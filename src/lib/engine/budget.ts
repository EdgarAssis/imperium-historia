// src/lib/engine/budget.ts
// Distribuição do orçamento: validação, defaults e estratégias por regime.

import type { BudgetAllocation, Country, GameState, RegimeType } from "@/types";

/** Distribuição equilibrada (25% em cada setor). */
export const BUDGET_DEFAULT: BudgetAllocation = {
  economia: 25,
  exercito: 25,
  saudeEducacao: 25,
  seguranca: 25,
};

/**
 * Estratégias orçamentais por regime. Os países controlados pela IA usam
 * estas percentagens; o jogador define as suas.
 */
export const BUDGET_BY_REGIME: Record<RegimeType, BudgetAllocation> = {
  democracia: { economia: 35, exercito: 20, saudeEducacao: 30, seguranca: 15 },
  republica: { economia: 35, exercito: 20, saudeEducacao: 30, seguranca: 15 },
  monarquia_constitucional: { economia: 35, exercito: 25, saudeEducacao: 25, seguranca: 15 },
  autocracia: { economia: 25, exercito: 30, saudeEducacao: 15, seguranca: 30 },
  regime_partido_unico: { economia: 30, exercito: 25, saudeEducacao: 20, seguranca: 25 },
  teocracia: { economia: 30, exercito: 25, saudeEducacao: 20, seguranca: 25 },
  junta_militar: { economia: 20, exercito: 40, saudeEducacao: 10, seguranca: 30 },
  monarquia_absoluta: { economia: 30, exercito: 30, saudeEducacao: 20, seguranca: 20 },
};

/**
 * Orçamento de um país controlado pela IA: usa o default do regime, mas
 * desvia para «segurança» se estiver em colapso, e para «exército» se estiver
 * em guerra.
 */
export function aiBudgetFor(country: Country, state: GameState): BudgetAllocation {
  const base = BUDGET_BY_REGIME[country.regime];
  const emGuerra = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  );
  const emColapso = (state.colapsoTurnos[country.id] ?? 0) > 0;
  if (!emGuerra && !emColapso) return { ...base };
  // Em guerra/colapso, canaliza 15 pontos da economia para o exército/segurança.
  const budget: BudgetAllocation = { ...base };
  budget.economia = Math.max(0, budget.economia - 15);
  if (emGuerra) {
    budget.exercito += 10;
    budget.seguranca += 5;
  }
  if (emColapso) {
    budget.seguranca += 15;
  }
  return budget;
}

/**
 * Normaliza um orçamento: garante que cada setor está em [0, 100] e,
 * se a soma > 100, escala para baixo preservando as proporções.
 * Se a soma < 100, devolve tal como está (o excedente fica como poupança).
 */
export function normalizeBudget(b: BudgetAllocation): BudgetAllocation {
  const clamped: BudgetAllocation = {
    economia: clamp01(b.economia),
    exercito: clamp01(b.exercito),
    saudeEducacao: clamp01(b.saudeEducacao),
    seguranca: clamp01(b.seguranca),
  };
  const total =
    clamped.economia +
    clamped.exercito +
    clamped.saudeEducacao +
    clamped.seguranca;
  if (total <= 100 || total === 0) return clamped;
  const scale = 100 / total;
  return {
    economia: clamped.economia * scale,
    exercito: clamped.exercito * scale,
    saudeEducacao: clamped.saudeEducacao * scale,
    seguranca: clamped.seguranca * scale,
  };
}

/** Soma das percentagens de um orçamento. */
export function budgetTotal(b: BudgetAllocation): number {
  return b.economia + b.exercito + b.saudeEducacao + b.seguranca;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
