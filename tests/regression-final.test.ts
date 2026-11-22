// tests/regression-final.test.ts
// Fase 13 — Testes de regressão finais.
// Verifica que o motor completo (13 fases integradas) corre 50 turnos sem:
//   - NaN/Infinity em qualquer campo numérico
//   - PIB ≤ 0
//   - Estabilidade/Aprovação fora de [0, 100]
//   - Reputação fora de [-100, 100]
//   - Estados inválidos (paises/provincias undefined)
//   - Guerras fantasma (terminadas sem turnoFim)

import { describe, it, expect } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import { advanceTurn } from "@/lib/engine";

const SCENARIO = SCENARIOS[0];

describe("Fase 13: regressão final — 50 turnos sem invariantes quebradas", () => {
  it("50 turnos mensais: motor completo corre sem NaN/absurdos", () => {
    let state = createInitialState(SCENARIO, "PRT", "normal", 2025);
    for (let i = 0; i < 50; i++) {
      // Resolve eventos pendentes automaticamente (limpa).
      if (state.pendingEvent) {
        state = { ...state, pendingEvent: null };
      }
      state = advanceTurn(state);
      // Verifica invariantes em todos os países.
      expect(state.paises).toBeDefined();
      expect(state.provincias).toBeDefined();
      for (const id of Object.keys(state.paises)) {
        const c = state.paises[id];
        expect(Number.isFinite(c.pib), `PIB NaN em ${id} turno ${i}`).toBe(true);
        expect(c.pib, `PIB ≤ 0 em ${id} turno ${i}`).toBeGreaterThan(0);
        expect(Number.isFinite(c.tesouro), `Tesouro NaN em ${id} turno ${i}`).toBe(true);
        expect(Number.isFinite(c.exercito), `Exército NaN em ${id} turno ${i}`).toBe(true);
        expect(c.estabilidade, `Estabilidade fora [0,100] em ${id} turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade).toBeLessThanOrEqual(100);
        expect(c.aprovacao, `Aprovação fora [0,100] em ${id} turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.aprovacao).toBeLessThanOrEqual(100);
        expect(Number.isFinite(c.orcamentoMilitar), `Orçamento militar NaN em ${id}`).toBe(true);
        expect(Number.isFinite(c.tropas), `Tropas NaN em ${id}`).toBe(true);
        expect(Number.isFinite(c.reputacao ?? 0), `Reputação NaN em ${id}`).toBe(true);
        if (c.reputacao !== undefined) {
          expect(c.reputacao, `Reputação fora [-100,100] em ${id}`).toBeGreaterThanOrEqual(-100);
          expect(c.reputacao).toBeLessThanOrEqual(100);
        }
      }
      // Verifica que missões/conselheiros/pesquisa/noticias permanecem definidos.
      expect(state.missoes).toBeDefined();
      expect(state.conselheiros).toBeDefined();
      expect(state.pesquisa).toBeDefined();
      expect(state.achievements).toBeDefined();
      expect(state.eleicoes).toBeDefined();
      expect(state.noticias).toBeDefined();
      expect(state.refugiadosFluxos).toBeDefined();
      // Guerras terminadas têm turnoFim.
      for (const g of state.guerras) {
        if (g.estado === "terminada") {
          expect(g.turnoFim).not.toBeNull();
        }
      }
    }
    // Após 50 turnos, o estado é válido.
    expect(state.turno).toBe(50);
    expect(state.eventos.length).toBeGreaterThan(0);
  });

  it("integração store: 30 turnos via useGameStore sem erros", () => {
    useGameStore.getState().clear();
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 42,
    });
    for (let i = 0; i < 30; i++) {
      const s = useGameStore.getState().state;
      if (s?.pendingEvent) {
        useGameStore.getState().resolveEvent(s.pendingEvent.evento.id, s.pendingEvent.evento.choices[0].id);
      }
      useGameStore.getState().endTurn();
      const ns = useGameStore.getState().state!;
      expect(ns).toBeDefined();
      expect(ns.paises).toBeDefined();
      // Invariantes críticas.
      const player = ns.paises["PRT"];
      expect(Number.isFinite(player.pib)).toBe(true);
      expect(player.pib).toBeGreaterThan(0);
      expect(player.estabilidade).toBeGreaterThanOrEqual(0);
      expect(player.estabilidade).toBeLessThanOrEqual(100);
    }
  });

  it("determinismo: mesma seed produz mesmos resultados (50 turnos)", () => {
    const s1 = createInitialState(SCENARIO, "PRT", "normal", 999);
    const s2 = createInitialState(SCENARIO, "PRT", "normal", 999);
    let state1 = s1;
    let state2 = s2;
    for (let i = 0; i < 50; i++) {
      if (state1.pendingEvent) state1 = { ...state1, pendingEvent: null };
      if (state2.pendingEvent) state2 = { ...state2, pendingEvent: null };
      state1 = advanceTurn(state1);
      state2 = advanceTurn(state2);
    }
    // Mesma seed → mesmos valores críticos.
    expect(state1.dataAtual).toBe(state2.dataAtual);
    expect(state1.turno).toBe(state2.turno);
    expect(state1.paises["PRT"].pib).toBe(state2.paises["PRT"].pib);
    expect(state1.paises["PRT"].estabilidade).toBe(state2.paises["PRT"].estabilidade);
    expect(state1.paises["USA"].pib).toBe(state2.paises["USA"].pib);
  });
});

describe("Fase 13: invariantes estruturais", () => {
  it("estado inicial tem todos os campos das 13 fases", () => {
    const state = createInitialState(SCENARIO, "PRT", "normal", 42);
    // Fase 1: relógio.
    expect(state.timeState).toBeDefined();
    expect(state.timeState.pausado).toBe(true);
    // Fase 2: países com dados realistas.
    expect(state.paises["USA"].orcamentoMilitar).toBeGreaterThan(0);
    expect(state.paises["USA"].tropas).toBeGreaterThan(0);
    expect(state.paises["USA"].moeda).toBe("USD");
    // Fase 3/4: provincias com cultura/lealdade.
    expect(state.provincias["AGO-CAB"].cultura).toBe("fiote");
    expect(state.provincias["AGO-CAB"].lealdade).toBeLessThan(50);
    // Fase 5: política fiscal.
    expect(state.paises["PRT"].taxPolicy).toBeDefined();
    expect(state.playerTaxPolicy).toBeUndefined(); // usa default do regime até jogador definir
    // Fase 6: blocos.
    expect(state.paises["PRT"].blocos).toContain("NATO");
    expect(state.votacoes).toEqual([]);
    // Fase 7/8: refugiados, reputação.
    expect(state.refugiadosFluxos).toEqual([]);
    expect(state.paises["PRT"].reputacao).toBe(0);
    // Fase 9: missões/achievements.
    expect(state.missoes.length).toBe(3);
    expect(state.achievements.length).toBeGreaterThan(10);
    expect(state.rankingsHistorico).toEqual([]);
    // Fase 10: conselheiros/pesquisa/eleições/notícias.
    expect(state.conselheiros.length).toBe(4);
    expect(state.pesquisa.desbloqueadas).toEqual([]);
    expect(state.eleicoes).toEqual([]);
    expect(state.noticias).toEqual([]);
  });

  it("cenário tem pelo menos 57 países e 150 províncias", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(57);
    expect(SCENARIO.provincias.length).toBeGreaterThanOrEqual(150);
  });

  it("todos os países têm moeda definida", () => {
    for (const c of SCENARIO.paises) {
      expect(c.moeda, `País ${c.id} sem moeda`).toBeDefined();
      expect(c.moeda!.length).toBe(3);
    }
  });

  it("todos os países têm taxPolicy definida", () => {
    for (const c of SCENARIO.paises) {
      expect(c.taxPolicy, `País ${c.id} sem taxPolicy`).toBeDefined();
      expect(c.taxPolicy!.taxa).toBeGreaterThanOrEqual(0);
      expect(c.taxPolicy!.taxa).toBeLessThanOrEqual(50);
    }
  });
});
