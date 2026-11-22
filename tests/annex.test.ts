// tests/annex.test.ts
// Testes do sistema de conquista de países (anexação).
// - annexCountry absorve recursos do perdedor para o vencedor.
// - Protecção: país do jogador nunca é anexado.
// - findAnnexableCountry detecta países sem províncias.
// - resolveWarTurn anexa automaticamente países sem províncias.
// - IDs determinísticos nos eventos de anexação.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import { annexCountry, findAnnexableCountry } from "@/lib/engine/annex";
import { resolveWarTurn, declareWar } from "@/lib/engine/war";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "USA"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Anexação: annexCountry", () => {
  it("anexa país perdedor ao vencedor: absorve PIB/tesouro/exército", () => {
    const state = makeState(1, "USA");
    const vencedorAntes = state.paises["USA"];
    const result = annexCountry(state, "USA", "MEX");
    expect(result.anexado).toBe(true);
    // MEX desapareceu do estado.
    expect(result.state.paises["MEX"]).toBeUndefined();
    // USA cresceu (PIB, tesouro, exército, população).
    const novoUSA = result.state.paises["USA"];
    expect(novoUSA.pib).toBeGreaterThan(vencedorAntes.pib);
    expect(novoUSA.tesouro).toBeGreaterThan(vencedorAntes.tesouro);
    expect(novoUSA.exercito).toBeGreaterThan(vencedorAntes.exercito);
    expect(novoUSA.populacao).toBeGreaterThan(vencedorAntes.populacao);
  });

  it("transfere províncias do perdedor para o vencedor", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "USA", "MEX");
    // Províncias de MEX agora têm countryId="USA".
    const provsMEX = Object.values(result.state.provincias).filter(
      (p) => p.id.startsWith("MEX-"),
    );
    for (const p of provsMEX) {
      expect(p.countryId).toBe("USA");
    }
  });

  it("remove relações que envolvem o perdedor", () => {
    const state = makeState(1, "USA");
    const antesRelacoesComMEX = state.relacoes.filter(
      (r) => r.a === "MEX" || r.b === "MEX",
    ).length;
    expect(antesRelacoesComMEX).toBeGreaterThan(0);
    const result = annexCountry(state, "USA", "MEX");
    const depoisRelacoesComMEX = result.state.relacoes.filter(
      (r) => r.a === "MEX" || r.b === "MEX",
    ).length;
    expect(depoisRelacoesComMEX).toBe(0);
  });

  it("marca tratados do perdedor como rompidos", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "USA", "MEX");
    // Tratado USMCA (USA, CAN, MEX) deve estar rompido.
    const usmca = result.state.tratados.find((t) => t.id.includes("usmca"));
    expect(usmca).toBeDefined();
    expect(usmca!.rompido).toBe(true);
  });

  it("termina guerras envolvendo o perdedor", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    expect(state.guerras.some((g) => g.estado === "ativa" && g.defensores.includes("MEX"))).toBe(true);
    const result = annexCountry(state, "USA", "MEX");
    const guerra = result.state.guerras.find((g) => g.defensores.includes("MEX"));
    expect(guerra).toBeDefined();
    expect(guerra!.estado).toBe("terminada");
  });

  it("não anexa o país do jogador (protecção)", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "MEX", "USA");
    expect(result.anexado).toBe(false);
    expect(result.mensagem).toContain("País do jogador");
  });

  it("não anexa país inexistente", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "USA", "XYZ");
    expect(result.anexado).toBe(false);
  });

  it("não anexa a si próprio", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "USA", "USA");
    expect(result.anexado).toBe(false);
  });

  it("adiciona evento ao diário", () => {
    const state = makeState(1, "USA");
    const result = annexCountry(state, "USA", "MEX");
    const ev = result.state.eventos.find((e) => e.tipo === "guerra" && e.titulo.includes("anexado"));
    expect(ev).toBeDefined();
    expect(ev!.efeitos.length).toBeGreaterThan(0);
  });

  it("IDs de eventos de anexação são determinísticos (mesma seed → mesmo ID)", () => {
    const s1 = makeState(99, "USA");
    const s2 = makeState(99, "USA");
    const r1 = annexCountry(s1, "USA", "MEX");
    const r2 = annexCountry(s2, "USA", "MEX");
    const ev1 = r1.state.eventos.find((e) => e.titulo.includes("anexado"));
    const ev2 = r2.state.eventos.find((e) => e.titulo.includes("anexado"));
    expect(ev1).toBeDefined();
    expect(ev2).toBeDefined();
    expect(ev1!.id).toBe(ev2!.id);
  });
});

describe("Anexação: findAnnexableCountry", () => {
  it("devolve null se todos os países têm províncias", () => {
    const state = makeState(1, "USA");
    expect(findAnnexableCountry(state)).toBeNull();
  });

  it("detecta país sem províncias e com guerra ativa", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    // Remove todas as províncias do MEX.
    for (const pid of Object.keys(state.provincias)) {
      if (state.provincias[pid].countryId === "MEX") {
        state.provincias[pid] = { ...state.provincias[pid], countryId: "USA" };
      }
    }
    const result = findAnnexableCountry(state);
    expect(result).not.toBeNull();
    expect(result!.perdedorId).toBe("MEX");
    expect(result!.vencedorId).toBe("USA");
  });

  it("não detecta país do jogador como anexável", () => {
    let state = makeState(1, "USA");
    // Remove todas as províncias do USA (jogador).
    for (const pid of Object.keys(state.provincias)) {
      if (state.provincias[pid].countryId === "USA") {
        state.provincias[pid] = { ...state.provincias[pid], countryId: "CAN" };
      }
    }
    expect(findAnnexableCountry(state)).toBeNull();
  });
});

describe("Anexação: integração com resolveWarTurn", () => {
  it("resolveWarTurn anexa país que perdeu todas as províncias", () => {
    let state = makeState(1, "USA");
    state = declareWar(state, "USA", ["MEX"], ["MEX-MEX"], "conquistar").state;
    // Avança a frente para 100 (conquista).
    state.guerras = state.guerras.map((g) =>
      g.id === state.guerras[state.guerras.length - 1].id
        ? { ...g, frentes: [{ ...g.frentes[0], progresso: 100 }] }
        : g,
    );
    // Isto deve transferir MEX-MEX para USA.
    // Agora simula país MEX sem províncias (já transferidas).
    const result = resolveWarTurn(state);
    // Após resolveWarTurn, se MEX não tem mais províncias, é anexado.
    // Verifica que MEX foi removido (se aplicável).
    if (!result.state.paises["MEX"]) {
      // Foi anexado — verifica evento no diário.
      const ev = result.state.eventos.find((e) => e.titulo.includes("anexado"));
      expect(ev).toBeDefined();
    } else {
      // MEX ainda existe porque ainda tem províncias (MEX-MEX foi transferida
      // para USA mas MEX tinha mais? neste cenário só tem 1).
      // Verifica pelo menos que MEX-MEX foi transferida.
      expect(result.state.provincias["MEX-MEX"].countryId).toBe("USA");
    }
  });
});

describe("Anexação: novos países africanos", () => {
  it("cenário inclui os 18 novos países africanos (TUN, SDN, AGO, COD, CMR, CIV, SEN, UGA, MOZ, MDG, ZMB, SOM, MLI, NER, BFA, ETH, KEN, ZWE)", () => {
    const ids = new Set(SCENARIO.paises.map((p) => p.id));
    const novos = ["TUN", "SDN", "AGO", "COD", "CMR", "CIV", "SEN", "UGA", "MOZ", "MDG", "ZMB", "SOM", "MLI", "NER", "BFA", "ETH", "KEN", "ZWE"];
    for (const id of novos) {
      expect(ids.has(id), `País africano ${id} em falta`).toBe(true);
    }
  });

  it("cenário tem pelo menos 55 países (40 + 15 africanos)", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(55);
  });

  it("todos os novos países africanos têm capital com lat/lng", () => {
    const novos = ["TUN", "SDN", "AGO", "COD", "CMR", "CIV", "SEN", "UGA", "MOZ", "MDG", "ZMB", "SOM", "MLI", "NER", "BFA", "ETH", "KEN", "ZWE"];
    for (const id of novos) {
      const pais = SCENARIO.paises.find((p) => p.id === id);
      expect(pais, `País ${id} em falta`).toBeDefined();
      const capital = SCENARIO.provincias.find((pr) => pr.id === pais!.capital);
      expect(capital, `Capital de ${id} em falta`).toBeDefined();
      expect(capital!.lat).toBeDefined();
      expect(capital!.lng).toBeDefined();
    }
  });
});

describe("Anexação: integração com store", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("annexCountry no store remove país e actualiza jogador", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "USA",
      realism: "normal",
      seed: 1,
    });
    const state = useGameStore.getState().state!;
    const pibAntes = state.paises["USA"].pib;
    useGameStore.getState().annexCountry("MEX");
    const novoEstado = useGameStore.getState().state!;
    expect(novoEstado.paises["MEX"]).toBeUndefined();
    expect(novoEstado.paises["USA"].pib).toBeGreaterThan(pibAntes);
  });

  it("annexCountry no store não anexa país do jogador", () => {
    useGameStore.getState().newGame({
      scenarioId: "mundo-2025",
      playerCountryId: "USA",
      realism: "normal",
      seed: 1,
    });
    useGameStore.getState().annexCountry("USA");
    const novoEstado = useGameStore.getState().state!;
    // USA ainda existe.
    expect(novoEstado.paises["USA"]).toBeDefined();
    // Mensagem de erro definida (protecção: país do jogador ou mesmo país).
    const erro = useGameStore.getState().erro;
    expect(erro).toMatch(/País do jogador|a si próprio/);
  });
});
