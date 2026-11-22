// src/data/iso-mapping.ts
// FICHEIRO ÚNICO de mapeamento entre o mundo (topojson) e o nosso cenário.
// Mapeia:
//   - código ISO 3166-1 numérico (zero-padded 3 chars, igual ao `id` do topojson world-atlas)
//   - código ISO 3166-1 alfa-3 (usado como ID dos países no nosso GameState)
//   - nome em português
// Os países do topojson que NÃO estiverem nesta tabela aparecem no mapa a cinzento
// com a etiqueta «sem dados» e o nome original do topojson como tooltip.

export interface IsoEntry {
  /** ID numérico ISO 3166-1, com zeros à esquerda (igual ao topojson `id`). */
  numeric: string;
  /** ID alfa-3 ISO 3166-1 — chave usada no GameState. */
  alpha3: string;
  /** Nome em português (sem «República de» etc., curto para a UI). */
  nome: string;
}

/**
 * Tabela canónica. Adiciona entradas aqui quando novos países entrarem no cenário
 * (ou quando quiseres exibir nomes portugueses para mais países do mapa).
 * Cada par (numeric, alpha3) deve ser único — verifica ISO_TABLE_DEDUP.
 */
export const ISO_TABLE: readonly IsoEntry[] = [
  // América do Norte
  { numeric: "124", alpha3: "CAN", nome: "Canadá" },
  { numeric: "840", alpha3: "USA", nome: "Estados Unidos da América" },
  { numeric: "484", alpha3: "MEX", nome: "México" },

  // América Central e do Sul
  { numeric: "032", alpha3: "ARG", nome: "Argentina" },
  { numeric: "076", alpha3: "BRA", nome: "Brasil" },
  { numeric: "170", alpha3: "COL", nome: "Colômbia" },
  { numeric: "152", alpha3: "CHL", nome: "Chile" },
  { numeric: "604", alpha3: "PER", nome: "Peru" },
  { numeric: "862", alpha3: "VEN", nome: "Venezuela" },
  { numeric: "858", alpha3: "URY", nome: "Uruguai" },

  // Europa Ocidental e Central
  { numeric: "040", alpha3: "AUT", nome: "Áustria" },
  { numeric: "056", alpha3: "BEL", nome: "Bélgica" },
  { numeric: "208", alpha3: "DNK", nome: "Dinamarca" },
  { numeric: "246", alpha3: "FIN", nome: "Finlândia" },
  { numeric: "250", alpha3: "FRA", nome: "França" },
  { numeric: "276", alpha3: "DEU", nome: "Alemanha" },
  { numeric: "300", alpha3: "GRC", nome: "Grécia" },
  { numeric: "372", alpha3: "IRL", nome: "Irlanda" },
  { numeric: "380", alpha3: "ITA", nome: "Itália" },
  { numeric: "528", alpha3: "NLD", nome: "Países Baixos" },
  { numeric: "578", alpha3: "NOR", nome: "Noruega" },
  { numeric: "616", alpha3: "POL", nome: "Polónia" },
  { numeric: "620", alpha3: "PRT", nome: "Portugal" },
  { numeric: "642", alpha3: "ROU", nome: "Roménia" },
  { numeric: "724", alpha3: "ESP", nome: "Espanha" },
  { numeric: "752", alpha3: "SWE", nome: "Suécia" },
  { numeric: "756", alpha3: "CHE", nome: "Suíça" },
  { numeric: "826", alpha3: "GBR", nome: "Reino Unido" },

  // Europa de Leste e Cáucaso
  { numeric: "112", alpha3: "BLR", nome: "Bielorrússia" },
  { numeric: "643", alpha3: "RUS", nome: "Rússia" },
  { numeric: "804", alpha3: "UKR", nome: "Ucrânia" },
  { numeric: "792", alpha3: "TUR", nome: "Turquia" },

  // Ásia
  { numeric: "050", alpha3: "BGD", nome: "Bangladesh" },
  { numeric: "156", alpha3: "CHN", nome: "China" },
  { numeric: "356", alpha3: "IND", nome: "Índia" },
  { numeric: "360", alpha3: "IDN", nome: "Indonésia" },
  { numeric: "364", alpha3: "IRN", nome: "Irão" },
  { numeric: "392", alpha3: "JPN", nome: "Japão" },
  { numeric: "408", alpha3: "PRK", nome: "Coreia do Norte" },
  { numeric: "410", alpha3: "KOR", nome: "Coreia do Sul" },
  { numeric: "458", alpha3: "MYS", nome: "Malásia" },
  { numeric: "496", alpha3: "MNG", nome: "Mongólia" },
  { numeric: "586", alpha3: "PAK", nome: "Paquistão" },
  { numeric: "608", alpha3: "PHL", nome: "Filipinas" },
  { numeric: "704", alpha3: "VNM", nome: "Vietname" },
  { numeric: "764", alpha3: "THA", nome: "Tailândia" },

  // Médio Oriente
  { numeric: "368", alpha3: "IRQ", nome: "Iraque" },
  { numeric: "376", alpha3: "ISR", nome: "Israel" },
  { numeric: "400", alpha3: "JOR", nome: "Jordânia" },
  { numeric: "414", alpha3: "KWT", nome: "Kuwait" },
  { numeric: "422", alpha3: "LBN", nome: "Líbano" },
  { numeric: "512", alpha3: "OMN", nome: "Omã" },
  { numeric: "682", alpha3: "SAU", nome: "Arábia Saudita" },
  { numeric: "760", alpha3: "SYR", nome: "Síria" },
  { numeric: "784", alpha3: "ARE", nome: "Emirados Árabes Unidos" },
  { numeric: "887", alpha3: "YEM", nome: "Iémen" },

  // África
  { numeric: "012", alpha3: "DZA", nome: "Argélia" },
  { numeric: "024", alpha3: "AGO", nome: "Angola" },
  { numeric: "072", alpha3: "BWA", nome: "Botsuana" },
  { numeric: "108", alpha3: "BDI", nome: "Burundi" },
  { numeric: "120", alpha3: "CMR", nome: "Camarões" },
  { numeric: "140", alpha3: "CAF", nome: "República Centro-Africana" },
  { numeric: "148", alpha3: "TCD", nome: "Chade" },
  { numeric: "174", alpha3: "COM", nome: "Comores" },
  { numeric: "178", alpha3: "COG", nome: "Congo" },
  { numeric: "180", alpha3: "COD", nome: "República Democrática do Congo" },
  { numeric: "232", alpha3: "ERI", nome: "Eritreia" },
  { numeric: "231", alpha3: "ETH", nome: "Etiópia" },
  { numeric: "262", alpha3: "DJI", nome: "Jibuti" },
  { numeric: "266", alpha3: "GAB", nome: "Gabão" },
  { numeric: "270", alpha3: "GMB", nome: "Gâmbia" },
  { numeric: "288", alpha3: "GHA", nome: "Gana" },
  { numeric: "324", alpha3: "GIN", nome: "Guiné" },
  { numeric: "624", alpha3: "GNB", nome: "Guiné-Bissau" },
  { numeric: "384", alpha3: "CIV", nome: "Costa do Marfim" },
  { numeric: "404", alpha3: "KEN", nome: "Quénia" },
  { numeric: "430", alpha3: "LSO", nome: "Lesoto" },
  { numeric: "434", alpha3: "LBY", nome: "Líbia" },
  { numeric: "450", alpha3: "MDG", nome: "Madagáscar" },
  { numeric: "454", alpha3: "MWI", nome: "Malawi" },
  { numeric: "466", alpha3: "MLI", nome: "Mali" },
  { numeric: "478", alpha3: "MRT", nome: "Mauritânia" },
  { numeric: "480", alpha3: "MUS", nome: "Maurícia" },
  { numeric: "504", alpha3: "MAR", nome: "Marrocos" },
  { numeric: "508", alpha3: "MOZ", nome: "Moçambique" },
  { numeric: "516", alpha3: "NAM", nome: "Namíbia" },
  { numeric: "562", alpha3: "NER", nome: "Níger" },
  { numeric: "566", alpha3: "NGA", nome: "Nigéria" },
  { numeric: "646", alpha3: "RWA", nome: "Ruanda" },
  { numeric: "686", alpha3: "SEN", nome: "Senegal" },
  { numeric: "690", alpha3: "SYC", nome: "Seicheles" },
  { numeric: "706", alpha3: "SOM", nome: "Somália" },
  { numeric: "710", alpha3: "ZAF", nome: "África do Sul" },
  { numeric: "716", alpha3: "ZWE", nome: "Zimbabué" },
  { numeric: "728", alpha3: "SSD", nome: "Sudão do Sul" },
  { numeric: "729", alpha3: "SDN", nome: "Sudão" },
  { numeric: "732", alpha3: "ESH", nome: "Saara Ocidental" },
  { numeric: "748", alpha3: "SWZ", nome: "Essuatíni" },
  { numeric: "768", alpha3: "TGO", nome: "Togo" },
  { numeric: "788", alpha3: "TUN", nome: "Tunísia" },
  { numeric: "800", alpha3: "UGA", nome: "Uganda" },
  { numeric: "818", alpha3: "EGY", nome: "Egito" },
  { numeric: "834", alpha3: "TZA", nome: "Tanzânia" },
  { numeric: "854", alpha3: "BFA", nome: "Burkina Faso" },
  { numeric: "894", alpha3: "ZMB", nome: "Zâmbia" },

  // Oceânia
  { numeric: "036", alpha3: "AUS", nome: "Austrália" },
  { numeric: "554", alpha3: "NZL", nome: "Nova Zelândia" },
];

/** Mapa: numeric (zero-padded) -> IsoEntry. */
export const ISO_BY_NUMERIC: ReadonlyMap<string, IsoEntry> = (() => {
  const map = new Map<string, IsoEntry>();
  for (const entry of ISO_TABLE) {
    if (map.has(entry.numeric)) {
      console.warn(`[iso-mapping] numeric duplicado: ${entry.numeric}`);
    }
    if (map.has(entry.alpha3)) {
      console.warn(`[iso-mapping] alpha3 duplicado: ${entry.alpha3}`);
    }
    map.set(entry.numeric, entry);
  }
  return map;
})();

/** Mapa: alpha3 -> IsoEntry. */
export const ISO_BY_ALPHA3: ReadonlyMap<string, IsoEntry> = (() => {
  const map = new Map<string, IsoEntry>();
  for (const entry of ISO_TABLE) {
    map.set(entry.alpha3, entry);
  }
  return map;
})();

/**
 * Converte o ID numérico do topojson (string zero-padded) num ID alfa-3.
 * Devolve null se não houver mapeamento (país «sem dados»).
 */
export function numericToAlpha3(numeric: string): string | null {
  const padded = String(numeric).padStart(3, "0");
  return ISO_BY_NUMERIC.get(padded)?.alpha3 ?? null;
}

/**
 * Devolve o nome em português a partir do alpha3.
 * Se não houver mapeamento, devolve o próprio alpha3 — útil para debug.
 */
export function alpha3ToNome(alpha3: string): string {
  return ISO_BY_ALPHA3.get(alpha3)?.nome ?? alpha3;
}

/**
 * Devolve o nome em português a partir do ID numérico do topojson.
 * Se não houver mapeamento, devolve null — o chamador deve usar o nome original
 * do topojson como fallback.
 */
export function numericToNome(numeric: string): string | null {
  const padded = String(numeric).padStart(3, "0");
  return ISO_BY_NUMERIC.get(padded)?.nome ?? null;
}
