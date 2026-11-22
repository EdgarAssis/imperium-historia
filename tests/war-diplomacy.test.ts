// tests/war-diplomacy.test.ts
// Testes da Fase 5: diplomacia, guerra (declarar, resolver, paz), frentes por
// província, reprodutibilidade com seed fixa, e garantia de que guerras não
// ficam «fantasma» (estados presos sem terminar).

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  proposeTreaty,
  calculateAcceptanceProbability,
  declareWar,
  resolveWarTurn,
  calculateFrontOutcome,
  signPeace,
} from "@/lib/engine";
import { Rng, rngForCountry } from "@/lib/engine/rng";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Fase 5: diplomacia — propostas", () => {
  it("propor comércio a país com relação neutra tem probabilidade > 0.5", () => {
    const state = makeState(7, "PRT");
    const de = state.paises["PRT"];
    const para = state.paises["USA"];
    const rng = rngForCountry(state, "PRT-USA-prop-comercio");
    const { probabilidade } = calculateAcceptanceProbability(state, de, para, "comercio", rng);
    expect(probabilidade).toBeGreaterThan(0.5);
  });

  it("propor aliança a país hostil (relação -100) tem probabilidade baixa", () => {
    const state = makeState(7, "RUS");
    // RUS-USA está em -60; abaixo de aliança.
    const de = state.paises["RUS"];
    const para = state.paises["USA"];
    const rng = rngForCountry(state, "RUS-USA-prop-alianca");
    const { probabilidade } = calculateAcceptanceProbability(state, de, para, "alianca", rng);
    expect(probabilidade).toBeLessThan(0.5);
  });

  it("proposeTreaty cria registo na lista propostas", () => {
    const state = makeState(7, "PRT");
    const de = state.paises["PRT"];
    const para = state.paises["BRA"];
    const result = proposeTreaty(state, de, para, "comercio");
    expect(result.state.propostas.length).toBe(1);
    expect(result.proposal.de).toBe("PRT");
    expect(result.proposal.para).toBe("BRA");
    expect(result.proposal.tipo).toBe("comercio");
  });

  it("se aceite, proposeTreaty cria novo tratado", () => {
    const state = makeState(7, "PRT");
    const de = state.paises["PRT"];
    const para = state.paises["BRA"];
    const result = proposeTreaty(state, de, para, "comercio");
    if (result.proposal.aceite) {
      expect(result.novoTratado).toBeDefined();
      expect(result.state.tratados.length).toBeGreaterThan(state.tratados.length);
    } else {
      // Se recusada, não cria tratado.
      expect(result.novoTratado).toBeUndefined();
    }
  });

  it("ultimato a país muito mais fraco tem probabilidade alta", () => {
    const state = makeState(7, "USA");
    // USA é superpotência; PRT é pequeno.
    const de = state.paises["USA"];
    const para = state.paises["PRT"];
    const rng = rngForCountry(state, "USA-PRT-prop-ultimato");
    const { probabilidade } = calculateAcceptanceProbability(state, de, para, "ultimato", rng);
    // Assimetria de poder enorme → alta probabilidade de aceitar sob coação.
    expect(probabilidade).toBeGreaterThan(0.6);
  });
});

describe("Fase 5: guerra — declarar e resolver frentes", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("declareWar cria guerra com frentes por província", () => {
    const state = makeState(1, "USA");
    const result = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    expect(result.war).not.toBeNull();
    expect(result.war!.agressor).toBe("USA");
    expect(result.war!.defensores).toEqual(["MEX"]);
    expect(result.war!.frentes.length).toBe(1);
    expect(result.war!.frentes[0].provinceId).toBe("MEX-MEX");
    expect(result.war!.frentes[0].progresso).toBe(0);
    expect(result.war!.estado).toBe("ativa");
    // Estado tem a guerra adicionada.
    expect(result.state.guerras.length).toBe(state.guerras.length + 1);
  });

  it("declareWar rejeita agressor inexistente", () => {
    const state = makeState(1, "USA");
    const result = declareWar(state, "XXX", ["MEX"], [], "conquistar");
    expect(result.war).toBeNull();
    expect(result.motivo).toContain("Agressor inexistente");
  });

  it("declareWar rejeita província que não pertence a defensor", () => {
    const state = makeState(1, "USA");
    // PRT-LIS é de Portugal, não México.
    const result = declareWar(state, "USA", ["MEX"], ["PRT-LIS"], "conquistar");
    expect(result.war).toBeNull();
    expect(result.motivo).toContain("não pertence");
  });

  it("declareWar rejeita duplicação (mesma guerra ativa)", () => {
    const state = makeState(1, "USA");
    const r1 = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    const r2 = declareWar(r1.state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    expect(r2.war).toBeNull();
    expect(r2.motivo).toContain("Já existe guerra");
  });

  it("declareWar rejeita se há tratado de não-agressão ativo", () => {
    const state = makeState(1, "USA");
    // Adiciona tratado de não-agressão USA-MEX.
    state.tratados = [
      ...state.tratados,
      {
        id: "nao-agg-usa-mex",
        tipo: "nao_agressao",
        paises: ["USA", "MEX"],
        inicio: "2024-01-01",
        rompido: false,
      },
    ];
    const result = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    expect(result.war).toBeNull();
    expect(result.motivo).toContain("não-agressão");
  });

  it("resolveWarTurn: frentes avançam quando agressor é mais forte", () => {
    const state = makeState(1, "USA");
    const { state: stateW } = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    const result = resolveWarTurn(stateW);
    // Procura o evento da frente MEX-MEX (a guerra RUS-UKR inicial pode gerar outros).
    const mexEvent = result.eventos.find((e) => e.provinceId === "MEX-MEX");
    expect(mexEvent).toBeDefined();
    // USA (820 exército) é mais forte que MEX (230) → progresso deve aumentar.
    const war = result.state.guerras.find(
      (w) => w.agressor === "USA" && w.defensores.includes("MEX"),
    );
    expect(war).toBeDefined();
    expect(war!.frentes[0].progresso).toBeGreaterThan(0);
  });

  it("calculateFrontOutcome com a mesma seed produz o mesmo delta", () => {
    const state = makeState(7, "USA");
    const agressor = state.paises["USA"];
    const defensor = state.paises["MEX"];
    const frente = { provinceId: "MEX-MEX", progresso: 0, ultimoDelta: 0 };
    const rng1 = new Rng(12345);
    const rng2 = new Rng(12345);
    const delta1 = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng1);
    const delta2 = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng2);
    // Mesma seed → mesmo delta.
    expect(delta1).toBe(delta2);
    // É um número finito.
    expect(Number.isFinite(delta1)).toBe(true);
    // Está dentro dos limites ±10.
    expect(delta1).toBeGreaterThanOrEqual(-10);
    expect(delta1).toBeLessThanOrEqual(10);
  });

  it("resolveWarTurn: província muda de dono quando progresso atinge 100", () => {
    // Cria estado com guerra + frente já a 95 (quase de conquistar).
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    const war = state.guerras[state.guerras.length - 1];
    state.guerras = state.guerras.map((w) =>
      w.id === war.id
        ? { ...w, frentes: [{ ...w.frentes[0], progresso: 95 }] }
        : w,
    );
    // Resolve alguns turnos até atingir 100.
    let conquered = false;
    for (let i = 0; i < 20; i++) {
      const result = resolveWarTurn(state);
      state = result.state;
      const w = state.guerras.find((g) => g.id === war.id);
      if (w && w.frentes[0].progresso >= 100) {
        conquered = true;
        break;
      }
    }
    expect(conquered).toBe(true);
    // Província MEX-MEX agora pertence a USA.
    expect(state.provincias["MEX-MEX"].countryId).toBe("USA");
    // Guerra foi terminada.
    const finalWar = state.guerras.find((g) => g.id === war.id);
    expect(finalWar?.estado).toBe("terminada");
  });

  it("resolveWarTurn: sem guerras fantasma (agressor desaparecido → termina)", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    // Remove USA do estado (simula «desaparecimento»).
    state = { ...state, paises: { ...state.paises } };
    delete state.paises["USA"];
    // Resolve — a guerra deve ser terminada (não fica fantasma).
    const result = resolveWarTurn(state);
    const war = result.state.guerras.find((g) => g.id === state.guerras[state.guerras.length - 1].id);
    expect(war).toBeDefined();
    expect(war!.estado).toBe("terminada");
  });
});

describe("Fase 5: paz — signPeace", () => {
  it("signPeace termina guerra ativa e cria tratado de paz", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    const war = state.guerras[state.guerras.length - 1];
    const result = signPeace(state, war.id, "USA", { retirada: true });
    const finalWar = result.state.guerras.find((g) => g.id === war.id);
    expect(finalWar?.estado).toBe("terminada");
    expect(finalWar?.turnoFim).toBe(state.turno);
    // Tratado de paz criado.
    const paz = result.state.tratados.find(
      (t) => !t.rompido && t.tipo === "paz" && t.paises.includes("USA") && t.paises.includes("MEX"),
    );
    expect(paz).toBeDefined();
  });

  it("signPeace com cedência muda o dono da província", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    const war = state.guerras[state.guerras.length - 1];
    // Antes: MEX-MEX é do México.
    expect(state.provincias["MEX-MEX"].countryId).toBe("MEX");
    const result = signPeace(state, war.id, "USA", { cederProvincias: ["MEX-MEX"] });
    // Depois: MEX-MEX é dos USA.
    expect(result.state.provincias["MEX-MEX"].countryId).toBe("USA");
  });

  it("signPeace com indemnizações transfere tesouro", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    const war = state.guerras[state.guerras.length - 1];
    const tesouroUSA_antes = state.paises["USA"].tesouro;
    const tesouroMEX_antes = state.paises["MEX"].tesouro;
    const result = signPeace(state, war.id, "USA", { indemnizacoes: 1_000_000_000 });
    // MEX perdeu pelo menos 1 MM (ou todo o tesouro se tinha menos).
    expect(result.state.paises["MEX"].tesouro).toBeLessThanOrEqual(tesouroMEX_antes);
    // USA ganhou o mesmo valor que MEX pagou.
    const pago = tesouroMEX_antes - result.state.paises["MEX"].tesouro;
    expect(result.state.paises["USA"].tesouro).toBeCloseTo(tesouroUSA_antes + pago, 1);
  });

  it("signPeace em guerra já terminada é no-op", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    const war = state.guerras[state.guerras.length - 1];
    // Termina a guerra primeiro.
    state = signPeace(state, war.id, "USA", { retirada: true }).state;
    // Tenta assinar paz de novo — deve devolver motivo de erro.
    const result = signPeace(state, war.id, "USA", { retirada: true });
    expect(result.motivo).toContain("já terminada");
  });
});

describe("Fase 5: reprodutibilidade do combate com seed fixa", () => {
  it("resolveWarTurn com a mesma seed produz estados idênticos", () => {
    const s1 = makeState(99, "USA");
    const s2 = makeState(99, "USA");
    const w1 = declareWar(s1, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    const w2 = declareWar(s2, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    const r1 = resolveWarTurn(w1.state);
    const r2 = resolveWarTurn(w2.state);
    // Mesma seed → mesmos progressos, mesmos deltas.
    expect(r1.state.guerras[r1.state.guerras.length - 1].frentes[0].progresso)
      .toBe(r2.state.guerras[r2.state.guerras.length - 1].frentes[0].progresso);
    expect(r1.state.guerras[r1.state.guerras.length - 1].frentes[0].ultimoDelta)
      .toBe(r2.state.guerras[r2.state.guerras.length - 1].frentes[0].ultimoDelta);
  });

  it("120 turnos com guerra não produz NaN nem guerras fantasma", () => {
    let state = makeState(2025, "USA");
    // Cria guerra contra México.
    const dr = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar");
    state = dr.state;
    const warId = state.guerras[state.guerras.length - 1].id;
    for (let i = 0; i < 120; i++) {
      const result = resolveWarTurn(state);
      state = result.state;
      // Verifica invariantes.
      for (const g of state.guerras) {
        for (const f of g.frentes) {
          expect(Number.isFinite(f.progresso), `NaN em ${g.id}/${f.provinceId}`).toBe(true);
          expect(f.progresso).toBeGreaterThanOrEqual(0);
          expect(f.progresso).toBeLessThanOrEqual(100);
        }
      }
      // Se a guerra terminou, para o teste.
      const w = state.guerras.find((g) => g.id === warId);
      if (w && w.estado === "terminada") break;
    }
    // A guerra ou terminou ou está ativa mas sem NaN/Infinity.
    const finalWar = state.guerras.find((g) => g.id === warId);
    expect(finalWar).toBeDefined();
    expect(finalWar!.estado === "ativa" || finalWar!.estado === "terminada").toBe(true);
  });
});

describe("Fase 5: cenário expandido com províncias", () => {
  it("cenário tem mais de 30 províncias (10 maiores × 3 + 20 × 1)", () => {
    expect(SCENARIO.provincias.length).toBeGreaterThanOrEqual(30);
  });

  it("as províncias dos 10 maiores países têm lat/lng", () => {
    const grandes = ["USA", "CHN", "IND", "IDN", "PAK", "NGA", "BRA", "RUS", "MEX", "JPN"];
    for (const id of grandes) {
      const provs = SCENARIO.provincias.filter((p) => p.countryId === id);
      expect(provs.length, `${id} deve ter ≥3 províncias`).toBeGreaterThanOrEqual(3);
      for (const p of provs) {
        expect(p.lat).toBeDefined();
        expect(p.lng).toBeDefined();
      }
    }
  });

  it("a guerra RUS-UKR tem frentes inicializadas", () => {
    expect(SCENARIO.guerras.length).toBe(1);
    const war = SCENARIO.guerras[0];
    expect(war.frentes).toBeDefined();
    expect(war.frentes.length).toBeGreaterThan(0);
    expect(war.objetivo).toBe("conquistar");
  });
});
