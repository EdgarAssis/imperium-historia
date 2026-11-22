// src/lib/engine/clock.ts
// Fase 1 — Sistema de tempo real.
// O relógio global avança a data dia a dia. O motor pesado (economia, guerras,
// eventos) corre apenas quando o mês rola (dia 1), para evitar cálculos caros
// a cada tick. Funções puras — o loop real (setInterval) vive na UI/store.
//
// Velocidades: dias de jogo por segundo real (0.5x a 10x).

import type { GameState, GameSpeed } from "@/types";
import { GAME_SPEEDS } from "@/types";
import { addDays } from "@/lib/state/date";

/** Intervalo (ms) entre ticks diários para uma dada velocidade. */
export function tickIntervalMs(velocidade: GameSpeed): number {
  return Math.round(1000 / velocidade);
}

/** Velocidade seguinte (ciclo para cima na lista). */
export function nextSpeed(velocidade: GameSpeed): GameSpeed {
  const idx = GAME_SPEEDS.indexOf(velocidade);
  return GAME_SPEEDS[Math.min(GAME_SPEEDS.length - 1, idx + 1)] ?? velocidade;
}

/** Velocidade anterior (ciclo para baixo na lista). */
export function prevSpeed(velocidade: GameSpeed): GameSpeed {
  const idx = GAME_SPEEDS.indexOf(velocidade);
  return GAME_SPEEDS[Math.max(0, idx - 1)] ?? velocidade;
}

/** Resultado de um tick diário. */
export interface TickDayResult {
  state: GameState;
  /** True se o dia avançado caiu no dia 1 de um mês (motor mensal deve correr). */
  monthRolled: boolean;
}

/**
 * Avança o relógio 1 dia de jogo. Função PURA.
 * NÃO corre o motor mensal — o chamador decide o que fazer quando `monthRolled`.
 * Mantém as referências de `paises`/`provincias` intactas (apenas muda a data)
 * para que selectors finos da UI não re-renderizem o mapa a cada dia.
 */
export function tickDay(state: GameState): TickDayResult {
  const novaData = addDays(state.dataAtual, 1);
  // Month rolled: a nova data cai no dia 01 (ex.: 2025-01-31 -> 2025-02-01).
  const monthRolled = novaData.endsWith("-01");
  return {
    state: { ...state, dataAtual: novaData },
    monthRolled,
  };
}
