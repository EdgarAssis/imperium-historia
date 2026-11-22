// tests/conquest-culture.test.ts
// Testes unitários para as Fases 3 (conquista) e 4 (cultura e ocupação).
//
// Fase 3: conquerBySurrender, conquerByPopularPressure, conquerByDiplomacy.
// Fase 4: calculateCulturalAffinity, calculateLoyaltyDrift, applyOccupationResistance,
//   integração no calculateFrontOutcome (revolta local ajuda invasor aparentado).

import { describe, it, expect } from "vitest";
import { createInitialState } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  conquerBySurrender,
  conquerByPopularPressure,
  conquerByDiplomacy,
  calculateCulturalAffinity,
  calculateLoyaltyDrift,
  applyOccupationResistance,
  calculateFrontOutcome,
} from "@/lib/engine";
import { Rng } from "@/lib/engine";
import type { GameState, Province } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

// ---------------------------------------------------------------------------
// Fase 3 — Rendição
// ---------------------------------------------------------------------------

describe("Fase 3: conquerBySurrender — rendição", () => {
  it("país fraco (estabilidade < 30) cede províncias sem guerra", () => {
    const state = makeState();
    // Força o Mali (estabilidade 30) a ficar abaixo de 30.
    const perdedorId = "MLI";
    state.paises = {
      ...state.paises,
      [perdedorId]: { ...state.paises[perdedorId], estabilidade: 25 },
    };
    const provinciasCedidas = Object.keys(state.provincias)
      .filter((pid) => state.provincias[pid].countryId === perdedorId)
      .slice(0, 1);
    const result = conquerBySurrender(state, "PRT", perdedorId, {
      cederProvincias: provinciasCedidas,
      indemnizacoes: 1_000_000,
    });
    expect(result.resultado).toBe(true);
    expect(result.metodo).toBe("rendicao");
    // Província mudou de dono.
    expect(result.state.provincias[provinciasCedidas[0]].countryId).toBe("PRT");
    // Tratado de paz criado.
    expect(result.state.tratados.some((t) => t.tipo === "paz" && t.paises.includes("PRT") && t.paises.includes(perdedorId))).toBe(true);
    // Evento no diário.
    expect(result.state.eventos.some((e) => e.tipo === "diplomacia" && e.titulo.includes("rende-se"))).toBe(true);
  });

  it("país forte recusa render-se", () => {
    const state = makeState();
    const result = conquerBySurrender(state, "PRT", "USA", {
      cederProvincias: [],
      indemnizacoes: 0,
    });
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("não está suficientemente fraco");
  });

  it("não se pode render a si próprio", () => {
    const state = makeState();
    const result = conquerBySurrender(state, "PRT", "PRT", {
      cederProvincias: [],
      indemnizacoes: 0,
    });
    expect(result.resultado).toBe(false);
  });

  it("país do jogador não pode ser forçado a render-se", () => {
    const state = makeState();
    // USA tenta forçar PRT (jogador) a render-se.
    const result = conquerBySurrender(state, "USA", "PRT", {
      cederProvincias: [],
      indemnizacoes: 0,
    });
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("jogador");
  });

  it("indemnização limitada ao tesouro do perdedor", () => {
    const state = makeState();
    state.paises = {
      ...state.paises,
      MLI: { ...state.paises["MLI"], estabilidade: 20, tesouro: 5_000_000 },
    };
    const result = conquerBySurrender(state, "PRT", "MLI", {
      cederProvincias: [],
      indemnizacoes: 100_000_000, // pede muito mais do que o perdedor tem
    });
    expect(result.resultado).toBe(true);
    // O perdedor perdeu só o que tinha (tesouro ficou negativo: 5M - 5M = 0).
    expect(result.state.paises["MLI"].tesouro).toBe(0);
    // O vencedor ganhou esse valor.
    expect(result.state.paises["PRT"].tesouro).toBe(state.paises["PRT"].tesouro + 5_000_000);
  });

  it("rejeita província que não pertence ao perdedor", () => {
    const state = makeState();
    // Provincias de Portugal (não do Mali).
    const provPT = Object.keys(state.provincias).find((pid) => state.provincias[pid].countryId === "PRT");
    expect(provPT).toBeDefined();
    state.paises = {
      ...state.paises,
      MLI: { ...state.paises["MLI"], estabilidade: 20 },
    };
    const result = conquerBySurrender(state, "USA", "MLI", {
      cederProvincias: [provPT!],
      indemnizacoes: 0,
    });
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("não pertence");
  });
});

// ---------------------------------------------------------------------------
// Fase 3 — Pressão popular
// ---------------------------------------------------------------------------

describe("Fase 3: conquerByPopularPressure — revolta financiada", () => {
  it("país rico financia revolta numa província desleal e anexa-a", () => {
    const state = makeState();
    // Alvo: Marrocos (capital MAR-RAB). Província a pressionar: Casablanca (MAR-CAS),
    // com cultura árabe-marroquina.
    const alvoId = "MAR";
    const provId = "MAR-CAS";
    // Força lealdade baixa.
    state.provincias = {
      ...state.provincias,
      [provId]: { ...state.provincias[provId], lealdade: 15 },
    };
    // Para que a cultura seja diferente do governo central, definimos capital cultura
    // diferente da província. Casablanca é árabe-marroquina; capital MAR-RAB também.
    // Para garantir diferença, mudamos cultura da capital.
    const capitalId = state.paises[alvoId].capital;
    if (capitalId) {
      state.provincias = {
        ...state.provincias,
        [capitalId]: { ...state.provincias[capitalId], cultura: "amazigh" },
      };
    }
    // USA é rico (PIB 27T). Província MAR-CAS tem PIB ~$28B; 5× = $140B; USA tem $27T.
    const result = conquerByPopularPressure(state, "USA", alvoId, provId);
    expect(result.resultado).toBe(true);
    expect(result.state.provincias[provId].countryId).toBe("USA");
    // Tesouro do agitador diminuiu (pagou 0.5×PIB da província).
    expect(result.state.paises["USA"].tesouro).toBeLessThan(state.paises["USA"].tesouro);
    // Evento de política no diário.
    expect(result.state.eventos.some((e) => e.tipo === "politica" && e.titulo.includes("Revolta"))).toBe(true);
    // Relação alvo→agitador caiu para -80.
    const rel = result.state.relacoes.find((r) =>
      (r.a === alvoId && r.b === "USA") || (r.a === "USA" && r.b === alvoId));
    expect(rel).toBeDefined();
    expect(rel!.valor).toBe(-80);
  });

  it("província leal (≥ 25) não se revolta", () => {
    const state = makeState();
    const alvoId = "MAR";
    const provId = "MAR-CAS";
    state.provincias = {
      ...state.provincias,
      [provId]: { ...state.provincias[provId], lealdade: 50 }, // leal
    };
    const result = conquerByPopularPressure(state, "USA", alvoId, provId);
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("demasiado leal");
  });

  it("país pobre não consegue financiar revolta", () => {
    const state = makeState();
    // Moçambique (PIB ~$20B) tenta pressionar província de MAR com PIB ~$28B.
    // 5×28B = 140B; Moçambique tem só 20B → falha.
    // Primeiro: garantir lealdade baixa para passar a verificação de tensão.
    state.provincias = {
      ...state.provincias,
      "MAR-CAS": { ...state.provincias["MAR-CAS"], lealdade: 10 },
    };
    // Garante que cultura da província != cultura do governo central (capital).
    const capitalId = state.paises["MAR"].capital;
    if (capitalId) {
      state.provincias = {
        ...state.provincias,
        [capitalId]: { ...state.provincias[capitalId], cultura: "amazigh" },
      };
    }
    const result = conquerByPopularPressure(state, "MOZ", "MAR", "MAR-CAS");
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("economia");
  });

  it("país do jogador não pode ser alvo", () => {
    const state = makeState();
    // USA tenta pressionar PRT (jogador).
    const result = conquerByPopularPressure(state, "USA", "PRT", "PRT-LIS");
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("jogador");
  });

  it("cultura igual à do governo central bloqueia (sem tensão étnica)", () => {
    const state = makeState();
    const alvoId = "MAR";
    const provId = "MAR-CAS";
    state.provincias = {
      ...state.provincias,
      [provId]: { ...state.provincias[provId], lealdade: 10 },
    };
    // Capital e província têm ambas cultura árabe-marroquina → sem tensão.
    const result = conquerByPopularPressure(state, "USA", alvoId, provId);
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("mesma do governo");
  });
});

// ---------------------------------------------------------------------------
// Fase 3 — Diplomacia (compra)
// ---------------------------------------------------------------------------

describe("Fase 3: conquerByDiplomacy — compra de província", () => {
  it("país em crise vende província a país rico", () => {
    const state = makeState();
    // Vendedor: Mali com estabilidade 20 (em crise).
    state.paises = {
      ...state.paises,
      MLI: { ...state.paises["MLI"], estabilidade: 20 },
    };
    const provId = Object.keys(state.provincias).find((pid) => state.provincias[pid].countryId === "MLI");
    expect(provId).toBeDefined();
    const prov = state.provincias[provId!];
    const preco = Math.round(prov.pib * 5);
    const tesouroAntesUSA = state.paises["USA"].tesouro;
    const tesouroAntesMLI = state.paises["MLI"].tesouro;
    const result = conquerByDiplomacy(state, "USA", "MLI", provId!, preco);
    expect(result.resultado).toBe(true);
    expect(result.state.provincias[provId!].countryId).toBe("USA");
    // Tesouros: USA pagou, MLI recebeu.
    expect(result.state.paises["USA"].tesouro).toBe(tesouroAntesUSA - preco);
    expect(result.state.paises["MLI"].tesouro).toBe(tesouroAntesMLI + preco);
    // Evento de diplomacia no diário.
    expect(result.state.eventos.some((e) => e.tipo === "diplomacia" && e.titulo.includes("compra"))).toBe(true);
  });

  it("país estável recusa vender", () => {
    const state = makeState();
    // USA estável, com tesouro positivo: não está em crise.
    const result = conquerByDiplomacy(state, "PRT", "USA", "USA-DC", 1_000_000_000);
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("não está em crise");
  });

  it("comprador sem tesouro suficiente falha", () => {
    const state = makeState();
    // Pobre: Moçambique. Vendedor em crise: Mali estabilidade 20.
    state.paises = {
      ...state.paises,
      MLI: { ...state.paises["MLI"], estabilidade: 20 },
      MOZ: { ...state.paises["MOZ"], tesouro: 1_000 },
    };
    const provId = Object.keys(state.provincias).find((pid) => state.provincias[pid].countryId === "MLI");
    const result = conquerByDiplomacy(state, "MOZ", "MLI", provId!, 1_000_000_000);
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("tesouro suficiente");
  });

  it("país do jogador não pode vender", () => {
    const state = makeState();
    const result = conquerByDiplomacy(state, "USA", "PRT", "PRT-LIS", 1_000_000);
    expect(result.resultado).toBe(false);
    expect(result.mensagem).toContain("jogador");
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — Afinidade cultural
// ---------------------------------------------------------------------------

describe("Fase 4: calculateCulturalAffinity", () => {
  it("mesma cultura → 1.0", () => {
    expect(calculateCulturalAffinity("portuguesa", "portuguesa")).toBe(1.0);
    expect(calculateCulturalAffinity("hân", "hân")).toBe(1.0);
  });

  it("culturas da mesma família (≠) → 0.85", () => {
    // Lusófonos: portuguesa e brasileira estão na mesma família.
    expect(calculateCulturalAffinity("portuguesa", "brasileira")).toBe(0.85);
    // Eslavo oriental: russa e ucraniana.
    expect(calculateCulturalAffinity("russa", "ucraniana")).toBe(0.85);
    // Africano ocidental: iorubá e hauçá.
    expect(calculateCulturalAffinity("iorubá", "hauçá")).toBe(0.85);
  });

  it("famílias aparentadas → 0.5", () => {
    // Lusófonos (família 0) e Latino/românico europeu (família 14) são aparentados.
    // Portuguesa e francesa.
    expect(calculateCulturalAffinity("portuguesa", "francesa")).toBe(0.5);
    // Eslavo oriental (10) e Eslavo sul (12).
    expect(calculateCulturalAffinity("russa", "sérvia")).toBe(0.5);
    // Africano Bantu (1) e Africano oriental (23).
    expect(calculateCulturalAffinity("umbundu", "swahili")).toBe(0.5);
  });

  it("culturas diferentes sem afinidade → 0.3", () => {
    // Portuguesa (latino) e japonesa (família própria).
    expect(calculateCulturalAffinity("portuguesa", "japonesa")).toBe(0.3);
    expect(calculateCulturalAffinity("hân", "iorubá")).toBe(0.3);
  });

  it("cultura vazia/undefined → 0.3", () => {
    expect(calculateCulturalAffinity("", "portuguesa")).toBe(0.3);
    expect(calculateCulturalAffinity("portuguesa", "")).toBe(0.3);
  });

  it("simétrica: affinity(a,b) === affinity(b,a)", () => {
    expect(calculateCulturalAffinity("portuguesa", "brasileira"))
      .toBe(calculateCulturalAffinity("brasileira", "portuguesa"));
    expect(calculateCulturalAffinity("russa", "japonesa"))
      .toBe(calculateCulturalAffinity("japonesa", "russa"));
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — Drift de lealdade sob ocupação
// ---------------------------------------------------------------------------

describe("Fase 4: calculateLoyaltyDrift", () => {
  it("ocupante com mesma cultura → +2/mês (assimilação)", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    expect(calculateLoyaltyDrift(prov, "portuguesa", 50)).toBe(2);
  });

  it("ocupante aparentado próximo (0.85) → +1/mês", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    // Brasileira: mesma família lusófona → 0.85.
    expect(calculateLoyaltyDrift(prov, "brasileira", 50)).toBe(1);
  });

  it("ocupante aparentado distante (0.5) → 0 (neutro)", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    // Francesa: aparentada distante (Latino europeu ↔ Lusófono/Latino ocidental) → 0.5 → drift 0.
    expect(calculateLoyaltyDrift(prov, "francesa", 50)).toBe(0);
  });

  it("ocupante de cultura diferente → -3/mês (resistência)", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    // Japonesa: diferente família → 0.3 → drift -3.
    expect(calculateLoyaltyDrift(prov, "japonesa", 50)).toBe(-3);
  });

  it("ocupante estável (>60) → +1 bónus", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    // Mesma cultura (drift base +2) + estabilidade alta (+1) = +3.
    expect(calculateLoyaltyDrift(prov, "portuguesa", 70)).toBe(3);
  });

  it("ocupante instável (<30) → -1 malus", () => {
    const prov: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    // Mesma cultura (+2) + estabilidade baixa (-1) = +1.
    expect(calculateLoyaltyDrift(prov, "portuguesa", 20)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — applyOccupationResistance (integração no motor mensal)
// ---------------------------------------------------------------------------

describe("Fase 4: applyOccupationResistance", () => {
  it("sem províncias ocupadas → sem eventos", () => {
    const state = makeState();
    const result = applyOccupationResistance(state);
    expect(result.eventos.length).toBe(0);
    // Estado inalterado (mesma referência via early-return).
    expect(result.state).toBe(state);
  });

  it("província ocupada com cultura diferente perde lealdade ao longo do tempo", () => {
    const state = makeState();
    // Ocupa Cabinda (cultura fiote) por USA (capital DC, cultura americana).
    state.provincias = {
      ...state.provincias,
      "AGO-CAB": {
        ...state.provincias["AGO-CAB"],
        ocupadaPor: "USA",
        lealdade: 50,
        mesesOcupada: 0,
      },
    };
    const result = applyOccupationResistance(state);
    // Cabinda foi processada.
    const cab = result.state.provincias["AGO-CAB"];
    expect(cab.mesesOcupada).toBe(1);
    // Cultura fiote vs americana → afinidade 0.3 → drift -3.
    // Estabilidade USA = 55 (>50, mas <60, sem bónus).
    expect(cab.lealdade).toBeLessThan(50);
  });

  it("revolta surge quando lealdade cai abaixo de 20", () => {
    const state = makeState();
    // Província já perto da revolta.
    state.provincias = {
      ...state.provincias,
      "AGO-CAB": {
        ...state.provincias["AGO-CAB"],
        ocupadaPor: "USA",
        lealdade: 22,
        mesesOcupada: 5,
      },
    };
    const result = applyOccupationResistance(state);
    // Cultura diferente → drift -3 (ou -4 com malus se stab USA baixa).
    // Lealdade final < 20 → evento de revolta.
    const cab = result.state.provincias["AGO-CAB"];
    expect(cab.lealdade).toBeLessThan(20);
    expect(result.eventos.some((e) => e.tipo === "revolta" && e.provinceId === "AGO-CAB")).toBe(true);
  });

  it("assimilação após 12 meses com lealdade > 80", () => {
    const state = makeState();
    // Província ocupada há 11 meses, lealdade 80 (depois do drift fica ≥80).
    // Para garantir drift positivo, ocupante mesma cultura.
    state.provincias = {
      ...state.provincias,
      "AGO-CAB": {
        ...state.provincias["AGO-CAB"],
        ocupadaPor: "AGO", // ocupa-se a si própria — não deveria acontecer na prática
        lealdade: 85,
        mesesOcupada: 11,
        cultura: "umbundu",
      },
    };
    // Para que a função processe, ocupante != countryId (de outra forma não há ocupação).
    // Vamos colocar uma província portuguesa ocupada por Brasil (mesma família).
    state.provincias = {
      ...state.provincias,
      "PRT-OPO": {
        ...state.provincias["PRT-OPO"],
        ocupadaPor: "BRA",
        lealdade: 82,
        mesesOcupada: 11,
        cultura: "portuguesa",
      },
    };
    // Assegura que capital do BRA tem cultura "brasileira" (mesma família de "portuguesa").
    const capitalBra = state.paises["BRA"].capital;
    if (capitalBra) {
      state.provincias = {
        ...state.provincias,
        [capitalBra]: { ...state.provincias[capitalBra], cultura: "brasileira" },
      };
    }
    const result = applyOccupationResistance(state);
    // Drift +1 (afinidade 0.85); lealdade inicial 82 + 1 = 83 (>80); meses 11+1=12.
    // → assimilação.
    const opo = result.state.provincias["PRT-OPO"];
    expect(opo.countryId).toBe("BRA"); // mudou de dono formal
    expect(opo.ocupadaPor).toBeNull();
    expect(opo.mesesOcupada).toBe(0);
    expect(result.eventos.some((e) => e.tipo === "assimilada" && e.provinceId === "PRT-OPO")).toBe(true);
  });

  it("ocupante desaparecido limpa ocupação", () => {
    const state = makeState();
    // Simula ocupante que foi anexado (já não existe no estado).
    state.provincias = {
      ...state.provincias,
      "AGO-CAB": {
        ...state.provincias["AGO-CAB"],
        ocupadaPor: "INEXISTENTE",
        lealdade: 50,
        mesesOcupada: 3,
      },
    };
    const result = applyOccupationResistance(state);
    const cab = result.state.provincias["AGO-CAB"];
    expect(cab.ocupadaPor).toBeNull();
    expect(cab.mesesOcupada).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — Integração cultura no calculateFrontOutcome
// ---------------------------------------------------------------------------

describe("Fase 4: calculateFrontOutcome — bónus de cultura", () => {
  it("sem província/cultura passadas → comportamento clássico (sem bónus)", () => {
    const state = makeState();
    const agressor = state.paises["USA"];
    const defensor = state.paises["RUS"];
    const rng = new Rng(12345);
    const frente = { provinceId: "X", progresso: 0, ultimoDelta: 0 };
    // Sem cultura → delta igual ao clássico.
    const deltaSemCultura = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng);
    // Mesmo RNG (estado interno igual) → deve dar igual.
    const rng2 = new Rng(12345);
    const deltaSemCultura2 = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng2);
    expect(deltaSemCultura).toBe(deltaSemCultura2);
  });

  it("província culturalmente aparentada com o agressor dá bónus (+3)", () => {
    const state = makeState();
    const agressor = state.paises["PRT"]; // cultura portuguesa (Lisboa)
    const defensor = state.paises["AGO"]; // cultura umbundu (Luanda)
    // Província disputada com cultura brasileira (mesma família de portuguesa → 0.85).
    const prov: Province = {
      id: "AGO-BGU", nome: "Benguela", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 50,
    };
    const rng1 = new Rng(42);
    const rng2 = new Rng(42);
    const frente = { provinceId: "AGO-BGU", progresso: 0, ultimoDelta: 0 };
    const deltaComBonus = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng1, prov, "portuguesa");
    const deltaSemBonus = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng2, undefined, undefined);
    // Com bónus cultural (+3 poder agressor) deve ser maior ou igual ao sem bónus.
    expect(deltaComBonus).toBeGreaterThanOrEqual(deltaSemBonus);
  });

  it("província desleal (< 30) dobra o bónus cultural", () => {
    const state = makeState();
    const agressor = state.paises["PRT"];
    const defensor = state.paises["AGO"];
    const provLeal: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 60,
    };
    const provDesleal: Province = {
      id: "X", nome: "X", countryId: "AGO", populacao: 1, pib: 1,
      ocupadaPor: null, cultura: "portuguesa", lealdade: 15, // < 30
    };
    const rng1 = new Rng(99);
    const rng2 = new Rng(99);
    const frente = { provinceId: "X", progresso: 0, ultimoDelta: 0 };
    const deltaLeal = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng1, provLeal, "portuguesa");
    const deltaDesleal = calculateFrontOutcome(agressor, defensor, frente, 0, 0, rng2, provDesleal, "portuguesa");
    // Província desleal dá bónus dobrado (6 em vez de 3) → delta maior.
    expect(deltaDesleal).toBeGreaterThan(deltaLeal);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 — Integração no motor mensal (runMonthlyPipeline)
// ---------------------------------------------------------------------------

describe("Fase 4: motor mensal integra applyOccupationResistance", () => {
  it("runMonthlyPipeline processa províncias ocupadas (regista houveRevoltaOcupacao)", async () => {
    const { runMonthlyPipeline } = await import("@/lib/engine");
    const state = makeState();
    // Província ocupada prestes a revoltar-se.
    state.provincias = {
      ...state.provincias,
      "AGO-CAB": {
        ...state.provincias["AGO-CAB"],
        ocupadaPor: "USA",
        lealdade: 22,
        mesesOcupada: 5,
      },
    };
    const result = runMonthlyPipeline(state, "2025-02-01");
    // Marca houveRevoltaOcupacao se lealdade caiu < 20.
    expect(result.houveRevoltaOcupacao).toBe(true);
  });
});
