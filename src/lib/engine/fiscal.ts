// src/lib/engine/fiscal.ts
// Fase 5 — Economia e política fiscal.
//
// Impostos: taxPolicy (renda/capital/mercadorias) define receita fiscal real,
// com evasão dependente da estabilidade (país instável tem mais evasão).
//
// Multinacionais: empresas instaladas em países; cada uma paga impostos ao
// país de operação e envia lucros ao país sede. A attractividade determina
// se novas multinacionais se instalam (sorteado mensalmente).
//
// Atualização dinâmica de orçamento militar e tropas: o motor mensal ajusta
// estes campos com base no investimento do orçamento (exercito%) e no estado
// de guerra.

import type { Country, GameState, Multinational, RegimeType, TaxPolicy } from "@/types";
import { Rng, hashCombine, hashString } from "./rng";

/** Defaults de política fiscal por regime (em percentagem). */
export const TAX_POLICY_BY_REGIME: Readonly<Record<RegimeType, TaxPolicy>> = {
  democracia: { taxa: 28, taxaCapital: 22, taxaMercadorias: 18 },
  republica: { taxa: 25, taxaCapital: 20, taxaMercadorias: 15 },
  monarquia_constitucional: { taxa: 27, taxaCapital: 22, taxaMercadorias: 16 },
  autocracia: { taxa: 18, taxaCapital: 12, taxaMercadorias: 10 },
  regime_partido_unico: { taxa: 20, taxaCapital: 15, taxaMercadorias: 12 },
  teocracia: { taxa: 22, taxaCapital: 18, taxaMercadorias: 12 },
  junta_militar: { taxa: 15, taxaCapital: 10, taxaMercadorias: 8 },
  monarquia_absoluta: { taxa: 0, taxaCapital: 5, taxaMercadorias: 5 },
};

/** Política fiscal efetiva de um país (jogador usa a sua; IA usa default do regime). */
export function getEffectiveTaxPolicy(country: Country, state: GameState): TaxPolicy {
  if (country.donoJogador && state.playerTaxPolicy) {
    return state.playerTaxPolicy;
  }
  return country.taxPolicy ?? TAX_POLICY_BY_REGIME[country.regime];
}

/**
 * Receita fiscal mensal de um país.
 * = PIB_mensal × taxa_efetiva × (1 − evasão)
 *
 * taxa_efetiva pondera: renda (60%) + capital (30%) + mercadorias (10%).
 * Evasão: 5% base; +0.5% por ponto de estabilidade abaixo de 50 (até 30% evasão).
 * País com estabilidade 0: 5 + 25 = 30% evasão.
 * País com estabilidade 100: 5% evasão.
 */
export function calculateTaxRevenue(country: Country, taxPolicy: TaxPolicy): number {
  const gdpMonthly = country.pib / 12;
  // Taxa efetiva ponderada (em decimal).
  const taxaEfetiva = (taxPolicy.taxa * 0.6 + taxPolicy.taxaCapital * 0.3 + taxPolicy.taxaMercadorias * 0.1) / 100;
  // Evasão: base 5% + penalização por instabilidade.
  const evasionBase = 0.05;
  const evasionInstability = Math.max(0, (50 - country.estabilidade) * 0.005); // até +25%
  const evasion = Math.min(0.30, evasionBase + evasionInstability);
  return gdpMonthly * taxaEfetiva * (1 - evasion);
}

/**
 * Quão atraente o país é para multinacionais (0–100).
 * Factores: PIB (peso 30%), estabilidade (25%), impostos baixos (25%),
 * investimento em saúde/educação (20%).
 */
export function calculateAttractiveness(
  country: Country,
  taxPolicy: TaxPolicy,
  state: GameState,
): number {
  // PIB normalizado em log (10B → 0, 10T → 100).
  const pibScore = normLog(country.pib, 10, 13) * 30;
  // Estabilidade: directamente para 25 pontos.
  const stabScore = (country.estabilidade / 100) * 25;
  // Impostos baixos: taxa média mais baixa = mais atraente.
  // taxa média = (taxa + taxaCapital + taxaMercadorias) / 3; 0 → 25 pontos; 40 → 0.
  const taxaMedia = (taxPolicy.taxa + taxPolicy.taxaCapital + taxPolicy.taxaMercadorias) / 3;
  const taxScore = Math.max(0, (40 - taxaMedia) / 40) * 25;
  // Investimento em saúde/educação: percentagem do orçamento do jogador (proxy).
  // Para IA, usa o default do regime.
  const saudeEducPct = country.donoJogador
    ? (state.playerBudget?.saudeEducacao ?? 25)
    : 25; // default aproximado
  const investScore = (saudeEducPct / 100) * 20;
  const raw = pibScore + stabScore + taxScore + investScore;
  return clamp(raw, 0, 100);
}

/**
 * Tenta atrair uma nova multinacional para o país neste mês.
 * Probabilidade base = attractividade / 200 (até 50% se attractividade = 100).
 * A multinacional é criada com sede num país rico (top 5 PIB) e sector aleatório.
 */
export function tryAttractMultinational(
  state: GameState,
  countryId: string,
  rng: Rng,
): { state: GameState; novaMultinacional: Multinational | null } {
  const country = state.paises[countryId];
  if (!country) return { state, novaMultinacional: null };
  // Não atrair se em guerra.
  const emGuerra = state.guerras.some(
    (g) => g.estado === "ativa" && (g.agressor === countryId || g.defensores.includes(countryId)),
  );
  if (emGuerra) return { state, novaMultinacional: null };
  const taxPolicy = getEffectiveTaxPolicy(country, state);
  const attractiveness = calculateAttractiveness(country, taxPolicy, state);
  const prob = attractiveness / 200; // até 50%
  if (!rng.chance(prob)) return { state, novaMultinacional: null };

  // Sede: top 5 países por PIB (excluindo o próprio país).
  const topPib = Object.values(state.paises)
    .filter((c) => c.id !== countryId)
    .sort((a, b) => b.pib - a.pib)
    .slice(0, 5);
  const sede = topPib[Math.floor(rng.next() * topPib.length)] ?? country;
  // Sector aleatório.
  const sectors = ["tecnologia", "petróleo", "farmacêutica", "automóvel", "mineração", "finanças", "agrícola", "têxtil"];
  const sector = sectors[Math.floor(rng.next() * sectors.length)];
  // Receita: entre 0.1% e 2% do PIB mensal do país de operação.
  const gdpMonthly = country.pib / 12;
  const receita = gdpMonthly * (0.001 + rng.next() * 0.019);
  const empregados = Math.round(receita / 50000); // 1 empregado por $50k/ano
  // ID determinístico.
  const idRng = new Rng(
    hashCombine(
      hashCombine(state.config.seed, state.turno),
      hashString(`mult-${countryId}-${sector}`),
    ),
  );
  const r = idRng.int(0, 0xffffffff);
  const nomeSede = sede.nome.split(" ")[0];
  const nomes = ["Global", "Corp", "Industries", "Group", "Holdings", "Ventures"];
  const nomeSufixo = nomes[Math.floor(rng.next() * nomes.length)];
  const nova: Multinational = {
    id: `mult-${state.turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}`,
    nome: `${nomeSede} ${sector.charAt(0).toUpperCase() + sector.slice(1)} ${nomeSufixo}`,
    sede: sede.id,
    paisOperacao: countryId,
    sector,
    receita,
    empregados,
    turnoInstalacao: state.turno,
  };
  return {
    state: { ...state, multinacionais: [...state.multinacionais, nova] },
    novaMultinacional: nova,
  };
}

/**
 * Processa todas as multinacionais: cada uma paga impostos ao país de operação
 * (baseado na taxaCapital desse país) e envia lucros ao país sede.
 * Devolve novo estado com tesouros actualizados + eventos de diário.
 */
export function processMultinationals(state: GameState): {
  state: GameState;
  eventos: { multinacionalId: string; paisOperacao: string; impostos: number; sede: string; lucros: number }[];
} {
  if (state.multinacionais.length === 0) return { state, eventos: [] };
  const eventos: { multinacionalId: string; paisOperacao: string; impostos: number; sede: string; lucros: number }[] = [];
  const paises = { ...state.paises };
  for (const m of state.multinacionais) {
    const operacao = paises[m.paisOperacao];
    const sede = paises[m.sede];
    if (!operacao || !sede) continue; // país desapareceu (anexado)
    // Imposto pago ao país de operação: receita × taxaCapital (mensal).
    const taxPolicy = getEffectiveTaxPolicy(operacao, state);
    const impostosMensais = (m.receita / 12) * (taxPolicy.taxaCapital / 100);
    // Lucros remetidos à sede: 70% da receita após impostos.
    const lucrosMensais = ((m.receita / 12) - impostosMensais) * 0.7;
    paises[m.paisOperacao] = { ...operacao, tesouro: operacao.tesouro + impostosMensais };
    paises[m.sede] = { ...sede, tesouro: sede.tesouro + lucrosMensais };
    eventos.push({
      multinacionalId: m.id,
      paisOperacao: m.paisOperacao,
      impostos: impostosMensais,
      sede: m.sede,
      lucros: lucrosMensais,
    });
  }
  return { state: { ...state, paises }, eventos };
}

/**
 * Atualiza o orçamento militar anual de um país com base no investimento
 * mensal em «exercito» do seu orçamento.
 *
 * Lógica:
 *   - investimento mensal = (budget.exercito / 100) * tesouro
 *   - novo orcamento = orcamento_anterior + investimento_anualizado (× 12)
 *   - em guerra: investimento × 1.5 (esforço de guerra)
 *   - clamp em [orcamento_anterior * 0.5, orcamento_anterior * 3] por turno
 *     (evita saltos absurdos)
 */
export function updateMilitaryBudget(
  country: Country,
  state: GameState,
  monthlyInvestment: number,
): number {
  const emGuerra = state.guerras.some(
    (g) => g.estado === "ativa" && (g.agressor === country.id || g.defensores.includes(country.id)),
  );
  const fator = emGuerra ? 1.5 : 1.0;
  // Investimento anualizado.
  const anual = monthlyInvestment * 12 * fator;
  const novo = country.orcamentoMilitar + anual;
  // Clamp: entre 50% e 300% do anterior (por turno).
  const min = country.orcamentoMilitar * 0.5;
  const max = country.orcamentoMilitar * 3;
  return clampFinite(novo, min, Math.max(max, min + 1));
}

/**
 * Atualiza o número de tropas ativas de um país.
 *
 * Lógica:
 *   - crescimento = (orcamentoMilitar / 1e9) × 1000 (cada $1B → 1000 tropas/ano)
 *   - em guerra: -0.5%/mês de perdas (proporcional ao número de frentes)
 *   - clamp em [0, 5× tropas_iniciais] (evita crescimento explosivo)
 */
export function updateTroops(
  country: Country,
  state: GameState,
): { tropas: number; perdasGuerra: number } {
  // Crescimento baseado em orçamento militar (anual → mensal).
  const crescimentoAnual = (country.orcamentoMilitar / 1e9) * 1000; // tropas/ano
  const crescimentoMensal = crescimentoAnual / 12;
  // Perdas em guerra.
  const frentesAtivas = state.guerras.filter(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  ).length;
  const perdas = frentesAtivas > 0 ? country.tropas * 0.005 * frentesAtivas : 0;
  const novo = Math.max(0, country.tropas + crescimentoMensal - perdas);
  // Clamp superior: 5× tropas iniciais (para evitar crescimento infinito).
  // Como não guardamos tropas iniciais, usamos um teto absoluto de 5M.
  const teto = Math.max(country.tropas, 5_000_000);
  return { tropas: Math.round(clampFinite(novo, 0, teto)), perdasGuerra: perdas };
}

// --- Helpers ---------------------------------------------------------------

function normLog(value: number, minExp: number, maxExp: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const clamped = Math.min(Math.max(Math.log10(value), minExp), maxExp);
  return (clamped - minExp) / (maxExp - minExp);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampFinite(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
