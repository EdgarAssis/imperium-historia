// src/lib/engine/culture.ts
// Fase 4 — Cultura e política regional.
//
// Cultura/etnia de uma província afeta:
//   - lealdade sob ocupação (cultura diferente = resistência; mesma = assimilação)
//   -outcome de frentes (revolta local ajuda invasor de cultura aparentada)
//   - integração: após 12 meses com lealdade > 80, província ocupada é
//     considerada assimilada e o ocupante torna-se dono formal.
//
// Afinidade cultural (0–1): 1.0 mesma cultura, ~0.85 aparentada próxima,
// ~0.5 aparentada distante, 0.3 diferente, 0.1 muito diferente.

import type { GameState, Province } from "@/types";

/**
 * Famílias culturais: culturas dentro da mesma família têm afinidade elevada
 * (~0.85 entre pares). Entre famílias diferentes, afinidade baixa (0.3).
 * Culturas individuais não listadas pertencem à sua própria família única.
 */
const FAMILIAS_CULTURAIS: ReadonlyArray<readonly string[]> = [
  // Lusófonos (CPLP)
  ["portuguesa", "brasileira", "moçambicana", "angolana", "caboverdiana", "santomense", "guineense", "timorense"],
  // Culturas locais de Angola/Moçambique (aparentadas entre si via Bantu)
  ["umbundu", "ovimbundu", "mbundu", "kimbundu", "kikongo", "chockwe", "nvanyeka", "fiote", "macua", "sena", "nyanja", "shona", "ndebele", "zulu", "xhosa", "tswana", "sotho", "swazi", "tsonga"],
  // Árabe (Magrebe + Médio Oriente)
  ["árabe-marroquina", "árabe-argelina", "árabe-tunisina", "árabe-egípcia", "árabe-sudanesa", "árabe-saudita", "árabe-iraquiana", "árabe-síria", "árabe-jordaniana", "árabe-libanesa", "árabe-líbia", "árabe-iemenita", "árabe-omani", "árabe-emiratense"],
  // Amazigh/Berberes (Norte de África)
  ["amazigh", "tuaregue", "cabila", "rifenha"],
  // Persa/Tajique
  ["persa", "tajique", "dari", "curda", "balúchi"],
  // Turca/Turcomana
  ["turca", "azeri", "turcomena", "uzbeca", "cazaque", "quirguiz", "uighur"],
  // Sul-asiático
  ["hindi", "punjabi", "bengali", "gujarati", "tamil", "telugu", "marata", "urdu", "sinhala", "nepalesa", "cingalesa"],
  // Sudeste asiático
  ["tai", "laociana", "cambojana", "shan", "lisu"],
  // Chinês
  ["hân", "cantonês", "mandarim", "wu", "min", "hakka", "xiang", "gan"],
  // Coreano/Japonês
  ["coreana", "japonesa", "ryukyu"],
  // Eslavo oriental
  ["russa", "ucraniana", "bielorrussa"],
  // Eslavo ocidental
  ["polaca", "checa", "eslovaca", "sorábia"],
  // Eslavo sul
  ["sérvia", "croata", "bosnia", "eslovena", "macedónia", "búlgara", "montenegrina"],
  // Latino/românico ocidental
  ["portuguesa", "brasileira", "moçambicana", "angolana", "espanhola", "argentina", "chilena", "colombiana", "peruana", "mexicana", "castelhana", "catalã", "galega", "basca", "andaluz", "venezuelana", "uruguaia", "paraguaia", "boliviana", "equatoriana", "centro-americana"],
  // Latino/românico europeu
  ["francesa", "italiana", "romena", "romanche", "occitana", "corsa", "sarda", "valã"],
  // Germânico
  ["alemã", "austriaca", "suíça-alemã", "holandesa", "flamenga", "frísia", "luxemburguesa", "afrikaans"],
  // Anglo-saxónico
  ["americana", "inglesa", "escocesa", "galesa", "irlandesa", "canadense", "australiana", "neozelandesa", "sul-africana-anglo"],
  // Nórdico
  ["sueca", "norueguesa", "dinamarquesa", "islandesa", "finlandesa", "estoniana"],
  // Báltico
  ["letã", "lituana"],
  // Grego/Albanês
  ["grega", "albanesa", "aromuniana"],
  // Caucasiano
  ["arménia", "georgiana", "azeibaijani-caucasiana", "chechena", "ingush", "dagestani"],
  // Índico Dravídico
  ["tamil", "telugu", "kannada", "malaiala", "tulu"],
  // Sudeste asiático ilhas
  ["javanesa", "sunda", "maduresa", "balinesa", "malaia", "indonésia", "tagala", "cebuano", "ilonggo", "bicolana", "samareña", "ilokana"],
  // Africano ocidental
  ["iorubá", "hauçá", "igbo", "akan", "ewé", "fon", "bambara", "mandinga", "uolofe", "serere", "fulani", "tuaregue-ocidental", "songai", "mossi", "jula", "baulé", "kru", "temne", "limba", "mende"],
  // Africano oriental
  ["swahili", "ganda", "kikuyu", "luo", "acholi", "nyarwanda", "hutu", "tutsi", "masai", "oromo", "amara", "tigré", "somali", "afar", "sidama"],
  // Africano central
  ["congolesa", "lubakat", "luba", "mongo", "kongo", "teke", "sango", "mboshi", "kota", "fang"],
];

/** Mapa cultura -> índice da família (cache para lookup O(1)). */
const CULTURA_PARA_FAMILIA: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < FAMILIAS_CULTURAIS.length; i++) {
    for (const c of FAMILIAS_CULTURAIS[i]) {
      map[c] = i;
    }
  }
  return map;
})();

/** Famílias consideradas «aparentadas» entre si (afinidade ~0.5 em vez de 0.3). */
const FAMILIAS_APARENTADAS: ReadonlyArray<readonly [number, number]> = [
  // Lusófonos (família 0) ←→ Latino/românico ocidental (família 13)
  [0, 13],
  // Árabe (3) ←→ Persa (4) (.World islâmico)
  [3, 4],
  // Turca (5) ←→ Persa (4)
  [5, 4],
  // Turca (5) ←→ Sul-asiático (6) (historicamente relacionadas via Ásia Central)
  [5, 6],
  // Angolano/Moçambicano Bantu (1) ←→ Africano central (24) e oriental (23)
  [1, 23],
  [1, 24],
  // Africano ocidental (22) ←→ Africano central (24)
  [22, 24],
  // Germânico (15) ←→ Anglo-saxónico (16)
  [15, 16],
  // Eslavo sul (12) ←→ Eslavo oriental (10) e ocidental (11)
  [12, 10],
  [12, 11],
  // Latino europeu (14) ←→ Latino ocidental (13)
  [14, 13],
  // Nórdico (17) ←→ Germânico (15)
  [17, 15],
];

/**
 * Afinidade cultural entre duas culturas (0–1).
 *   1.0 = mesma cultura
 *   0.85 = cultura diferente na mesma família
 *   0.5 = família aparentada (ex.: português ↔ brasileiro já é mesma família,
 *         mas africano-ocidental ↔ africano-central é aparentada)
 *   0.3 = cultura diferente, família diferente
 *   0.1 = nenhuma afinidade conhecida (fallback)
 */
export function calculateCulturalAffinity(cultA: string, cultB: string): number {
  if (!cultA || !cultB) return 0.3;
  if (cultA === cultB) return 1.0;
  const fa = CULTURA_PARA_FAMILIA[cultA];
  const fb = CULTURA_PARA_FAMILIA[cultB];
  // Se uma ou ambas não estão mapeadas, afinidade baixa.
  if (fa === undefined || fb === undefined) return 0.3;
  if (fa === fb) return 0.85;
  for (const [a, b] of FAMILIAS_APARENTADAS) {
    if ((a === fa && b === fb) || (a === fb && b === fa)) return 0.5;
  }
  return 0.3;
}

/**
 * Drift mensal de lealdade de uma província ocupada.
 *   - Cultura do ocupante = cultura da província: +2/mês (assimilação)
 *   - Cultura aparentada (0.85): +1/mês
 *   - Cultura aparentada distante (0.5): 0 (neutro)
 *   - Cultura diferente (0.3): -3/mês (resistência)
 *   - Sem afinidade (0.1): -5/mês (resistência forte)
 *
 * Bónus/malus por estabilidade do ocupante:
 *   - ocupante estável (>60): +1 bónus
 *   - ocupante instável (<30): -1 malus
 */
export function calculateLoyaltyDrift(province: Province, occupierCulture: string | undefined, occupierStability: number): number {
  const affinity = occupierCulture
    ? calculateCulturalAffinity(province.cultura ?? "local", occupierCulture)
    : 0.3;
  let drift = 0;
  if (affinity >= 1.0) drift = 2;
  else if (affinity >= 0.85) drift = 1;
  else if (affinity >= 0.5) drift = 0;
  else if (affinity >= 0.3) drift = -3;
  else drift = -5;
  // Modificador por estabilidade do ocupante.
  if (occupierStability > 60) drift += 1;
  else if (occupierStability < 30) drift -= 1;
  return drift;
}

/**
 * Aplica drift mensal de lealdade a todas as províncias ocupadas.
 * Devolve novo estado com lealdades atualizadas, contador `mesesOcupada`
 * incrementado, e eventos de revolta/assimilação gerados.
 *
 * Regras:
 *   - Se lealdade cai abaixo de 20: surge um evento «revolta popular».
 *   - Se lealdade > 80 e mesesOcupada >= 12: província é assimilada
 *     (ocupadaPor = null, countryId = ocupante, dono formal = ocupante).
 */
export function applyOccupationResistance(state: GameState): {
  state: GameState;
  eventos: { provinceId: string; tipo: "revolta" | "assimilada"; occupierId: string }[];
} {
  const eventos: { provinceId: string; tipo: "revolta" | "assimilada"; occupierId: string }[] = [];
  if (!state.playerCountryId) {
    return { state, eventos };
  }
  // Early return: se não há províncias ocupadas, devolve estado inalterado.
  const temOcupadas = Object.values(state.provincias).some((p) => p.ocupadaPor !== null);
  if (!temOcupadas) {
    return { state, eventos };
  }
  // Para cada província ocupada (ocupadaPor != null).
  const provincias: GameState["provincias"] = { ...state.provincias };
  for (const pid of Object.keys(provincias)) {
    const p = provincias[pid];
    if (!p.ocupadaPor) continue;
    const occupier = state.paises[p.ocupadaPor];
    if (!occupier) {
      // Ocupante desapareceu (anexado, etc.): limpa ocupação.
      provincias[pid] = { ...p, ocupadaPor: null, mesesOcupada: 0 };
      continue;
    }
    const occupierCulture = occupierCultureFor(state, p.ocupadaPor);
    const drift = calculateLoyaltyDrift(p, occupierCulture, occupier.estabilidade);
    const novaLealdade = clampStat((p.lealdade ?? 50) + drift);
    const novosMeses = (p.mesesOcupada ?? 0) + 1;

    // Revolta: lealdade < 20 e não foi já assinalada neste mês.
    if (novaLealdade < 20) {
      eventos.push({ provinceId: pid, tipo: "revolta", occupierId: p.ocupadaPor });
    }

    // Assimilação: lealdade alta por tempo prolongado.
    if (novaLealdade > 80 && novosMeses >= 12) {
      // A província muda formalmente de dono (deixa de estar ocupada).
      provincias[pid] = {
        ...p,
        countryId: p.ocupadaPor,
        ocupadaPor: null,
        mesesOcupada: 0,
        lealdade: novaLealdade,
      };
      eventos.push({ provinceId: pid, tipo: "assimilada", occupierId: p.ocupadaPor });
      continue;
    }

    provincias[pid] = {
      ...p,
      lealdade: novaLealdade,
      mesesOcupada: novosMeses,
    };
  }

  return {
    state: { ...state, provincias },
    eventos,
  };
}

/** Devolve a cultura dominante do país ocupante (para calcular drift). */
function occupierCultureFor(state: GameState, occupierId: string): string | undefined {
  // Heurística: usa a cultura da capital do ocupante como representativa.
  const occupier = state.paises[occupierId];
  if (!occupier || !occupier.capital) return undefined;
  const capital = state.provincias[occupier.capital];
  return capital?.cultura;
}

// --- Helpers ---------------------------------------------------------------

function clampStat(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
