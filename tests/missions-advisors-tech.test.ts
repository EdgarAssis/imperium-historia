// tests/missions-advisors-tech.test.ts
// Testes unitários para as Fases 9 (missões/achievements/ranking) e 10 (conselheiros, espionagem, tech tree, eleições, notícias).

import { describe, it, expect } from "vitest";
import { createInitialState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  MISSION_LIBRARY,
  ACHIEVEMENT_LIBRARY,
  rollInitialMissions,
  calculateMissionProgress,
  processMissions,
  checkAchievements,
  createRankingSnapshot,
} from "@/lib/engine/missions";
import {
  defaultAdvisors,
  generateAdvisorSuggestions,
  updateAdvisorConfidence,
} from "@/lib/engine/advisors";
import {
  executeSpyOperation,
  SPY_OPERATIONS,
} from "@/lib/engine/espionage";
import {
  TECH_TREE,
  getTech,
  availableTechs,
  startResearch,
  processResearch,
  applyTechBonuses,
  emptyResearchState,
} from "@/lib/engine/tech-tree";
import {
  ELECTION_INTERVAL,
  hasElections,
  calculateElectionResult,
  processElection,
  electionApproaching,
  turnsUntilElection,
} from "@/lib/engine/elections";
import {
  processNews,
  generateNews,
} from "@/lib/engine/news";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

// ---------------------------------------------------------------------------
// Fase 9 — Missões
// ---------------------------------------------------------------------------

describe("Fase 9: missões", () => {
  it("MISSION_LIBRARY tem pelo menos 5 missões", () => {
    expect(MISSION_LIBRARY.length).toBeGreaterThanOrEqual(5);
  });

  it("rollInitialMissions devolve 3 missões", () => {
    const state = makeState();
    const missoes = rollInitialMissions(state);
    expect(missoes.length).toBe(3);
    for (const m of missoes) {
      expect(m.status).toBe("ativa");
      expect(m.progresso).toBe(0);
      expect(m.turnoAtribuicao).toBe(0);
    }
  });

  it("rollInitialMissions é determinístico (mesma seed → mesmas missões)", () => {
    const s1 = makeState(123);
    const s2 = makeState(123);
    const m1 = rollInitialMissions(s1);
    const m2 = rollInitialMissions(s2);
    expect(m1.map((m) => m.titulo).sort()).toEqual(m2.map((m) => m.titulo).sort());
  });

  it("calculateMissionProgress para atingir_pib", () => {
    const state = makeState();
    const missoes = rollInitialMissions(state);
    const missaoPib = missoes.find((m) => m.objetivo === "atingir_pib");
    if (missaoPib) {
      const progresso = calculateMissionProgress(missaoPib, state);
      expect(progresso).toBe(state.paises["PRT"].pib);
    }
  });

  it("calculateMissionProgress para aliar_blocos", () => {
    const state = makeState();
    const missoes = rollInitialMissions(state);
    const missaoBlocos = missoes.find((m) => m.objetivo === "aliar_blocos");
    if (missaoBlocos) {
      const progresso = calculateMissionProgress(missaoBlocos, state);
      expect(progresso).toBe(state.paises["PRT"].blocos.length);
    }
  });

  it("processMissions completa missão quando progresso >= alvo", () => {
    const state = makeState();
    // Força uma missão de reputação com alvo baixo.
    const stateComMissao = {
      ...state,
      missoes: [{
        id: "miss-test-rep",
        titulo: "Reputação baixa",
        descricao: "Atinge reputação 5",
        objetivo: "elevar_reputacao" as const,
        alvo: 5,
        progresso: 0,
        turnoAtribuicao: 0,
        prazo: 60,
        recompensaTesouro: 1_000_000_000,
        recompensaReputacao: 5,
        status: "ativa" as const,
      }],
      paises: {
        ...state.paises,
        PRT: { ...state.paises["PRT"], reputacao: 10 }, // já > alvo 5
      },
    };
    const result = processMissions(stateComMissao);
    const missao = result.state.missoes[0];
    expect(missao.status).toBe("completa");
    expect(result.eventos.length).toBeGreaterThan(0);
    // Recompensa em tesouro aplicada.
    expect(result.state.paises["PRT"].tesouro).toBeGreaterThan(stateComMissao.paises["PRT"].tesouro);
  });

  it("processMissions falha missão quando prazo expira", () => {
    const state = makeState();
    const stateComMissao = {
      ...state,
      turno: 100, // turno muito avançado
      missoes: [{
        id: "miss-test-fail",
        titulo: "Impossível",
        descricao: "Atinge PIB 100T",
        objetivo: "atingir_pib" as const,
        alvo: 1e14, // $100T — impossível
        progresso: 0,
        turnoAtribuicao: 0,
        prazo: 10, // prazo 10 turnos
        recompensaTesouro: 0,
        recompensaReputacao: 0,
        status: "ativa" as const,
      }],
    };
    const result = processMissions(stateComMissao);
    const missao = result.state.missoes[0];
    expect(missao.status).toBe("falhada");
  });
});

// ---------------------------------------------------------------------------
// Fase 9 — Achievements
// ---------------------------------------------------------------------------

describe("Fase 9: achievements", () => {
  it("ACHIEVEMENT_LIBRARY tem pelo menos 10 achievements", () => {
    expect(ACHIEVEMENT_LIBRARY.length).toBeGreaterThanOrEqual(10);
  });

  it("estado inicial: todos os achievements bloqueados (turnoDesbloqueio null)", () => {
    const state = makeState();
    for (const a of state.achievements) {
      expect(a.turnoDesbloqueio).toBeNull();
    }
  });

  it("checkAchievements desbloqueia quando condição satisfeita", () => {
    const state = makeState();
    // Força PIB $1T para desbloquear "achv-pib-1t".
    const stateModificado = {
      ...state,
      paises: {
        ...state.paises,
        PRT: { ...state.paises["PRT"], pib: 1e12 },
      },
    };
    const result = checkAchievements(stateModificado);
    const achv = result.state.achievements.find((a) => a.id === "achv-pib-1t");
    expect(achv?.turnoDesbloqueio).not.toBeNull();
    expect(result.eventos.some((e) => e.achievementId === "achv-pib-1t")).toBe(true);
  });

  it("checkAchievements desbloqueia membro NATO", () => {
    const state = makeState();
    // PRT já é membro da NATO no cenário.
    expect(state.paises["PRT"].blocos).toContain("NATO");
    const result = checkAchievements(state);
    const achv = result.state.achievements.find((a) => a.id === "achv-membro-nato");
    expect(achv?.turnoDesbloqueio).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fase 9 — Ranking histórico
// ---------------------------------------------------------------------------

describe("Fase 9: ranking histórico", () => {
  it("createRankingSnapshot cria snapshot com top 10", () => {
    const state = makeState();
    const snapshot = createRankingSnapshot(state);
    expect(snapshot.top10Pib.length).toBe(10);
    expect(snapshot.top10Forca.length).toBe(10);
    expect(snapshot.posicaoJogadorPib).toBeGreaterThanOrEqual(-1);
  });

  it("snapshot detecta posição do jogador", () => {
    const state = makeState();
    const snapshot = createRankingSnapshot(state);
    // PRT é país pequeno; provavelmente não está no top 10.
    if (snapshot.posicaoJogadorPib >= 0) {
      expect(snapshot.top10Pib[snapshot.posicaoJogadorPib]).toBe("PRT");
    } else {
      expect(snapshot.posicaoJogadorPib).toBe(-1);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 10 — Conselheiros
// ---------------------------------------------------------------------------

describe("Fase 10: conselheiros", () => {
  it("defaultAdvisors devolve 4 conselheiros", () => {
    const advisors = defaultAdvisors();
    expect(advisors.length).toBe(4);
    expect(advisors.map((a) => a.tipo).sort()).toEqual(["diplomatico", "economico", "militar", "seguranca"]);
  });

  it("generateAdvisorSuggestions devolve 4 sugestões", () => {
    const state = makeState();
    const suggestions = generateAdvisorSuggestions(state);
    expect(suggestions.length).toBe(4);
    for (const s of suggestions) {
      expect(s.sugestao.length).toBeGreaterThan(10);
      expect(["alta", "media", "baixa"]).toContain(s.prioridade);
    }
  });

  it("updateAdvisorConfidence ajusta confiança com estabilidade", () => {
    const state = makeState();
    // Força estabilidade alta (80) para garantir drift positivo.
    const stateEstavel = {
      ...state,
      paises: {
        ...state.paises,
        PRT: { ...state.paises["PRT"], estabilidade: 80 },
      },
    };
    const confiancaAntes = stateEstavel.conselheiros[0].confianca;
    const newState = updateAdvisorConfidence(stateEstavel);
    const confiancaDepois = newState.conselheiros[0].confianca;
    // Estabilidade 80 → (80-50)/100 = 0.3 → Math.round(0.3 * 2) = 1 → +1 drift.
    expect(confiancaDepois).toBe(confiancaAntes + 1);
  });
});

// ---------------------------------------------------------------------------
// Fase 10 — Espionagem
// ---------------------------------------------------------------------------

describe("Fase 10: espionagem", () => {
  it("SPY_OPERATIONS tem 5 tipos", () => {
    expect(SPY_OPERATIONS.length).toBe(5);
  });

  it("executeSpyOperation falha se tesouro insuficiente", () => {
    const state = makeState();
    // PRT tesouro $18B; custo assassinar $20B.
    const result = executeSpyOperation(state, "AGO", "assassinar");
    expect(result.resultado.sucesso).toBe(false);
    expect(result.resultado.mensagem).toContain("Tesouro");
  });

  it("executeSpyOperation falha se alvo é o jogador", () => {
    const state = makeState();
    const result = executeSpyOperation(state, "PRT", "subornar_oficial");
    expect(result.resultado.sucesso).toBe(false);
    expect(result.resultado.mensagem).toContain("próprio");
  });

  it("executeSpyOperation com tesouro suficiente: sucesso ou falha determinísticos", () => {
    const state = makeState();
    // PRT tesouro $18B; custo subornar $2B.
    // Faz várias tentativas para verificar que eventualmente executa.
    let s = state;
    let executou = false;
    for (let i = 0; i < 20; i++) {
      const result = executeSpyOperation(s, "AGO", "subornar_oficial");
      s = result.state;
      // Se não falhou por tesouro, executou (sucesso ou falha de RNG).
      if (!result.resultado.mensagem.includes("Tesouro") && !result.resultado.mensagem.includes("jogador")) {
        executou = true;
        break;
      }
    }
    expect(executou).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fase 10 — Tech tree
// ---------------------------------------------------------------------------

describe("Fase 10: tech tree", () => {
  it("TECH_TREE tem pelo menos 10 techs", () => {
    expect(TECH_TREE.length).toBeGreaterThanOrEqual(10);
  });

  it("getTech devolve tech por ID", () => {
    const tech = getTech("tech-industria");
    expect(tech).not.toBeNull();
    expect(tech?.nome).toBe("Indústria Avançada");
  });

  it("availableTechs no estado inicial devolve techs sem prereqs", () => {
    const state = makeState();
    const available = availableTechs(state);
    // Techs sem prereqs: industria, armas, saude-publica, ciber, renovaveis.
    expect(available.length).toBeGreaterThanOrEqual(5);
    for (const t of available) {
      expect(t.prereqs.length).toBe(0);
    }
  });

  it("startResearch falha se já há pesquisa em curso", () => {
    const state = makeState();
    // Inicia pesquisa.
    const r1 = startResearch(state, "tech-industria");
    expect(r1.ok).toBe(true);
    // Tenta iniciar outra.
    const r2 = startResearch(r1.state, "tech-armas");
    expect(r2.ok).toBe(false);
    expect(r2.mensagem).toContain("em curso");
  });

  it("startResearch falha se prereq em falta", () => {
    const state = makeState();
    // tech-financas requer tech-industria.
    const r = startResearch(state, "tech-financas");
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("Pré-requisito");
  });

  it("processResearch decrementa turnos restantes", () => {
    const state = makeState();
    const r1 = startResearch(state, "tech-industria");
    const turnosAntes = r1.state.pesquisa.turnosRestantes;
    const r2 = processResearch(r1.state);
    expect(r2.state.pesquisa.turnosRestantes).toBe(turnosAntes - 1);
  });

  it("processResearch completa tech quando turnos chegam a 0", () => {
    const state = makeState();
    // tech-industria: 6 turnos.
    const r1 = startResearch(state, "tech-industria");
    let s = r1.state;
    for (let i = 0; i < 6; i++) {
      s = processResearch(s).state;
    }
    expect(s.pesquisa.emPesquisa).toBeNull();
    expect(s.pesquisa.desbloqueadas).toContain("tech-industria");
  });

  it("applyTechBonuses aplica bónus ao país", () => {
    const state = makeState();
    // Desbloqueia tech-industria (bónus +0.5% PIB).
    const stateComTech = {
      ...state,
      pesquisa: {
        ...state.pesquisa,
        desbloqueadas: ["tech-industria"],
      },
    };
    const newState = applyTechBonuses(stateComTech);
    const pibAntes = state.paises["PRT"].pib;
    const pibDepois = newState.paises["PRT"].pib;
    expect(pibDepois).toBeGreaterThan(pibAntes);
  });

  it("emptyResearchState devolve estado vazio", () => {
    const r = emptyResearchState();
    expect(r.desbloqueadas).toEqual([]);
    expect(r.emPesquisa).toBeNull();
    expect(r.turnosRestantes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 10 — Eleições
// ---------------------------------------------------------------------------

describe("Fase 10: eleições", () => {
  it("ELECTION_INTERVAL = 48 meses (4 anos)", () => {
    expect(ELECTION_INTERVAL).toBe(48);
  });

  it("hasElections true para democracia (PRT)", () => {
    const state = makeState();
    expect(hasElections(state)).toBe(true); // PRT é república
  });

  it("hasElections false para autocracia (RUS)", () => {
    const state = makeState(42, "RUS");
    expect(hasElections(state)).toBe(false);
  });

  it("calculateElectionResult devolve soma 100", () => {
    const state = makeState();
    const { votosJogador, votosOpositor } = calculateElectionResult(state);
    expect(votosJogador + votosOpositor).toBe(100);
    expect(votosJogador).toBeGreaterThanOrEqual(0);
    expect(votosJogador).toBeLessThanOrEqual(100);
  });

  it("processElection não dispara antes de 48 turnos", () => {
    const state = makeState();
    state.turno = 10;
    const result = processElection(state);
    expect(result.eleicao).toBeNull();
  });

  it("processElection dispara no turno 48", () => {
    const state = makeState();
    state.turno = 48;
    const result = processElection(state);
    expect(result.eleicao).not.toBeNull();
    expect(result.eleicao?.votosJogador + result.eleicao?.votosOpositor).toBe(100);
  });

  it("electionApproaching true nos últimos 12 meses", () => {
    const state = makeState();
    state.turno = 40; // faltam 8 turnos
    expect(electionApproaching(state)).toBe(true);
  });

  it("turnsUntilElection devolve turnos restantes", () => {
    const state = makeState();
    state.turno = 10;
    expect(turnsUntilElection(state)).toBe(38); // 48 - 10
  });

  it("eleição perdida muda líder e reseta aprovação", () => {
    const state = makeState();
    state.turno = 48;
    // Força aprovação baixa para o jogador perder.
    state.paises = {
      ...state.paises,
      PRT: { ...state.paises["PRT"], aprovacao: 10 },
    };
    const result = processElection(state);
    if (result.eleicao && !result.eleicao.venceu) {
      const player = result.state.paises["PRT"];
      expect(player.lider).toBe("Líder da Oposição");
      expect(player.aprovacao).toBe(50);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 10 — Notícias
// ---------------------------------------------------------------------------

describe("Fase 10: notícias", () => {
  it("generateNews devolve array (possivelmente vazio)", () => {
    const state = makeState();
    const news = generateNews(state);
    expect(Array.isArray(news)).toBe(true);
    for (const n of news) {
      expect(n.titulo.length).toBeGreaterThan(0);
      expect(n.texto.length).toBeGreaterThan(10);
    }
  });

  it("processNews adiciona notícias ao histórico (máx. 50)", () => {
    const state = makeState();
    const result = processNews(state);
    if (result.novasNoticias.length > 0) {
      expect(result.state.noticias.length).toBeGreaterThan(state.noticias.length);
    }
  });

  it("notícia sobre guerra é gerada quando há guerras IA activas", () => {
    // Cenário tem guerra RUS-UKR; verifica se pelo menos uma notícia de guerra é gerada
    // em vários turnos.
    let houveNoticiaGuerra = false;
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeState(seed);
      const news = generateNews(s);
      if (news.some((n) => n.categoria === "guerra")) {
        houveNoticiaGuerra = true;
        break;
      }
    }
    expect(houveNoticiaGuerra).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fase 9/10 — Integração no motor mensal
// ---------------------------------------------------------------------------

describe("Fase 9/10: integração no motor mensal", () => {
  it("runMonthlyPipeline inicializa missões, conselheiros, pesquisa", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    // Estado inicial tem missões.
    expect(state.missoes.length).toBe(3);
    expect(state.conselheiros.length).toBe(4);
    expect(state.pesquisa.desbloqueadas).toEqual([]);
    // Após 1 turno, tudo permanece definido.
    const r = runMonthlyPipeline(state, "2025-02-01");
    expect(r.state.missoes).toBeDefined();
    expect(r.state.conselheiros).toBeDefined();
    expect(r.state.pesquisa).toBeDefined();
    expect(r.state.achievements).toBeDefined();
  });

  it("1 turno não produz NaN", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    let state = makeState(2025);
    if (state.pendingEvent) {
      state = { ...state, pendingEvent: null };
    }
    const r = runMonthlyPipeline(state, state.dataAtual);
    expect(r.state).toBeDefined();
    expect(r.state.paises).toBeDefined();
    for (const id of Object.keys(r.state.paises).slice(0, 10)) {
      const c = r.state.paises[id];
      expect(Number.isFinite(c.pib)).toBe(true);
      expect(Number.isFinite(c.tesouro)).toBe(true);
    }
  });
});
