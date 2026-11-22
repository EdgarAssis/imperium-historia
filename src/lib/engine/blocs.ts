// src/lib/engine/blocs.ts
// Fase 6 — Blocos políticos e moedas.
//
// Efeitos de bloco:
//   - Comércio interno: membros do mesmo bloco têm bónus de receita por par.
//   - Votações: propostas (admissão/sanção/resolução) votadas por membros,
//     peso = Influência Política. Maioria simples fecha a votação.
//   - Moeda partilhada: blocos como UE usam EUR (não há câmbio interno).
//
// Funções puras. IDs determinísticos via (seed, turno, blocoId).

import type { GameState, Country, BlocVote } from "@/types";
import { BLOCOS, getBlocDefinition } from "@/data/blocs";
import { calculatePoliticalInfluence } from "./metrics";
import { Rng, hashCombine, hashString, rngForCountry } from "./rng";

/** Devolve a lista de membros actuais de um bloco (países com `blocoId` em `blocos`). */
export function getBlocMembers(state: GameState, blocoId: string): Country[] {
  return Object.values(state.paises).filter((c) => c.blocos.includes(blocoId));
}

/**
 * Bónus de comércio interno que um país recebe por pertencer a um bloco.
 * Soma, para cada bloco do país, `bonusComercioInterno × (n_outros_membros)`
 * aplicado ao PIB mensal.
 */
export function calculateBlocTradeBonus(state: GameState, countryId: string): number {
  const country = state.paises[countryId];
  if (!country) return 0;
  let bonus = 0;
  for (const blocoId of country.blocos) {
    const def = getBlocDefinition(blocoId);
    if (!def || def.bonusComercioInterno === 0) continue;
    const outrosMembros = getBlocMembers(state, blocoId).filter((c) => c.id !== countryId).length;
    bonus += def.bonusComercioInterno * outrosMembros * (country.pib / 12);
  }
  return bonus;
}

/**
 * Cria uma votação num bloco. Os votos são todos `null` inicialmente (não votados);
 * o motor mensal preenche-os automaticamente com base na relação dos membros
 * com os alvos.
 */
export function proposeBlocVote(
  state: GameState,
  blocoId: string,
  proposal: { tipo: BlocVote["tipo"]; proposta: string; alvos: string[] },
): { state: GameState; vote: BlocVote | null } {
  const def = getBlocDefinition(blocoId);
  if (!def) return { state, vote: null };
  const membros = getBlocMembers(state, blocoId);
  if (membros.length === 0) return { state, vote: null };
  // ID determinístico.
  const idRng = new Rng(
    hashCombine(
      hashCombine(state.config.seed, state.turno),
      hashString(`vote-${blocoId}-${proposal.tipo}-${state.turno}`),
    ),
  );
  const r = idRng.int(0, 0xffffffff);
  const votosIniciais: Record<string, "sim" | "nao" | "abstencao" | null> = {};
  for (const m of membros) {
    votosIniciais[m.id] = null;
  }
  const vote: BlocVote = {
    id: `vote-${state.turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}`,
    blocoId,
    proposta: proposal.proposta,
    tipo: proposal.tipo,
    alvos: [...proposal.alvos],
    turnoAbertura: state.turno,
    votos: votosIniciais,
    fechada: false,
  };
  return {
    state: { ...state, votacoes: [...state.votacoes, vote] },
    vote,
  };
}

/** Bloco A3/C6 — Prazo máximo de votações: 3 turnos após abertura. */
export const VOTE_MAX_TURNS = 3;

/**
 * Processa todas as votações em curso: cada membro vota com base na sua relação
 * com os alvos (e no tipo de proposta). Fecha votações quando todos votaram.
 *
 * BLOCO C6 — Prazo máximo: votações que excedem 3 turnos após abertura são
 * fechadas automaticamente (membros que não votaram contam como abstenção).
 */
export function processBlocVotes(state: GameState): {
  state: GameState;
  closedVotes: BlocVote[];
} {
  if (state.votacoes.length === 0) return { state, closedVotes: [] };
  const closed: BlocVote[] = [];
  const votacoes = state.votacoes.map((vote) => {
    if (vote.fechada) return vote;
    // BLOCO C6 — Verifica prazo máximo (3 turnos).
    const turnosDecorridos = state.turno - vote.turnoAbertura;
    const prazoExpirado = turnosDecorridos >= VOTE_MAX_TURNS;

    let todosVotaram = true;
    const novosVotos = { ...vote.votos };
    for (const membroId of Object.keys(novosVotos)) {
      if (novosVotos[membroId] !== null) continue;
      // Se prazo expirou, força voto (abstenção para não-votantes).
      if (prazoExpirado) {
        novosVotos[membroId] = "abstencao";
        continue;
      }
      // Vota automaticamente.
      const voto = autoVote(state, membroId, vote);
      if (voto === null) {
        todosVotaram = false;
      } else {
        novosVotos[membroId] = voto;
      }
    }
    // Se prazo expirou, força todos a votar (abstenção).
    if (prazoExpirado) {
      todosVotaram = true;
    }
    // Fecha se todos votaram.
    let fechada = vote.fechada;
    let resultado = vote.resultado;
    if (todosVotaram && !fechada) {
      fechada = true;
      resultado = tallyVotes(state, vote.blocoId, novosVotos);
      closed.push({ ...vote, votos: novosVotos, fechada, resultado });
    }
    return { ...vote, votos: novosVotos, fechada, resultado };
  });
  return { state: { ...state, votacoes }, closedVotes: closed };
}

/**
 * Decide o voto automático de um país membro.
 * Devolve "sim" | "nao" | "abstencao" ou null se ainda não vai votar (10% chance/mês).
 */
function autoVote(state: GameState, membroId: string, vote: BlocVote): "sim" | "nao" | "abstencao" | null {
  // 10% de chance de adiar o voto (simula deliberação).
  const rng = rngForCountry(state, `vote-${membroId}-${vote.id}`);
  if (rng.chance(0.1)) return null;
  // Relação média com os alvos.
  const alvoIds = vote.alvos;
  if (alvoIds.length === 0) {
    // Resolução política sem alvo: vota com base em influência média do bloco.
    const membros = getBlocMembers(state, vote.blocoId);
    const infMedia =
      membros.reduce((sum, m) => sum + calculatePoliticalInfluence(m, state), 0) / Math.max(1, membros.length);
    return infMedia > 40 ? "sim" : infMedia < 20 ? "nao" : "abstencao";
  }
  let somaRelacao = 0;
  let contaRelacao = 0;
  for (const alvoId of alvoIds) {
    const rel = findRelationValue(state, membroId, alvoId);
    somaRelacao += rel;
    contaRelacao += 1;
  }
  const media = contaRelacao > 0 ? somaRelacao / contaRelacao : 0;
  switch (vote.tipo) {
    case "admissao":
      // Relação boa → sim; má → não; neutra → abstenção.
      return media > 20 ? "sim" : media < -20 ? "nao" : "abstencao";
    case "sancionar":
      // Relação má → sim; boa → não; neutra → abstenção.
      return media < -20 ? "sim" : media > 20 ? "nao" : "abstencao";
    case "resolucao":
      // Vota com base em influência do bloco.
      return media >= 0 ? "sim" : "nao";
  }
}

/** Conta os votos ponderados por Influência Política. Devolve resultado. */
function tallyVotes(
  state: GameState,
  blocoId: string,
  votos: Record<string, "sim" | "nao" | "abstencao" | null>,
): "aprovada" | "rejeitada" {
  let pesoSim = 0;
  let pesoNao = 0;
  for (const membroId of Object.keys(votos)) {
    const voto = votos[membroId];
    if (voto === null) continue;
    if (voto === "abstencao") continue;
    const membro = state.paises[membroId];
    if (!membro) continue;
    const peso = calculatePoliticalInfluence(membro, state);
    if (voto === "sim") pesoSim += peso;
    else if (voto === "nao") pesoNao += peso;
  }
  return pesoSim > pesoNao ? "aprovada" : "rejeitada";
}

/**
 * Junta um país a um bloco. Aplica imediatamente (sem votação — o caller é
 * responsável por validar, ex.: se uma votação foi aprovada).
 * Efeito: bónus de comércio interno passa a aplicar-se; relação média com
 * membros melhora +5.
 */
export function joinBloc(state: GameState, countryId: string, blocoId: string): GameState {
  const country = state.paises[countryId];
  if (!country) return state;
  if (country.blocos.includes(blocoId)) return state; // já é membro
  const paises = {
    ...state.paises,
    [countryId]: { ...country, blocos: [...country.blocos, blocoId] },
  };
  // Melhora relação com outros membros do bloco.
  const membros = getBlocMembers({ ...state, paises }, blocoId).filter((c) => c.id !== countryId);
  let relacoes = state.relacoes.map((r) => ({ ...r }));
  for (const m of membros) {
    relacoes = adjustRelation(relacoes, countryId, m.id, +5);
  }
  return { ...state, paises, relacoes };
}

/**
 * Sai de um bloco. Custo: estabilidade -5 (custo político de isolamento).
 * Relação com antigos membros deteriora -10.
 */
export function leaveBloc(state: GameState, countryId: string, blocoId: string): GameState {
  const country = state.paises[countryId];
  if (!country) return state;
  if (!country.blocos.includes(blocoId)) return state;
  const novosBlocos = country.blocos.filter((b) => b !== blocoId);
  const paises = {
    ...state.paises,
    [countryId]: {
      ...country,
      blocos: novosBlocos,
      estabilidade: clampStat(country.estabilidade - 5),
    },
  };
  // Deteriora relação com antigos membros.
  const antigosMembros = getBlocMembers(state, blocoId).filter((c) => c.id !== countryId);
  let relacoes = state.relacoes.map((r) => ({ ...r }));
  for (const m of antigosMembros) {
    relacoes = adjustRelation(relacoes, countryId, m.id, -10);
  }
  return { ...state, paises, relacoes };
}

/** Lista de blocos aos quais o país pode candidatar-se (não é ainda membro). */
export function blocosDisponiveisPara(state: GameState, countryId: string): string[] {
  const country = state.paises[countryId];
  if (!country) return [];
  return Object.keys(BLOCOS).filter((b) => !country.blocos.includes(b));
}

// --- Helpers ---------------------------------------------------------------

function findRelationValue(state: GameState, a: string, b: string): number {
  for (const r of state.relacoes) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r.valor;
  }
  return 0;
}

function adjustRelation(
  relacoes: GameState["relacoes"],
  a: string,
  b: string,
  delta: number,
): GameState["relacoes"] {
  let found = false;
  const clamped = clampInt(delta, -100, 100);
  const result = relacoes.map((r) => {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
      found = true;
      const newValue = clampInt(r.valor + clamped, -100, 100);
      return { ...r, valor: newValue };
    }
    return r;
  });
  if (!found) {
    result.push({ a, b, valor: clamped });
  }
  return result;
}

function clampStat(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
