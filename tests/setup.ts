// tests/setup.ts
// Configura jsdom + localStorage de teste (vitest).

import { beforeEach } from "vitest";

beforeEach(() => {
  // Limpa o localStorage entre testes.
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
});
