// src/lib/engine/coup.ts
// Lógica do golpe de estado. Se o colapso durar vários turnos, a probabilidade
// de golpe sobe; se ocorrer, muda o regime, reduz a aprovação inicial do novo
// governo, pode romper tratados e alterar relações.

import type { Country, GameState, RegimeType, Relation, Treaty } from "@/types";
import { Rng, REGIMES_AUTORITARIOS } from "./rng";

/** Probabilidade base de golpe num país estável (praticamente zero). */
const COUP_BASE_PROBABILITY = 0.001; // 0.1% por turno

/**
 * Calcula a probabilidade de golpe de estado para um país.
 * - Base: 0.1% (quase nunca).
 * - +5% por turno em colapso (até 30%).
 * - +3% se estabilidade < 10.
 * - +2% se aprovação < 15.
 * - Bónus de instabilidade para regimes autoritários (juntas têm mais golpes).
 */
export function calculateCoupProbability(
  country: Country,
  state: GameState,
): number {
  const colapsoTurnos = state.colapsoTurnos[country.id] ?? 0;
  let p = COUP_BASE_PROBABILITY;
  p += Math.min(0.3, colapsoTurnos * 0.05); // +5% por turno de colapso, cap 30%
  if (country.estabilidade < 10) p += 0.03;
  if (country.aprovacao < 15) p += 0.02;
  if (REGIMES_AUTORITARIOS.includes(country.regime)) p += 0.01;
  // Em guerra: bónus por fragilidade.
  const emGuerra = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      (g.agressor === country.id || g.defensores.includes(country.id)),
  );
  if (emGuerra) p += 0.005;
  return Math.min(0.6, p); // cap 60%
}

/**
 * Determina se ocorre um golpe neste turno.
 * Usa o RNG passado (já derivado de seed+turno+país) para reprodutibilidade.
 */
export function shouldCoupOccur(
  country: Country,
  state: GameState,
  rng: Rng,
): boolean {
  const p = calculateCoupProbability(country, state);
  return rng.chance(p);
}

/** Novo regime após golpe. Dependendo do regime anterior e de fatores. */
export function pickNewRegime(country: Country, rng: Rng): RegimeType {
  // Regimes democráticos caem em autocracia/militar; autocracias rodam entre si.
  const democratic: RegimeType[] = [
    "democracia",
    "republica",
    "monarquia_constitucional",
  ];
  const authoritarian: RegimeType[] = [
    "autocracia",
    "regime_partido_unico",
    "teocracia",
    "monarquia_absoluta",
  ];
  if (democratic.includes(country.regime)) {
    // Democracia cai em junta militar ou autocracia.
    return rng.pick<RegimeType>(["junta_militar", "autocracia"]);
  }
  if (authoritarian.includes(country.regime)) {
    // Rotação entre autoritários: outro autoritário assume.
    return rng.pick<RegimeType>(
      authoritarian.filter((r) => r !== country.regime),
    );
  }
  // Junta militar tende a manter-se.
  if (country.regime === "junta_militar") {
    return rng.pick<RegimeType>(["autocracia", "regime_partido_unico"]);
  }
  return "junta_militar";
}

/**
 * Aplica um golpe ao estado: muda regime, redefine estabilidade/aprovação,
 * pode romper alguns tratados e deteriora relações com antigos aliados.
 * Devolve um NOVO estado (imutável) e uma lista de efeitos para o diário.
 */
export function applyCoup(
  state: GameState,
  countryId: string,
  rng: Rng,
): { state: GameState; efeitos: string[] } {
  const country = state.paises[countryId];
  if (!country) {
    return { state, efeitos: [] };
  }
  const newRegime = pickNewRegime(country, rng);
  const newStability = rng.range(25, 35); // governo novo mas frágil
  const newApproval = rng.range(20, 30); // apoio baixo do novo governo

  // 30% de chance de romper cada tratado comercial/aliança do país.
  const tratados: Treaty[] = state.tratados.map((t) => {
    if (t.rompido) return t;
    if (!t.paises.includes(countryId)) return t;
    if (t.tipo === "paz" || t.tipo === "nao_agressao") return t; // paz mantém-se
    if (rng.chance(0.3)) {
      return { ...t, rompido: true };
    }
    return t;
  });

  // Relações: deteriora -10 a -20 com todos os parceiros.
  const relacoes: Relation[] = state.relacoes.map((r) => {
    if (r.a !== countryId && r.b !== countryId) return r;
    const delta = -rng.int(10, 20);
    return { ...r, valor: clamp(r.valor + delta, -100, 100) };
  });

  // Países: actualiza o país que sofreu o golpe.
  const paises: GameState["paises"] = {
    ...state.paises,
    [countryId]: {
      ...country,
      regime: newRegime,
      estabilidade: Math.round(newStability),
      aprovacao: Math.round(newApproval),
    },
  };

  // Colapso: reseta o contador para o país do golpe (novo governo).
  const colapsoTurnos = { ...state.colapsoTurnos };
  delete colapsoTurnos[countryId];

  const efeitos = [
    `Regime mudou de ${country.regime} para ${newRegime}.`,
    `Estabilidade redefinida para ${Math.round(newStability)}.`,
    `Aprovação redefinida para ${Math.round(newApproval)}.`,
  ];
  const rompidos = tratados.filter((t, i) => !state.tratados[i].rompido && t.rompido).length;
  if (rompidos > 0) {
    efeitos.push(`${rompidos} tratado(s) rompido(s).`);
  }

  return {
    state: { ...state, paises, tratados, relacoes, colapsoTurnos },
    efeitos,
  };
}

// --- Helpers ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
