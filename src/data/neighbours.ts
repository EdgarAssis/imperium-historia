// src/data/neighbours.ts
// Bloco A6/B2 — Lista de países vizinhos (fronteiras terrestres).
// Usado para:
//   - Distribuição de refugiados (países vizinhos recebem primeiro)
//   - Modo de mapa "refugiados" (mostrar fluxos entre vizinhos)
//
// Lista manual baseada em fronteiras geográficas reais. Editável.
// Países sem vizinhos nesta lista são ilhas ou não têm fronteira terrestre
// com nenhum país do jogo.

export const NEIGHBOURS: Readonly<Record<string, string[]>> = {
  // América do Norte
  USA: ["CAN", "MEX"],
  CAN: ["USA"],
  MEX: ["USA", "GTM"],
  // América do Sul
  BRA: ["ARG", "COL", "VEN", "PER", "BOL", "PRY", "URY", "GUY", "SUR"],
  ARG: ["BRA", "CHL", "PRY", "URY", "BOL"],
  COL: ["VEN", "BRA", "ECU", "PER"],
  CHL: ["ARG", "BOL", "PER"],
  PER: ["ECU", "COL", "BRA", "BOL", "CHL"],
  // Europa
  PRT: ["ESP"],
  ESP: ["PRT", "FRA", "AND"],
  FRA: ["ESP", "BEL", "LUX", "DEU", "CHE", "ITA", "MCO"],
  DEU: ["FRA", "BEL", "NLD", "LUX", "CHE", "AUT", "CZE", "POL", "DNK"],
  GBR: ["IRL"],
  ITA: ["FRA", "CHE", "AUT", "SVN", "VAT", "SMR"],
  POL: ["DEU", "CZE", "SVK", "UKR", "BLR", "LTU", "RUS"],
  UKR: ["POL", "SVK", "HUN", "ROU", "MDA", "BLR", "RUS"],
  SWE: ["NOR", "FIN"],
  BEL: ["NLD", "DEU", "FRA", "LUX"],
  CHE: ["FRA", "DEU", "AUT", "ITA", "LIE"],
  TUR: ["GRC", "BGR", "GEO", "ARM", "AZE", "IRN", "IRQ", "SYR"],
  // Ásia
  CHN: ["RUS", "MNG", "KAZ", "KGZ", "TJK", "AFG", "PAK", "IND", "NPL", "BTN", "MMR", "LAO", "VNM", "PRK"],
  RUS: ["NOR", "FIN", "EST", "LVA", "LTU", "POL", "BLR", "UKR", "GEO", "AZE", "KAZ", "CHN", "MNG", "PRK"],
  IND: ["PAK", "CHN", "NPL", "BTN", "BGD", "MMR", "LKA"],
  JPN: [], // ilha
  KOR: ["PRK"],
  IDN: ["MYS", "PNG", "TLS"],
  PAK: ["IND", "AFG", "IRN", "CHN"],
  BGD: ["IND", "MMR"],
  VNM: ["CHN", "LAO", "KHM"],
  THA: ["MMR", "LAO", "KHM", "MYS"],
  PHL: [], // arquipélago
  IRN: ["IRQ", "TUR", "ARM", "AZE", "TKM", "AFG", "PAK"],
  SAU: ["JOR", "IRQ", "KWT", "QAT", "UAE", "OMN", "YEM"],
  ISR: ["LBN", "SYR", "JOR", "EGY"],
  // Médio Oriente
  AFG: ["IRN", "PAK", "TKM", "UZB", "TJK", "CHN"],
  IRQ: ["IRN", "TUR", "SYR", "JOR", "SAU", "KWT"],
  SYR: ["TUR", "IRQ", "JOR", "ISR", "LBN"],
  // África
  EGY: ["LBY", "SDN", "ISR"],
  LBY: ["EGY", "TUN", "DZA", "NER", "TCD", "SDN"],
  DZA: ["MAR", "TUN", "LBY", "NER", "MLI", "MRT"],
  MAR: ["ESP", "DZA", "ESH"],
  TUN: ["DZA", "LBY"],
  SDN: ["EGY", "LBY", "TCD", "CAF", "ZAR", "SSD", "ETH"],
  AGO: ["COD", "COG", "GAB", "ZMB", "NAM"],
  COD: ["AGO", "COG", "CAF", "SSD", "UGA", "RWA", "BDI", "TZA", "ZMB"],
  CMR: ["NGA", "TCD", "CAF", "COG", "GAB", "GNQ"],
  CIV: ["GHA", "BFA", "MLI", "GIN", "LBR"],
  SEN: ["MRT", "MLI", "GIN", "GMB", "GNS"],
  UGA: ["COD", "SSD", "KEN", "RWA", "TZA"],
  MOZ: ["TZA", "MWI", "ZMB", "ZWE", "ZAF", "SWZ"],
  MDG: [], // ilha
  ZMB: ["COD", "TZA", "MWI", "MOZ", "ZWE", "BWA", "NAM", "AGO"],
  SOM: ["ETH", "KEN", "DJI"],
  MLI: ["DZA", "NER", "BFA", "CIV", "GIN", "SEN", "MRT"],
  NER: ["DZA", "LBY", "TCD", "NGA", "BEN", "BFA", "MLI"],
  BFA: ["MLI", "CIV", "GHA", "TGO", "BEN", "NER"],
  ETH: ["ERI", "DJI", "SOM", "KEN", "SSD", "SDN"],
  KEN: ["ETH", "SOM", "TZA", "UGA", "SSD"],
  ZWE: ["ZAF", "BWA", "ZMB", "MOZ"],
  ZAF: ["NAM", "BWA", "ZWE", "MOZ", "SWZ", "LSO"],
  // Oceania
  AUS: [], // ilha
};

/** Devolve a lista de vizinhos de um país (fronteiras terrestres). */
export function getNeighbours(countryId: string): string[] {
  return NEIGHBOURS[countryId] ?? [];
}

/** Verifica se dois países são vizinhos (fronteira terrestre). */
export function areNeighbours(a: string, b: string): boolean {
  return getNeighbours(a).includes(b);
}
