// tests/events-victory.test.ts
// Testes da Fase 6: eventos aleatórios, guerra civil, ranking + vitória,
// 50 turnos sem estados impossíveis, e migração de saves antigos.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore, migrateState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  EVENT_LIBRARY,
  rollForEvent,
  applyEventChoice,
  calculateEventChance,
} from "@/lib/engine/events";
import { triggerCivilWar } from "@/lib/engine/civil-war";
import {
  rankByGdp,
  rankByMilitary,
  isPlayerInTop3,
  checkVictory,
  victoryThreshold,
} from "@/lib/engine/ranking";
import { advanceTurn } from "@/lib/engine/advance-turn";
import { rngForCountry } from "@/lib/engine/rng";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Fase 6: biblioteca de eventos", () => {
  it("biblioteca tem pelo menos 12 eventos", () => {
    expect(EVENT_LIBRARY.length).toBeGreaterThanOrEqual(12);
  });

  it("biblioteca tem pelo menos 20 eventos (após expansão Fase 7+)", () => {
    expect(EVENT_LIBRARY.length).toBeGreaterThanOrEqual(20);
  });

  it("cada evento tem 2 ou 3 escolhas", () => {
    for (const e of EVENT_LIBRARY) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.length).toBeLessThanOrEqual(3);
    }
  });

  it("cada escolha tem id e label únicos dentro do evento", () => {
    for (const e of EVENT_LIBRARY) {
      const ids = e.choices.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      const labels = e.choices.map((c) => c.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("evento «risco-guerra-civil» tem a escolha «ignorar» com nota GUERRA_CIVIL_TRIGGER", () => {
    const ev = EVENT_LIBRARY.find((e) => e.id === "risco-guerra-civil");
    expect(ev).toBeDefined();
    const ignore = ev!.choices.find((c) => c.id === "ignorar");
    expect(ignore).toBeDefined();
    expect(ignore!.efeitos.nota).toBe("GUERRA_CIVIL_TRIGGER");
  });
});

describe("Fase 6: rollForEvent + applyEventChoice", () => {
  it("rollForEvent devolve null se já há pendingEvent", () => {
    const state = makeState(1, "PRT");
    state.pendingEvent = {
      evento: EVENT_LIBRARY[0],
      turno: 1,
      data: "2025-01-01",
    };
    const country = state.paises["PRT"];
    const rng = rngForCountry(state, "PRT-event");
    expect(rollForEvent(state, country, rng)).toBeNull();
  });

  it("calculateEventChance aumenta com estabilidade baixa", () => {
    const state = makeState(1, "PRT");
    const country = state.paises["PRT"];
    const chanceAlta = calculateEventChance({ ...country, estabilidade: 80 }, state);
    const chanceBaixa = calculateEventChance({ ...country, estabilidade: 20 }, state);
    expect(chanceBaixa).toBeGreaterThan(chanceAlta);
  });

  it("calculateEventChance aumenta com tesouro negativo", () => {
    const state = makeState(1, "PRT");
    const country = state.paises["PRT"];
    const chanceOk = calculateEventChance(country, state);
    const chanceNeg = calculateEventChance({ ...country, tesouro: -1_000_000_000 }, state);
    expect(chanceNeg).toBeGreaterThan(chanceOk);
  });

  it("applyEventChoice aplica efeitos ao país do jogador", () => {
    const state = makeState(1, "PRT");
    const oldPib = state.paises["PRT"].pib;
    const result = applyEventChoice(state, "crise-economica", "austeridade");
    // Austeridade: pib_pct -2 → PIB baixa ~2%.
    expect(result.state.paises["PRT"].pib).toBeLessThan(oldPib);
    expect(result.nota).toContain("Austeridade");
  });

  it("applyEventChoice com evento inexistente não altera estado", () => {
    const state = makeState(1, "PRT");
    const result = applyEventChoice(state, "evento-inexistente", "x");
    expect(result.state).toBe(state);
    expect(result.nota).toBeNull();
  });
});

describe("Fase 6: guerra civil", () => {
  it("triggerCivilWar cria país rebelde + transfere províncias + declara guerra", () => {
    const state = makeState(7, "USA");
    const provinciasAntes = Object.values(state.provincias).filter(
      (p) => p.countryId === "USA",
    ).length;
    const result = triggerCivilWar(state, "USA");
    expect(result.rebeldeId).toBe("USA-R");
    expect(result.state.paises["USA-R"]).toBeDefined();
    expect(result.state.paises["USA-R"].nome).toContain("Rebeldes");
    // Províncias do país original diminuíram.
    const provinciasDepois = Object.values(result.state.provincias).filter(
      (p) => p.countryId === "USA",
    ).length;
    expect(provinciasDepois).toBeLessThan(provinciasAntes);
    // Guerra criada.
    const guerra = result.state.guerras.find(
      (g) => g.agressor === "USA" && g.defensores.includes("USA-R"),
    );
    expect(guerra).toBeDefined();
    expect(guerra!.estado).toBe("ativa");
    // Relação hostil.
    const rel = result.state.relacoes.find(
      (r) => (r.a === "USA" && r.b === "USA-R") || (r.b === "USA" && r.a === "USA-R"),
    );
    expect(rel).toBeDefined();
    expect(rel!.valor).toBe(-100);
  });

  it("triggerCivilWar rejeita país sem províncias suficientes", () => {
    const state = makeState(7, "PRT");
    // PRT tem só 1 província (Lisboa). Reduz para 1.
    const provinciasPRT = Object.values(state.provincias).filter(
      (p) => p.countryId === "PRT",
    );
    // Remove todas as províncias extra (deixa só 1).
    const provsToKeep = provinciasPRT.slice(0, 1);
    const newProvs: Record<string, GameState["provincias"][string]> = {};
    for (const p of provsToKeep) newProvs[p.id] = p;
    const stateModified = { ...state, provincias: newProvs };
    const result = triggerCivilWar(stateModified, "PRT");
    expect(result.rebeldeId).toBeNull();
    expect(result.motivo).toContain("não tem províncias");
  });

  it("triggerCivilWar é determinístico com a mesma seed", () => {
    const s1 = makeState(7, "USA");
    const s2 = makeState(7, "USA");
    const r1 = triggerCivilWar(s1, "USA");
    const r2 = triggerCivilWar(s2, "USA");
    // Mesmas províncias transferidas.
    const provs1 = Object.values(r1.state.provincias).filter((p) => p.countryId === "USA-R").map((p) => p.id).sort();
    const provs2 = Object.values(r2.state.provincias).filter((p) => p.countryId === "USA-R").map((p) => p.id).sort();
    expect(provs1).toEqual(provs2);
  });
});

describe("Fase 6: ranking e vitória", () => {
  it("rankByGdp devolve top 10 ordenado por PIB descendente", () => {
    const state = makeState(1, "PRT");
    const top = rankByGdp(state, 10);
    expect(top.length).toBe(10);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].pib).toBeLessThanOrEqual(top[i - 1].pib);
    }
  });

  it("rankByMilitary devolve top 10 ordenado por exército descendente", () => {
    const state = makeState(1, "PRT");
    const top = rankByMilitary(state, 10);
    expect(top.length).toBe(10);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].exercito).toBeLessThanOrEqual(top[i - 1].exercito);
    }
  });

  it("isPlayerInTop3: jogador PRT não está no top 3 PIB nem militar", () => {
    const state = makeState(1, "PRT");
    // PRT é pequeno; top 3 PIB são USA, CHN, DEU (ou semelhantes).
    expect(isPlayerInTop3(state)).toBe(false);
  });

  it("isPlayerInTop3: jogador USA está no top 3 PIB", () => {
    const state = makeState(1, "USA");
    expect(isPlayerInTop3(state)).toBe(true);
  });

  it("checkVictory: jogador no top 3 incrementa turnosTop3", () => {
    const state = makeState(1, "USA");
    const result = checkVictory(state);
    expect(result.state.turnosTop3).toBe(1);
    // USA precisa de 60 turnos (60 meses = 5 anos) em modo mensal.
    expect(victoryThreshold(state)).toBe(60);
  });

  it("checkVictory: jogador fora do top 3 reseta turnosTop3 a 0", () => {
    let state = makeState(1, "USA");
    state = checkVictory(state).state; // turnosTop3 = 1
    expect(state.turnosTop3).toBe(1);
    // Agora troca para um país pequeno.
    const newState: GameState = {
      ...state,
      playerCountryId: "PRT",
      paises: { ...state.paises },
    };
    // PRT não está no top 3.
    const result = checkVictory(newState);
    expect(result.state.turnosTop3).toBe(0);
  });

  it("checkVictory: declara vitória após 60 turnos no top 3 (mensal)", () => {
    let state = makeState(1, "USA");
    state = { ...state, turnosTop3: 59 }; // 1 turno antes de vencer
    const result = checkVictory(state);
    expect(result.venceu).toBe(true);
    expect(result.state.vitoriaDeclarada).toBe(true);
  });

  it("vitoriaDeclarada é cumulativa: não volta a declarar", () => {
    let state = makeState(1, "USA");
    state = { ...state, turnosTop3: 59, vitoriaDeclarada: true };
    const result = checkVictory(state);
    // Já declarada → não dispara venceu=true de novo.
    expect(result.venceu).toBe(false);
    expect(result.state.vitoriaDeclarada).toBe(true);
  });
});

describe("Fase 6: 50 turnos sem estados impossíveis", () => {
  it("50 turnos com Mock (sem IA real) — sem NaN, sem estados impossíveis", () => {
    let state = makeState(2025, "PRT");
    for (let i = 0; i < 50; i++) {
      // Resolve eventos pendentes automaticamente (escolha 0) para o teste
      // não ficar bloqueado.
      if (state.pendingEvent) {
        const event = state.pendingEvent.evento;
        const choiceId = event.choices[0].id;
        const r = applyEventChoice(state, event.id, choiceId);
        state = { ...r.state, pendingEvent: null };
      }
      state = advanceTurn(state);
      // Verifica invariantes.
      for (const id of Object.keys(state.paises)) {
        const c = state.paises[id];
        expect(Number.isFinite(c.pib), `PIB NaN em ${id} no turno ${i}`).toBe(true);
        expect(c.pib, `PIB ≤ 0 em ${id} no turno ${i}`).toBeGreaterThan(0);
        expect(Number.isFinite(c.tesouro), `Tesouro NaN em ${id} no turno ${i}`).toBe(true);
        expect(c.estabilidade, `Estab fora [0,100] em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade).toBeLessThanOrEqual(100);
        expect(c.aprovacao, `Aprov fora [0,100] em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.aprovacao).toBeLessThanOrEqual(100);
        expect(c.exercito, `Exército negativo em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
      }
      // Verifica playerHistory cresce.
      expect(state.playerHistory.length).toBe(i + 1);
      // Verifica pendingEvent é um evento válido (se presente).
      if (state.pendingEvent) {
        expect(state.pendingEvent.evento.choices.length).toBeGreaterThanOrEqual(2);
      }
    }
    // Após 50 turnos, o histórico tem 50 entradas.
    expect(state.playerHistory.length).toBe(50);
    // turnosTop3 deve ser consistente (não negativo, finito).
    expect(state.turnosTop3).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.turnosTop3)).toBe(true);
  });
});

describe("Fase 6: migração de saves antigos", () => {
  it("migrateState preenche pendingEvent, playerHistory, turnosTop3, vitoriaDeclarada", () => {
    // Simula um save da Fase 5 (sem os novos campos).
    const stateSemFase6 = makeState(1, "PRT");
    const stripped: GameState = {
      ...stateSemFase6,
      // @ts-expect-error — simula save antigo sem o campo
      pendingEvent: undefined,
      // @ts-expect-error — simula save antigo sem o campo
      playerHistory: undefined,
      // @ts-expect-error — simula save antigo sem o campo
      turnosTop3: undefined,
      // @ts-expect-error — simula save antigo sem o campo
      vitoriaDeclarada: undefined,
    };
    const migrated = migrateState(stripped);
    expect(migrated.pendingEvent).toBeNull();
    expect(migrated.playerHistory).toEqual([]);
    expect(migrated.turnosTop3).toBe(0);
    expect(migrated.vitoriaDeclarada).toBe(false);
  });
});

describe("Fase 6: ranking muda após conquistas e crises", () => {
  it("ranking muda quando PIB de um país muda significativamente", () => {
    const state = makeState(1, "USA");
    const topAntes = rankByGdp(state, 3).map((c) => c.id);
    // Reduz drasticamente o PIB do país #1.
    const firstId = topAntes[0];
    const newState = {
      ...state,
      paises: {
        ...state.paises,
        [firstId]: { ...state.paises[firstId], pib: state.paises[firstId].pib * 0.1 },
      },
    };
    const topDepois = rankByGdp(newState, 3).map((c) => c.id);
    // O ranking mudou.
    expect(topDepois).not.toEqual(topAntes);
  });
});

describe("Fase 6: integração store + resolveEvent", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("resolveEvent aplica efeitos e limpa pendingEvent", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 1,
    });
    const state = useGameStore.getState().state!;
    // Injecta um pendingEvent.
    useGameStore.getState().loadState({
      ...state,
      pendingEvent: {
        evento: EVENT_LIBRARY.find((e) => e.id === "boom-economico")!,
        turno: 0,
        data: state.dataAtual,
      },
    });
    const oldTesouro = useGameStore.getState().state!.paises["PRT"].tesouro;
    useGameStore.getState().resolveEvent("boom-economico", "poupar");
    const newState = useGameStore.getState().state!;
    expect(newState.pendingEvent).toBeNull();
    // "poupar" dá +12% tesouro.
    expect(newState.paises["PRT"].tesouro).toBeGreaterThan(oldTesouro);
  });

  it("resolveEvent com nota GUERRA_CIVIL_TRIGGER cria país rebelde", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "USA",
      realism: "normal",
      seed: 1,
    });
    const state = useGameStore.getState().state!;
    useGameStore.getState().loadState({
      ...state,
      pendingEvent: {
        evento: EVENT_LIBRARY.find((e) => e.id === "risco-guerra-civil")!,
        turno: 0,
        data: state.dataAtual,
      },
    });
    useGameStore.getState().resolveEvent("risco-guerra-civil", "ignorar");
    const newState = useGameStore.getState().state!;
    expect(newState.paises["USA-R"]).toBeDefined();
    expect(newState.guerras.some((g) => g.defensores.includes("USA-R"))).toBe(true);
  });
});
