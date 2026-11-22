// src/data/currencies.ts
// Fase 6 — Moedas nacionais e câmbio aproximado para USD (jan/2025).
// O câmbio é estático (não flutua no jogo por enquanto — Fase 7 poderá
// adicionar mercado cambial). Mapa país → código ISO 4217.

export interface Currency {
  readonly codigo: string;
  readonly nome: string;
  /** Símbolo curto (ex.: «$», «€», «¥»). */
  readonly simbolo: string;
  /** Câmbio: 1 USD = X unidades desta moeda (ex.: EUR → 0.92 significa 1 USD = 0.92 EUR). */
  readonly cambioParaUSD: number;
}

export const CURRENCIES: Readonly<Record<string, Currency>> = {
  USD: { codigo: "USD", nome: "Dólar americano", simbolo: "$", cambioParaUSD: 1 },
  EUR: { codigo: "EUR", nome: "Euro", simbolo: "€", cambioParaUSD: 0.92 },
  GBP: { codigo: "GBP", nome: "Libra esterlina", simbolo: "£", cambioParaUSD: 0.79 },
  JPY: { codigo: "JPY", nome: "Iene japonês", simbolo: "¥", cambioParaUSD: 156.5 },
  CNY: { codigo: "CNY", nome: "Yuan chinês (renminbi)", simbolo: "¥", cambioParaUSD: 7.18 },
  RUB: { codigo: "RUB", nome: "Rublo russo", simbolo: "₽", cambioParaUSD: 92.5 },
  INR: { codigo: "INR", nome: "Rupia indiana", simbolo: "₹", cambioParaUSD: 83.2 },
  BRL: { codigo: "BRL", nome: "Real brasileiro", simbolo: "R$", cambioParaUSD: 5.05 },
  CHF: { codigo: "CHF", nome: "Franco suíço", simbolo: "Fr", cambioParaUSD: 0.88 },
  CAD: { codigo: "CAD", nome: "Dólar canadiano", simbolo: "C$", cambioParaUSD: 1.36 },
  AUD: { codigo: "AUD", nome: "Dólar australiano", simbolo: "A$", cambioParaUSD: 1.52 },
  ZAR: { codigo: "ZAR", nome: "Rand sul-africano", simbolo: "R", cambioParaUSD: 18.8 },
  AOA: { codigo: "AOA", nome: "Kwanza angolano", simbolo: "Kz", cambioParaUSD: 850 },
  MZN: { codigo: "MZN", nome: "Metical moçambicano", simbolo: "MT", cambioParaUSD: 63.5 },
  MXN: { codigo: "MXN", nome: "Peso mexicano", simbolo: "$", cambioParaUSD: 17.1 },
  ARS: { codigo: "ARS", nome: "Peso argentino", simbolo: "$", cambioParaUSD: 985 },
  TRY: { codigo: "TRY", nome: "Lira turca", simbolo: "₺", cambioParaUSD: 33.5 },
  KRW: { codigo: "KRW", nome: "Won sul-coreano", simbolo: "₩", cambioParaUSD: 1335 },
  IDR: { codigo: "IDR", nome: "Rupia indonésia", simbolo: "Rp", cambioParaUSD: 15850 },
  PKR: { codigo: "PKR", nome: "Rupia paquistanesa", simbolo: "₨", cambioParaUSD: 278 },
  SAR: { codigo: "SAR", nome: "Rial saudita", simbolo: "﷼", cambioParaUSD: 3.75 },
  IRR: { codigo: "IRR", nome: "Rial iraniano", simbolo: "﷼", cambioParaUSD: 60000 },
  EGP: { codigo: "EGP", nome: "Libra egípcia", simbolo: "£", cambioParaUSD: 48.5 },
  NGN: { codigo: "NGN", nome: "Naira nigeriana", simbolo: "₦", cambioParaUSD: 1500 },
  UAH: { codigo: "UAH", nome: "Grívnia ucraniana", simbolo: "₴", cambioParaUSD: 41.5 },
  PLN: { codigo: "PLN", nome: "Zlóti polaco", simbolo: "zł", cambioParaUSD: 4.05 },
  SEK: { codigo: "SEK", nome: "Coroa sueca", simbolo: "kr", cambioParaUSD: 10.5 },
  VND: { codigo: "VND", nome: "Dong vietnamita", simbolo: "₫", cambioParaUSD: 24800 },
  THB: { codigo: "THB", nome: "Baht tailandês", simbolo: "฿", cambioParaUSD: 35.5 },
  PHP: { codigo: "PHP", nome: "Peso filipino", simbolo: "₱", cambioParaUSD: 56.0 },
  BDT: { codigo: "BDT", nome: "Taca bengalesa", simbolo: "৳", cambioParaUSD: 117 },
  ILS: { codigo: "ILS", nome: "Shekel israelita", simbolo: "₪", cambioParaUSD: 3.65 },
  MAD: { codigo: "MAD", nome: "Dirham marroquino", simbolo: "DH", cambioParaUSD: 10.0 },
  DZD: { codigo: "DZD", nome: "Dinar argelino", simbolo: "DA", cambioParaUSD: 134 },
  PEN: { codigo: "PEN", nome: "Sol peruano", simbolo: "S/", cambioParaUSD: 3.75 },
  TND: { codigo: "TND", nome: "Dinar tunisino", simbolo: "DT", cambioParaUSD: 3.1 },
  SDG: { codigo: "SDG", nome: "Libra sudanesa", simbolo: "£", cambioParaUSD: 600 },
  CDF: { codigo: "CDF", nome: "Franco congolês", simbolo: "FC", cambioParaUSD: 2500 },
  XAF: { codigo: "XAF", nome: "Franco CFA BEAC", simbolo: "FCFA", cambioParaUSD: 600 },
  XOF: { codigo: "XOF", nome: "Franco CFA BCEAO", simbolo: "FCFA", cambioParaUSD: 600 },
  UGX: { codigo: "UGX", nome: "Xelim ugandês", simbolo: "USh", cambioParaUSD: 3800 },
  ZMW: { codigo: "ZMW", nome: "Kwacha zambiano", simbolo: "ZK", cambioParaUSD: 25.0 },
  SOS: { codigo: "SOS", nome: "Xelim somali", simbolo: "Sh", cambioParaUSD: 571 },
  MLF: { codigo: "MLF", nome: "Franco maliano", simbolo: "FCFA", cambioParaUSD: 600 },
  ETB: { codigo: "ETB", nome: "Birr etíope", simbolo: "Br", cambioParaUSD: 130 },
  KES: { codigo: "KES", nome: "Xelim queniano", simbolo: "KSh", cambioParaUSD: 158 },
  ZWL: { codigo: "ZWL", nome: "Dólar zimbabueano", simbolo: "Z$", cambioParaUSD: 13.5 },
  COP: { codigo: "COP", nome: "Peso colombiano", simbolo: "$", cambioParaUSD: 4000 },
  CLP: { codigo: "CLP", nome: "Peso chileno", simbolo: "$", cambioParaUSD: 950 },
  ARS2: { codigo: "ARS", nome: "Peso argentino", simbolo: "$", cambioParaUSD: 985 },
};

/** Mapa país → código ISO 4217 da moeda nacional. */
export const MOEDA_POR_PAIS: Readonly<Record<string, string>> = {
  USA: "USD",
  CAN: "CAD",
  MEX: "MXN",
  BRA: "BRL",
  ARG: "ARS",
  COL: "COP",
  CHL: "CLP",
  PER: "PEN",
  PRT: "EUR",
  ESP: "EUR",
  FRA: "EUR",
  DEU: "EUR",
  ITA: "EUR",
  BEL: "EUR",
  POL: "PLN",
  SWE: "SEK",
  GBR: "GBP",
  CHE: "CHF",
  UKR: "UAH",
  RUS: "RUB",
  TUR: "TRY",
  CHN: "CNY",
  JPN: "JPY",
  KOR: "KRW",
  IND: "INR",
  PAK: "PKR",
  BGD: "BDT",
  IDN: "IDR",
  VNM: "VND",
  THA: "THB",
  PHL: "PHP",
  AUS: "AUD",
  IRN: "IRR",
  SAU: "SAR",
  ISR: "ILS",
  EGY: "EGP",
  MAR: "MAD",
  DZA: "DZD",
  TUN: "TND",
  SDN: "SDG",
  AGO: "AOA",
  MOZ: "MZN",
  ZAF: "ZAR",
  NGA: "NGN",
  COD: "CDF",
  CMR: "XAF",
  CIV: "XOF",
  SEN: "XOF",
  UGA: "UGX",
  ZMB: "ZMW",
  SOM: "SOS",
  MLI: "XOF",
  NER: "XOF",
  BFA: "XOF",
  ETH: "ETB",
  KEN: "KES",
  ZWE: "ZWL",
  MDG: "MGA", // não temos MGA definido; usa XAF como fallback
};

/** Devolve a moeda de um país; fallback USD se desconhecida. */
export function moedaDoPais(countryId: string): Currency {
  const codigo = MOEDA_POR_PAIS[countryId] ?? "USD";
  return CURRENCIES[codigo] ?? CURRENCIES.USD;
}

/** Converte um valor em USD para a moeda do país. */
export function converterParaMoedaPais(countryId: string, valorUSD: number): number {
  const moeda = moedaDoPais(countryId);
  return valorUSD * moeda.cambioParaUSD;
}
