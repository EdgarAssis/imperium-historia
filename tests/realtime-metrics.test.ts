// tests/realtime-metrics.test.ts
// Testes unitários para as Fases 1 e 2 do jogo em tempo real.
// Fase 1 (clock.ts): tickDay, tickIntervalMs, nextSpeed, prevSpeed.
// Fase 2 (metrics.ts): calculateMilitaryStrength, calculatePoliticalInfluence,
//   rankByMilitaryStrength, rankByInfluence.

import { describe, it, expect } from "vitest";
import { createInitialState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  tickDay,
  tickIntervalMs,
  nextSpeed,
  prevSpeed,
  calculateMilitaryStrength,
  calculatePoliticalInfluence,
  rankByMilitaryStrength,
  rankByInfluence,
} from "@/lib/engine";
import type { GameState, GameSpeed } from "@/types";
import { GAME_SPEEDS } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

// ---------------------------------------------------------------------------
// Fase 1 — Relógio global (clock.ts)
// ---------------------------------------------------------------------------

describe("Fase 1: relógio global — tickDay", () => {
  it("tickDay avança exatamente 1 dia", () => {
    const state = makeState();
    const result = tickDay(state);
    expect(result.state.dataAtual).toBe("2025-01-02");
    expect(result.state.turno).toBe(0); // turno NÃO muda por dia
  });

  it("tickDay não altera países nem províncias (apenas a data)", () => {
    const state = makeState();
    const before = state.paises;
    const result = tickDay(state);
    // Mesma referência — apenas dataAtual muda.
    expect(result.state.paises).toBe(before);
    expect(result.state.provincias).toBe(state.provincias);
  });

  it("monthRolled=true quando o novo dia é dia 1 de mês", () => {
    const state = makeState();
    // 2025-01-31 -> 2025-02-01: rola mês.
    const endOfMonth: GameState = { ...state, dataAtual: "2025-01-31" };
    const r1 = tickDay(endOfMonth);
    expect(r1.monthRolled).toBe(true);
    expect(r1.state.dataAtual).toBe("2025-02-01");

    // 2025-02-01 -> 2025-02-02: NÃO rola mês.
    const r2 = tickDay(r1.state);
    expect(r2.monthRolled).toBe(false);
    expect(r2.state.dataAtual).toBe("2025-02-02");
  });

  it("monthRolled ao atravessar meses de 28/30/31 dias", () => {
    const state = makeState();
    // Fevereiro (28 dias em 2025) -> 1 de março.
    const febEnd: GameState = { ...state, dataAtual: "2025-02-28" };
    const r = tickDay(febEnd);
    expect(r.state.dataAtual).toBe("2025-03-01");
    expect(r.monthRolled).toBe(true);

    // Abril (30 dias) -> 1 de maio.
    const aprEnd: GameState = { ...state, dataAtual: "2025-04-30" };
    const r2 = tickDay(aprEnd);
    expect(r2.state.dataAtual).toBe("2025-05-01");
    expect(r2.monthRolled).toBe(true);
  });

  it("tickDay é pura: não altera o estado original", () => {
    const state = makeState();
    const original = state.dataAtual;
    tickDay(state);
    expect(state.dataAtual).toBe(original);
  });

  it("tickDay preserva o timeState (pausa/velocidade)", () => {
    const state = makeState();
    state.timeState = { pausado: false, velocidade: 5, autoPauseEventos: true };
    const result = tickDay(state);
    expect(result.state.timeState).toEqual(state.timeState);
  });
});

describe("Fase 1: relógio global — velocidades", () => {
  it("tickIntervalMs devolve 1000/velocidade arredondado", () => {
    expect(tickIntervalMs(1)).toBe(1000);
    expect(tickIntervalMs(2)).toBe(500);
    expect(tickIntervalMs(5)).toBe(200);
    expect(tickIntervalMs(10)).toBe(100);
    expect(tickIntervalMs(0.5)).toBe(2000);
  });

  it("nextSpeed avança na lista GAME_SPEEDS", () => {
    expect(nextSpeed(0.5)).toBe(1);
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(5);
    expect(nextSpeed(5)).toBe(10);
  });

  it("nextSpeed trava no máximo (10x)", () => {
    expect(nextSpeed(10)).toBe(10);
  });

  it("prevSpeed retrocede na lista GAME_SPEEDS", () => {
    expect(prevSpeed(10)).toBe(5);
    expect(prevSpeed(5)).toBe(2);
    expect(prevSpeed(2)).toBe(1);
    expect(prevSpeed(1)).toBe(0.5);
  });

  it("prevSpeed trava no mínimo (0.5x)", () => {
    expect(prevSpeed(0.5)).toBe(0.5);
  });

  it("GAME_SPEEDS tem as 5 velocidades esperadas por ordem crescente", () => {
    expect(GAME_SPEEDS).toEqual([0.5, 1, 2, 5, 10]);
    expect(GAME_SPEEDS.length).toBe(5);
  });

  it("todas as velocidades têm tickIntervalMs positivo e finito", () => {
    for (const s of GAME_SPEEDS as readonly GameSpeed[]) {
      const ms = tickIntervalMs(s);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 2 — Métricas realistas (metrics.ts)
// ---------------------------------------------------------------------------

describe("Fase 2: Força Militar — calculateMilitaryStrength", () => {
  it("USA tem Força Militar elevada (≥80)", () => {
    const state = makeState();
    const usa = state.paises["USA"];
    const fm = calculateMilitaryStrength(usa);
    expect(fm).toBeGreaterThanOrEqual(80);
    expect(fm).toBeLessThanOrEqual(100);
  });

  it("Superpotências nucleares (USA, RUS, CHN) têm Força Militar > 60", () => {
    const state = makeState();
    for (const id of ["USA", "RUS", "CHN"]) {
      const c = state.paises[id];
      const fm = calculateMilitaryStrength(c);
      expect(fm).toBeGreaterThan(60);
    }
  });

  it("País com orçamento militar baixo tem Força Militar baixa", () => {
    const state = makeState();
    // Moçambique: orçamento militar ~$110M, 11k tropas, sem nuclear.
    const moz = state.paises["MOZ"];
    const fm = calculateMilitaryStrength(moz);
    expect(fm).toBeLessThan(20);
  });

  it("Bónus nuclear eleva a Força Militar (+15 pontos)", () => {
    const state = makeState();
    // Clona um país e dá-lhe/tira nuclear para medir o delta.
    const baseSemNuclear = { ...state.paises["DEU"], nuclear: false };
    const comNuclear = { ...baseSemNuclear, nuclear: true };
    const delta = calculateMilitaryStrength(comNuclear) - calculateMilitaryStrength(baseSemNuclear);
    expect(delta).toBeCloseTo(15, 0);
  });

  it("Força Militar fica sempre em [0, 100]", () => {
    const state = makeState();
    for (const id of Object.keys(state.paises)) {
      const fm = calculateMilitaryStrength(state.paises[id]);
      expect(fm).toBeGreaterThanOrEqual(0);
      expect(fm).toBeLessThanOrEqual(100);
      expect(Number.isFinite(fm)).toBe(true);
    }
  });

  it("País com orçamento 0 e 0 tropas tem Força Militar 0", () => {
    const state = makeState();
    const c = { ...state.paises["PRT"], orcamentoMilitar: 0, tropas: 0, nuclear: false };
    expect(calculateMilitaryStrength(c)).toBe(0);
  });
});

describe("Fase 2: Influência Política — calculatePoliticalInfluence", () => {
  it("Membros permanentes do CS-ONU têm bónus de +30 (USA, RUS, CHN, GBR, FRA)", () => {
    const state = makeState();
    for (const id of ["USA", "RUS", "CHN", "GBR", "FRA"]) {
      const c = state.paises[id];
      expect(c.blocos).toContain("ONU-CS");
      const inf = calculatePoliticalInfluence(c, state);
      // Pelo menos 30 pontos do bónus ONU-CS.
      expect(inf).toBeGreaterThan(30);
    }
  });

  it("Países pequenos sem ONU-CS têm Influência < 30", () => {
    const state = makeState();
    const moz = state.paises["MOZ"];
    const inf = calculatePoliticalInfluence(moz, state);
    expect(inf).toBeLessThan(30);
  });

  it("Países sem blocos nem aliados têm Influência muito baixa", () => {
    const state = makeState();
    const c = {
      ...state.paises["PRT"],
      blocos: [],
      pib: 1_000_000, // PIB baixo
    };
    // Limpa relações de PRT.
    state.relacoes = state.relacoes.filter((r) => r.a !== "PRT" && r.b !== "PRT");
    const inf = calculatePoliticalInfluence(c, state);
    expect(inf).toBeLessThan(15);
  });

  it("Influência Política fica sempre em [0, 100]", () => {
    const state = makeState();
    for (const id of Object.keys(state.paises)) {
      const inf = calculatePoliticalInfluence(state.paises[id], state);
      expect(inf).toBeGreaterThanOrEqual(0);
      expect(inf).toBeLessThanOrEqual(100);
      expect(Number.isFinite(inf)).toBe(true);
    }
  });

  it("Aliados (relações > 40) aumentam a Influência", () => {
    const state = makeState();
    const c = state.paises["PRT"];
    // Sem aliados.
    state.relacoes = [];
    const infSemAliados = calculatePoliticalInfluence(c, state);
    // Com muitos aliados (8 relações > 40).
    state.relacoes = [
      { a: "PRT", b: "BRA", valor: 80 },
      { a: "PRT", b: "ESP", valor: 70 },
      { a: "PRT", b: "FRA", valor: 60 },
      { a: "PRT", b: "AGO", valor: 50 },
      { a: "PRT", b: "USA", valor: 45 },
      { a: "PRT", b: "DEU", valor: 50 },
      { a: "PRT", b: "ITA", valor: 50 },
      { a: "PRT", b: "GBR", valor: 50 },
    ];
    const infComAliados = calculatePoliticalInfluence(c, state);
    expect(infComAliados).toBeGreaterThan(infSemAliados);
    // Bónus de aliados capped em 15.
    expect(infComAliados - infSemAliados).toBeLessThanOrEqual(15);
  });
});

describe("Fase 2: rankings realistas", () => {
  it("rankByMilitaryStrength devolve top N ordenado desc", () => {
    const state = makeState();
    const top5 = rankByMilitaryStrength(state, 5);
    expect(top5.length).toBe(5);
    for (let i = 0; i < top5.length - 1; i++) {
      const a = calculateMilitaryStrength(top5[i]);
      const b = calculateMilitaryStrength(top5[i + 1]);
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("rankByInfluence devolve top N ordenado desc", () => {
    const state = makeState();
    const top5 = rankByInfluence(state, 5);
    expect(top5.length).toBe(5);
    for (let i = 0; i < top5.length - 1; i++) {
      const a = calculatePoliticalInfluence(top5[i], state);
      const b = calculatePoliticalInfluence(top5[i + 1], state);
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("Top 3 por Força Militar inclui USA (orçamento militar maior do mundo)", () => {
    const state = makeState();
    const top3 = rankByMilitaryStrength(state, 3);
    expect(top3.map((c) => c.id)).toContain("USA");
  });

  it("rankByMilitaryStrength com N maior que total devolve todos os países", () => {
    const state = makeState();
    const total = Object.keys(state.paises).length;
    const result = rankByMilitaryStrength(state, total + 100);
    expect(result.length).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// Fase 2 — Cenário enriquecido (loader merge countries.json + mundo-2025.json)
// ---------------------------------------------------------------------------

describe("Fase 2: cenário enriquecido", () => {
  it("Cenário tem ≥57 países com dados realistas", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(57);
  });

  it("Cenário tem ≥150 províncias (todas com cultura/lealdade/valorEstrategico)", () => {
    expect(SCENARIO.provincias.length).toBeGreaterThanOrEqual(150);
    for (const p of SCENARIO.provincias) {
      expect(p.cultura).toBeDefined();
      expect(p.lealdade).toBeGreaterThanOrEqual(0);
      expect(p.lealdade).toBeLessThanOrEqual(100);
      expect(p.valorEstrategico).toBeGreaterThanOrEqual(1);
      expect(p.valorEstrategico).toBeLessThanOrEqual(5);
    }
  });

  it("Angola tem Luanda + Benguela + Huíla + Cabinda (4 províncias)", () => {
    const agos = SCENARIO.provincias.filter((p) => p.countryId === "AGO");
    const nomes = agos.map((p) => p.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Luanda", "Benguela", "Huíla", "Cabinda"]));
    expect(agos.length).toBeGreaterThanOrEqual(4);
  });

  it("Portugal tem Lisboa + Porto + Coimbra", () => {
    const prts = SCENARIO.provincias.filter((p) => p.countryId === "PRT");
    const nomes = prts.map((p) => p.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Lisboa", "Porto", "Coimbra"]));
  });

  it("Todas as províncias têm ID único", () => {
    const ids = new Set(SCENARIO.provincias.map((p) => p.id));
    expect(ids.size).toBe(SCENARIO.provincias.length);
  });

  it("Cada país jogável tem pelo menos 1 província", () => {
    for (const c of SCENARIO.paises) {
      const provs = SCENARIO.provincias.filter((p) => p.countryId === c.id);
      expect(provs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("Province.enrichProvinces preenche lealdade/cultura/valorEstrategico mesmo se ausentes no JSON", () => {
    // O loader scenarios/index.ts enriquece províncias sem cultura/lealdade
    // com defaults derivados do país. Verificamos isso implicitamente: todas
    // as províncias finais do cenário têm estes campos.
    for (const p of SCENARIO.provincias) {
      expect(p.cultura, `Província ${p.id} sem cultura`).toBeDefined();
      expect(p.lealdade, `Província ${p.id} sem lealdade`).toBeDefined();
      expect(p.valorEstrategico, `Província ${p.id} sem valor estratégico`).toBeDefined();
    }
  });
});
