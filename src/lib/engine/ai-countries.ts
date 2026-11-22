// src/lib/engine/ai-countries.ts
// Fase 7 — Mundo vivo: decisões automáticas dos países IA.
//
// Para cada país não controlado pelo jogador, o motor toma decisões mensais:
//   - Propor tratados a aliados (relação > 40)
//   - Retaliar contra agressor recente (se mais forte)
//   - Pedir paz se exausto (estabilidade < 20 OU tropas < 30% do adversário)
//   - Ajustar orçamento dinamicamente (estabilidade baixa → +segurança; guerra → +exército)
//
// Estas decisões são determinísticas (RNG por país) e não afectam o jogador
// directamente (excepto se ele for alvo de uma proposta ou retaliação).

import type { GameState, DiplomaticProposalType } from "@/types";
import { Rng, rngForCountry } from "./rng";
import { proposeTreaty as proposeTreatyEngine } from "./diplomacy";
import { declareWar as declareWarEngine } from "./war";
import { signPeace as signPeaceEngine } from "./war";
import { calculateMilitaryStrength } from "./metrics";

/** Resultado do processamento de IA dos países. */
export interface AICountriesResult {
  state: GameState;
  eventos: { countryId: string; acao: string; detalhe: string }[];
}

/**
 * Processa decisões de IA para todos os países (não-jogador). Devolve novo
 * estado + eventos para o diário.
 *
 * Cada país toma no máximo 1 decisão por turno (para evitar explosão de eventos).
 */
export function processAICountries(state: GameState): AICountriesResult {
  if (!state.playerCountryId) return { state, eventos: [] };
  const eventos: { countryId: string; acao: string; detalhe: string }[] = [];
  let workingState = state;
  const aiCountryIds = Object.keys(state.paises).filter((id) => id !== state.playerCountryId);

  for (const countryId of aiCountryIds) {
    const country = workingState.paises[countryId];
    if (!country) continue;
    const rng = rngForCountry(workingState, `ai-${countryId}-${workingState.turno}`);

    // Tenta ações por prioridade:
    // 1. Pedir paz (se exausto em guerra).
    // 2. Retaliar (se perdeu província recentemente).
    // 3. Propor tratado a aliado.

    const paz = trySeekPeace(workingState, countryId, rng);
    if (paz.acted) {
      workingState = paz.state;
      eventos.push({ countryId, acao: "pedir_paz", detalhe: paz.detalhe });
      continue;
    }

    const retaliação = tryRetaliate(workingState, countryId, rng);
    if (retaliação.acted) {
      workingState = retaliação.state;
      eventos.push({ countryId, acao: "retaliar", detalhe: retaliação.detalhe });
      continue;
    }

    const proposta = tryProposeTreaty(workingState, countryId, rng);
    if (proposta.acted) {
      workingState = proposta.state;
      eventos.push({ countryId, acao: "propor_tratado", detalhe: proposta.detalhe });
      continue;
    }
  }

  return { state: workingState, eventos };
}

// ---------------------------------------------------------------------------
// 1. Pedir paz
// ---------------------------------------------------------------------------

/** Tenta pedir paz se o país está exausto numa guerra. */
function trySeekPeace(state: GameState, countryId: string, rng: Rng): { state: GameState; acted: boolean; detalhe: string } {
  // Encontra guerra ativa onde countryId é agressor ou defensor.
  const guerra = state.guerras.find(
    (g) => g.estado === "ativa" && (g.agressor === countryId || g.defensores.includes(countryId)),
  );
  if (!guerra) return { state, acted: false, detalhe: "" };
  const country = state.paises[countryId];
  // Identifica o adversário.
  const adversarioId = guerra.agressor === countryId
    ? guerra.defensores[0]
    : guerra.agressor;
  const adversario = state.paises[adversarioId];
  if (!adversario) return { state, acted: false, detalhe: "" };

  // Condições de exaustão.
  const exaustoPorEstab = country.estabilidade < 20;
  const exaustoPorTropas = country.tropas < adversario.tropas * 0.3;
  if (!exaustoPorEstab && !exaustoPorTropas) return { state, acted: false, detalhe: "" };

  // 10% chance/mês de pedir paz.
  if (!rng.chance(0.10)) return { state, acted: false, detalhe: "" };

  // Assina paz (statu quo).
  const vencedorPaz = country.estabilidade < adversario.estabilidade ? adversarioId : countryId;
  const result = signPeaceEngine(state, guerra.id, vencedorPaz, { retirada: true });
  if (!result.motivo.includes("sucesso")) {
    return { state, acted: false, detalhe: "" };
  }
  return {
    state: result.state,
    acted: true,
    detalhe: `${country.nome} pediu paz a ${adversario.nome} (exausto: ${exaustoPorEstab ? "estabilidade" : "tropas"}).`,
  };
}

// ---------------------------------------------------------------------------
// 2. Retaliar
// ---------------------------------------------------------------------------

/** Tenta retaliar se perdeu província recentemente e é mais forte que o agressor. */
function tryRetaliate(state: GameState, countryId: string, rng: Rng): { state: GameState; acted: boolean; detalhe: string } {
  const country = state.paises[countryId];
  // Procura guerras terminadas recentemente onde perdeu território.
  // Heurística: guerras terminadas no último turno onde era defensor.
  const guerrasPerdidas = state.guerras.filter(
    (g) => g.estado === "terminada" && g.turnoFim === state.turno - 1 && g.defensores.includes(countryId),
  );
  if (guerrasPerdidas.length === 0) return { state, acted: false, detalhe: "" };

  // Verifica se ainda perdeu províncias (não anexado).
  const temProvincia = Object.values(state.provincias).some((p) => p.countryId === countryId);
  if (!temProvincia) return { state, acted: false, detalhe: "" };

  // 20% chance/mês de retaliar.
  if (!rng.chance(0.20)) return { state, acted: false, detalhe: "" };

  const guerraPerdida = guerrasPerdidas[0];
  const agressorId = guerraPerdida.agressor;
  const agressor = state.paises[agressorId];
  if (!agressor) return { state, acted: false, detalhe: "" };

  // Só retaliar se for mais forte que o agressor.
  const forcaCountry = calculateMilitaryStrength(country);
  const forcaAgressor = calculateMilitaryStrength(agressor);
  if (forcaCountry < forcaAgressor * 1.2) {
    return { state, acted: false, detalhe: "" };
  }

  // Verifica tratado de paz ativo — se existir, não declara guerra.
  const haPaz = state.tratados.some(
    (t) => !t.rompido && (t.tipo === "paz" || t.tipo === "nao_agressao") &&
      t.paises.includes(countryId) && t.paises.includes(agressorId),
  );
  if (haPaz) return { state, acted: false, detalhe: "" };

  // Escolhe província do agressor para disputar.
  const provAgressor = Object.values(state.provincias).find((p) => p.countryId === agressorId);
  if (!provAgressor) return { state, acted: false, detalhe: "" };

  const result = declareWarEngine(state, countryId, [agressorId], [provAgressor.id], "conquistar");
  if (!result.war) {
    return { state, acted: false, detalhe: "" };
  }
  return {
    state: result.state,
    acted: true,
    detalhe: `${country.nome} retaliou contra ${agressor.nome} (perdeu província na guerra ${guerraPerdida.id}).`,
  };
}

// ---------------------------------------------------------------------------
// 3. Propor tratado a aliado
// ---------------------------------------------------------------------------

/** Tenta propor tratado (comércio/aliança) a país com relação > 40. */
function tryProposeTreaty(state: GameState, countryId: string, rng: Rng): { state: GameState; acted: boolean; detalhe: string } {
  const country = state.paises[countryId];
  // 5% chance/mês de propor tratado.
  if (!rng.chance(0.05)) return { state, acted: false, detalhe: "" };

  // Lista aliados potenciais (relação > 40, não-jogador, sem tratado activo).
  const aliados = state.relacoes
    .filter((r) => {
      const otherId = r.a === countryId ? r.b : r.b === countryId ? r.a : null;
      if (!otherId) return false;
      if (r.valor <= 40) return false;
      const other = state.paises[otherId];
      if (!other) return false;
      // Sem tratado comercial/aliança activo entre os dois.
      const temTratado = state.tratados.some(
        (t) => !t.rompido &&
          (t.tipo === "comercio" || t.tipo === "alianca") &&
          t.paises.includes(countryId) && t.paises.includes(otherId),
      );
      return !temTratado;
    });

  if (aliados.length === 0) return { state, acted: false, detalhe: "" };

  // Escolhe aliado aleatoriamente.
  const alvoRelacao = aliados[Math.floor(rng.next() * aliados.length)];
  const alvoId = alvoRelacao.a === countryId ? alvoRelacao.b : alvoRelacao.a;
  const alvo = state.paises[alvoId];

  // Tipo de tratado: comércio se relação 40-70, aliança se > 70.
  const tipo: DiplomaticProposalType = alvoRelacao.valor > 70 ? "alianca" : "comercio";

  const result = proposeTreatyEngine(state, country, alvo, tipo);
  const detalhe = result.proposal.aceite
    ? `${country.nome} propôs ${tipo} a ${alvo.nome}: ACEITE.`
    : `${country.nome} propôs ${tipo} a ${alvo.nome}: RECUSADO.`;
  return { state: result.state, acted: true, detalhe };
}
