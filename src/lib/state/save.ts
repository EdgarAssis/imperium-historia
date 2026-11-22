// src/lib/state/save.ts
// Guardar/carregar jogos: 3 ranhuras em localStorage + export/import JSON.
// Tudo o que entra é validado com zod — um ficheiro inválido nunca corrompe o estado.

import { type GameState } from "@/types/index";
import { gameStateSchema } from "@/types/scenario";
import { migrateState } from "./store";

/** Versão do formato de save. Incrementar sempre que a estrutura mudar. */
export const SAVE_VERSION = 1;

export const STORAGE_PREFIX = "imperium-historia:save";
export const AUTOSAVE_KEY = `${STORAGE_PREFIX}:autosave`;
const SLOT_PREFIX = `${STORAGE_PREFIX}:slot`;

export type SaveSlot = 1 | 2 | 3;

/** Metadados para apresentar no ecrã de carregar jogo. */
export interface SaveSlotMeta {
  slot: SaveSlot;
  ocupado: boolean;
  turno: number | null;
  dataAtual: string | null;
  playerCountryId: string | null;
  playerCountryNome: string | null;
  scenarioId: string | null;
  guardadoEm: string | null;
}

/** Serializa um GameState para string JSON estável (chaves ordenadas). */
export function serializeState(state: GameState): string {
  // JSON.stringify com replacer para ordenar chaves — facilita diffs e testes.
  const stable = sortObjectKeys(state as unknown as Record<string, unknown>);
  return JSON.stringify(stable);
}

/** Guarda o estado numa ranhura. Devolve true em caso de sucesso. */
export function saveToSlot(state: GameState, slot: SaveSlot): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload = {
      state: JSON.parse(serializeState(state)) as GameState,
      guardadoEm: new Date().toISOString(),
    };
    window.localStorage.setItem(`${SLOT_PREFIX}:${slot}`, JSON.stringify(payload));
    // Também guardamos no autosave para suportar recarregar a página e continuar.
    window.localStorage.setItem(AUTOSAVE_KEY, serializeState(state));
    return true;
  } catch (err) {
    console.error("[save] erro ao guardar na ranhura", slot, err);
    return false;
  }
}

/** Carrega de uma ranhura. Lança SaveValidationError se o conteúdo for inválido. */
export function loadFromSlot(slot: SaveSlot): GameState {
  if (typeof window === "undefined") {
    throw new Error("localStorage indisponível no servidor");
  }
  const raw = window.localStorage.getItem(`${SLOT_PREFIX}:${slot}`);
  if (!raw) {
    throw new Error(`Ranhura ${slot} vazia`);
  }
  // A ranhura guarda { state, guardadoEm }. Validamos só o `state`.
  let wrapper: unknown;
  try {
    wrapper = JSON.parse(raw);
  } catch (err) {
    throw new SaveValidationError(
      "Ranhura corrupta: não é JSON válido.",
      [err instanceof Error ? err.message : "JSON parse error"],
    );
  }
  if (
    typeof wrapper !== "object" ||
    wrapper === null ||
    !("state" in wrapper) ||
    typeof (wrapper as { state?: unknown }).state === "undefined"
  ) {
    throw new SaveValidationError(
      "Ranhura corrupta: campo `state` em falta.",
      ["expected wrapper object with key `state`"],
    );
  }
  const stateField = (wrapper as { state: unknown }).state;
  return parseAndValidate(JSON.stringify(stateField));
}

/** Lista os metadados das 3 ranhuras. */
export function listSlots(): SaveSlotMeta[] {
  if (typeof window === "undefined") {
    return [1, 2, 3].map((slot) => emptyMeta(slot as SaveSlot));
  }
  return ([1, 2, 3] as const).map((slot) => readMeta(slot));
}

/** Apaga uma ranhura. */
export function deleteSlot(slot: SaveSlot): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${SLOT_PREFIX}:${slot}`);
}

/** Exporta o estado para uma string JSON (para download). */
export function exportToFile(state: GameState): string {
  return serializeState(state);
}

/** Importa de uma string JSON. Valida com zod; lança erro amigável se inválido. */
export function importFromFile(jsonString: string): GameState {
  return parseAndValidate(jsonString);
}

/** Faz autosave (usado no fim de cada turno). */
export function autosave(state: GameState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, serializeState(state));
  } catch (err) {
    console.error("[save] autosave falhou", err);
  }
}

/** Lê o autosave, ou null se não existir/for inválido. */
export function loadAutosave(): GameState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    return parseAndValidate(raw);
  } catch (err) {
    console.warn("[save] autosave inválido, ignorando", err);
    return null;
  }
}

/** Limpa o autosave (usado quando o jogador começa um jogo novo). */
export function clearAutosave(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTOSAVE_KEY);
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

class SaveValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "SaveValidationError";
    this.issues = issues;
  }
}

/**
 * Valida e transforma uma string JSON num GameState seguro.
 * Erros são sempre amigáveis — a app nunca deve rebentar por um save corrupto.
 */
function parseAndValidate(raw: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SaveValidationError(
      "Ficheiro de jogo inválido: não é JSON válido.",
      [err instanceof Error ? err.message : "JSON parse error"],
    );
  }
  const result = gameStateSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new SaveValidationError(
      `Ficheiro de jogo inválido: ${issues.length} erro(s) de validação.`,
      issues,
    );
  }
  return migrateIfNeeded(result.data);
}

/**
 * Migra saves antigos para a versão atual.
 * Aplica `migrateState` (preenche playerBudget, colapsoTurnos se em falta).
 */
function migrateIfNeeded(state: GameState): GameState {
  return migrateState(state);
}

function readMeta(slot: SaveSlot): SaveSlotMeta {
  const raw = window.localStorage.getItem(`${SLOT_PREFIX}:${slot}`);
  if (!raw) return emptyMeta(slot);
  try {
    const payload = JSON.parse(raw) as { state?: GameState; guardadoEm?: string };
    const state = payload.state;
    if (!state) return emptyMeta(slot);
    const country = state.playerCountryId ? state.paises[state.playerCountryId] : null;
    return {
      slot,
      ocupado: true,
      turno: state.turno,
      dataAtual: state.dataAtual,
      playerCountryId: state.playerCountryId,
      playerCountryNome: country?.nome ?? null,
      scenarioId: state.config.scenarioId,
      guardadoEm: payload.guardadoEm ?? null,
    };
  } catch {
    return emptyMeta(slot);
  }
}

function emptyMeta(slot: SaveSlot): SaveSlotMeta {
  return {
    slot,
    ocupado: false,
    turno: null,
    dataAtual: null,
    playerCountryId: null,
    playerCountryNome: null,
    scenarioId: null,
    guardadoEm: null,
  };
}

/** Ordena recursivamente as chaves de um objeto (estabilidade de serialização). */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
