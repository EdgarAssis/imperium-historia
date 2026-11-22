import { defineConfig } from "vitest/config";
import path from "node:path";

// Configuração do vitest: ambiente jsdom (para testar componentes React),
// alias `@` para `src`, e inclui apenas ficheiros `*.test.ts(x)`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
