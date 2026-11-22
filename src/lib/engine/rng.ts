// src/lib/engine/rng.ts
// Gerador pseudo-aleatório determinístico (Mulberry32).
// - Semente guardada em state.config.seed (constante por jogo).
// - Por turno, deriva sub-sementes por país via FNV-1a, garantindo
//   que a mesma (seed, turno, countryId) produz sempre a mesma sequência.

import type { GameState, RegimeType } from "@/types";

/**
 * RNG Mulberry32. Rápido, com período 2^32 suficiente para um jogo de simulação.
 * Estado interno é um u32.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Próximo double no intervalo [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Double no intervalo [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inteiro no intervalo [min, max] (inclusivo). */
  int(min: number, max: number): number {
    if (max < min) {
      throw new Error(`Rng.int: max < min (${max} < ${min})`);
    }
    return Math.floor(this.range(min, max + 1));
  }

  /** True com probabilidade p (0–1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Escolhe um elemento aleatório do array (não-vazio). */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error("Rng.pick: array vazio");
    }
    return arr[this.int(0, arr.length - 1)];
  }

  /** Replica o RNG para um ramo independente sem afectar o estado principal. */
  fork(extraSeed: number): Rng {
    return new Rng(hashCombine(this.state, extraSeed));
  }
}

/** Combina dois u32 num novo u32 via FNV-1a. Determinístico. */
export function hashCombine(a: number, b: number): number {
  let h = a >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x01000193) >>> 0;
  return h;
}

/** Hash FNV-1a de uma string para u32. */
export function hashString(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Cria um RNG determinístico para um turno específico.
 * Apenas baseado em (seed, turno) — para o motor global.
 */
export function rngForTurn(state: GameState): Rng {
  return new Rng(hashCombine(state.config.seed, state.turno));
}

/**
 * Cria um RNG determinístico para (seed, turno, countryId).
 * Garante que cada país tem um fluxo aleatório independente e reproduzível.
 */
export function rngForCountry(state: GameState, countryId: string): Rng {
  const turnHash = hashCombine(state.config.seed, state.turno);
  return new Rng(hashCombine(turnHash, hashString(countryId)));
}

/**
 * Lista de regimes considerados «estáveis» (baixo risco de golpe espontâneo).
 * Usado pelo motor de golpes.
 */
export const REGIMES_AUTORITARIOS: readonly RegimeType[] = [
  "autocracia",
  "regime_partido_unico",
  "teocracia",
  "junta_militar",
  "monarquia_absoluta",
];
