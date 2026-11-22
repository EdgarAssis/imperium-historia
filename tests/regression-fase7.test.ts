// tests/regression-fase7.test.ts
// Testes de regressão da Fase 7: validar correções feitas na revisão.
// - IDs de tratados/guerras criados pela IA são determinísticos (não Math.random).
// - Guerras criadas pela IA têm a estrutura completa (frentes, objetivo, etc.).
// - Migração de saves antigos: simula um save da Fase 1 (sem campos novos) e valida.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore, migrateState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import { applyChanges } from "@/lib/engine/apply-changes";
import { proposeTreaty } from "@/lib/engine/diplomacy";
import type { GameState, AiChanges } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Fase 7: regressão — IDs determinísticos", () => {
  it("applyChanges: IDs de tratados IA são determinísticos com a mesma seed", () => {
    const s1 = makeState(123, "PRT");
    const s2 = makeState(123, "PRT");
    const changes: AiChanges = {
      paises: [],
      relacoes: [],
      tratados: [{ acao: "criar", tipo: "comercio", paises: ["PRT", "BRA"] }],
      guerras: [],
      provincias: [],
    };
    const r1 = applyChanges(s1, changes, { turno: 1, dataEvento: "2025-02-01" });
    const r2 = applyChanges(s2, changes, { turno: 1, dataEvento: "2025-02-01" });
    const t1 = r1.state.tratados.find((t) => t.id.startsWith("tratado-ia"));
    const t2 = r2.state.tratados.find((t) => t.id.startsWith("tratado-ia"));
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t1!.id).toBe(t2!.id);
  });

  it("applyChanges: IDs de guerras IA são determinísticos", () => {
    const s1 = makeState(123, "PRT");
    const s2 = makeState(123, "PRT");
    const changes: AiChanges = {
      paises: [],
      relacoes: [],
      tratados: [],
      guerras: [{ acao: "declarar", agressor: "USA", defensores: ["MEX"] }],
      provincias: [],
    };
    const r1 = applyChanges(s1, changes, { turno: 1, dataEvento: "2025-02-01" });
    const r2 = applyChanges(s2, changes, { turno: 1, dataEvento: "2025-02-01" });
    const w1 = r1.state.guerras.find((g) => g.id.startsWith("guerra-ia"));
    const w2 = r2.state.guerras.find((g) => g.id.startsWith("guerra-ia"));
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    expect(w1!.id).toBe(w2!.id);
  });

  it("applyChanges: guerras IA têm estrutura completa (frentes, objetivo, etc.)", () => {
    const state = makeState(123, "PRT");
    const changes: AiChanges = {
      paises: [],
      relacoes: [],
      tratados: [],
      guerras: [{ acao: "declarar", agressor: "USA", defensores: ["MEX"] }],
      provincias: [],
    };
    const result = applyChanges(state, changes, { turno: 1, dataEvento: "2025-02-01" });
    const war = result.state.guerras.find((g) => g.id.startsWith("guerra-ia"));
    expect(war).toBeDefined();
    expect(war!.frentes).toEqual([]);
    expect(war!.objetivo).toBe("conquistar");
    expect(war!.indemnizacoes).toBe(0);
    expect(war!.turnoFim).toBeNull();
    expect(war!.estado).toBe("ativa");
  });

  it("proposeTreaty: ID do tratado aceite é determinístico", () => {
    const s1 = makeState(7, "PRT");
    const s2 = makeState(7, "PRT");
    // Mesma seed → mesma resposta (aceitação) e mesmo ID.
    const r1 = proposeTreaty(s1, s1.paises["PRT"], s1.paises["BRA"], "comercio");
    const r2 = proposeTreaty(s2, s2.paises["PRT"], s2.paises["BRA"], "comercio");
    // Se ambos aceitaram (ou ambos recusaram), o ID deve ser igual.
    expect(r1.proposal.aceite).toBe(r2.proposal.aceite);
    if (r1.novoTratado && r2.novoTratado) {
      expect(r1.novoTratado.id).toBe(r2.novoTratado.id);
    }
  });
});

describe("Fase 7: regressão — países sem dono e províncias", () => {
  it("applyChanges não deixa província sem dono (novo_dono é sempre válido)", () => {
    const state = makeState(1, "USA");
    // Adiciona guerra ativa entre USA e MEX.
    state.guerras = [
      {
        id: "g1",
        agressor: "USA",
        defensores: ["MEX"],
        provinciasDisputa: ["MEX-MEX"],
        frentes: [{ provinceId: "MEX-MEX", progresso: 50, ultimoDelta: 0 }],
        objetivo: "conquistar",
        estado: "ativa",
        inicio: "2025-01-01",
        indemnizacoes: 0,
        turnoFim: null,
      },
    ];
    const changes: AiChanges = {
      paises: [],
      relacoes: [],
      tratados: [],
      guerras: [],
      provincias: [{ id: "MEX-MEX", novo_dono: "USA" }],
    };
    const result = applyChanges(state, changes);
    // Província tem novo dono USA.
    expect(result.state.provincias["MEX-MEX"].countryId).toBe("USA");
    expect(result.state.provincias["MEX-MEX"].ocupadaPor).toBeNull();
  });

  it("applyChanges rejeita província inexistente", () => {
    const state = makeState(1, "PRT");
    const changes: AiChanges = {
      paises: [],
      relacoes: [],
      tratados: [],
      guerras: [],
      provincias: [{ id: "INEXISTENTE", novo_dono: "USA" }],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].motivo).toContain("Província inexistente");
  });
});

describe("Fase 7: regressão — migração de save antigo", () => {
  it("migrateState preenche TODOS os campos novos (Fase 6) com defaults", () => {
    // Simula um save da Fase 1 (sem campos das Fases 3, 5, 6).
    const baseState = {
      config: {
        scenarioId: "mundo-2025",
        resolution: "mensal" as const,
        realism: "normal" as const,
        seed: 42,
        version: 1,
      },
      dataAtual: "2025-01-01",
      turno: 0,
      paises: {},
      provincias: {},
      relacoes: [],
      tratados: [],
      guerras: [],
      eventos: [],
      playerCountryId: "PRT",
    };
    // @ts-expect-error — simula save antigo sem os campos novos
    const migrated = migrateState(baseState);
    expect(migrated.playerBudget).toBeDefined();
    expect(migrated.colapsoTurnos).toEqual({});
    expect(migrated.propostas).toEqual([]);
    expect(migrated.pendingEvent).toBeNull();
    expect(migrated.playerHistory).toEqual([]);
    expect(migrated.turnosTop3).toBe(0);
    expect(migrated.vitoriaDeclarada).toBe(false);
  });

  it("migrateState preserva dados existentes sem os substituir", () => {
    const state = makeState(7, "PRT");
    // Adiciona alguns dados.
    state.playerBudget = { economia: 50, exercito: 10, saudeEducacao: 30, seguranca: 10 };
    state.propostas = [
      {
        id: "p1",
        de: "PRT",
        para: "BRA",
        tipo: "comercio" as const,
        aceite: true,
        motivo: "ok",
        turno: 0,
        data: "2025-01-01",
      },
    ];
    state.turnosTop3 = 5;
    state.vitoriaDeclarada = true;
    const migrated = migrateState(state);
    expect(migrated.playerBudget.economia).toBe(50);
    expect(migrated.propostas.length).toBe(1);
    expect(migrated.turnosTop3).toBe(5);
    expect(migrated.vitoriaDeclarada).toBe(true);
  });
});

describe("Fase 7: regressão — 50 turnos sem NaN", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("50 turnos: endTurn no store corre sem erros nem estados impossíveis", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "USA",
      realism: "normal",
      seed: 2025,
    });
    for (let i = 0; i < 50; i++) {
      // Resolve eventos pendentes automaticamente (escolha 0).
      const s = useGameStore.getState().state;
      if (s?.pendingEvent) {
        useGameStore.getState().resolveEvent(s.pendingEvent.evento.id, s.pendingEvent.evento.choices[0].id);
      }
      useGameStore.getState().endTurn();
      const ns = useGameStore.getState().state!;
      // Verifica invariantes.
      for (const id of Object.keys(ns.paises)) {
        const c = ns.paises[id];
        expect(Number.isFinite(c.pib), `PIB NaN em ${id}`).toBe(true);
        expect(c.pib, `PIB ≤ 0`).toBeGreaterThan(0);
        expect(Number.isFinite(c.tesouro), `Tesouro NaN em ${id}`).toBe(true);
        expect(c.estabilidade).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade).toBeLessThanOrEqual(100);
        expect(c.aprovacao).toBeGreaterThanOrEqual(0);
        expect(c.aprovacao).toBeLessThanOrEqual(100);
      }
      // Histórico cresce.
      expect(ns.playerHistory.length).toBe(i + 1);
      // Sem guerras fantasma: todas as guerras terminadas têm turnoFim definido.
      for (const g of ns.guerras) {
        if (g.estado === "terminada") {
          expect(g.turnoFim).not.toBeNull();
        }
      }
    }
  });
});
