// tests/engine.test.ts
// Testes unitários da Fase 1: criar jogo, guardar/carregar e importar JSON inválido.
// Estes são testes do «motor»/estado — não cobrem a UI.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import {
  saveToSlot,
  loadFromSlot,
  listSlots,
  exportToFile,
  importFromFile,
  loadAutosave,
} from "@/lib/state/save";
import { SCENARIOS } from "@/data/scenarios";
import { scenarioSchema } from "@/types/scenario";

const SCENARIO = SCENARIOS[0];

describe("Fase 1: criação de jogo", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
    localStorage.clear();
  });

  it("cria um GameState válido a partir do cenário mundo-2025", () => {
    const state = createInitialState(SCENARIO, "PRT", "normal", 42);
    expect(state.config.scenarioId).toBe("mundo-2025");
    expect(state.config.realism).toBe("normal");
    expect(state.config.seed).toBe(42);
    expect(state.dataAtual).toBe(SCENARIO.dataInicio);
    expect(state.turno).toBe(0);
    expect(state.playerCountryId).toBe("PRT");
    expect(state.paises["PRT"].donoJogador).toBe(true);
    expect(state.paises["USA"].donoJogador).toBe(false);
    // As 10 províncias do cenário devem estar presentes.
    expect(Object.keys(state.provincias).length).toBeGreaterThanOrEqual(10);
  });

  it("rejeita país do jogador inexistente", () => {
    expect(() => createInitialState(SCENARIO, "XXX", "normal", 1)).toThrow();
  });

  it("o cenário mundo-2025 tem pelo menos 10 países", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(10);
    expect(SCENARIO.paises.map((p) => p.id)).toContain("PRT");
  });

  it("newGame via store define o estado e marca o país do jogador", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "BRA",
      realism: "brutal",
      seed: 7,
    });
    const state = useGameStore.getState().state;
    expect(state).not.toBeNull();
    expect(state?.playerCountryId).toBe("BRA");
    expect(state?.paises["BRA"].donoJogador).toBe(true);
    expect(state?.config.realism).toBe("brutal");
  });

  it("advanceDate avança 1 mês sem alterar o estado anterior", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 1,
    });
    const before = useGameStore.getState().state;
    useGameStore.getState().advanceDate();
    const after = useGameStore.getState().state;
    expect(after).not.toBe(before);
    expect(before?.dataAtual).toBe("2025-01-01");
    expect(after?.dataAtual).toBe("2025-02-01");
    expect(after?.turno).toBe(1);
    expect(before?.turno).toBe(0);
  });

  it("addEvent adiciona evento ao histórico com id estável", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 1,
    });
    useGameStore.getState().addEvent({
      turno: 0,
      data: "2025-01-01",
      tipo: "sistema",
      titulo: "Início do mandato",
      texto: "O novo governo toma posse.",
      efeitos: [],
    });
    const state = useGameStore.getState().state;
    expect(state?.eventos.length).toBe(1);
    expect(state?.eventos[0].id).toBe("ev-0000-000");
  });
});

describe("Fase 1: guardar e carregar", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
    localStorage.clear();
  });

  it("guarda numa ranhura e recarrega um estado equivalente", () => {
    const original = createInitialState(SCENARIO, "PRT", "normal", 123);
    const ok = saveToSlot(original, 1);
    expect(ok).toBe(true);

    const loaded = loadFromSlot(1);
    expect(loaded.playerCountryId).toBe(original.playerCountryId);
    expect(loaded.config.seed).toBe(original.config.seed);
    expect(loaded.paises["PRT"].nome).toBe(original.paises["PRT"].nome);
    // round-trip do JSON deve preservar a estrutura
    expect(loaded).toEqual(original);
  });

  it("listSlots reporta corretamente ranhura vazia e ocupada", () => {
    const empty = listSlots();
    expect(empty[0].ocupado).toBe(false);

    saveToSlot(createInitialState(SCENARIO, "USA", "brutal", 99), 2);
    const filled = listSlots();
    expect(filled[1].ocupado).toBe(true);
    expect(filled[1].playerCountryNome).toBe("Estados Unidos da América");
    expect(filled[1].turno).toBe(0);
  });

  it("loadFromSlot numa ranhura vazia lança erro amigável", () => {
    expect(() => loadFromSlot(3)).toThrow(/Ranhura 3 vazia/);
  });

  it("autosave permite recuperar após «recarregar»", async () => {
    const original = createInitialState(SCENARIO, "BRA", "casual", 5);
    // Simula o efeito de autosave feito pelo GameScreen.
    const mod = await import("@/lib/state/save");
    mod.autosave(original);
    // Recupera imediatamente (simula reload).
    const recovered = loadAutosave();
    expect(recovered).not.toBeNull();
    expect(recovered?.playerCountryId).toBe("BRA");
  });

  it("exportToFile + importFromFile fazem round-trip estável", () => {
    const original = createInitialState(SCENARIO, "IND", "normal", 1);
    const json = exportToFile(original);
    const imported = importFromFile(json);
    expect(imported).toEqual(original);
  });
});

describe("Fase 1: validação de JSON inválido", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("JSON malformado (não é JSON) é rejeitado com erro claro", () => {
    expect(() => importFromFile("isto não é JSON")).toThrow();
    let caught: Error | null = null;
    try {
      importFromFile("isto não é JSON");
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }
    expect(caught?.message).toMatch(/não é JSON válido/);
  });

  it("JSON estruturalmente inválido (faltam campos) é rejeitado", () => {
    const badJson = JSON.stringify({ foo: "bar", baz: [1, 2, 3] });
    expect(() => importFromFile(badJson)).toThrow();
  });

  it("JSON com valores fora de intervalo é rejeitado (estabilidade > 100)", () => {
    const good = createInitialState(SCENARIO, "PRT", "normal", 1);
    const tampered = JSON.parse(JSON.stringify(good));
    tampered.paises["PRT"].estabilidade = 250;
    expect(() => importFromFile(JSON.stringify(tampered))).toThrow();
  });

  it("JSON com tipo errado num campo é rejeitado (turno como string)", () => {
    const good = createInitialState(SCENARIO, "PRT", "normal", 1);
    const tampered = JSON.parse(JSON.stringify(good));
    tampered.turno = "um";
    expect(() => importFromFile(JSON.stringify(tampered))).toThrow();
  });

  it("um save adulterado num ranhura não corrompe o import", () => {
    localStorage.setItem("imperium-historia:save:slot:1", "{not-json");
    expect(() => loadFromSlot(1)).toThrow();
    // O estado atual no store permanece intocado.
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 1,
    });
    expect(useGameStore.getState().state).not.toBeNull();
  });
});

describe("Fase 1: invariantes do cenário", () => {
  it("o cenário mundo-2025 passa na validação zod", () => {
    // Garante que não adulteramos o JSON por engano.
    expect(() => scenarioSchema.parse(SCENARIO)).not.toThrow();
  });

  it("todas as relações referenciam países que existem", () => {
    const ids = new Set(SCENARIO.paises.map((p) => p.id));
    for (const r of SCENARIO.relacoes) {
      expect(ids.has(r.a)).toBe(true);
      expect(ids.has(r.b)).toBe(true);
    }
  });

  it("todas as províncias referenciam países que existem", () => {
    const ids = new Set(SCENARIO.paises.map((p) => p.id));
    for (const p of SCENARIO.provincias) {
      expect(ids.has(p.countryId)).toBe(true);
    }
  });
});
