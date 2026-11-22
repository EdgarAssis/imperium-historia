// src/lib/engine/elections.ts
// Fase 10 — Eleições democráticas.
//
// Em regimes democráticos (democracia, republica, monarquia_constitucional),
// eleições ocorrem a cada 48 meses (4 anos). O resultado baseia-se em:
//   - aprovação do jogador (peso 50%)
//   - crescimento económico (PIB actual vs PIB histórico) (peso 30%)
//   - estabilidade (peso 20%)
//
// Se o jogador vence (votos > 50%), mantém o poder. Se perde, é substituído
// por um líder opositor (lider muda, aprovação reset a 50).

import type { GameState, ElectionResult, RegimeType } from "@/types";
import { Rng, hashCombine, hashString } from "./rng";

/** Regimes com eleições democráticas. */
const REGIMES_DEMOCRATICOS: RegimeType[] = ["democracia", "republica", "monarquia_constitucional"];

/** Intervalo entre eleições (meses). 48 = 4 anos. */
export const ELECTION_INTERVAL = 48;

/** Verifica se o país do jogador tem regime democrático. */
export function hasElections(state: GameState): boolean {
  if (!state.playerCountryId) return false;
  const player = state.paises[state.playerCountryId];
  if (!player) return false;
  return REGIMES_DEMOCRATICOS.includes(player.regime);
}

/**
 * Calcula o resultado de uma eleição para o país do jogador.
 * Devolve votos do jogador (0-100) e do opositor (100-votosJogador).
 */
export function calculateElectionResult(state: GameState): {
  votosJogador: number;
  votosOpositor: number;
} {
  if (!state.playerCountryId) return { votosJogador: 50, votosOpositor: 50 };
  const player = state.paises[state.playerCountryId];
  if (!player) return { votosJogador: 50, votosOpositor: 50 };

  // Aprovação: 50% peso.
  const aprovScore = Math.max(0, Math.min(100, player.aprovacao));
  // Crescimento económico: comparar PIB actual com PIB de há 12 meses (playerHistory).
  let growthScore = 50; // neutro
  if (state.playerHistory.length >= 12) {
    const yearAgo = state.playerHistory[state.playerHistory.length - 12];
    if (yearAgo && yearAgo.pib > 0) {
      const growth = (player.pib - yearAgo.pib) / yearAgo.pib;
      // Crescimento 5% = score 100; -5% = score 0.
      growthScore = Math.max(0, Math.min(100, 50 + growth * 1000));
    }
  }
  // Estabilidade: 20% peso.
  const stabScore = Math.max(0, Math.min(100, player.estabilidade));

  // Combina: 50% aprovação + 30% crescimento + 20% estabilidade.
  let votosJogador = 0.5 * aprovScore + 0.3 * growthScore + 0.2 * stabScore;

  // Ruído determinístico (±5%).
  const rng = new Rng(hashCombine(state.config.seed, hashString(`election-${state.turno}`)));
  votosJogador += rng.range(-5, 5);
  votosJogador = Math.max(0, Math.min(100, Math.round(votosJogador)));
  const votosOpositor = 100 - votosJogador;
  return { votosJogador, votosOpositor };
}

/**
 * Realiza uma eleição se for altura (turno múltiplo de 48) e o regime for democrático.
 * Devolve novo estado + resultado da eleição (se ocorreu).
 */
export function processElection(state: GameState): {
  state: GameState;
  eleicao: ElectionResult | null;
} {
  if (!hasElections(state)) return { state, eleicao: null };
  // Eleições a cada 48 turnos (4 anos), começando no turno 48.
  if (state.turno === 0 || state.turno % ELECTION_INTERVAL !== 0) {
    return { state, eleicao: null };
  }
  if (!state.playerCountryId) return { state, eleicao: null };
  const { votosJogador, votosOpositor } = calculateElectionResult(state);
  const venceu = votosJogador > 50;
  const player = state.paises[state.playerCountryId];
  const eleicao: ElectionResult = {
    id: `eleicao-${state.turno.toString().padStart(4, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    votosJogador,
    votosOpositor,
    venceu,
    novoLider: venceu ? undefined : "Líder da Oposição",
  };
  let newState: GameState = {
    ...state,
    eleicoes: [...state.eleicoes, eleicao],
  };
  // Se perdeu, muda líder e reseta aprovação.
  if (!venceu && player) {
    newState = {
      ...newState,
      paises: {
        ...newState.paises,
        [state.playerCountryId]: {
          ...player,
          lider: "Líder da Oposição",
          aprovacao: 50, // novo governo começa neutro
          estabilidade: Math.max(20, Math.min(60, player.estabilidade - 10)), // abalo político
        },
      },
    };
  }
  return { state: newState, eleicao };
}

/** Verifica se uma eleição está próxima (próximos 12 meses). */
export function electionApproaching(state: GameState): boolean {
  if (!hasElections(state)) return false;
  const turnosParaEleicao = ELECTION_INTERVAL - (state.turno % ELECTION_INTERVAL);
  return turnosParaEleicao <= 12 && turnosParaEleicao > 0;
}

/** Turnos até à próxima eleição (0 se for este turno). */
export function turnsUntilElection(state: GameState): number {
  if (!hasElections(state)) return -1;
  return ELECTION_INTERVAL - (state.turno % ELECTION_INTERVAL);
}
