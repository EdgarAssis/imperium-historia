// src/data/scenarios/index.ts
// Pontos de entrada para cenários. Mantém a validação num só sítio.
//
// Fase 2: os países (dados realistas) vivem em src/data/countries.json e o
// cenário (relações, tratados, guerras, províncias) em mundo-2025.json.
// Este loader faz o MERGE e enriquece províncias sem cultura/lealdade com
// defaults derivados do país. A validação zod acontece sempre no arranque.

import mundo2025 from "./mundo-2025.json";
import countriesData from "../countries.json";
import { culturaDoPais } from "../cultures";
import { MOEDA_POR_PAIS } from "../currencies";
import { scenarioSchema, type Scenario } from "@/types/scenario";
import type { Country, RegimeType, TaxPolicy } from "@/types";
import { TAX_POLICY_BY_REGIME } from "@/lib/engine/fiscal";

// Tipagem explícita do JSON cru (o TS infere unions rígidas de JSON importado).
interface RawCountryJson {
  id: string;
  nome: string;
  cor: string;
  capital: string;
  populacao: number;
  pib: number;
  tesouro: number;
  exercito: number;
  estabilidade: number;
  aprovacao: number;
  regime: RegimeType;
  orcamentoMilitar: number;
  tropas: number;
  nuclear: boolean;
  blocos: string[];
  recursos: string[];
  lider: string;
  // Fase 5/6: opcionais no JSON (o loader preenche defaults).
  taxPolicy?: TaxPolicy;
  moeda?: string;
  // Fase 7/8: opcionais no JSON.
  reputacao?: number;
  proxies?: string[];
  refugiadosAcolhidos?: number;
  refugiadosGerados?: number;
}

interface RawProvinceJson {
  id: string;
  nome: string;
  countryId: string;
  populacao: number;
  pib: number;
  ocupadaPor: string | null;
  lat?: number;
  lng?: number;
  cultura?: string;
  lealdade?: number;
  recursos?: string[];
  valorEstrategico?: number;
}

interface RawScenarioJson {
  id: string;
  nome: string;
  descricao: string;
  dataInicio: string;
  resolution: "mensal" | "anual";
  provincias: RawProvinceJson[];
  relacoes: { a: string; b: string; valor: number }[];
  tratados: unknown[];
  guerras: unknown[];
}

const scenarioJson = mundo2025 as unknown as RawScenarioJson;
const countriesJson = (countriesData as { paises: RawCountryJson[] }).paises;

/** Converte um país cru do countries.json no formato do schema (merge). */
function buildCountries(raw: readonly RawCountryJson[]): Country[] {
  return raw.map((c): Country => {
    // Fase 5/6: política fiscal default do regime + moeda por país.
    const taxPolicy: TaxPolicy = c.taxPolicy ?? TAX_POLICY_BY_REGIME[c.regime];
    const moeda = c.moeda ?? MOEDA_POR_PAIS[c.id] ?? "USD";
    return {
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      capital: c.capital,
      populacao: c.populacao,
      pib: c.pib,
      tesouro: c.tesouro,
      exercito: c.exercito,
      estabilidade: c.estabilidade,
      aprovacao: c.aprovacao,
      regime: c.regime,
      donoJogador: false,
      orcamentoMilitar: c.orcamentoMilitar,
      tropas: c.tropas,
      nuclear: c.nuclear,
      blocos: c.blocos,
      recursos: c.recursos,
      lider: c.lider,
      taxPolicy,
      moeda,
      // Fase 7/8: defaults para mundo vivo.
      reputacao: c.reputacao ?? 0,
      proxies: c.proxies ?? [],
      refugiadosAcolhidos: c.refugiadosAcolhidos ?? 0,
      refugiadosGerados: c.refugiadosGerados ?? 0,
    };
  });
}

/** Enriquece províncias sem cultura/lealdade com defaults do país dono. */
function enrichProvinces(
  provincias: readonly RawProvinceJson[],
  paises: readonly Country[],
): RawProvinceJson[] {
  const byId = new Map(paises.map((p) => [p.id, p]));
  return provincias.map((prov) => {
    const pais = byId.get(prov.countryId);
    if (prov.cultura !== undefined && prov.lealdade !== undefined) return prov;
    return {
      ...prov,
      cultura: prov.cultura ?? culturaDoPais(prov.countryId),
      lealdade: prov.lealdade ?? (pais ? Math.min(100, Math.max(0, pais.estabilidade)) : 50),
      recursos: prov.recursos ?? (pais ? [...pais.recursos] : []),
      valorEstrategico: prov.valorEstrategico ?? 2,
    };
  });
}

function buildScenario(): Scenario {
  const paises = buildCountries(countriesJson);
  const provincias = enrichProvinces(scenarioJson.provincias, paises);
  const merged = { ...scenarioJson, paises, provincias };
  return scenarioSchema.parse(merged);
}

/** Lista de cenários disponíveis para seleção no ecrã inicial. */
export const SCENARIOS: readonly Scenario[] = [buildScenario()];

/** Obtém um cenário pelo ID. Lança erro se não existir (não deve acontecer). */
export function getScenarioById(id: string): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Cenário desconhecido: ${id}`);
  }
  return found;
}
