// tests/motor.test.ts
// Testes unitários do motor (lib/engine) — Fase 3.
// Cobre: crescimento com/sem investimento, tesouro negativo, clamp, colapso,
// golpe, reprodutibilidade com a mesma seed, e 120 turnos sem NaN/absurdo.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  advanceTurn,
  calculateGdpGrowth,
  calculateNewTreasury,
  calculateStabilityDelta,
  calculateCoupProbability,
  applyCoup,
  clampStat,
  normalizeBudget,
  budgetTotal,
  BUDGET_DEFAULT,
  BUDGET_BY_REGIME,
  aiBudgetFor,
  economyInvestmentBoost,
  sectorInvestment,
  Rng,
  rngForCountry,
} from "@/lib/engine";
import type { BudgetAllocation, GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Fase 3: motor — funções puras", () => {
  it("clampStat corta valores para [0, 100]", () => {
    expect(clampStat(-5)).toBe(0);
    expect(clampStat(0)).toBe(0);
    expect(clampStat(50)).toBe(50);
    expect(clampStat(100)).toBe(100);
    expect(clampStat(150)).toBe(100);
    expect(clampStat(NaN)).toBe(0);
    expect(clampStat(Infinity)).toBe(0);
  });

  it("normalizeBudget escala para baixo quando soma > 100", () => {
    const b: BudgetAllocation = { economia: 50, exercito: 50, saudeEducacao: 50, seguranca: 50 };
    const norm = normalizeBudget(b);
    expect(budgetTotal(norm)).toBeCloseTo(100, 1);
    expect(norm.economia).toBeCloseTo(25, 1);
  });

  it("normalizeBudget mantém proporções se soma < 100", () => {
    const b: BudgetAllocation = { economia: 10, exercito: 10, saudeEducacao: 10, seguranca: 10 };
    const norm = normalizeBudget(b);
    expect(budgetTotal(norm)).toBeCloseTo(40, 1);
    expect(norm.economia).toBeCloseTo(10, 1);
  });

  it("sectorInvestment devolve 0 se tesouro <= 0", () => {
    const country = { ...SCENARIO.paises[0], tesouro: -1000 };
    expect(sectorInvestment(50, country)).toBe(0);
  });

  it("economyInvestmentBoost tem retornos decrescentes (curva côncava)", () => {
    const gdpMonthly = 1_000_000;
    // Passos iguais para verificar que a marginal DIMINUI: o boost entre
    // (x=0.01, x=0.02) deve ser > entre (x=0.02, x=0.03).
    const boost1 = economyInvestmentBoost(0.01 * gdpMonthly, gdpMonthly);
    const boost2 = economyInvestmentBoost(0.02 * gdpMonthly, gdpMonthly);
    const boost3 = economyInvestmentBoost(0.03 * gdpMonthly, gdpMonthly);
    // Mais investimento → mais boost.
    expect(boost2).toBeGreaterThan(boost1);
    expect(boost3).toBeGreaterThan(boost2);
    // Margem diminui com passos iguais.
    const m1 = boost2 - boost1;
    const m2 = boost3 - boost2;
    expect(m1).toBeGreaterThan(m2);
    // Boost aproxima-se assintoticamente do máximo (0.5%).
    const boostHuge = economyInvestmentBoost(10 * gdpMonthly, gdpMonthly);
    expect(boostHuge).toBeLessThanOrEqual(0.005);
    expect(boostHuge).toBeGreaterThan(0.0049);
  });

  it("aiBudgetFor usa o default do regime", () => {
    const state = makeState();
    const country = state.paises["USA"];
    const budget = aiBudgetFor(country, state);
    expect(budget).toEqual(BUDGET_BY_REGIME["republica"]);
  });

  it("aiBudgetFor desvia para segurança/exército em guerra", () => {
    const state = makeState();
    // Coloca USA em guerra.
    state.guerras = [
      {
        id: "test-war",
        agressor: "RUS",
        defensores: ["USA"],
        provinciasDisputa: [],
        estado: "ativa",
        inicio: "2025-01-01",
      },
    ];
    const country = state.paises["USA"];
    const budget = aiBudgetFor(country, state);
    const base = BUDGET_BY_REGIME["republica"];
    expect(budget.exercito).toBeGreaterThan(base.exercito);
    expect(budget.economia).toBeLessThan(base.economia);
  });
});

describe("Fase 3: motor — crescimento do PIB", () => {
  it("sem investimento, crescimento é baixo (≈ base + ruído)", () => {
    const state = makeState();
    const country = state.paises["PRT"];
    const noBudget: BudgetAllocation = { economia: 0, exercito: 0, saudeEducacao: 0, seguranca: 0 };
    const rng = rngForCountry(state, "PRT");
    const growth = calculateGdpGrowth(country, noBudget, state, rng);
    // Sem investimento: crescimento base ~0.2% + ruído ±0.05%.
    expect(growth).toBeGreaterThan(-0.001);
    expect(growth).toBeLessThan(0.004);
  });

  it("com investimento alto, crescimento é claramente superior", () => {
    const state = makeState();
    const country = state.paises["PRT"];
    const highBudget: BudgetAllocation = { economia: 100, exercito: 0, saudeEducacao: 0, seguranca: 0 };
    const rng = rngForCountry(state, "PRT");
    const growthHigh = calculateGdpGrowth(country, highBudget, state, rng);
    const noBudget: BudgetAllocation = { economia: 0, exercito: 0, saudeEducacao: 0, seguranca: 0 };
    const rng2 = rngForCountry(state, "PRT");
    const growthLow = calculateGdpGrowth(country, noBudget, state, rng2);
    expect(growthHigh).toBeGreaterThan(growthLow);
  });

  it("crescimento fica dentro de limites razoáveis (±5% por mês)", () => {
    const state = makeState();
    const country = state.paises["PRT"];
    // Testa vários orçamentos extremos.
    for (const alloc of [
      { economia: 0, exercito: 0, saudeEducacao: 0, seguranca: 0 },
      { economia: 100, exercito: 0, saudeEducacao: 0, seguranca: 0 },
      { economia: 0, exercito: 100, saudeEducacao: 0, seguranca: 0 },
      { economia: 50, exercito: 50, saudeEducacao: 50, seguranca: 50 },
    ]) {
      const rng = rngForCountry(state, "PRT");
      const g = calculateGdpGrowth(country, alloc, state, rng);
      expect(g).toBeGreaterThanOrEqual(-0.05);
      expect(g).toBeLessThanOrEqual(0.05);
      expect(Number.isFinite(g)).toBe(true);
    }
  });
});

describe("Fase 3: motor — tesouro", () => {
  it("tesouro negativo: dívida aumenta penalização de estabilidade", () => {
    const state = makeState();
    const country = { ...state.paises["PRT"], tesouro: -1_000_000_000 };
    const rng = rngForCountry(state, "PRT");
    const budget: BudgetAllocation = BUDGET_DEFAULT;
    const gdpGrowth = 0.005;
    const delta = calculateStabilityDelta(country, budget, state, gdpGrowth, rng);
    // Com tesouro negativo, a estabilidade deve cair.
    expect(delta).toBeLessThan(0);
  });

  it("calculateNewTreasury: com tesouro negativo inicial muito grave, dívida persiste", () => {
    const state = makeState();
    // País em dívida extrema: -$50T (muito acima da receita fiscal anual).
    // Fase 5: a nova receita fiscal é mais alta (~22% PIB vs 2% antigo),
    // mas ainda assim um défice colossal deve persistir.
    const country = { ...state.paises["USA"], tesouro: -50_000_000_000_000 };
    const budget: BudgetAllocation = BUDGET_DEFAULT;
    const result = calculateNewTreasury(country, budget, state);
    // Mesmo com receita fiscal alta (~$487B/mês), o tesouro deve continuar negativo.
    expect(result.tesouro).toBeLessThan(0);
  });

  it("calculateNewTreasury: tesouro nunca fica NaN", () => {
    const state = makeState();
    const country = state.paises["USA"];
    const budget: BudgetAllocation = { economia: 100, exercito: 100, saudeEducacao: 100, seguranca: 100 };
    const result = calculateNewTreasury(country, budget, state);
    expect(Number.isFinite(result.tesouro)).toBe(true);
    expect(Number.isFinite(result.receita)).toBe(true);
    expect(Number.isFinite(result.despesas)).toBe(true);
  });
});

describe("Fase 3: motor — colapso e golpe", () => {
  it("estabilidade 0 + colapsoTurnos > 0 aumenta probabilidade de golpe", () => {
    const state = makeState();
    const country = { ...state.paises["PRT"], estabilidade: 0, aprovacao: 10 };
    // 1 turno de colapso.
    state.colapsoTurnos = { PRT: 1 };
    const p1 = calculateCoupProbability(country, state);
    expect(p1).toBeGreaterThan(0.05);

    // 5 turnos de colapso.
    state.colapsoTurnos = { PRT: 5 };
    const p5 = calculateCoupProbability(country, state);
    expect(p5).toBeGreaterThan(p1);

    // 10 turnos de colapso.
    state.colapsoTurnos = { PRT: 10 };
    const p10 = calculateCoupProbability(country, state);
    expect(p10).toBeGreaterThanOrEqual(p5);
    expect(p10).toBeLessThanOrEqual(0.6); // cap de 60%
  });

  it("applyCoup muda o regime e redefine estabilidade/aprovação", () => {
    const state = makeState();
    state.paises["PRT"] = {
      ...state.paises["PRT"],
      estabilidade: 0,
      aprovacao: 5,
    };
    state.colapsoTurnos = { PRT: 3 };
    const rng = new Rng(12345);
    const { state: newState, efeitos } = applyCoup(state, "PRT", rng);
    expect(newState.paises["PRT"].regime).not.toBe(state.paises["PRT"].regime);
    expect(newState.paises["PRT"].estabilidade).toBeGreaterThan(20);
    expect(newState.paises["PRT"].estabilidade).toBeLessThan(40);
    expect(newState.paises["PRT"].aprovacao).toBeGreaterThan(15);
    expect(newState.paises["PRT"].aprovacao).toBeLessThan(35);
    expect(newState.colapsoTurnos["PRT"]).toBeUndefined();
    expect(efeitos.length).toBeGreaterThan(0);
  });

  it("applyCoup deteriora relações com parceiros", () => {
    const state = makeState();
    const beforeRelation = state.relacoes.find((r) => r.a === "PRT" || r.b === "PRT");
    expect(beforeRelation).toBeDefined();
    const rng = new Rng(999);
    const { state: newState } = applyCoup(state, "PRT", rng);
    const afterRelation = newState.relacoes.find(
      (r) =>
        (r.a === "PRT" && r.b === beforeRelation!.b) ||
        (r.b === "PRT" && r.a === beforeRelation!.a),
    );
    expect(afterRelation).toBeDefined();
    expect(afterRelation!.valor).toBeLessThan(beforeRelation!.valor);
  });
});

describe("Fase 3: motor — reprodutibilidade com a mesma seed", () => {
  it("advanceTurn com a mesma seed produz estados idênticos", () => {
    const s1 = makeState(123);
    const s2 = makeState(123);
    const next1 = advanceTurn(s1);
    const next2 = advanceTurn(s2);
    // Mesma seed → mesmo resultado (incluindo datas, turnos, valores).
    expect(next1.dataAtual).toBe(next2.dataAtual);
    expect(next1.turno).toBe(next2.turno);
    expect(next1.paises["PRT"].pib).toBe(next2.paises["PRT"].pib);
    expect(next1.paises["PRT"].estabilidade).toBe(next2.paises["PRT"].estabilidade);
    expect(next1.paises["PRT"].aprovacao).toBe(next2.paises["PRT"].aprovacao);
  });

  it("advanceTurn não altera o estado original (imutabilidade)", () => {
    const state = makeState(99);
    const originalPib = state.paises["PRT"].pib;
    const originalTurno = state.turno;
    const originalDate = state.dataAtual;
    advanceTurn(state);
    expect(state.paises["PRT"].pib).toBe(originalPib);
    expect(state.turno).toBe(originalTurno);
    expect(state.dataAtual).toBe(originalDate);
  });

  it("advanceTurn avança 1 mês e incrementa o turno", () => {
    const state = makeState(1);
    const next = advanceTurn(state);
    expect(next.turno).toBe(1);
    expect(next.dataAtual).toBe("2025-02-01");
  });

  it("advanceTurn adiciona um evento de resumo ao diário", () => {
    const state = makeState(1);
    const next = advanceTurn(state);
    expect(next.eventos.length).toBeGreaterThan(0);
    // Procura o evento de resumo do jogador (tipo "sistema", título "Resumo do turno").
    // Nota: o último evento pode ser de multinacional (Fase 5) ou votação (Fase 6),
    // adicionados depois do resumo. Por isso procuramos por título.
    const resumo = next.eventos.find((e) => e.tipo === "sistema" && e.titulo.startsWith("Resumo do turno"));
    expect(resumo).toBeDefined();
    expect(resumo!.turno).toBe(1);
    expect(resumo!.efeitos.length).toBeGreaterThan(0);
  });
});

describe("Fase 3: motor — long-run de 120 turnos", () => {
  it("120 turnos seguidos não produzem NaN nem valores absurdos", () => {
    let state = makeState(2025);
    for (let i = 0; i < 120; i++) {
      state = advanceTurn(state);
      // Verifica invariantes em todos os países.
      for (const id of Object.keys(state.paises)) {
        const c = state.paises[id];
        expect(Number.isFinite(c.pib), `PIB não-finito em ${id} no turno ${i}`).toBe(true);
        expect(c.pib, `PIB ≤ 0 em ${id} no turno ${i}`).toBeGreaterThan(0);
        expect(Number.isFinite(c.tesouro), `Tesouro não-finito em ${id} no turno ${i}`).toBe(true);
        expect(Number.isFinite(c.exercito), `Exército não-finito em ${id} no turno ${i}`).toBe(true);
        expect(c.exercito, `Exército negativo em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade, `Estabilidade fora de [0,100] em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade).toBeLessThanOrEqual(100);
        expect(c.aprovacao, `Aprovação fora de [0,100] em ${id} no turno ${i}`).toBeGreaterThanOrEqual(0);
        expect(c.aprovacao).toBeLessThanOrEqual(100);
      }
    }
    // Verifica que o diário tem pelo menos 120 eventos de resumo.
    expect(state.eventos.length).toBeGreaterThanOrEqual(120);
    // Verifica que o tesouro do jogador não é NaN/Infinity.
    const player = state.paises["PRT"];
    expect(Number.isFinite(player.tesouro)).toBe(true);
  });

  it("120 turnos: cenário «anual» também corre sem erros", () => {
    let state = createInitialState(SCENARIO, "USA", "brutal", 7);
    // Muda resolução para anual.
    state = { ...state, config: { ...state.config, resolution: "anual" } };
    for (let i = 0; i < 120; i++) {
      state = advanceTurn(state);
      for (const id of Object.keys(state.paises)) {
        const c = state.paises[id];
        expect(Number.isFinite(c.pib)).toBe(true);
        expect(c.pib).toBeGreaterThan(0);
        expect(Number.isFinite(c.tesouro)).toBe(true);
        expect(c.estabilidade).toBeGreaterThanOrEqual(0);
        expect(c.estabilidade).toBeLessThanOrEqual(100);
        expect(c.aprovacao).toBeGreaterThanOrEqual(0);
        expect(c.aprovacao).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("Fase 3: integração store + motor", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("endTurn no store avança o estado sem alterar o original", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 42,
    });
    const before = useGameStore.getState().state;
    useGameStore.getState().endTurn();
    const after = useGameStore.getState().state;
    expect(after).not.toBeNull();
    expect(after!.turno).toBe(1);
    expect(before!.turno).toBe(0);
  });

  it("setBudget atualiza o orçamento do jogador", () => {
    useGameStore.getState().clear();
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "PRT",
      realism: "normal",
      seed: 1,
    });
    const newBudget: BudgetAllocation = { economia: 60, exercito: 10, saudeEducacao: 20, seguranca: 10 };
    useGameStore.getState().setBudget(newBudget);
    const state = useGameStore.getState().state;
    expect(state?.playerBudget).toEqual(newBudget);
  });
});
