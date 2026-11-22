// tests/iso-mapping.test.ts
// Testes do mapeamento ISO (numeric topojson -> alpha3 -> nome PT).
// Garante que todos os 30 países do cenário têm mapeamento correto.

import { describe, it, expect } from "vitest";
import {
  ISO_BY_ALPHA3,
  numericToAlpha3,
  numericToNome,
  alpha3ToNome,
  ISO_TABLE,
} from "@/data/iso-mapping";
import { SCENARIOS } from "@/data/scenarios";

const SCENARIO = SCENARIOS[0];

describe("Fase 2: mapeamento ISO", () => {
  it("tabela não tem numeric duplicado", () => {
    const numerics = ISO_TABLE.map((e) => e.numeric);
    const set = new Set(numerics);
    expect(set.size).toBe(numerics.length);
  });

  it("tabela não tem alpha3 duplicado", () => {
    const alpha3 = ISO_TABLE.map((e) => e.alpha3);
    const set = new Set(alpha3);
    expect(set.size).toBe(alpha3.length);
  });

  it("numericToAlpha3 encontra os 30 países do cenário", () => {
    // Para cada país do cenário, devemos conseguir encontrar um numeric correspondente.
    const scenarioAlpha3 = SCENARIO.paises.map((p) => p.id);
    for (const alpha3 of scenarioAlpha3) {
      // Procuramos a entrada correspondente na tabela ISO.
      const entry = ISO_BY_ALPHA3.get(alpha3);
      expect(entry).toBeDefined();
      // O reverse lookup (numeric -> alpha3) também tem de funcionar.
      const back = numericToAlpha3(entry!.numeric);
      expect(back).toBe(alpha3);
    }
  });

  it("numericToAlpha3 devolve null para códigos desconhecidos", () => {
    expect(numericToAlpha3("999")).toBeNull();
    expect(numericToAlpha3("xxx")).toBeNull();
  });

  it("numericToNome devolve o nome em português para Portugal (620)", () => {
    expect(numericToNome("620")).toBe("Portugal");
    expect(numericToNome("076")).toBe("Brasil");
    expect(numericToNome("840")).toBe("Estados Unidos da América");
  });

  it("numericToNome devolve null para país não mapeado", () => {
    expect(numericToNome("999")).toBeNull();
  });

  it("alpha3ToNome devolve nome PT para PRT, BRA, USA", () => {
    expect(alpha3ToNome("PRT")).toBe("Portugal");
    expect(alpha3ToNome("BRA")).toBe("Brasil");
    expect(alpha3ToNome("USA")).toBe("Estados Unidos da América");
  });

  it("numericToAlpha3 lida com string zero-padded vs não padded", () => {
    // topojson pode trazer "076" como string ou 76 como número.
    expect(numericToAlpha3("076")).toBe("BRA");
    expect(numericToAlpha3("76")).toBe("BRA"); // normaliza
  });
});

describe("Fase 2: cenário expandido (30 países)", () => {
  it("cenário mundo-2025 tem pelo menos 30 países", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(30);
  });

  it("cenário mundo-2025 tem pelo menos 40 países (após expansão)", () => {
    expect(SCENARIO.paises.length).toBeGreaterThanOrEqual(40);
  });

  it("cenário inclui os 10 novos países (THA, PHL, BGD, SWE, BEL, CHE, ISR, MAR, DZA, PER)", () => {
    const ids = new Set(SCENARIO.paises.map((p) => p.id));
    for (const id of ["THA", "PHL", "BGD", "SWE", "BEL", "CHE", "ISR", "MAR", "DZA", "PER"]) {
      expect(ids.has(id), `País ${id} em falta`).toBe(true);
    }
  });

  it("cenário tem províncias capitais para todos os países", () => {
    const paisesIds = new Set(SCENARIO.paises.map((p) => p.id));
    for (const p of SCENARIO.paises) {
      if (p.capital) {
        const prov = SCENARIO.provincias.find((pr) => pr.id === p.capital);
        expect(prov, `Capital de ${p.id} em falta`).toBeDefined();
        expect(paisesIds.has(prov!.countryId)).toBe(true);
      }
    }
  });

  it("todos os alpha3 do cenário estão na tabela ISO", () => {
    for (const p of SCENARIO.paises) {
      expect(ISO_BY_ALPHA3.has(p.id), `alpha3 ${p.id} em falta no mapeamento ISO`).toBe(true);
    }
  });

  it("todos os numeric da tabela ISO têm nome em português", () => {
    for (const e of ISO_TABLE) {
      expect(e.nome.length).toBeGreaterThan(0);
    }
  });

  it("a guerra inicial RUS-UKR é válida e ativa", () => {
    expect(SCENARIO.guerras.length).toBe(1);
    const war = SCENARIO.guerras[0];
    expect(war.estado).toBe("ativa");
    expect(war.agressor).toBe("RUS");
    expect(war.defensores).toContain("UKR");
  });
});
