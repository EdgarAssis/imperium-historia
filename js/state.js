import { COUNTRIES, DEFAULT_SCENARIO, RELATION_PRESETS } from './data.js';
import { clamp, clone } from './utils.js';

const PLAYER_ISO_FALLBACK = {
  Portugal: 'PRT',
  França: 'FRA',
  Prússia: 'DEU',
  Japão: 'JPN',
  Angola: 'AGO',
  'Império Otomano': 'TUR',
  'Turquia/Otomano': 'TUR',
};

export function createState(scenario = DEFAULT_SCENARIO, custom = {}) {
  const chosen = custom.nation
    ? {
        ...scenario,
        nation: custom.nation,
        flag: '🏴',
        year: custom.year || scenario.year,
        era: `Ano ${custom.year || scenario.year}`,
        government: 'Governo',
        context: 'Partida personalizada',
      }
    : scenario;

  const stats = sanitizeStats(chosen.stats);
  return {
    nation: chosen.nation,
    flag: chosen.flag,
    era: chosen.era,
    year: Number(chosen.year) || DEFAULT_SCENARIO.year,
    government: chosen.government,
    context: chosen.context,
    turn: 1,
    treasury: 150,
    stats,
    prevStats: clone(stats),
    events: [],
    history: [],
    diploTarget: null,
    selectedIso: null,
    diploHistory: {},
    relations: initRelations(chosen.nation),
    treaties: [],
    currentLayer: 'political',
    lastReport: null,
  };
}

export function initRelations(nation) {
  return { ...(RELATION_PRESETS[nation] || {}) };
}

export function sanitizeStats(stats = {}) {
  return {
    economy: clamp(stats.economy ?? 50),
    military: clamp(stats.military ?? 50),
    diplomacy: clamp(stats.diplomacy ?? 50),
    stability: clamp(stats.stability ?? 50),
    culture: clamp(stats.culture ?? 50),
    technology: clamp(stats.technology ?? 50),
    population: clamp(stats.population ?? 60),
  };
}

export function sanitizeState(input) {
  const base = createState(DEFAULT_SCENARIO);
  const state = { ...base, ...clone(input || {}) };
  state.year = Number.isFinite(Number(state.year)) ? Number(state.year) : base.year;
  state.turn = Math.max(1, Number.parseInt(state.turn || 1, 10));
  state.treasury = Math.max(0, Number.parseInt(state.treasury || 0, 10));
  state.stats = sanitizeStats(state.stats);
  state.prevStats = sanitizeStats(state.prevStats || state.stats);
  state.events = Array.isArray(state.events) ? state.events.slice(0, 8) : [];
  state.history = Array.isArray(state.history) ? state.history.slice(0, 80) : [];
  state.treaties = Array.isArray(state.treaties)
    ? state.treaties.slice(0, 40).map(treaty => ({
        ...treaty,
        status: treaty.status || 'active',
        signedTurn: Math.max(1, Number.parseInt(treaty.signedTurn || state.turn, 10)),
        expiresTurn: Math.max(1, Number.parseInt(treaty.expiresTurn || state.turn + 6, 10)),
        effects: treaty.effects && typeof treaty.effects === 'object' ? treaty.effects : {},
        income: Number.parseInt(treaty.income || 0, 10),
      }))
    : [];
  state.diploHistory = state.diploHistory && typeof state.diploHistory === 'object' ? state.diploHistory : {};
  state.relations = state.relations && typeof state.relations === 'object' ? state.relations : {};
  state.currentLayer = ['political', 'economy', 'military'].includes(state.currentLayer) ? state.currentLayer : 'political';
  return state;
}

export function getPlayerISO(state) {
  for (const [iso, country] of Object.entries(COUNTRIES)) {
    if (country.name === state.nation) return iso;
  }
  return PLAYER_ISO_FALLBACK[state.nation] || null;
}

export function getCountryInfo(iso) {
  if (COUNTRIES[iso]) return COUNTRIES[iso];
  return {
    name: iso || 'Desconhecido',
    flag: '🏳',
    leader: 'Líder desconhecido',
    personality: 'Interesses incertos e informação diplomática limitada.',
  };
}

export function setRelation(state, iso, relation) {
  if (!iso) return;
  if (relation === 'neutral') delete state.relations[iso];
  else state.relations[iso] = relation;
}

export function makeSerializableState(state) {
  return sanitizeState(state);
}
