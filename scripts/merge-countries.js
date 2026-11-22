// scripts/merge-countries.js
// Script pontual (Fase 2): move os países do mundo-2025.json para countries.json
// e enriquece as províncias principais com cultura/lealdade/recursos/valor estratégico.
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/data/scenarios/mundo-2025.json";
const scenario = JSON.parse(readFileSync(path, "utf8"));

// 1. Remove o bloco de países (passam a vir de src/data/countries.json).
delete scenario.paises;

// 2. Enriquecimento manual das províncias (cultura, lealdade, recursos, valor estratégico).
const enriquecimento = {
  // EUA
  "USA-DC": { cultura: "americana", lealdade: 60, recursos: ["governo", "serviços"], valorEstrategico: 5 },
  "USA-NYC": { cultura: "americana", lealdade: 62, recursos: ["finanças", "media"], valorEstrategico: 5 },
  "USA-LAX": { cultura: "americana", lealdade: 55, recursos: ["portos", "cinema"], valorEstrategico: 4 },
  // China
  "CHN-BJ": { cultura: "hân", lealdade: 75, recursos: ["governo", "tecnologia"], valorEstrategico: 5 },
  "CHN-SHA": { cultura: "hân", lealdade: 70, recursos: ["finanças", "indústria"], valorEstrategico: 5 },
  "CHN-CAN": { cultura: "cantonês", lealdade: 65, recursos: ["indústria", "exportações"], valorEstrategico: 4 },
  // Rússia
  "RUS-MOW": { cultura: "russa", lealdade: 55, recursos: ["governo", "indústria"], valorEstrategico: 5 },
  "RUS-SPB": { cultura: "russa", lealdade: 50, recursos: ["portos", "indústria"], valorEstrategico: 4 },
  "RUS-VVO": { cultura: "russa", lealdade: 45, recursos: ["portos", "militar"], valorEstrategico: 4 },
  // Índia
  "IND-DEL": { cultura: "hindi", lealdade: 60, recursos: ["governo", "tecnologia"], valorEstrategico: 5 },
  "IND-MUM": { cultura: "marata", lealdade: 58, recursos: ["finanças", "cinema"], valorEstrategico: 4 },
  "IND-BLR": { cultura: "canará", lealdade: 60, recursos: ["tecnologia"], valorEstrategico: 4 },
  // Brasil
  "BRA-BSB": { cultura: "brasileira", lealdade: 55, recursos: ["governo"], valorEstrategico: 4 },
  "BRA-SPO": { cultura: "brasileira", lealdade: 52, recursos: ["indústria", "finanças"], valorEstrategico: 5 },
  "BRA-RIO": { cultura: "brasileira", lealdade: 50, recursos: ["petróleo", "turismo"], valorEstrategico: 4 },
  // Japão
  "JPN-TYO": { cultura: "japonesa", lealdade: 72, recursos: ["finanças", "tecnologia"], valorEstrategico: 5 },
  "JPN-OSA": { cultura: "japonesa", lealdade: 70, recursos: ["indústria"], valorEstrategico: 4 },
  "JPN-NGY": { cultura: "japonesa", lealdade: 70, recursos: ["automóvel"], valorEstrategico: 4 },
  // Europa
  "DEU-BER": { cultura: "alemã", lealdade: 68, recursos: ["governo", "indústria"], valorEstrategico: 4 },
  "FRA-PAR": { cultura: "francesa", lealdade: 62, recursos: ["finanças", "moda"], valorEstrategico: 5 },
  "GBR-LON": { cultura: "inglesa", lealdade: 60, recursos: ["finanças"], valorEstrategico: 5 },
  "ESP-MAD": { cultura: "espanhola", lealdade: 58, recursos: ["governo", "serviços"], valorEstrategico: 4 },
  "ITA-ROM": { cultura: "italiana", lealdade: 55, recursos: ["governo", "turismo"], valorEstrategico: 4 },
  "POL-WAW": { cultura: "polaca", lealdade: 60, recursos: ["indústria"], valorEstrategico: 3 },
  "UKR-IEV": { cultura: "ucraniana", lealdade: 80, recursos: ["governo", "indústria"], valorEstrategico: 5 },
  "PRT-LIS": { cultura: "portuguesa", lealdade: 60, recursos: ["portos", "turismo", "finanças"], valorEstrategico: 4 },
  "SWE-STO": { cultura: "sueca", lealdade: 70, recursos: ["tecnologia"], valorEstrategico: 3 },
  "BEL-BRU": { cultura: "flamenga", lealdade: 62, recursos: ["governo UE", "logística"], valorEstrategico: 4 },
  "CHE-BRN": { cultura: "suíça-alemã", lealdade: 75, recursos: ["governo", "finanças"], valorEstrategico: 3 },
  // Ásia
  "TUR-IST": { cultura: "turca", lealdade: 50, recursos: ["comércio", "turismo"], valorEstrategico: 4 },
  "KOR-SEL": { cultura: "coreana", lealdade: 62, recursos: ["tecnologia", "semicondutores"], valorEstrategico: 5 },
  "IDN-JKT": { cultura: "javanesa", lealdade: 60, recursos: ["governo", "comércio"], valorEstrategico: 4 },
  "IDN-SBY": { cultura: "javanesa", lealdade: 58, recursos: ["portos", "indústria"], valorEstrategico: 3 },
  "IDN-MDN": { cultura: "malaia", lealdade: 55, recursos: ["agrícola"], valorEstrategico: 3 },
  "PAK-ISB": { cultura: "punjabi", lealdade: 45, recursos: ["governo"], valorEstrategico: 3 },
  "PAK-KHI": { cultura: "sindi", lealdade: 40, recursos: ["portos", "indústria"], valorEstrategico: 4 },
  "PAK-LHE": { cultura: "punjabi", lealdade: 45, recursos: ["agrícola", "têxtil"], valorEstrategico: 3 },
  "SAU-RUH": { cultura: "árabe-saudita", lealdade: 65, recursos: ["petróleo", "governo"], valorEstrategico: 5 },
  "IRN-THR": { cultura: "persa", lealdade: 45, recursos: ["petróleo", "governo"], valorEstrategico: 5 },
  "VNM-HAN": { cultura: "vietnamita", lealdade: 70, recursos: ["governo", "indústria"], valorEstrategico: 4 },
  "THA-BKK": { cultura: "tai", lealdade: 55, recursos: ["turismo", "portos"], valorEstrategico: 4 },
  "PHL-MNL": { cultura: "tagala", lealdade: 55, recursos: ["portos", "montagem"], valorEstrategico: 4 },
  "BGD-DAC": { cultura: "bengali", lealdade: 45, recursos: ["têxtil", "governo"], valorEstrategico: 3 },
  "ISR-JRS": { cultura: "israelita", lealdade: 55, recursos: ["governo", "tecnologia"], valorEstrategico: 5 },
  // Américas
  "CAN-YOW": { cultura: "canadense", lealdade: 65, recursos: ["governo"], valorEstrategico: 3 },
  "MEX-MEX": { cultura: "mexicana", lealdade: 50, recursos: ["governo", "indústria"], valorEstrategico: 5 },
  "MEX-GDL": { cultura: "mexicana", lealdade: 48, recursos: ["indústria", "tecnologia"], valorEstrategico: 3 },
  "MEX-MTY": { cultura: "mexicana", lealdade: 50, recursos: ["indústria", "aço"], valorEstrategico: 4 },
  "ARG-BUE": { cultura: "argentina", lealdade: 45, recursos: ["portos", "agrícola"], valorEstrategico: 4 },
  "COL-BOG": { cultura: "colombiana", lealdade: 48, recursos: ["governo", "finanças"], valorEstrategico: 4 },
  "CHL-SCL": { cultura: "chilena", lealdade: 55, recursos: ["governo", "mineração"], valorEstrategico: 4 },
  "PER-LIM": { cultura: "peruana", lealdade: 50, recursos: ["governo", "portos"], valorEstrategico: 4 },
  // África
  "EGY-CAI": { cultura: "árabe-egípcia", lealdade: 50, recursos: ["governo", "canal de Suez"], valorEstrategico: 5 },
  "NGA-ABV": { cultura: "iorubá", lealdade: 45, recursos: ["governo"], valorEstrategico: 3 },
  "NGA-LOS": { cultura: "iorubá", lealdade: 40, recursos: ["petróleo", "portos"], valorEstrategico: 5 },
  "NGA-KAN": { cultura: "haussa", lealdade: 42, recursos: ["agrícola", "comércio"], valorEstrategico: 3 },
  "ZAF-PRE": { cultura: "zulu", lealdade: 50, recursos: ["governo", "mineração"], valorEstrategico: 4 },
  "MAR-RAB": { cultura: "árabe-marroquina", lealdade: 55, recursos: ["governo"], valorEstrategico: 3 },
  "DZA-ALG": { cultura: "árabe-argelina", lealdade: 48, recursos: ["governo", "petróleo"], valorEstrategico: 3 },
  "AGO-LAD": { cultura: "umbundu", lealdade: 45, recursos: ["petróleo", "portos"], valorEstrategico: 4 },
  "COD-KSH": { cultura: "congolesa", lealdade: 40, recursos: ["governo", "minerais"], valorEstrategico: 4 },
  "ETH-ADD": { cultura: "amara", lealdade: 50, recursos: ["governo"], valorEstrategico: 3 },
  "KEN-NBO": { cultura: "kikuyu", lealdade: 55, recursos: ["finanças", "portos"], valorEstrategico: 4 },
  "TUN-TUN": { cultura: "árabe-tunisina", lealdade: 55, recursos: ["governo", "portos"], valorEstrategico: 3 },
  "SDN-KRT": { cultura: "árabe-sudanesa", lealdade: 30, recursos: ["governo"], valorEstrategico: 3 },
  "CMR-YDE": { cultura: "camaronesa", lealdade: 45, recursos: ["governo"], valorEstrategico: 3 },
  "CIV-ABJ": { cultura: "baulé", lealdade: 52, recursos: ["portos", "cacau"], valorEstrategico: 4 },
  "SEN-DKR": { cultura: "uolofe", lealdade: 58, recursos: ["portos", "pesca"], valorEstrategico: 3 },
  "UGA-KMP": { cultura: "ganda", lealdade: 50, recursos: ["agrícola"], valorEstrategico: 3 },
  "MOZ-MPM": { cultura: "macua", lealdade: 45, recursos: ["portos"], valorEstrategico: 3 },
  "MDG-TNR": { cultura: "merina", lealdade: 48, recursos: ["agrícola"], valorEstrategico: 2 },
  "ZMB-LUN": { cultura: "bemba", lealdade: 48, recursos: ["cobre"], valorEstrategico: 3 },
  "SOM-MGQ": { cultura: "somali", lealdade: 25, recursos: ["portos"], valorEstrategico: 2 },
  "MLI-BMK": { cultura: "mandinga", lealdade: 35, recursos: ["ouro"], valorEstrategico: 2 },
  "NER-NIM": { cultura: "haussa", lealdade: 30, recursos: ["urânio"], valorEstrategico: 3 },
  "BFA-OUA": { cultura: "mossi", lealdade: 32, recursos: ["ouro"], valorEstrategico: 2 },
  "ZWE-HRE": { cultura: "shona", lealdade: 35, recursos: ["mineração"], valorEstrategico: 2 },
  // Oceânia
  "AUS-CBR": { cultura: "australiana", lealdade: 65, recursos: ["governo"], valorEstrategico: 3 },
};

for (const prov of scenario.provincias) {
  const extra = enriquecimento[prov.id];
  if (extra) {
    prov.cultura = extra.cultura;
    prov.lealdade = extra.lealdade;
    prov.recursos = extra.recursos;
    prov.valorEstrategico = extra.valorEstrategico;
  }
}

// 3. Actualiza a descrição do cenário (países agora vêm de countries.json).
scenario.descricao =
  "Cenário de partida: ordem geopolítica contemporânea em 2025 com 58 países detalhados (dados realistas: população, PIB, orçamento militar, tropas, nuclear, blocos). Países adicionais do mapa aparecem a cinzento com a etiqueta «sem dados». Valores aproximados e plausíveis.";

writeFileSync(path, JSON.stringify(scenario, null, 2) + "\n", "utf8");
console.log("OK: mundo-2025.json reescrito sem o bloco paises; provincias enriquecidas:", Object.keys(enriquecimento).length);
