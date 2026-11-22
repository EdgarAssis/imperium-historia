// src/lib/engine/ranking.ts
// Ranking mundial: top países por PIB e por poder militar.
// Verificação de vitória relativa: jogador vence se ficar no top 3 (PIB OU
// militar) durante 5 anos consecutivos (= 60 turnos mensais ou 5 anuais).

import type { Country, GameState } from "@/types";

/** Threshold para declarar vitória: 5 anos = 60 turnos mensais ou 5 anuais. */
export function victoryThreshold(state: GameState): number {
  return state.config.resolution === "mensal" ? 60 : 5;
}

/**
 * Computa o ranking top-N por PIB. Devolve array ordenado (desc).
 */
export function rankByGdp(state: GameState, n: number = 10): Country[] {
  return Object.values(state.paises)
    .sort((a, b) => b.pib - a.pib)
    .slice(0, n);
}

/**
 * Computa o ranking top-N por poder militar. Devolve array ordenado (desc).
 */
export function rankByMilitary(state: GameState, n: number = 10): Country[] {
  return Object.values(state.paises)
    .sort((a, b) => b.exercito - a.exercito)
    .slice(0, n);
}

/**
 * Verifica se o país do jogador está no top 3 por PIB OU por poder militar.
 */
export function isPlayerInTop3(state: GameState): boolean {
  if (!state.playerCountryId) return false;
  const top3Pib = rankByGdp(state, 3).map((c) => c.id);
  const top3Mil = rankByMilitary(state, 3).map((c) => c.id);
  return top3Pib.includes(state.playerCountryId) || top3Mil.includes(state.playerCountryId);
}

/**
 * Verifica a condição de vitória e actualiza `turnosTop3` e `vitoriaDeclarada`.
 * Devolve um NOVO estado (imutável).
 */
export function checkVictory(state: GameState): { state: GameState; venceu: boolean } {
  if (!state.playerCountryId) {
    return { state, venceu: false };
  }
  const inTop3 = isPlayerInTop3(state);
  const novosTurnos = inTop3 ? state.turnosTop3 + 1 : 0;
  const threshold = victoryThreshold(state);
  const venceu = novosTurnos >= threshold && !state.vitoriaDeclarada;
  return {
    state: {
      ...state,
      turnosTop3: novosTurnos,
      vitoriaDeclarada: state.vitoriaDeclarada || venceu,
    },
    venceu,
  };
}
