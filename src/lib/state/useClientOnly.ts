// src/lib/state/useClientOnly.ts
// Helper para evitar hydration mismatch: só devolve `true` no cliente.
// Baseado em `useSyncExternalStore` — padrão recomendado pelo React 19.

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Devolve `true` quando estamos no cliente (após hydration).
 * No servidor e durante o primeiro render do SSR devolve `false`.
 */
export function useClientOnly(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
