// src/lib/engine/missions.ts
// Fase 9 — Missões, Achievements e Ranking histórico.
//
// Missões: objectivos atribuídos ao jogador com prazo e recompensa.
// Achievements: marcos desbloqueados automaticamente.
// Ranking histórico: snapshot periódico (anual) do top 10.

import type { GameState, Mission, Achievement, RankingSnapshot, Country } from "@/types";
import { rankByGdp } from "./ranking";
import { rankByMilitaryStrength as rankByFM } from "./metrics";
import { adjustReputation } from "./reputation";
import { Rng, hashCombine, hashString } from "./rng";

/** Biblioteca de missões predefinidas (sorteadas no início do jogo). */
export const MISSION_LIBRARY: readonly Omit<Mission, "id" | "turnoAtribuicao" | "status" | "progresso">[] = [
  {
    titulo: "Potência Económica",
    descricao: "Atinge PIB de $1 trilião.",
    objetivo: "atingir_pib",
    alvo: 1e12,
    prazo: 120, // 10 anos
    recompensaTesouro: 50_000_000_000,
    recompensaReputacao: 15,
  },
  {
    titulo: "Expansionista",
    descricao: "Conquista 5 províncias por qualquer método.",
    objetivo: "conquistar_provincias",
    alvo: 5,
    prazo: 60,
    recompensaTesouro: 20_000_000_000,
    recompensaReputacao: 5,
  },
  {
    titulo: "Estabilidade Política",
    descricao: "Mantém estabilidade > 70 durante 24 meses.",
    objetivo: "manter_estabilidade",
    alvo: 24,
    prazo: 36,
    recompensaTesouro: 10_000_000_000,
    recompensaReputacao: 10,
  },
  {
    titulo: "Respeito Internacional",
    descricao: "Eleva a reputação mundial a 50.",
    objetivo: "elevar_reputacao",
    alvo: 50,
    prazo: 60,
    recompensaTesouro: 15_000_000_000,
    recompensaReputacao: 0,
  },
  {
    titulo: "Estrategista Militar",
    descricao: "Vence 3 guerras.",
    objetivo: "vencer_guerra",
    alvo: 3,
    prazo: 90,
    recompensaTesouro: 30_000_000_000,
    recompensaReputacao: -5, // guerra é mau para reputação
  },
  {
    titulo: "Diplomata",
    descricao: "Junta-te a 3 blocos políticos.",
    objetivo: "aliar_blocos",
    alvo: 3,
    prazo: 48,
    recompensaTesouro: 10_000_000_000,
    recompensaReputacao: 10,
  },
  {
    titulo: "Inovador",
    descricao: "Pesquisa 5 tecnologias.",
    objetivo: "pesquisar_tech",
    alvo: 5,
    prazo: 96,
    recompensaTesouro: 25_000_000_000,
    recompensaReputacao: 8,
  },
];

/** Biblioteca de achievements (marcos automáticos). */
export const ACHIEVEMENT_LIBRARY: readonly Achievement[] = [
  { id: "achv-primeira-guerra", titulo: "Primeira Guerra", descricao: "Declara a tua primeira guerra.", categoria: "guerra", turnoDesbloqueio: null },
  { id: "achv-primeira-vitoria", titulo: "Primeira Vitória Militar", descricao: "Vence a tua primeira guerra.", categoria: "guerra", turnoDesbloqueio: null },
  { id: "achv-primeira-conquista", titulo: "Conquistador", descricao: "Conquista a tua primeira província.", categoria: "guerra", turnoDesbloqueio: null },
  { id: "achv-anexacao", titulo: "Imperialista", descricao: "Anexa um país inteiro.", categoria: "guerra", turnoDesbloqueio: null },
  { id: "achv-pib-1t", titulo: "Trilião de Dólares", descricao: "Atinge PIB de $1 trilião.", categoria: "economia", turnoDesbloqueio: null },
  { id: "achv-pib-10t", titulo: "Década Económica", descricao: "Atinge PIB de $10 triliões.", categoria: "economia", turnoDesbloqueio: null },
  { id: "achv-membro-nato", titulo: "Aliança Atlântica", descricao: "Junta-te à NATO.", categoria: "diplomacia", turnoDesbloqueio: null },
  { id: "achv-membro-ue", titulo: "Europeu", descricao: "Junta-te à União Europeia.", categoria: "diplomacia", turnoDesbloqueio: null },
  { id: "achv-membro-brics", titulo: "Sul Global", descricao: "Junta-te aos BRICS.", categoria: "diplomacia", turnoDesbloqueio: null },
  { id: "achv-reputacao-50", titulo: "Respeitado", descricao: "Atinge reputação mundial 50.", categoria: "politica", turnoDesbloqueio: null },
  { id: "achv-reputacao-80", titulo: "Parceiro de Confiança", descricao: "Atinge reputação mundial 80.", categoria: "politica", turnoDesbloqueio: null },
  { id: "achv-primeira-tech", titulo: "Inovador", descricao: "Pesquisa a tua primeira tecnologia.", categoria: "ciencia", turnoDesbloqueio: null },
  { id: "achv-5-techs", titulo: "Polímata", descricao: "Pesquisa 5 tecnologias.", categoria: "ciencia", turnoDesbloqueio: null },
  { id: "achv-estabilidade-perfeita", titulo: "Estabilidade Perfeita", descricao: "Atinge estabilidade 100.", categoria: "politica", turnoDesbloqueio: null },
  { id: "achv-eleicao-vencida", titulo: "Mandato Renovado", descricao: "Vence uma eleição democrática.", categoria: "politica", turnoDesbloqueio: null },
  { id: "achv-multinacional", titulo: "Pólo de Atração", descricao: "Atrai a tua primeira multinacional.", categoria: "economia", turnoDesbloqueio: null },
];

/** Sorteia 3 missões iniciais para o jogador. */
export function rollInitialMissions(state: GameState): Mission[] {
  const rng = new Rng(hashCombine(state.config.seed, hashString("missions-init")));
  const candidatos = [...MISSION_LIBRARY];
  // Sorteia 3 sem reposição.
  const escolhidas: Mission[] = [];
  for (let i = 0; i < 3 && candidatos.length > 0; i++) {
    const idx = Math.floor(rng.next() * candidatos.length);
    const m = candidatos[idx];
    candidatos.splice(idx, 1);
    escolhidas.push({
      ...m,
      id: `miss-${i}-${m.titulo.toLowerCase().replace(/\s+/g, "-")}`,
      turnoAtribuicao: state.turno,
      progresso: 0,
      status: "ativa",
    });
  }
  return escolhidas;
}

/**
 * Calcula o progresso actual de uma missão baseado no estado do jogo.
 * Devolve o valor numérico de progresso.
 */
export function calculateMissionProgress(mission: Mission, state: GameState): number {
  if (!state.playerCountryId) return 0;
  const player = state.paises[state.playerCountryId];
  if (!player) return 0;
  switch (mission.objetivo) {
    case "atingir_pib":
      return player.pib;
    case "conquistar_provincias":
      // Conta províncias do jogador que não eram dele no início (heurística:
      // contamos todas as províncias do jogador - nº inicial).
      // Sem tracking exacto de províncias iniciais; usamos nº actual - 1 (capital).
      return Math.max(0, Object.values(state.provincias).filter((p) => p.countryId === state.playerCountryId).length - 1);
    case "manter_estabilidade":
      // Progresso = meses consecutivos com estabilidade > 70.
      // Heurística: se estabilidade actual > 70, progresso = turnos decorridos desde atribuição (limitado).
      if (player.estabilidade > 70) {
        return Math.min(mission.alvo, state.turno - mission.turnoAtribuicao);
      }
      return 0; // reset se estabilidade cai
    case "elevar_reputacao":
      return player.reputacao ?? 0;
    case "vencer_guerra":
      // Conta guerras terminadas onde o jogador venceu (agressor ou defensor).
      return state.guerras.filter((g) =>
        g.estado === "terminada" &&
        (g.agressor === state.playerCountryId || g.defensores.includes(state.playerCountryId)) &&
        g.turnoFim !== null
      ).length;
    case "aliar_blocos":
      return player.blocos.length;
    case "pesquisar_tech":
      return state.pesquisa.desbloqueadas.length;
    default:
      return 0;
  }
}

/**
 * Processa todas as missões activas: actualiza progresso, completa/falha.
 * Devolve novo estado + eventos de missão.
 */
export function processMissions(state: GameState): {
  state: GameState;
  eventos: { missionId: string; tipo: "completa" | "falhada"; titulo: string; recompensa: string }[];
} {
  if (state.missoes.length === 0) return { state, eventos: [] };
  const eventos: { missionId: string; tipo: "completa" | "falhada"; titulo: string; recompensa: string }[] = [];
  let paises = state.paises;
  let newReputacao = 0;
  const missoes = state.missoes.map((m) => {
    if (m.status !== "ativa") return m;
    const progresso = calculateMissionProgress(m, state);
    // Verifica conclusão.
    if (progresso >= m.alvo) {
      // Aplica recompensas.
      if (state.playerCountryId && paises[state.playerCountryId]) {
        const player = paises[state.playerCountryId];
        paises = {
          ...paises,
          [state.playerCountryId]: {
            ...player,
            tesouro: player.tesouro + m.recompensaTesouro,
          },
        };
      }
      newReputacao += m.recompensaReputacao;
      eventos.push({
        missionId: m.id,
        tipo: "completa",
        titulo: m.titulo,
        recompensa: `+$${formatCompact(m.recompensaTesouro)} tesouro, ${m.recompensaReputacao >= 0 ? "+" : ""}${m.recompensaReputacao} reputação`,
      });
      return { ...m, progresso, status: "completa" as const };
    }
    // Verifica prazo expirado.
    if (m.prazo > 0 && state.turno - m.turnoAtribuicao >= m.prazo) {
      eventos.push({
        missionId: m.id,
        tipo: "falhada",
        titulo: m.titulo,
        recompensa: "sem recompensa",
      });
      return { ...m, progresso, status: "falhada" as const };
    }
    return { ...m, progresso };
  });
  // Aplica ajuste de reputação acumulado.
  let newState: GameState = { ...state, missoes, paises };
  if (newReputacao !== 0 && state.playerCountryId) {
    newState = adjustReputation(newState, state.playerCountryId, newReputacao, "missões completas");
  }
  return { state: newState, eventos };
}

/**
 * Verifica achievements: desbloqueia marcos automáticos.
 * Devolve novo estado + eventos de achievement.
 */
export function checkAchievements(state: GameState): {
  state: GameState;
  eventos: { achievementId: string; titulo: string }[];
} {
  if (!state.playerCountryId) return { state, eventos: [] };
  const player = state.paises[state.playerCountryId];
  if (!player) return { state, eventos: [] };
  const eventos: { achievementId: string; titulo: string }[] = [];
  // Converte biblioteca para estado actual (mantém turnoDesbloqueio se já existe).
  const existingMap = new Map(state.achievements.map((a) => [a.id, a]));
  const novosAchievements: Achievement[] = ACHIEVEMENT_LIBRARY.map((def) => {
    const existing = existingMap.get(def.id);
    if (existing && existing.turnoDesbloqueio !== null) return existing;
    // Verifica condição de desbloqueio.
    const desbloqueado = checkAchievementCondition(def.id, state, player);
    if (desbloqueado) {
      eventos.push({ achievementId: def.id, titulo: def.titulo });
      return { ...def, turnoDesbloqueio: state.turno };
    }
    return { ...def, turnoDesbloqueio: existing?.turnoDesbloqueio ?? null };
  });
  return {
    state: { ...state, achievements: novosAchievements },
    eventos,
  };
}

/** Verifica se um achievement específico está desbloqueado. */
function checkAchievementCondition(achievementId: string, state: GameState, player: Country): boolean {
  switch (achievementId) {
    case "achv-primeira-guerra":
      return state.guerras.some((g) => g.agressor === player.id);
    case "achv-primeira-vitoria":
      return state.guerras.some((g) => g.estado === "terminada" && g.agressor === player.id && g.turnoFim !== null);
    case "achv-primeira-conquista":
      // Heurística: tem mais províncias que o inicial (capital).
      return Object.values(state.provincias).filter((p) => p.countryId === player.id).length > 1;
    case "achv-anexacao":
      // Anexou um país: existe evento de anexação.
      return state.eventos.some((e) => e.titulo.includes("anexado por") && e.titulo.includes(player.nome));
    case "achv-pib-1t":
      return player.pib >= 1e12;
    case "achv-pib-10t":
      return player.pib >= 10e12;
    case "achv-membro-nato":
      return player.blocos.includes("NATO");
    case "achv-membro-ue":
      return player.blocos.includes("UE");
    case "achv-membro-brics":
      return player.blocos.includes("BRICS");
    case "achv-reputacao-50":
      return (player.reputacao ?? 0) >= 50;
    case "achv-reputacao-80":
      return (player.reputacao ?? 0) >= 80;
    case "achv-primeira-tech":
      return state.pesquisa.desbloqueadas.length >= 1;
    case "achv-5-techs":
      return state.pesquisa.desbloqueadas.length >= 5;
    case "achv-estabilidade-perfeita":
      return player.estabilidade >= 100;
    case "achv-eleicao-vencida":
      return state.eleicoes.some((e) => e.venceu);
    case "achv-multinacional":
      return state.multinacionais.some((m) => m.paisOperacao === player.id);
    default:
      return false;
  }
}

/**
 * Cria um snapshot do ranking mundial (top 10 PIB + Força Militar).
 * Guardado periodicamente (anual).
 */
export function createRankingSnapshot(state: GameState): RankingSnapshot {
  const top10Pib = rankByGdp(state, 10).map((c) => c.id);
  const top10Forca = rankByFM(state, 10).map((c) => c.id);
  const posicaoJogadorPib = state.playerCountryId ? top10Pib.indexOf(state.playerCountryId) : -1;
  const posicaoJogadorForca = state.playerCountryId ? top10Forca.indexOf(state.playerCountryId) : -1;
  return {
    id: `rank-${state.turno.toString().padStart(4, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    top10Pib,
    top10Forca,
    posicaoJogadorPib,
    posicaoJogadorForca,
  };
}

/** Adiciona um snapshot ao histórico (máx. 50). */
export function addRankingSnapshot(state: GameState, snapshot: RankingSnapshot): GameState {
  return {
    ...state,
    rankingsHistorico: [...state.rankingsHistorico, snapshot].slice(-50),
  };
}

/**
 * Processa missões + achievements + snapshot de ranking anual.
 * Chamado pelo motor mensal.
 */
export function processMissionsAndAchievements(state: GameState): {
  state: GameState;
  eventos: { tipo: "missao_completa" | "missao_falhada" | "achievement" | "ranking_snapshot"; titulo: string; texto: string }[];
} {
  const eventos: { tipo: "missao_completa" | "missao_falhada" | "achievement" | "ranking_snapshot"; titulo: string; texto: string }[] = [];
  let newState = state;

  // Missões.
  const mResult = processMissions(newState);
  newState = mResult.state;
  for (const ev of mResult.eventos) {
    eventos.push({
      tipo: ev.tipo === "completa" ? "missao_completa" : "missao_falhada",
      titulo: ev.tipo === "completa" ? `Missão completa: ${ev.titulo}` : `Missão falhada: ${ev.titulo}`,
      texto: ev.tipo === "completa"
        ? `Missão "${ev.titulo}" concluída! Recompensa: ${ev.recompensa}.`
        : `Missão "${ev.titulo}" expirou sem ser concluída.`,
    });
  }

  // Achievements.
  const aResult = checkAchievements(newState);
  newState = aResult.state;
  for (const ev of aResult.eventos) {
    eventos.push({
      tipo: "achievement",
      titulo: `Achievement: ${ev.titulo}`,
      texto: `Achievement desbloqueado: ${ev.titulo}.`,
    });
  }

  // Snapshot anual de ranking (a cada 12 turnos = 1 ano).
  if (state.turno > 0 && state.turno % 12 === 0) {
    const snapshot = createRankingSnapshot(newState);
    newState = addRankingSnapshot(newState, snapshot);
    eventos.push({
      tipo: "ranking_snapshot",
      titulo: `Snapshot de ranking anual (${snapshot.data})`,
      texto: `Posição do jogador: PIB #${snapshot.posicaoJogadorPib >= 0 ? snapshot.posicaoJogadorPib + 1 : "—"}/${snapshot.top10Pib.length}; Força #${snapshot.posicaoJogadorForca >= 0 ? snapshot.posicaoJogadorForca + 1 : "—"}/${snapshot.top10Forca.length}.`,
    });
  }

  return { state: newState, eventos };
}

// --- Helpers ---------------------------------------------------------------

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}
