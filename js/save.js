import { clone } from './utils.js';

export const SAVE_KEY = 'imperium.historia.save.v1';
const SAVE_VERSION = 1;

export function saveGame(state) {
  const payload = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: clone(state),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function loadSavedGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state) return null;
  return parsed;
}

export function hasSavedGame() {
  return Boolean(localStorage.getItem(SAVE_KEY));
}

export function clearSavedGame() {
  localStorage.removeItem(SAVE_KEY);
}
