// src/lib/engine/civil-war.ts
// Guerra civil: quando o país do jogador entra em colapso prolongado, pode
// dividir-se em duas fações. Cria um país rebelde com algumas províncias e
// uma guerra activa entre o país original e o rebelde.

import type { Country, GameState, Province, RegimeType } from "@/types";
import { REGIMES_AUTORITARIOS } from "./rng";

/**
 * Cria um país rebelde a partir do país do jogador. O rebelde fica com ~50%
// das províncias do jogador, com PIB e exército reduzidos.
 * Devolve um NOVO estado com: país rebelde adicionado, províncias transferidas,
 * relação hostil, e guerra activa declarada.
 */
export function triggerCivilWar(
  state: GameState,
  countryId: string,
): { state: GameState; rebeldeId: string | null; motivo: string } {
  const country = state.paises[countryId];
  if (!country) {
    return { state, rebeldeId: null, motivo: "País não encontrado" };
  }
  // País rebelde: ID alfa3 + "-R" (ex.: "PRT-R"). Ajusta nome e cor.
  const rebeldeId = `${countryId}-R`;
  if (state.paises[rebeldeId]) {
    return { state, rebeldeId: null, motivo: "Já existe um país rebelde" };
  }

  // Lista de províncias do país.
  const provinciasDoPais = Object.values(state.provincias).filter(
    (p) => p.countryId === countryId,
  );
  if (provinciasDoPais.length < 2) {
    return { state, rebeldeId: null, motivo: "País não tem províncias suficientes para se dividir" };
  }

  // Rebelde fica com metade (arredondada para cima) das províncias.
  const nRebelde = Math.ceil(provinciasDoPais.length / 2);
  // Embaralha deterministamente (com base no seed+turno+countryId) para escolher.
  const shuffled = deterministicShuffle(provinciasDoPais, state.config.seed, state.turno, countryId);
  const provinciasRebelde = shuffled.slice(0, nRebelde).map((p) => p.id);

  // PIB + tesouro + exército do rebelde: ~40% do original (fracção revoltosa).
  const rebeldePib = Math.round(country.pib * 0.4);
  const rebeldeTesouro = Math.round(country.tesouro * 0.4);
  const rebeldeExercito = Math.round(country.exercito * 0.5);
  const rebeldePop = Math.round(country.populacao * 0.4);

  // Regime do rebelde: espelha o do original mas marca como rival.
  const regimeRebelde: RegimeType = country.regime;

  // Cor: varia ligeiramente para distinguir no mapa (inverter para tons opostos).
  const corRebelde = invertColor(country.cor);

  const rebeldeCountry: Country = {
    id: rebeldeId,
    nome: `${country.nome} (Rebeldes)`,
    cor: corRebelde,
    capital: provinciasRebelde[0] ?? country.capital,
    populacao: rebeldePop,
    pib: rebeldePib,
    tesouro: rebeldeTesouro,
    exercito: rebeldeExercito,
    estabilidade: 30, // governo rebelde frágil
    aprovacao: 60, // apoiantes do rebelde
    regime: regimeRebelde,
    donoJogador: false,
  };

  // Transfere províncias: countryId -> rebeldeId.
  const provincias: Record<string, Province> = { ...state.provincias };
  for (const pid of provinciasRebelde) {
    const p = provincias[pid];
    if (p) {
      provincias[pid] = { ...p, countryId: rebeldeId, ocupadaPor: null };
    }
  }

  // Paises: adiciona o rebelde; original perde PIB + tesouro + exército correspondente.
  const paises: GameState["paises"] = {
    ...state.paises,
    [rebeldeId]: rebeldeCountry,
    [countryId]: {
      ...country,
      pib: country.pib - rebeldePib,
      tesouro: country.tesouro - rebeldeTesouro,
      exercito: country.exercito - rebeldeExercito,
      populacao: country.populacao - rebeldePop,
      estabilidade: 20, // país dilacerado
      aprovacao: 30,
    },
  };

  // Relação: -100 (inimizade total).
  const relacoes = [
    ...state.relacoes,
    { a: countryId, b: rebeldeId, valor: -100 },
  ];

  // Guerra activa entre original (agressor, tentando reconquistar) e rebelde.
  const warId = `guerra-civil-${state.turno.toString().padStart(4, "0")}`;
  const guerra = {
    id: warId,
    agressor: countryId,
    defensores: [rebeldeId],
    provinciasDisputa: provinciasRebelde,
    frentes: provinciasRebelde.map((pid) => ({
      provinceId: pid,
      progresso: 0,
      ultimoDelta: 0,
    })),
    objetivo: "conquistar" as const,
    estado: "ativa" as const,
    inicio: state.dataAtual,
    indemnizacoes: 0,
    turnoFim: null,
  };

  return {
    state: {
      ...state,
      paises,
      provincias,
      relacoes,
      guerras: [...state.guerras, guerra],
    },
    rebeldeId,
    motivo: "Guerra civil despoletada",
  };
}

// --- Helpers ---------------------------------------------------------------

/**
 * Embaralha um array de forma determinística usando FNV-1a + RNG Mulberry32.
 * Garante reprodutibilidade para a mesma (seed, turno, countryId).
 */
function deterministicShuffle<T>(
  arr: readonly T[],
  seed: number,
  turno: number,
  countryId: string,
): T[] {
  const result = [...arr];
  let h = seed >>> 0;
  h = Math.imul(h ^ (turno >>> 0), 0x01000193) >>> 0;
  for (let i = 0; i < countryId.length; i++) {
    h = Math.imul(h ^ countryId.charCodeAt(i), 0x01000193) >>> 0;
  }
  let state = h;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher-Yates shuffle.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Inverte um hex #RRGGBB para o complementar (para distinguir no mapa). */
function invertColor(hex: string): string {
  const match = /^#?([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) return "#666666";
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  // Inversão parcial (mais 50% para ficar ainda próximo mas distinguível).
  const newR = Math.round(255 - r * 0.5);
  const newG = Math.round(255 - g * 0.5);
  const newB = Math.round(255 - b * 0.5);
  return `#${pad(newR)}${pad(newG)}${pad(newB)}`;
}

function pad(n: number): string {
  return n.toString(16).padStart(2, "0");
}

// Silencia o aviso de unused (REGIMES_AUTORITARIOS importado para uso futuro).
void REGIMES_AUTORITARIOS;
