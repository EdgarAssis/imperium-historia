// src/lib/engine/apply-changes-helpers.ts
// Helper interno: aplica EventChoiceEffects a um país individual.
// Mantém-se separado do apply-changes.ts (que valida mudanças da IA) porque
// os efeitos de eventos são directos (não precisam de validação externa).

import type { GameState, EventChoiceEffects } from "@/types";
import { clampStat } from "./stability";

/**
 * Aplica EventChoiceEffects a um país específico. Clamps automáticos em
 * estabilidade/aprovação. PIB/tesouro/exército são percentagens (±).
 */
export function applyChangesToCountry(
  state: GameState,
  countryId: string,
  effects: EventChoiceEffects,
): GameState {
  if (!countryId) return state;
  const country = state.paises[countryId];
  if (!country) return state;
  const pibPct = effects.pib_pct ?? 0;
  const stabDelta = effects.estabilidade ?? 0;
  const aprovDelta = effects.aprovacao ?? 0;
  const tesPct = effects.tesouro_pct ?? 0;
  const exPct = effects.exercito_pct ?? 0;
  const newCountry = {
    ...country,
    pib: Math.max(1, country.pib * (1 + pibPct / 100)),
    tesouro: country.tesouro * (1 + tesPct / 100),
    estabilidade: clampStat(country.estabilidade + stabDelta),
    aprovacao: clampStat(country.aprovacao + aprovDelta),
    exercito: clampInt(country.exercito * (1 + exPct / 100), 0, 1000),
  };
  return {
    ...state,
    paises: { ...state.paises, [countryId]: newCountry },
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
