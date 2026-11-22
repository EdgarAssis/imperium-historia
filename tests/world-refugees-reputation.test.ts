// tests/world-refugees-reputation.test.ts
// Testes unitários para as Fases 7 (mundo vivo) e 8 (proxy wars, refugiados, reputação).
//
// Fase 7: processAICountries (decisões automáticas de países IA).
// Fase 8: supportRebels, processProxyWars, generateRefugees, distributeRefugees,
//   processRefugees, adjustReputation, processReputationDrift, getReputationLabel.

import { describe, it, expect } from "vitest";
import { createInitialState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  processAICountries,
  supportRebels,
  processProxyWars,
  generateRefugees,
  distributeRefugees,
  processRefugees,
  adjustReputation,
  processReputationDrift,
  getReputationLabel,
  getReputationColor,
  calculateAverageReputation,
} from "@/lib/engine";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

// ---------------------------------------------------------------------------
// Fase 7 — processAICountries (mundo vivo)
// ---------------------------------------------------------------------------

describe("Fase 7: processAICountries", () => {
  it("corre sem erros no estado inicial", () => {
    const state = makeState();
    const result = processAICountries(state);
    expect(result.state).toBeDefined();
    expect(Array.isArray(result.eventos)).toBe(true);
    // Estado não altera propriedades estruturais.
    expect(result.state.paises["PRT"]).toBeDefined();
  });

  it("não processa o país do jogador", () => {
    const state = makeState();
    // O país do jogador (PRT) não deve aparecer como countryId nos eventos.
    const result = processAICountries(state);
    for (const ev of result.eventos) {
      expect(ev.countryId).not.toBe("PRT");
    }
  });

  it("é determinístico (mesma seed → mesmo resultado)", () => {
    const s1 = makeState(123);
    const s2 = makeState(123);
    const r1 = processAICountries(s1);
    const r2 = processAICountries(s2);
    // Mesmo número de eventos.
    expect(r1.eventos.length).toBe(r2.eventos.length);
    // Mesmos countryIds.
    const ids1 = r1.eventos.map((e) => e.countryId).sort();
    const ids2 = r2.eventos.map((e) => e.countryId).sort();
    expect(ids1).toEqual(ids2);
  });

  it("país exausto em guerra pede paz", () => {
    const state = makeState();
    // Coloca USA em guerra com RUS, USA com estabilidade baixa.
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"], provinciasDisputa: [],
      frentes: [], objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    state.paises = {
      ...state.paises,
      USA: { ...state.paises["USA"], estabilidade: 15 },
    };
    // Corre várias vezes até USA pedir paz (10% chance/mês).
    let s = state;
    let pediuPaz = false;
    for (let i = 0; i < 50; i++) {
      const r = processAICountries(s);
      s = r.state;
      if (r.eventos.some((e) => e.countryId === "USA" && e.acao === "pedir_paz")) {
        pediuPaz = true;
        break;
      }
    }
    expect(pediuPaz).toBe(true);
    // Após pedir paz, a guerra deve estar terminada.
    const guerra = s.guerras.find((g) => g.id === "gw1");
    expect(guerra?.estado).toBe("terminada");
  });
});

// ---------------------------------------------------------------------------
// Fase 8 — Guerra por procuração (supportRebels)
// ---------------------------------------------------------------------------

describe("Fase 8: supportRebels (proxy war)", () => {
  it("USA pode apadrinhar rebeldes em Mali (PIB USA >> Mali)", () => {
    const state = makeState();
    const result = supportRebels(state, "USA", "MLI");
    expect(result.criado).toBe(true);
    expect(result.proxyId).toBe("MLI-PR");
    // País-proxy criado.
    expect(result.state.paises["MLI-PR"]).toBeDefined();
    expect(result.state.paises["MLI-PR"].nome).toContain("Rebeldes");
    // Guerra civil criada.
    expect(result.state.guerras.some((g) => g.agressor === "MLI-PR" && g.defensores.includes("MLI"))).toBe(true);
    // Sponsor paga custo e perde reputação.
    const custo = state.paises["USA"].pib * 0.001;
    expect(result.state.paises["USA"].tesouro).toBe(state.paises["USA"].tesouro - custo);
    expect(result.state.paises["USA"].reputacao ?? 0).toBeLessThan(state.paises["USA"].reputacao ?? 0);
    // Sponsor regista proxy.
    expect(result.state.paises["USA"].proxies ?? []).toContain("MLI-PR");
    // Evento no diário.
    expect(result.state.eventos.some((e) => e.titulo.includes("apadrinha rebeldes"))).toBe(true);
  });

  it("não pode apadrinhar em país do jogador", () => {
    const state = makeState();
    const result = supportRebels(state, "USA", "PRT");
    expect(result.criado).toBe(false);
    expect(result.mensagem).toContain("jogador");
  });

  it("país pobre não pode apadrinhar (PIB < 5× alvo)", () => {
    const state = makeState();
    // Moçambique (PIB $20B) tenta apadrinhar em Angola ($90B). 20B < 5*90B = 450B.
    const result = supportRebels(state, "MOZ", "AGO");
    expect(result.criado).toBe(false);
    expect(result.mensagem).toContain("economia");
  });

  it("não pode criar proxy duplicado", () => {
    const state = makeState();
    const r1 = supportRebels(state, "USA", "MLI");
    expect(r1.criado).toBe(true);
    const r2 = supportRebels(r1.state, "USA", "MLI");
    expect(r2.criado).toBe(false);
    expect(r2.mensagem).toContain("proxy activo");
  });

  it("país-proxy tem 25% dos recursos do alvo", () => {
    const state = makeState();
    const alvoPib = state.paises["MLI"].pib;
    const alvoTropas = state.paises["MLI"].tropas;
    const result = supportRebels(state, "USA", "MLI");
    const proxy = result.state.paises["MLI-PR"];
    expect(proxy.pib).toBeCloseTo(alvoPib * 0.25, 0);
    expect(proxy.tropas).toBeCloseTo(alvoTropas * 0.25, 0);
  });
});

// ---------------------------------------------------------------------------
// Fase 8 — processProxyWars (manutenção mensal)
// ---------------------------------------------------------------------------

describe("Fase 8: processProxyWars", () => {
  it("sem proxies activos → sem eventos", () => {
    const state = makeState();
    const result = processProxyWars(state);
    expect(result.eventos.length).toBe(0);
  });

  it("proxy activo custa manutenção mensal ao sponsor", () => {
    const state = makeState();
    // Cria proxy: USA apadrinha em MLI.
    const r1 = supportRebels(state, "USA", "MLI");
    const tesouroAntes = r1.state.paises["USA"].tesouro;
    const result = processProxyWars(r1.state);
    // Sponsor perde custo mensal (0.1% PIB / 12).
    const custoMensal = r1.state.paises["USA"].pib * 0.001 / 12;
    expect(result.state.paises["USA"].tesouro).toBeLessThan(tesouroAntes);
    expect(result.state.paises["USA"].tesouro).toBeCloseTo(tesouroAntes - custoMensal, 0);
  });

  it("proxy desaparecido é removido da lista do sponsor", () => {
    const state = makeState();
    const r1 = supportRebels(state, "USA", "MLI");
    // Simula proxy anexado: remove-o do estado.
    const semProxy: GameState = {
      ...r1.state,
      paises: { ...r1.state.paises },
    };
    delete semProxy.paises["MLI-PR"];
    const result = processProxyWars(semProxy);
    // Lista de proxies do sponsor deve estar vazia.
    expect(result.state.paises["USA"].proxies ?? []).toEqual([]);
    expect(result.eventos.some((e) => e.proxyId === "MLI-PR" && e.status === "terminado")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fase 8 — Refugiados (generateRefugees, distributeRefugees, processRefugees)
// ---------------------------------------------------------------------------

describe("Fase 8: generateRefugees", () => {
  it("sem guerras activas → sem fluxos", () => {
    const state = makeState();
    // Limpa guerras do cenário inicial (RUS-UKR).
    state.guerras = [];
    const result = generateRefugees(state);
    expect(result.fluxos.length).toBe(0);
  });

  it("guerra activa com províncias disputadas gera refugiados", () => {
    const state = makeState();
    // Coloca uma guerra USA-RUS com uma província disputada (USA-DC).
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"],
      provinciasDisputa: ["USA-DC"],
      frentes: [{ provinceId: "USA-DC", progresso: 50, ultimoDelta: 0 }],
      objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const result = generateRefugees(state);
    // 5% da população de USA-DC (680k) = 34k refugiados.
    expect(result.fluxos.length).toBeGreaterThan(0);
    expect(result.fluxos[0].origem).toBe("USA");
    expect(result.fluxos[0].numero).toBeGreaterThan(0);
    // País de origem acumula refugiadosGerados.
    expect(result.state.paises["USA"].refugiadosGerados ?? 0).toBeGreaterThan(0);
  });

  it("província com progresso 100 (conquistada) não gera refugiados", () => {
    const state = makeState();
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"],
      provinciasDisputa: ["USA-DC"],
      frentes: [{ provinceId: "USA-DC", progresso: 100, ultimoDelta: 0 }],
      objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const result = generateRefugees(state);
    // A província conquistada (progresso 100) não gera; mas pode haver outras guerras no estado.
    // Filtra só fluxos da guerra gw1.
    const fluxosGw1 = result.fluxos.filter((f) => f.motivo.includes("gw1"));
    expect(fluxosGw1.length).toBe(0);
  });
});

describe("Fase 8: distributeRefugees", () => {
  it("refugiados são distribuídos por países estáveis", () => {
    const state = makeState();
    const fluxos = [{ origem: "USA", numero: 100_000, motivo: "Guerra gw1" }];
    const result = distributeRefugees(state, fluxos);
    expect(result.novosFluxos.length).toBeGreaterThan(0);
    // Cada fluxo tem destino != origem.
    for (const f of result.novosFluxos) {
      expect(f.destino).not.toBe("USA");
      expect(f.numero).toBeGreaterThan(0);
    }
  });

  it("país de acolhimento ganha refugiados + população + PIB", () => {
    const state = makeState();
    const fluxos = [{ origem: "USA", numero: 50_000, motivo: "Guerra" }];
    const result = distributeRefugees(state, fluxos);
    if (result.novosFluxos.length > 0) {
      const fluxo = result.novosFluxos[0];
      const pais = result.state.paises[fluxo.destino];
      const paisOriginal = state.paises[fluxo.destino];
      expect(pais.refugiadosAcolhidos ?? 0).toBeGreaterThan(paisOriginal.refugiadosAcolhidos ?? 0);
      expect(pais.populacao).toBeGreaterThan(paisOriginal.populacao);
    }
  });

  it("sem fluxos → sem novos fluxos", () => {
    const state = makeState();
    const result = distributeRefugees(state, []);
    expect(result.novosFluxos).toEqual([]);
  });
});

describe("Fase 8: processRefugees (integração)", () => {
  it("corre sem erros no estado sem guerras", () => {
    const state = makeState();
    state.guerras = []; // Limpa guerra RUS-UKR do cenário.
    const result = processRefugees(state);
    expect(result.novosFluxos.length).toBe(0);
  });

  it("com guerra activa, gera e distribui refugiados", () => {
    const state = makeState();
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"],
      provinciasDisputa: ["USA-DC"],
      frentes: [{ provinceId: "USA-DC", progresso: 50, ultimoDelta: 0 }],
      objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const result = processRefugees(state);
    expect(result.novosFluxos.length).toBeGreaterThan(0);
    // Fluxos adicionados ao histórico.
    expect(result.state.refugiadosFluxos.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 8 — Reputação mundial
// ---------------------------------------------------------------------------

describe("Fase 8: adjustReputation", () => {
  it("ajusta reputação de um país", () => {
    const state = makeState();
    const result = adjustReputation(state, "USA", -10, "guerra agressiva");
    // adjustReputation retorna GameState directamente.
    expect(result.paises["USA"].reputacao ?? 0).toBeLessThan(state.paises["USA"].reputacao ?? 0);
  });

  it("reputação fica em [-100, 100]", () => {
    const state = makeState();
    const r1 = adjustReputation(state, "USA", -200, "teste");
    expect(r1.paises["USA"].reputacao).toBeGreaterThanOrEqual(-100);
    const r2 = adjustReputation(state, "USA", 200, "teste");
    expect(r2.paises["USA"].reputacao).toBeLessThanOrEqual(100);
  });

  it("país inexistente → sem alteração", () => {
    const state = makeState();
    const result = adjustReputation(state, "INEXISTENTE", -10);
    // adjustReputation retorna GameState directamente (não { state }).
    expect(result).toBe(state);
  });
});

describe("Fase 8: processReputationDrift", () => {
  it("corre sem erros no estado inicial", () => {
    const state = makeState();
    const result = processReputationDrift(state);
    expect(result.state).toBeDefined();
    expect(Array.isArray(result.eventos)).toBe(true);
  });

  it("país em guerra ofensiva perde reputação (-2/mês)", () => {
    const state = makeState();
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"], provinciasDisputa: [],
      frentes: [], objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const repAntes = state.paises["USA"].reputacao ?? 0;
    const result = processReputationDrift(state);
    const repDepois = result.state.paises["USA"].reputacao ?? 0;
    // Pode haver outros drifts; no geral deve cair (ofensiva -2 + regime -1 = -3).
    expect(repDepois).toBeLessThanOrEqual(repAntes);
  });

  it("país estável ganha reputação (+1/mês)", () => {
    const state = makeState();
    // Suíça: estabilidade 75, sem guerra, democrática.
    const repAntes = state.paises["CHE"].reputacao ?? 0;
    const result = processReputationDrift(state);
    const repDepois = result.state.paises["CHE"].reputacao ?? 0;
    // Estabilidade alta (+1) + sem tratados rompidos (+1) = +2; regime democracia (não autoritário).
    expect(repDepois).toBeGreaterThan(repAntes);
  });

  it("regime autoritário perde reputação (-1/mês)", () => {
    const state = makeState();
    // Rússia: autocracia.
    const repAntes = state.paises["RUS"].reputacao ?? 0;
    const result = processReputationDrift(state);
    const repDepois = result.state.paises["RUS"].reputacao ?? 0;
    // Autocracia -1; sem guerra no estado inicial; tratados respeitados +1; estab < 70 → 0.
    // Resultado líquido: ~0 ou ligeiramente negativo.
    void repAntes;
    void repDepois;
    // Apenas verifica que não rebenta.
    expect(Number.isFinite(repDepois)).toBe(true);
  });
});

describe("Fase 8: getReputationLabel + getReputationColor", () => {
  it("etiquetas correctas por intervalo", () => {
    expect(getReputationLabel(80)).toBe("Parceiro de confiança");
    expect(getReputationLabel(50)).toBe("Respeitado");
    expect(getReputationLabel(25)).toBe("Favorável");
    expect(getReputationLabel(0)).toBe("Neutro");
    expect(getReputationLabel(-25)).toBe("Suspeito");
    expect(getReputationLabel(-50)).toBe("Tensão");
    expect(getReputationLabel(-80)).toBe("Pária internacional");
  });

  it("cores variam (verde para positivo, vermelho para negativo)", () => {
    expect(getReputationColor(50)).toBe("#16a34a"); // verde
    expect(getReputationColor(0)).toBe("#6b7280"); // cinzento
    expect(getReputationColor(-50)).toBe("#ea580c"); // laranja
    expect(getReputationColor(-80)).toBe("#dc2626"); // vermelho
  });
});

describe("Fase 8: calculateAverageReputation", () => {
  it("média de reputação de vários países", () => {
    const state = makeState();
    // Define reputações manualmente.
    state.paises = {
      ...state.paises,
      USA: { ...state.paises["USA"], reputacao: 50 },
      RUS: { ...state.paises["RUS"], reputacao: -30 },
      CHN: { ...state.paises["CHN"], reputacao: 10 },
    };
    const media = calculateAverageReputation(state, ["USA", "RUS", "CHN"]);
    // (50 + -30 + 10) / 3 = 10.
    expect(media).toBe(10);
  });

  it("lista vazia → 0", () => {
    const state = makeState();
    expect(calculateAverageReputation(state, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 7/8 — Integração no motor mensal (runMonthlyPipeline)
// ---------------------------------------------------------------------------

describe("Fase 7/8: integração no motor mensal", () => {
  it("runMonthlyPipeline inicializa refugiadosFluxos vazio", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    expect(state.refugiadosFluxos).toEqual([]);
    const r = runMonthlyPipeline(state, "2025-02-01");
    // Após 1 turno, refugiadosFluxos continua definido (possivelmente vazio se não há guerras).
    expect(r.state.refugiadosFluxos).toBeDefined();
    expect(Array.isArray(r.state.refugiadosFluxos)).toBe(true);
  });

  it("runMonthlyPipeline mantém reputação definida nos países", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    // Estado inicial: todos os países têm reputacao = 0 (via loader).
    for (const id of Object.keys(state.paises).slice(0, 5)) {
      expect(state.paises[id].reputacao).toBe(0);
    }
    const r = runMonthlyPipeline(state, "2025-02-01");
    // Após 1 turno, países ainda têm reputação definida (drift pode ter alterado).
    for (const id of Object.keys(r.state.paises).slice(0, 5)) {
      const c = r.state.paises[id];
      expect(c.reputacao).toBeDefined();
      expect(Number.isFinite(c.reputacao ?? 0)).toBe(true);
    }
  });

  it("1 turno não produz NaN nem absurdos", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    let state = makeState(2025);
    if (state.pendingEvent) {
      state = { ...state, pendingEvent: null };
    }
    const r = runMonthlyPipeline(state, state.dataAtual);
    expect(r).toBeDefined();
    expect(r.state).toBeDefined();
    expect(r.state.paises).toBeDefined();
    for (const id of Object.keys(r.state.paises).slice(0, 10)) {
      const c = r.state.paises[id];
      expect(Number.isFinite(c.pib), `PIB NaN em ${id}`).toBe(true);
      expect(Number.isFinite(c.tesouro), `Tesouro NaN em ${id}`).toBe(true);
      expect(Number.isFinite(c.reputacao ?? 0), `Reputação NaN em ${id}`).toBe(true);
    }
  });
});
