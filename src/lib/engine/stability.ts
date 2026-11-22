// src/lib/engine/stability.ts
// Cálculo de estabilidade e aprovação (0–100), com drift, clamp, e estado
// «colapso». Estabilidade = 0 NÃO termina o jogo — activa penalizações fortes
// e crescentes, e aumenta o risco de golpe.

import type { BudgetAllocation, Country, GameState } from "@/types";
import { Rng } from "./rng";
import { sectorInvestment } from "./economy";

/** Taxa máxima de variação por turno (em pontos). Evita saltos grandes. */
export const MAX_DELTA = 8;

/**
 * Drift da estabilidade baseado em fatores económicos, políticos e de orçamento.
 * Retorna delta em pontos (positivo = subiu, negativo = desceu).
 */
export function calculateStabilityDelta(
  country: Country,
  budget: BudgetAllocation,
  state: GameState,
  gdpGrowth: number,
  rng: Rng,
): number {
  let delta = 0;

  // Crescimento económico.
  if (gdpGrowth > 0.01) delta += 0.8; // crescimento saudável
  else if (gdpGrowth < -0.005) delta -= 1.5; // recessão

  // Tesouro: superavit pequeno bónus; dívida penaliza.
  if (country.tesouro < 0) delta -= 1.5;
  else if (country.tesouro > country.pib * 0.05) delta += 0.3; // superavit grande

  // Guerra: penaliza estabilidade.
  const emGuerra = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  );
  if (emGuerra) delta -= 1.0;

  // Investimento em saúde/educação.
  const investSaude = sectorInvestment(budget.saudeEducacao, country);
  const gdpMonthly = country.pib / 12;
  if (investSaude > 0 && gdpMonthly > 0) {
    const ratio = investSaude / gdpMonthly;
    delta += Math.min(2.5, ratio * 50); // até +2.5/turno
  }

  // Investimento em segurança: bónus modesto + reduz risco de golpe.
  const investSeg = sectorInvestment(budget.seguranca, country);
  if (investSeg > 0 && gdpMonthly > 0) {
    const ratio = investSeg / gdpMonthly;
    delta += Math.min(1.5, ratio * 30); // até +1.5/turno
  }

  // Aprovação influencia estabilidade (governo popular é mais estável).
  if (country.aprovacao > 70) delta += 0.5;
  else if (country.aprovacao < 30) delta -= 1.0;

  // Colapso: penalização crescente.
  const colapsoTurnos = state.colapsoTurnos[country.id] ?? 0;
  if (colapsoTurnos > 0) {
    delta -= Math.min(5, 1 + colapsoTurnos * 0.5);
  }

  // Ruído pequeno (±0.5).
  delta += rng.range(-0.5, 0.5);

  return clamp(delta, -MAX_DELTA, MAX_DELTA);
}

/**
 * Drift da aprovação baseado em fatores económicos, guerra, desigualdade.
 * Aprovação move-se mais devagar que a estabilidade (opinião pública é pegajosa).
 */
export function calculateApprovalDelta(
  country: Country,
  budget: BudgetAllocation,
  state: GameState,
  gdpGrowth: number,
  rng: Rng,
): number {
  let delta = 0;

  // Economia: o eleitorado recompensa crescimento e pune recessão.
  if (gdpGrowth > 0.01) delta += 1.2;
  else if (gdpGrowth < -0.005) delta -= 1.8;

  // Tesouro.
  if (country.tesouro < 0) delta -= 1.0;

  // Guerra: rally around the flag se curta, desgaste se longa.
  const emGuerra = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  );
  if (emGuerra) delta -= 0.5; // desgaste

  // Investimento em saúde/educação: bónus forte na aprovação.
  const investSaude = sectorInvestment(budget.saudeEducacao, country);
  const gdpMonthly = country.pib / 12;
  if (investSaude > 0 && gdpMonthly > 0) {
    const ratio = investSaude / gdpMonthly;
    delta += Math.min(3, ratio * 60); // até +3/turno
  }

  // Investimento em economia: bónus modesto.
  const investEcon = sectorInvestment(budget.economia, country);
  if (investEcon > 0 && gdpMonthly > 0) {
    const ratio = investEcon / gdpMonthly;
    delta += Math.min(1.5, ratio * 40);
  }

  // Estabilidade baixa puxa a aprovação para baixo.
  if (country.estabilidade < 30) delta -= 0.8;

  // Colapso: penaliza muito a aprovação do governo atual.
  const colapsoTurnos = state.colapsoTurnos[country.id] ?? 0;
  if (colapsoTurnos > 0) delta -= Math.min(4, 1 + colapsoTurnos * 0.8);

  // Ruído.
  delta += rng.range(-0.7, 0.7);

  return clamp(delta, -MAX_DELTA, MAX_DELTA);
}

/** Aplica clamp 0–100 a um valor. */
export function clampStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Verifica se um país entrou em colapso (estabilidade = 0).
 * Actualiza o contador de turnos em colapso.
 */
export function updateCollapseTurns(
  countryId: string,
  newStability: number,
  currentColapso: Record<string, number>,
): { colapso: Record<string, number>; entrouColapso: boolean; saiuColapso: boolean } {
  const next = { ...currentColapso };
  const atual = next[countryId] ?? 0;
  let entrou = false;
  let saiu = false;
  if (newStability <= 0) {
    if (atual === 0) entrou = true;
    next[countryId] = atual + 1;
  } else {
    if (atual > 0) saiu = true;
    delete next[countryId];
  }
  return { colapso: next, entrouColapso: entrou, saiuColapso: saiu };
}

// --- Helpers ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
