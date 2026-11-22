// src/lib/engine/economy.ts
// Lógica económica: crescimento do PIB com retornos decrescentes,
// receitas (impostos, comércio) e despesas (manutenção do exército, serviços).
// Tudo funções puras que devolvem deltas a aplicar.

import type { BudgetAllocation, Country, GameState } from "@/types";
import { Rng } from "./rng";
import { aiBudgetFor, normalizeBudget } from "./budget";
import { calculateTaxRevenue, getEffectiveTaxPolicy } from "./fiscal";
import { calculateBlocTradeBonus } from "./blocs";

/** Limite mensal de crescimento/contracção do PIB (evita saltos absurdos). */
export const MAX_GROWTH_PER_TURN = 0.05; // ±5% por mês
/** Limite anual (aplicado se resolution === "anual"). */
export const MAX_GROWTH_ANNUAL = 0.4; // ±40% por ano

/**
 * Calcula o investimento absoluto (em dólares) num setor, dado o orçamento.
 * = (allocation / 100) * tesouro_disponivel
 * O tesouro_disponivel é o tesouro atual (tudo é gastável).
 */
export function sectorInvestment(
  allocationPct: number,
  country: Country,
): number {
  if (allocationPct <= 0 || country.tesouro <= 0) return 0;
  return (allocationPct / 100) * country.tesouro;
}

/**
 * Fator de crescimento do PIB por investimento em economia, com retornos
 * decrescentes. Fórmula: boost = MAX * (1 - exp(-k * ratio))
 *   - ratio = investimento / PIB_mensal
 *   - MAX = 0.5% (limite máximo de boost por mês)
 *   - k = 8 (atinge ~95% do máximo quando ratio = ~0.4, i.e., 40% do PIB investido)
 *
 * Sem investimento: 0.
 * Com investimento de 1% do PIB mensal: ~0.31%
 * Com investimento de 5% do PIB mensal: ~0.49% (quase no máximo)
 */
export function economyInvestmentBoost(investment: number, gdpMonthly: number): number {
  if (investment <= 0 || gdpMonthly <= 0) return 0;
  const ratio = investment / gdpMonthly;
  const MAX = 0.005; // 0.5% por mês
  const k = 8;
  return MAX * (1 - Math.exp(-k * ratio));
}

/**
 * Crescimento base do PIB (sem investimento, sem fatores).
 * Fase 12 — equilíbrio: 0.3% por mês ≈ 3.6% ao ano (mais realista para economias saudáveis).
 */
export const BASE_MONTHLY_GROWTH = 0.003;

/**
 * Calcula o crescimento mensal do PIB de um país.
 * Retorna um valor fracionário (ex.: 0.003 = 0.3% por mês).
 */
export function calculateGdpGrowth(
  country: Country,
  budget: BudgetAllocation,
  state: GameState,
  rng: Rng,
): number {
  const gdpMonthly = country.pib / 12;
  const colapsoTurnos = state.colapsoTurnos[country.id] ?? 0;
  const emGuerra = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  );

  // Investimento em economia (retornos decrescentes).
  const investEcon = sectorInvestment(budget.economia, country);
  const boost = economyInvestmentBoost(investEcon, gdpMonthly);

  // Penais.
  const warPenalty = emGuerra ? -0.004 : 0; // -0.4% por mês em guerra
  const collapsePenalty = -Math.min(0.003 * colapsoTurnos, 0.015); // até -1.5%
  const debtPenalty = country.tesouro < 0 ? -0.001 : 0; // -0.1% em dívida

  // Bónus por estabilidade alta.
  const stabilityBonus = country.estabilidade > 70 ? 0.0008 : 0;

  // Ruído pequeno (±0.05%).
  const noise = rng.range(-0.0005, 0.0005);

  let growth = BASE_MONTHLY_GROWTH + boost + warPenalty + collapsePenalty + debtPenalty + stabilityBonus + noise;

  // Clamp no crescimento mensal.
  growth = clamp(growth, -MAX_GROWTH_PER_TURN, MAX_GROWTH_PER_TURN);

  // Se a resolução for anual, multiplica por 12 (com clamp anual).
  if (state.config.resolution === "anual") {
    growth = clamp(growth * 12, -MAX_GROWTH_ANNUAL, MAX_GROWTH_ANNUAL);
  }
  return growth;
}

/**
 * Receitas do tesouro por turno: impostos (Fase 5: política fiscal real) +
 * comércio (tratados) + bónus de comércio interno de blocos (Fase 6).
 *
 * Impostos: calculateTaxRevenue (PIB × taxa efetiva × (1-evasão)).
 * Comércio: 0.05% do PIB mensal por tratado comercial ativo.
 * Blocos: calculateBlocTradeBonus (membros do mesmo bloco têm bónus).
 */
export function calculateRevenue(
  country: Country,
  state: GameState,
): number {
  // Fase 5: receita fiscal real baseada em política fiscal.
  const taxPolicy = getEffectiveTaxPolicy(country, state);
  const tax = calculateTaxRevenue(country, taxPolicy);
  // Comércio bilateral (tratados).
  const gdpMonthly = country.pib / 12;
  const tradeTreaties = state.tratados.filter(
    (t) => !t.rompido && t.tipo === "comercio" && t.paises.includes(country.id),
  ).length;
  const trade = gdpMonthly * 0.0005 * tradeTreaties;
  // Fase 6: bónus de comércio interno de blocos.
  const blocBonus = calculateBlocTradeBonus(state, country.id);
  return tax + trade + blocBonus;
}

/**
 * Despesas fixas por turno: serviços governamentais + manutenção do exército.
 * Serviços: ~1.5% do PIB mensal (educação, saúde, infraestruturas, etc.).
 * Exército: 0.0008% do PIB mensal * (exército / 100), escala com o tamanho do país.
 */
export function calculateFixedExpenses(country: Country): number {
  const gdpMonthly = country.pib / 12;
  const services = gdpMonthly * 0.015;
  const army = gdpMonthly * 0.000008 * country.exercito; // ~0.06% do PIB anual por ponto de exército
  return services + army;
}

/**
 * Despesas variáveis: investimento em setores (do orçamento do país).
 * Para o jogador: usa o state.playerBudget (aplicado ao tesouro).
 * Para países IA: usa o orçamento derivado do regime.
 *
 * Nota: se o tesouro é ≤ 0 (dívida), os setoriais devolvem 0 — não se investe
 * com dívida. Isto evita o bug de "poupança negativa" que criaria receita irreal.
 */
export function calculateSectorSpending(
  country: Country,
  budget: BudgetAllocation,
): BudgetAllocation {
  if (country.tesouro <= 0) {
    return { economia: 0, exercito: 0, saudeEducacao: 0, seguranca: 0 };
  }
  // O orçamento é uma percentagem do tesouro. Normaliza para evitar soma > 100%.
  const norm = normalizeBudget(budget);
  return {
    economia: (norm.economia / 100) * country.tesouro,
    exercito: (norm.exercito / 100) * country.tesouro,
    saudeEducacao: (norm.saudeEducacao / 100) * country.tesouro,
    seguranca: (norm.seguranca / 100) * country.tesouro,
  };
}

/**
 * Calcula o novo tesouro: tesouro_anterior + receita - despesas_fixas - despesas_setoriais.
 * Pode ficar negativo (dívida pública).
 */
export function calculateNewTreasury(
  country: Country,
  budget: BudgetAllocation,
  state: GameState,
): { tesouro: number; receita: number; despesas: number } {
  const receita = calculateRevenue(country, state);
  const fixas = calculateFixedExpenses(country);
  const setoriais = calculateSectorSpending(country, budget);
  const totalSetoriais =
    setoriais.economia + setoriais.exercito + setoriais.saudeEducacao + setoriais.seguranca;
  const despesas = fixas + totalSetoriais;
  const novo = country.tesouro + receita - despesas;
  return { tesouro: novo, receita, despesas };
}

/** Orçamento efetivo de um país (jogador usa o seu; IA usa o seu default). */
export function getEffectiveBudget(country: Country, state: GameState): BudgetAllocation {
  if (country.donoJogador) {
    return state.playerBudget;
  }
  return aiBudgetFor(country, state);
}

// --- Helpers ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
