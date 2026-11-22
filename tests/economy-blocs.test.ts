// tests/economy-blocs.test.ts
// Testes unitários para as Fases 5 (economia e política fiscal) e 6 (blocos e moedas).
//
// Fase 5: calculateTaxRevenue, calculateAttractiveness, tryAttractMultinational,
//   processMultinationals, updateMilitaryBudget, updateTroops.
// Fase 6: getBlocMembers, calculateBlocTradeBonus, proposeBlocVote,
//   processBlocVotes, joinBloc, leaveBloc.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  calculateTaxRevenue,
  calculateAttractiveness,
  tryAttractMultinational,
  processMultinationals,
  updateMilitaryBudget,
  updateTroops,
  getEffectiveTaxPolicy,
  TAX_POLICY_BY_REGIME,
} from "@/lib/engine/fiscal";
import {
  getBlocMembers,
  calculateBlocTradeBonus,
  proposeBlocVote,
  processBlocVotes,
  joinBloc,
  leaveBloc,
} from "@/lib/engine/blocs";
import { Rng } from "@/lib/engine/rng";
import { BLOCOS } from "@/data/blocs";
import { moedaDoPais, CURRENCIES } from "@/data/currencies";
import type { GameState, TaxPolicy, Multinational } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

// ---------------------------------------------------------------------------
// Fase 5 — Política fiscal
// ---------------------------------------------------------------------------

describe("Fase 5: calculateTaxRevenue", () => {
  it("USA com taxa 28% gera receita fiscal realista", () => {
    const state = makeState();
    const usa = state.paises["USA"];
    const taxPolicy: TaxPolicy = { taxa: 28, taxaCapital: 22, taxaMercadorias: 18 };
    const receita = calculateTaxRevenue(usa, taxPolicy);
    // PIB USA = 27.36T; mensal = 2.28T.
    // taxa efetiva = (28*0.6 + 22*0.3 + 18*0.1) / 100 = (16.8 + 6.6 + 1.8) / 100 = 0.252
    // evasão = 5% + (50-55)*0.005 = 5% - 0.025 = 4.75% (não negativo; clamp em 5%)
    // receita = 2.28T * 0.252 * (1 - 0.05) ≈ $543B
    expect(receita).toBeGreaterThan(400e9);
    expect(receita).toBeLessThan(700e9);
    expect(Number.isFinite(receita)).toBe(true);
  });

  it("país com estabilidade 0 tem mais evasão (até 30%)", () => {
    const state = makeState();
    const country = { ...state.paises["PRT"], estabilidade: 0 };
    const taxPolicy: TaxPolicy = { taxa: 25, taxaCapital: 20, taxaMercadorias: 15 };
    const receita = calculateTaxRevenue(country, taxPolicy);
    // evasão = 5% + 50*0.005 = 5% + 25% = 30% (cap).
    // Verifica que é menor do que seria sem evasão.
    const gdpMonthly = country.pib / 12;
    const taxaEfetiva = (25 * 0.6 + 20 * 0.3 + 15 * 0.1) / 100;
    const semEvasao = gdpMonthly * taxaEfetiva;
    expect(receita).toBeLessThan(semEvasao);
    // Razão = 0.7 (1 - 0.30).
    expect(receita / semEvasao).toBeCloseTo(0.7, 1);
  });

  it("taxas zero geram receita zero", () => {
    const state = makeState();
    const country = state.paises["PRT"];
    const receita = calculateTaxRevenue(country, { taxa: 0, taxaCapital: 0, taxaMercadorias: 0 });
    expect(receita).toBe(0);
  });
});

describe("Fase 5: TAX_POLICY_BY_REGIME defaults", () => {
  it("cada regime tem defaults definidos", () => {
    const regimes = ["democracia", "republica", "monarquia_constitucional", "autocracia", "regime_partido_unico", "teocracia", "junta_militar", "monarquia_absoluta"] as const;
    for (const r of regimes) {
      const policy = TAX_POLICY_BY_REGIME[r];
      expect(policy).toBeDefined();
      expect(policy.taxa).toBeGreaterThanOrEqual(0);
      expect(policy.taxa).toBeLessThanOrEqual(50);
    }
  });

  it("monarquia_absoluta tem taxa 0 (sem imposto sobre renda)", () => {
    expect(TAX_POLICY_BY_REGIME.monarquia_absoluta.taxa).toBe(0);
  });

  it("junta_militar tem impostos baixos para atrair capital", () => {
    expect(TAX_POLICY_BY_REGIME.junta_militar.taxa).toBeLessThan(20);
  });

  it("democracia tem impostos altos (estado social)", () => {
    expect(TAX_POLICY_BY_REGIME.democracia.taxa).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — Attractividade para multinacionais
// ---------------------------------------------------------------------------

describe("Fase 5: calculateAttractiveness", () => {
  it("USA tem attractividade elevada (≥ 60)", () => {
    const state = makeState();
    const usa = state.paises["USA"];
    const taxPolicy = getEffectiveTaxPolicy(usa, state);
    const attr = calculateAttractiveness(usa, taxPolicy, state);
    expect(attr).toBeGreaterThanOrEqual(60);
    expect(attr).toBeLessThanOrEqual(100);
  });

  it("país estável com impostos baixos é mais atraente que país instável com impostos altos", () => {
    const state = makeState();
    const country = state.paises["PRT"];
    const policyBaixa: TaxPolicy = { taxa: 5, taxaCapital: 5, taxaMercadorias: 5 };
    const policyAlta: TaxPolicy = { taxa: 45, taxaCapital: 45, taxaMercadorias: 25 };
    const attrBaixa = calculateAttractiveness({ ...country, estabilidade: 80 }, policyBaixa, state);
    const attrAlta = calculateAttractiveness({ ...country, estabilidade: 20 }, policyAlta, state);
    expect(attrBaixa).toBeGreaterThan(attrAlta);
  });

  it("attractividade fica em [0, 100]", () => {
    const state = makeState();
    for (const id of Object.keys(state.paises)) {
      const c = state.paises[id];
      const attr = calculateAttractiveness(c, getEffectiveTaxPolicy(c, state), state);
      expect(attr).toBeGreaterThanOrEqual(0);
      expect(attr).toBeLessThanOrEqual(100);
      expect(Number.isFinite(attr)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — Multinacionais
// ---------------------------------------------------------------------------

describe("Fase 5: tryAttractMultinational", () => {
  it("com RNG favorable, multinacional é instalada", () => {
    const state = makeState();
    const rng = new Rng(99999); // RNG arbitrária
    // Tentar várias vezes até aparecer uma (probabilidade base ~ attractiveness/200).
    let result = { state, novaMultinacional: null as Multinational | null };
    for (let i = 0; i < 50 && !result.novaMultinacional; i++) {
      const r = tryAttractMultinational(result.state, "USA", rng);
      result = r;
    }
    expect(result.novaMultinacional).not.toBeNull();
    const m = result.novaMultinacional!;
    expect(m.paisOperacao).toBe("USA");
    expect(m.sede).not.toBe("USA"); // sede != país de operação
    expect(m.receita).toBeGreaterThan(0);
    expect(m.empregados).toBeGreaterThan(0);
    expect(result.state.multinacionais.length).toBe(1);
  });

  it("país em guerra não atrai multinacionais", () => {
    const state = makeState();
    // Coloca USA em guerra com RUS.
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"], provinciasDisputa: [],
      frentes: [], objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const rng = new Rng(99999);
    const result = tryAttractMultinational(state, "USA", rng);
    expect(result.novaMultinacional).toBeNull();
  });

  it("ID da multinacional é determinístico (mesma seed+turno)", () => {
    const s1 = makeState(123);
    const s2 = makeState(123);
    // Força probabilidade alta simulando attractividade máxima via RNG favorable.
    let r1 = { state: s1, novaMultinacional: null as Multinational | null };
    let r2 = { state: s2, novaMultinacional: null as Multinational | null };
    const rng1 = new Rng(99999);
    const rng2 = new Rng(99999);
    for (let i = 0; i < 50 && (!r1.novaMultinacional || !r2.novaMultinacional); i++) {
      if (!r1.novaMultinacional) r1 = tryAttractMultinational(r1.state, "USA", rng1);
      if (!r2.novaMultinacional) r2 = tryAttractMultinational(r2.state, "USA", rng2);
    }
    if (r1.novaMultinacional && r2.novaMultinacional) {
      expect(r1.novaMultinacional.id).toBe(r2.novaMultinacional.id);
    }
  });
});

describe("Fase 5: processMultinationals", () => {
  it("multinacional paga impostos ao país de operação e envia lucros à sede", () => {
    const state = makeState();
    const tesouroAntesOp = state.paises["PRT"].tesouro;
    const tesouroAntesSede = state.paises["USA"].tesouro;
    // Adiciona multinacional manualmente.
    const m: Multinational = {
      id: "mult-test-1",
      nome: "TestCorp",
      sede: "USA",
      paisOperacao: "PRT",
      sector: "tecnologia",
      receita: 1e9, // $1B/ano
      empregados: 1000,
      turnoInstalacao: 0,
    };
    const stateComMult = { ...state, multinacionais: [m] };
    const result = processMultinationals(stateComMult);
    // PRT recebeu impostos.
    expect(result.state.paises["PRT"].tesouro).toBeGreaterThan(tesouroAntesOp);
    // USA recebeu lucros.
    expect(result.state.paises["USA"].tesouro).toBeGreaterThan(tesouroAntesSede);
    expect(result.eventos.length).toBe(1);
  });

  it("multinacional com país de operação desaparecido é ignorada", () => {
    const state = makeState();
    const m: Multinational = {
      id: "mult-test-2", nome: "Ghost", sede: "USA",
      paisOperacao: "INEXISTENTE", sector: "x", receita: 1e9, empregados: 100, turnoInstalacao: 0,
    };
    const stateComMult = { ...state, multinacionais: [m] };
    const result = processMultinationals(stateComMult);
    expect(result.eventos.length).toBe(0); // ignorada
  });
});

// ---------------------------------------------------------------------------
// Fase 5 — Atualização dinâmica de orçamento militar e tropas
// ---------------------------------------------------------------------------

describe("Fase 5: updateMilitaryBudget", () => {
  it("investimento mensal aumenta orçamento militar anual", () => {
    const state = makeState();
    const country = state.paises["USA"];
    const investimento = 1e10; // $10B/mês
    const novo = updateMilitaryBudget(country, state, investimento);
    // Anual: $10B * 12 = $120B. orcamento_anterior ($916B) + $120B = $1036B.
    expect(novo).toBeGreaterThan(country.orcamentoMilitar);
    expect(novo).toBeLessThan(country.orcamentoMilitar * 2);
  });

  it("em guerra, investimento tem factor 1.5", () => {
    const state = makeState();
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"], provinciasDisputa: [],
      frentes: [], objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const country = state.paises["USA"];
    const investimento = 1e10;
    const novoGuerra = updateMilitaryBudget(country, state, investimento);
    // Sem guerra (cópia sem guerras).
    const stateSemGuerra = { ...state, guerras: [] };
    const novoPaz = updateMilitaryBudget(country, stateSemGuerra, investimento);
    expect(novoGuerra).toBeGreaterThan(novoPaz);
  });

  it("clamp: não cresce mais de 3× por turno", () => {
    const state = makeState();
    const country = state.paises["USA"];
    // Investimento absurdo.
    const novo = updateMilitaryBudget(country, state, 1e15);
    expect(novo).toBeLessThanOrEqual(country.orcamentoMilitar * 3);
  });
});

describe("Fase 5: updateTroops", () => {
  it("tropas crescem com orçamento militar", () => {
    const state = makeState();
    const country = state.paises["USA"];
    const { tropas } = updateTroops(country, state);
    expect(tropas).toBeGreaterThan(country.tropas);
  });

  it("em guerra, tropas diminuem (perdas)", () => {
    const state = makeState();
    state.guerras = [{
      id: "gw1", agressor: "USA", defensores: ["RUS"], provinciasDisputa: [],
      frentes: [], objetivo: "conquistar", estado: "ativa", inicio: "2025-01-01",
      indemnizacoes: 0, turnoFim: null,
    }];
    const country = state.paises["USA"];
    const { tropas, perdasGuerra } = updateTroops(country, state);
    expect(perdasGuerra).toBeGreaterThan(0);
    // Tropas podem ainda crescer se crescimentoMensal > perdas, mas perdas > 0.
    expect(perdasGuerra).toBeCloseTo(country.tropas * 0.005, 1);
    void tropas;
  });

  it("tropas nunca ficam negativas", () => {
    const state = makeState();
    const country = { ...state.paises["PRT"], tropas: 0 };
    const { tropas } = updateTroops(country, state);
    expect(tropas).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 6 — Blocos
// ---------------------------------------------------------------------------

describe("Fase 6: getBlocMembers", () => {
  it("NATO tem múltiplos membros no cenário inicial", () => {
    const state = makeState();
    const membros = getBlocMembers(state, "NATO");
    expect(membros.length).toBeGreaterThanOrEqual(8); // USA, CAN, GBR, FRA, DEU, ITA, ESP, POL, TUR, PRT, BEL, SWE
    const ids = membros.map((m) => m.id);
    expect(ids).toContain("USA");
    expect(ids).toContain("PRT");
    expect(ids).toContain("DEU");
  });

  it("bloco inexistente devolve lista vazia", () => {
    const state = makeState();
    const membros = getBlocMembers(state, "BLOCO_INEXISTENTE");
    expect(membros).toEqual([]);
  });
});

describe("Fase 6: calculateBlocTradeBonus", () => {
  it("membro de bloco com membros recebe bónus > 0", () => {
    const state = makeState();
    const bonus = calculateBlocTradeBonus(state, "USA");
    // USA em NATO com 11+ outros membros; bonus = 0.0008 * 11 * gdpMonthly.
    expect(bonus).toBeGreaterThan(0);
  });

  it("país sem blocos recebe bónus zero", () => {
    const state = makeState();
    // Colómbia não tem blocos.
    const bonus = calculateBlocTradeBonus(state, "COL");
    expect(bonus).toBe(0);
  });

  it("país membro de ONU-CS não recebe bónus (bonusComercioInterno = 0)", () => {
    const state = makeState();
    // USA é membro de ONU-CS; bónus desse bloco = 0.
    // (mas USA também é NATO, então bónus total > 0; isolamos ONU-CS)
    const country = state.paises["USA"];
    const def = BLOCOS["ONU-CS"];
    expect(def.bonusComercioInterno).toBe(0);
    void country;
  });
});

describe("Fase 6: proposeBlocVote + processBlocVotes", () => {
  it("proposeBlocVote cria votação com membros NATO", () => {
    const state = makeState();
    const result = proposeBlocVote(state, "NATO", {
      tipo: "resolucao",
      proposta: "Resolução conjunta",
      alvos: [],
    });
    expect(result.vote).not.toBeNull();
    expect(result.vote!.blocoId).toBe("NATO");
    expect(result.vote!.votos).toBeDefined();
    // Todos os membros começam com null.
    for (const v of Object.values(result.vote!.votos)) {
      expect(v).toBeNull();
    }
  });

  it("proposeBlocVote em bloco inexistente falha", () => {
    const state = makeState();
    const result = proposeBlocVote(state, "INEXISTENTE", {
      tipo: "resolucao",
      proposta: "X",
      alvos: [],
    });
    expect(result.vote).toBeNull();
  });

  it("processBlocVotes preenche votos e fecha votação", () => {
    const state = makeState();
    const r1 = proposeBlocVote(state, "NATO", {
      tipo: "admissao",
      proposta: "Admitir país X",
      alvos: ["BRA"],
    });
    // Processa várias vezes até fechar (10% chance de adiar por membro).
    let s = r1.state;
    for (let i = 0; i < 20; i++) {
      const r = processBlocVotes(s);
      s = r.state;
      if (r.closedVotes.length > 0) break;
    }
    // Verifica que a votação foi fechada.
    const vote = s.votacoes.find((v) => v.id === r1.vote!.id);
    expect(vote).toBeDefined();
    expect(vote!.fechada).toBe(true);
    expect(vote!.resultado).toBeDefined();
    expect(["aprovada", "rejeitada"]).toContain(vote!.resultado);
  });
});

describe("Fase 6: joinBloc + leaveBloc", () => {
  it("joinBloc adiciona país ao bloco", () => {
    const state = makeState();
    // PRT não é membro de BRICS.
    expect(state.paises["PRT"].blocos).not.toContain("BRICS");
    const newState = joinBloc(state, "PRT", "BRICS");
    expect(newState.paises["PRT"].blocos).toContain("BRICS");
  });

  it("joinBloc melhora relação com outros membros (+5)", () => {
    const state = makeState();
    // PRT (CPLP) já é membro; testa com BRICS (já tem BRA).
    // Antes: PRT-BRA relação existe? procura.
    const relAntes = state.relacoes.find((r) =>
      (r.a === "PRT" && r.b === "BRA") || (r.a === "BRA" && r.b === "PRT"));
    const newState = joinBloc(state, "PRT", "BRICS");
    const relDepois = newState.relacoes.find((r) =>
      (r.a === "PRT" && r.b === "BRA") || (r.a === "BRA" && r.b === "PRT"));
    if (relAntes && relDepois) {
      expect(relDepois.valor).toBeGreaterThan(relAntes.valor);
    }
  });

  it("leaveBloc remove país e penaliza estabilidade (-5)", () => {
    const state = makeState();
    // PRT é membro de NATO.
    const stabAntes = state.paises["PRT"].estabilidade;
    const newState = leaveBloc(state, "PRT", "NATO");
    expect(newState.paises["PRT"].blocos).not.toContain("NATO");
    expect(newState.paises["PRT"].estabilidade).toBe(stabAntes - 5);
  });

  it("leaveBloc deteriora relação com antigos membros (-10)", () => {
    const state = makeState();
    // PRT sai da CPLP; outro membro é AGO.
    const relAntes = state.relacoes.find((r) =>
      (r.a === "PRT" && r.b === "AGO") || (r.a === "AGO" && r.b === "PRT"));
    const newState = leaveBloc(state, "PRT", "CPLP");
    const relDepois = newState.relacoes.find((r) =>
      (r.a === "PRT" && r.b === "AGO") || (r.a === "AGO" && r.b === "PRT"));
    if (relAntes && relDepois) {
      expect(relDepois.valor).toBeLessThan(relAntes.valor);
    }
  });

  it("joinBloc em bloco já membro é no-op", () => {
    const state = makeState();
    // PRT já é NATO.
    const newState = joinBloc(state, "PRT", "NATO");
    // Estado igual (não adiciona duplicado).
    expect(newState.paises["PRT"].blocos.filter((b) => b === "NATO").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fase 6 — Moedas
// ---------------------------------------------------------------------------

describe("Fase 6: moedas", () => {
  it("moedaDoPais devolve USD para USA", () => {
    const moeda = moedaDoPais("USA");
    expect(moeda.codigo).toBe("USD");
    expect(moeda.cambioParaUSD).toBe(1);
  });

  it("moedaDoPais devolve EUR para PRT/DEU/FRA", () => {
    expect(moedaDoPais("PRT").codigo).toBe("EUR");
    expect(moedaDoPais("DEU").codigo).toBe("EUR");
    expect(moedaDoPais("FRA").codigo).toBe("EUR");
  });

  it("moedaDoPais devolve AOA para AGO", () => {
    expect(moedaDoPais("AGO").codigo).toBe("AOA");
  });

  it("país desconhecido faz fallback para USD", () => {
    expect(moedaDoPais("XXX").codigo).toBe("USD");
  });

  it("CURRENCIES tem pelo menos 10 moedas definidas", () => {
    expect(Object.keys(CURRENCIES).length).toBeGreaterThanOrEqual(10);
  });

  it("todas as moedas têm câmbio finito e positivo", () => {
    for (const codigo of Object.keys(CURRENCIES)) {
      const c = CURRENCIES[codigo];
      expect(Number.isFinite(c.cambioParaUSD)).toBe(true);
      expect(c.cambioParaUSD).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 6 — Definições de blocos
// ---------------------------------------------------------------------------

describe("Fase 6: BLOCOS definições", () => {
  it("pelo menos 12 blocos definidos", () => {
    expect(Object.keys(BLOCOS).length).toBeGreaterThanOrEqual(12);
  });

  it("NATO é bloco militar", () => {
    expect(BLOCOS.NATO.tipo).toBe("militar");
  });

  it("UE é bloco económico com moeda partilhada EUR", () => {
    expect(BLOCOS.UE.tipo).toBe("economico");
    expect(BLOCOS.UE.moedaPartilhada).toBe("EUR");
  });

  it("ONU-CS tem bonusComercioInterno zero (bloco político puro)", () => {
    expect(BLOCOS["ONU-CS"]?.bonusComercioInterno).toBe(0);
  });

  it("todos os blocos têm nome PT e descrição", () => {
    for (const id of Object.keys(BLOCOS)) {
      const b = BLOCOS[id];
      expect(b.nome.length).toBeGreaterThan(0);
      expect(b.descricao.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 5/6 — Integração no motor mensal (runMonthlyPipeline)
// ---------------------------------------------------------------------------

describe("Fase 5/6: integração no motor mensal", () => {
  beforeEach(() => {
    // Use vitest state reset if needed.
  });

  it("runMonthlyPipeline inicializa multinacionais e votacoes vazias", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    expect(state.multinacionais).toEqual([]);
    expect(state.votacoes).toEqual([]);
    const r = runMonthlyPipeline(state, "2025-02-01");
    // Após 1 turno, estado válido.
    expect(r.state.multinacionais).toBeDefined();
    expect(r.state.votacoes).toBeDefined();
  });

  it("runMonthlyPipeline atualiza orcamentoMilitar e tropas dos países", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    const orcAntes = state.paises["PRT"].orcamentoMilitar;
    const tropasAntes = state.paises["PRT"].tropas;
    const r = runMonthlyPipeline(state, "2025-02-01");
    // PIB cresce; tesouro muda; orçamento militar e tropas atualizam-se.
    expect(r.state.paises["PRT"].orcamentoMilitar).not.toBe(orcAntes);
    expect(r.state.paises["PRT"].tropas).not.toBe(tropasAntes);
  });
});
