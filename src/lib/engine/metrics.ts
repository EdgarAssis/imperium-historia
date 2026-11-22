// src/lib/engine/metrics.ts
// Fase 2 — métricas realistas calculadas a partir dos dados dos países
// (orçamento militar, tropas, arsenal nuclear, PIB, blocos, aliados).
//
// Força Militar (0–100, estilo Global Firepower): pondera orçamento militar
//   (escala log), número de tropas (escala log) e bónus nuclear.
// Influência Política (0–100, peso diplomático): pondera economia (PIB log),
//   lugar no Conselho de Segurança da ONU, nº de blocos e nº de aliados.
//
// Ambas são funções PURAS derivadas do estado — não são guardadas, são
// recalculadas on demand (baratas: O(n) sobre ~58 países).

import type { Country, GameState } from "@/types";

/** Limites para normalização logarítmica (evitam divisões por zero). */
const LOG_BUDGET_MIN = 8; // $100M -> 0
const LOG_BUDGET_MAX = Math.log10(300e9); // $300B -> 100
const LOG_TROPAS_MIN = 3; // 1.000 tropas -> 0
const LOG_TROPAS_MAX = Math.log10(2_000_000); // 2M tropas -> 100
const LOG_PIB_MIN = 10; // $10B -> 0
const LOG_PIB_MAX = 13; // $10T -> 100

/** Normaliza log10 de um valor positivo entre 0 e 1. */
function normLog(value: number, minExp: number, maxExp: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const clamped = Math.min(Math.max(Math.log10(value), minExp), maxExp);
  return (clamped - minExp) / (maxExp - minExp);
}

/** Força Militar de um país (0–100). */
export function calculateMilitaryStrength(country: Country): number {
  const budgetScore = normLog(country.orcamentoMilitar, LOG_BUDGET_MIN, LOG_BUDGET_MAX) * 100;
  const tropasScore = normLog(country.tropas, LOG_TROPAS_MIN, LOG_TROPAS_MAX) * 100;
  const nuclearBonus = country.nuclear ? 15 : 0;
  const raw = 0.5 * budgetScore + 0.35 * tropasScore + nuclearBonus;
  return clamp(round1(raw), 0, 100);
}

/** Influência Política de um país (0–100). */
export function calculatePoliticalInfluence(country: Country, state: GameState): number {
  // Economia (PIB em escala log).
  const econScore = normLog(country.pib, LOG_PIB_MIN, LOG_PIB_MAX) * 100;
  // Membro permanente do Conselho de Segurança da ONU.
  const onuCS = country.blocos.includes("ONU-CS") ? 30 : 0;
  // Peso dos blocos (cada bloco vale 5 pontos, cap 20).
  const blocosBonus = Math.min(20, country.blocos.length * 5);
  // Aliados: relações > 40 (cap 15).
  const aliados = state.relacoes.filter(
    (r) => (r.a === country.id || r.b === country.id) && r.valor > 40,
  ).length;
  const aliadosBonus = Math.min(15, aliados);
  const raw = 0.5 * econScore + onuCS + blocosBonus + aliadosBonus;
  return clamp(round1(raw), 0, 100);
}

/** Ranking por Força Militar realista (desc). */
export function rankByMilitaryStrength(state: GameState, n: number = 10): Country[] {
  return Object.values(state.paises)
    .sort((a, b) => calculateMilitaryStrength(b) - calculateMilitaryStrength(a))
    .slice(0, n);
}

/** Ranking por Influência Política (desc). */
export function rankByInfluence(state: GameState, n: number = 10): Country[] {
  return Object.values(state.paises)
    .sort((a, b) => calculatePoliticalInfluence(b, state) - calculatePoliticalInfluence(a, state))
    .slice(0, n);
}

// --- Helpers ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
