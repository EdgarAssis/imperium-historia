// src/lib/engine/annex.ts
// Sistema de conquista de países: quando TODAS as províncias de um país são
// conquistadas por outro (ou o país atinge estabilidade 0 prolongada e é
// anexado por um vizinho mais forte), o país perdedor é removido do mapa
// e o vencedor absorve parte do seu PIB/população/tesouro.
//
// Regras:
//   - annexCountry(state, vencedorId, perdedorId): anexa o perdedor ao vencedor.
//   - O vencedor absorve 80% do PIB, 70% do tesouro, 60% da população e 50%
//     do exército que sobraram ao perdedor.
//   - Todas as províncias do perdedor passam para o vencedor.
//   - Todas as relações com o perdedor são removidas.
//   - Todos os tratados com o perdedor são marcados como rompidos.
//   - Todas as guerras envolvendo o perdedor são terminadas.
//   - O país perdedor é removido do estado `paises`.
//   - Não se pode anexar o país do jogador (protecção).
//   - Adiciona evento ao diário.

import type { GameState, GameEvent, Country, Relation, Treaty, War } from "@/types";
import { clampStat } from "./stability";
import { Rng, hashCombine, hashString } from "./rng";
import { REPUTATION_IMPACTS } from "@/lib/config/reputation-impacts";
import { adjustReputation } from "./reputation";

/** Percentagens absorvidas pelo vencedor. */
const ABSORB_PIB = 0.8;
const ABSORB_TESOURO = 0.7;
const ABSORB_POPULACAO = 0.6;
const ABSORB_EXERCITO = 0.5;

export interface AnnexResult {
  state: GameState;
  /** True se a anexação foi efectuada. False caso contrário (país não existe,
   *  é o jogador, ou já não tem províncias para transferir). */
  anexado: boolean;
  /** Mensagem para o diário (se anexado). */
  mensagem: string;
}

/**
 * Anexa o país `perdedorId` ao país `vencedorId`. Devolve um novo estado.
 * - Se o perdedor não existir: devolve estado inalterado.
 * - Se o perdedor for o país do jogador: não anexa (protecção).
 * - Se o vencedor não existir: não anexa.
 */
export function annexCountry(
  state: GameState,
  vencedorId: string,
  perdedorId: string,
  options?: { motivo?: string },
): AnnexResult {
  if (vencedorId === perdedorId) {
    return { state, anexado: false, mensagem: "Não se pode anexar a si próprio." };
  }
  const vencedor = state.paises[vencedorId];
  const perdedor = state.paises[perdedorId];
  if (!vencedor || !perdedor) {
    return { state, anexado: false, mensagem: "País inexistente." };
  }
  if (perdedor.donoJogador) {
    // Protecção: o país do jogador nunca é anexado automaticamente.
    // Apenas eventos especiais (guerra civil perdida) podem fazê-lo.
    return { state, anexado: false, mensagem: "País do jogador não pode ser anexado." };
  }

  // RNG determinístico para o ID do evento.
  const idRng = new Rng(
    hashCombine(
      hashCombine(state.config.seed, state.turno),
      hashString(`annex-${vencedorId}-${perdedorId}`),
    ),
  );

  // Absorve recursos.
  const pibAbsorvido = perdedor.pib * ABSORB_PIB;
  const tesouroAbsorvido = perdedor.tesouro * ABSORB_TESOURO;
  const popAbsorvida = perdedor.populacao * ABSORB_POPULACAO;
  const exercitoAbsorvido = Math.round(perdedor.exercito * ABSORB_EXERCITO);

  // Novo vencedor com recursos absorvidos.
  const novoVencedor: Country = {
    ...vencedor,
    pib: vencedor.pib + pibAbsorvido,
    tesouro: vencedor.tesouro + tesouroAbsorvido,
    populacao: vencedor.populacao + popAbsorvida,
    exercito: clampInt(vencedor.exercito + exercitoAbsorvido, 0, 2000),
    estabilidade: clampStat(vencedor.estabilidade - 5), // custo político de anexar
  };

  // Paises: remove o perdedor, actualiza o vencedor.
  const paises: GameState["paises"] = { ...state.paises };
  delete paises[perdedorId];
  paises[vencedorId] = novoVencedor;

  // Províncias: todas do perdedor passam para o vencedor.
  const provincias: GameState["provincias"] = { ...state.provincias };
  for (const pid of Object.keys(provincias)) {
    const p = provincias[pid];
    if (p.countryId === perdedorId) {
      provincias[pid] = { ...p, countryId: vencedorId, ocupadaPor: null };
    }
  }

  // Relações: remove todas as relações que envolvem o perdedor.
  const relacoes: Relation[] = state.relacoes.filter(
    (r) => r.a !== perdedorId && r.b !== perdedorId,
  );

  // Tratados: marca como rompidos os tratados que envolvem o perdedor.
  const tratados: Treaty[] = state.tratados.map((t) => {
    if (!t.paises.includes(perdedorId)) return t;
    return { ...t, rompido: true };
  });

  // Guerras: termina todas as guerras que envolvem o perdedor.
  const guerras: War[] = state.guerras.map((g) => {
    if (g.estado !== "ativa") return g;
    if (g.agressor !== perdedorId && !g.defensores.includes(perdedorId)) return g;
    return { ...g, estado: "terminada" as const, turnoFim: state.turno };
  });

  // Evento de diário.
  const eventos: GameEvent[] = [...state.eventos];
  const motivo = options?.motivo ?? "todas as províncias conquistadas";
  const r = idRng.int(0, 0xffffffff);
  eventos.push({
    id: `ev-annex-${state.turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "guerra",
    titulo: `${perdedor.nome} anexado por ${vencedor.nome}`,
    texto: `O país ${perdedor.nome} foi anexado por ${vencedor.nome} após ${motivo}. As províncias, recursos e população foram absorvidos pelo vencedor.`,
    efeitos: [
      `Perdedor: ${perdedor.nome} (${perdedor.id})`,
      `Vencedor: ${vencedor.nome} (${vencedor.id})`,
      `PIB absorvido: $${formatCompact(pibAbsorvido)}`,
      `Tesouro absorvido: $${formatCompact(tesouroAbsorvido)}`,
      `Exército absorvido: ${exercitoAbsorvido}`,
      `População absorvida: ${Math.round(popAbsorvida / 1e6)} M`,
    ],
  });

  // BLOCO B5 — Impacto imediato de reputação: anexar país = -15 (agressão grave).
  let newState: GameState = { ...state, paises, provincias, relacoes, tratados, guerras, eventos };
  newState = adjustReputation(newState, vencedorId, REPUTATION_IMPACTS.anexar_pais, "anexar país");

  return {
    state: newState,
    anexado: true,
    mensagem: `${perdedor.nome} foi anexado por ${vencedor.nome}.`,
  };
}

/**
 * Verifica se um país perdeu todas as suas províncias (não tem nenhuma província
 * atribuída a ele no estado actual). Se sim, e se houver um agressor numa guerra
 * ativa contra ele, retorna o ID do agressor para anexação.
 */
export function findAnnexableCountry(state: GameState): { perdedorId: string; vencedorId: string } | null {
  for (const countryId of Object.keys(state.paises)) {
    if (countryId === state.playerCountryId) continue; // protecção do jogador
    // Verifica se o país tem alguma província.
    const temProvincia = Object.values(state.provincias).some((p) => p.countryId === countryId);
    if (temProvincia) continue;
    // Não tem províncias — verifica se há guerra ativa contra ele.
    const guerraAtiva = state.guerras.find(
      (g) => g.estado === "ativa" && g.defensores.includes(countryId),
    );
    if (guerraAtiva) {
      return { perdedorId: countryId, vencedorId: guerraAtiva.agressor };
    }
  }
  return null;
}

// --- Helpers ---------------------------------------------------------------

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}
