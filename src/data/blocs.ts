// src/data/blocs.ts
// Fase 6 — Definições dos principais blocos políticos/económicos/militares.
// Cada bloco tem: nome (PT), tipo, membros-fundadores (em 2025), bónus de
// comércio interno (multiplicador aplicado ao PIB mensal por par de membros),
// e moeda partilhada (se aplicável, ex.: UE → EUR).
//
// Os membros reais são derivados do `country.blocos` no estado do jogo; aqui
// ficam apenas as DEFINIÇÕES estáticas.

export type BlocType = "militar" | "economico" | "politico";

export interface BlocDefinition {
  readonly id: string;
  /** Nome em português, para apresentação. */
  nome: string;
  /** Tipo de bloco. */
  tipo: BlocType;
  /** Descrição curta. */
  descricao: string;
  /** Bónus de comércio interno: multiplicador aplicado ao comércio entre membros. */
  bonusComercioInterno: number;
  /** Código da moeda partilhada (se existir); caso contrário, null. */
  moedaPartilhada: string | null;
  /** Membros fundadores em 2025 (para inicialização do cenário). */
  membrosFundadores: string[];
}

export const BLOCOS: Readonly<Record<string, BlocDefinition>> = {
  NATO: {
    id: "NATO",
    nome: "Organização do Tratado do Atlântico Norte",
    tipo: "militar",
    descricao: "Aliança militar ocidental; defesa mútua (artigo 5).",
    bonusComercioInterno: 0.0008, // 0.08% PIB/mês por par de membros
    moedaPartilhada: null,
    membrosFundadores: ["USA", "CAN", "GBR", "FRA", "DEU", "ITA", "ESP", "POL", "TUR", "PRT", "BEL", "SWE"],
  },
  UE: {
    id: "UE",
    nome: "União Europeia",
    tipo: "economico",
    descricao: "Bloco económico e político europeu; mercado único e euro.",
    bonusComercioInterno: 0.0015, // 0.15% PIB/mês (mercado único forte)
    moedaPartilhada: "EUR",
    membrosFundadores: ["DEU", "FRA", "ITA", "ESP", "POL", "PRT", "BEL", "SWE"],
  },
  BRICS: {
    id: "BRICS",
    nome: "BRICS",
    tipo: "economico",
    descricao: "Bloco económico emergente: Brasil, Rússia, Índia, China, África do Sul + novos.",
    bonusComercioInterno: 0.0010,
    moedaPartilhada: null,
    membrosFundadores: ["BRA", "RUS", "IND", "CHN", "ZAF", "ETH", "IDN", "IRN"],
  },
  SADC: {
    id: "SADC",
    nome: "Comunidade de Desenvolvimento da África Austral",
    tipo: "economico",
    descricao: "Bloco económico da África Austral; integração regional.",
    bonusComercioInterno: 0.0006,
    moedaPartilhada: null,
    membrosFundadores: ["ZAF", "AGO", "MOZ", "ZMB", "ZWE", "MDG", "COD"],
  },
  ECOWAS: {
    id: "ECOWAS",
    nome: "Comunidade Económica dos Estados da África Ocidental",
    tipo: "economico",
    descricao: "Bloco económico da África Ocidental.",
    bonusComercioInterno: 0.0005,
    moedaPartilhada: null,
    membrosFundadores: ["NGA", "SEN", "CIV", "MLI", "BFA", "NER"],
  },
  UA: {
    id: "UA",
    nome: "União Africana",
    tipo: "politico",
    descricao: "Bloco político continental africano; paz e cooperação.",
    bonusComercioInterno: 0.0003,
    moedaPartilhada: null,
    membrosFundadores: ["NGA", "ZAF", "EGY", "ETH", "KEN", "AGO", "MOZ", "DZA", "MAR", "SEN", "UGA", "CMR", "COD", "TUN", "SDN", "ZMB", "ZWE", "MDG", "SOM", "MLI", "NER", "BFA", "CIV"],
  },
  "ONU-CS": {
    id: "ONU-CS",
    nome: "Conselho de Segurança da ONU (membros permanentes)",
    tipo: "politico",
    descricao: "Os 5 membros permanentes com poder de veto.",
    bonusComercioInterno: 0,
    moedaPartilhada: null,
    membrosFundadores: ["USA", "CHN", "RUS", "GBR", "FRA"],
  },
  G7: {
    id: "G7",
    nome: "Grupo dos Sete",
    tipo: "economico",
    descricao: "Os 7 países mais industrializados do mundo ocidental.",
    bonusComercioInterno: 0.0007,
    moedaPartilhada: null,
    membrosFundadores: ["USA", "CAN", "GBR", "FRA", "DEU", "ITA", "JPN"],
  },
  ASEAN: {
    id: "ASEAN",
    nome: "Associação das Nações do Sudeste Asiático",
    tipo: "economico",
    descricao: "Bloco económico do Sudeste Asiático.",
    bonusComercioInterno: 0.0009,
    moedaPartilhada: null,
    membrosFundadores: ["IDN", "VNM", "THA", "PHL"],
  },
  Mercosul: {
    id: "Mercosul",
    nome: "Mercado Comum do Sul",
    tipo: "economico",
    descricao: "Bloco económico da América do Sul.",
    bonusComercioInterno: 0.0006,
    moedaPartilhada: null,
    membrosFundadores: ["BRA", "ARG", "COL", "CHL"],
  },
  CPLP: {
    id: "CPLP",
    nome: "Comunidade dos Países de Língua Portuguesa",
    tipo: "politico",
    descricao: "Bloco cultural e político dos países lusófonos.",
    bonusComercioInterno: 0.0004,
    moedaPartilhada: null,
    membrosFundadores: ["PRT", "BRA", "AGO", "MOZ"],
  },
  OPEP: {
    id: "OPEP",
    nome: "Organização dos Países Exportadores de Petróleo",
    tipo: "economico",
    descricao: "Cartel petrolífero; coordena quotas de produção.",
    bonusComercioInterno: 0.0005,
    moedaPartilhada: null,
    membrosFundadores: ["SAU", "IRN", "NGA", "DZA", "AGO", "VEN", "IRQ"],
  },
  CSTO: {
    id: "CSTO",
    nome: "Organização do Tratado de Segurança Coletiva",
    tipo: "militar",
    descricao: "Aliança militar liderada pela Rússia.",
    bonusComercioInterno: 0.0003,
    moedaPartilhada: null,
    membrosFundadores: ["RUS"],
  },
  GCC: {
    id: "GCC",
    nome: "Conselho de Cooperação do Golfo",
    tipo: "economico",
    descricao: "Bloco económico dos monarcas do Golfo Pérsico.",
    bonusComercioInterno: 0.0008,
    moedaPartilhada: null,
    membrosFundadores: ["SAU"],
  },
  SCO: {
    id: "SCO",
    nome: "Organização de Cooperação de Xangai",
    tipo: "politico",
    descricao: "Bloco político euro-asiático liderado por China e Rússia.",
    bonusComercioInterno: 0.0005,
    moedaPartilhada: null,
    membrosFundadores: ["CHN", "RUS", "IND", "PAK", "IRN"],
  },
  AUKUS: {
    id: "AUKUS",
    nome: "AUKUS",
    tipo: "militar",
    descricao: "Aliança militar Austrália-Reino Unido-EUA (submarinos nucleares).",
    bonusComercioInterno: 0.0004,
    moedaPartilhada: null,
    membrosFundadores: ["AUS", "GBR", "USA"],
  },
  Quad: {
    id: "Quad",
    nome: "Diálogo Quadrilateral",
    tipo: "politico",
    descricao: "Aliança estratégica EUA-Índia-Japão-Austrália (contra a China).",
    bonusComercioInterno: 0.0003,
    moedaPartilhada: null,
    membrosFundadores: ["USA", "IND", "JPN", "AUS"],
  },
  Liga_Arabe: {
    id: "Liga Árabe",
    nome: "Liga Árabe",
    tipo: "politico",
    descricao: "Organização política do mundo árabe.",
    bonusComercioInterno: 0.0003,
    moedaPartilhada: null,
    membrosFundadores: ["SAU", "EGY", "DZA", "MAR", "TUN", "SDN", "SOM"],
  },
  Commonwealth: {
    id: "Commonwealth",
    nome: "Comunidade das Nações",
    tipo: "politico",
    descricao: "Organização política dos antigos territórios britânicos.",
    bonusComercioInterno: 0.0003,
    moedaPartilhada: null,
    membrosFundadores: ["GBR", "CAN", "AUS"],
  },
  USMCA: {
    id: "USMCA",
    nome: "Acordo EUA-México-Canadá",
    tipo: "economico",
    descricao: "Zona de livre comércio da América do Norte.",
    bonusComercioInterno: 0.0010,
    moedaPartilhada: null,
    membrosFundadores: ["USA", "CAN", "MEX"],
  },
  SAARC: {
    id: "SAARC",
    nome: "Associação Sul-Asiática para a Cooperação Regional",
    tipo: "economico",
    descricao: "Bloco económico do Sul da Ásia.",
    bonusComercioInterno: 0.0004,
    moedaPartilhada: null,
    membrosFundadores: ["IND", "PAK", "BGD"],
  },
  IGAD: {
    id: "IGAD",
    nome: "Autoridade Intergovernamental de Desenvolvimento",
    tipo: "politico",
    descricao: "Bloco do Corno de África; paz e segurança.",
    bonusComercioInterno: 0.0002,
    moedaPartilhada: null,
    membrosFundadores: ["ETH", "KEN", "UGA", "SOM"],
  },
};

/** Devolve a definição de um bloco pelo ID; null se não existir. */
export function getBlocDefinition(blocoId: string): BlocDefinition | null {
  return BLOCOS[blocoId] ?? null;
}

/** Lista de todos os blocos (para iteração). */
export function allBlocs(): readonly BlocDefinition[] {
  return Object.values(BLOCOS);
}
