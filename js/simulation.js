import { clamp, normalizeText, randomInt, sentence } from './utils.js';

export const STAT_LABELS = {
  economy: 'Economia',
  military: 'Militar',
  diplomacy: 'Diplomacia',
  stability: 'Estabilidade',
  culture: 'Cultura',
  technology: 'Tecnologia',
  population: 'Felicidade',
};

export const STAT_COLORS = {
  economy: '#4aab6a',
  military: '#4a8abf',
  diplomacy: '#c9a84c',
  stability: '#4aab6a',
  culture: '#a07adf',
  technology: '#df8a4a',
  population: '#ff9a5c',
};

export const INVESTMENTS = {
  economy: { label: 'Indústria', cost: 20, icon: '🏭' },
  military: { label: 'Exército', cost: 25, icon: '⚔' },
  technology: { label: 'Tecnologia', cost: 20, icon: '🔬' },
  stability: { label: 'Admin.', cost: 15, icon: '🏛' },
  culture: { label: 'Cultura', cost: 10, icon: '📜' },
  diplomacy: { label: 'Diplomacia', cost: 15, icon: '🤝' },
};

export const TREATY_TYPES = {
  trade: {
    label: 'Tratado Comercial',
    shortLabel: 'Comércio',
    cost: 12,
    duration: 8,
    relation: 'ally',
    effects: { economy: 3, diplomacy: 2 },
    income: 8,
    desc: 'Aumenta rendimento por turno e melhora relações económicas.',
  },
  nonAggression: {
    label: 'Pacto de Não-Agressão',
    shortLabel: 'Não-agressão',
    cost: 8,
    duration: 6,
    relation: 'neutral',
    effects: { diplomacy: 3, stability: 2 },
    income: 0,
    desc: 'Reduz tensão militar e estabiliza a fronteira.',
  },
  alliance: {
    label: 'Aliança Formal',
    shortLabel: 'Aliança',
    cost: 20,
    duration: 10,
    relation: 'ally',
    effects: { diplomacy: 5, military: 2, stability: 1 },
    income: 0,
    desc: 'Cria compromisso político e fortalece dissuasão militar.',
  },
  defensivePact: {
    label: 'Pacto Defensivo',
    shortLabel: 'Defesa',
    cost: 16,
    duration: 8,
    relation: 'ally',
    effects: { military: 4, diplomacy: 2 },
    income: 0,
    desc: 'Melhora preparação militar sem declarar hostilidade direta.',
  },
  embargo: {
    label: 'Embargo',
    shortLabel: 'Embargo',
    cost: 6,
    duration: 5,
    relation: 'hostile',
    effects: { economy: -2, diplomacy: -3, stability: 1 },
    income: -3,
    desc: 'Pressiona o alvo, mas também prejudica comércio e diplomacia.',
  },
};

export function clampStats(stats) {
  const next = {};
  for (const key of Object.keys(STAT_LABELS)) next[key] = clamp(stats[key] ?? 50);
  return next;
}

export function calculateIncome(state) {
  const treatyIncome = (state.treaties || [])
    .filter(treaty => treaty.status === 'active')
    .reduce((total, treaty) => total + (TREATY_TYPES[treaty.type]?.income || 0), 0);
  return Math.max(5, Math.floor(state.stats.economy * 0.8 + state.stats.technology * 0.3 + treatyIncome));
}

export function applyInvestment(state, stat) {
  const investment = INVESTMENTS[stat];
  if (!investment) return { ok: false, message: 'Investimento desconhecido.' };
  if (state.treasury < investment.cost) {
    return { ok: false, message: `Tesouro insuficiente. Precisas de ${investment.cost} moedas.` };
  }
  state.prevStats = { ...state.stats };
  state.treasury -= investment.cost;
  state.stats[stat] = clamp(state.stats[stat] + 8);
  return {
    ok: true,
    action: `Investimento em ${investment.label}`,
    result: `O erário financiou ${investment.label.toLowerCase()} com efeitos imediatos. +8 pontos.`,
  };
}

export function buildGameSystem(state) {
  return `És o motor narrativo de "Imperium Historia", um grand strategy histórico com IA.

NAÇÃO DO JOGADOR: ${state.nation} (${state.flag}) | ERA: ${state.era} | ANO: ${state.year}
GOVERNO: ${state.government} | TESOURO: ${state.treasury} moedas

INDICADORES: Eco ${state.stats.economy} | Mil ${state.stats.military} | Dip ${state.stats.diplomacy} | Est ${state.stats.stability} | Cult ${state.stats.culture} | Tec ${state.stats.technology} | Pop ${state.stats.population}
HISTORIAL: ${state.history.slice(-3).map(entry => entry.action).join(' | ') || '(início)'}

REGRAS:
1. Português europeu culto, estilo literário imersivo como cronista da época.
2. 3-4 parágrafos narrando consequências com rigor histórico real.
3. Menciona figuras históricas reais e tensões geopolíticas autênticas da época.
4. Considera impacto na população.
5. Menciona reações de países vizinhos ou afetados.
6. Inclui obrigatoriamente no fim:
STATS_UPDATE:{"economy":X,"military":X,"diplomacy":X,"stability":X,"culture":X,"technology":X,"population":X}
com valores absolutos realistas de 0 a 100.`;
}

export function buildInitialEventsPrompt(state) {
  return `Gera 3 eventos para ${state.nation} no ano ${state.year}. Responde APENAS JSON:
[{"type":"event","title":"Título","desc":"1-2 frases"},{"type":"opportunity","title":"Título","desc":"Descrição"},{"type":"crisis","title":"Título","desc":"Descrição"}]
Inclui pelo menos uma crise com pressão interna, diplomática ou económica.`;
}

export function buildReportPrompt(state) {
  const lastAction = state.history.length ? state.history[state.history.length - 1].action : 'Nenhuma ação notável';
  return `Gera o relatório completo do turno ${state.turn} (ano ${state.year}) para ${state.nation}.

Responde APENAS com JSON válido, sem texto adicional:
{
  "summary": "Estado do reino este turno em 2-3 frases",
  "population": "Reação popular às políticas recentes em 2 frases",
  "worldEvents": [
    {"nation":"Nome completo do país","flag":"emoji","event":"Evento histórico real ou plausível neste país no ano ${state.year}","impact":"como afeta ${state.nation}"},
    {"nation":"Nome","flag":"🏳","event":"Evento","impact":"impacto"},
    {"nation":"Nome","flag":"🏳","event":"Evento","impact":"impacto"},
    {"nation":"Nome","flag":"🏳","event":"Evento","impact":"impacto"}
  ],
  "neighbors": "Reação específica de 1-2 países vizinhos ou afetados pela última ação",
  "historicalEvent": "Um evento histórico real mundialmente impactante próximo do ano ${state.year}, ou null",
  "statsChange": {"economy":X,"military":X,"diplomacy":X,"stability":X,"culture":X,"technology":X,"population":X}
}

Contexto: ${state.nation} | Ano ${state.year} | Última ação: "${lastAction}"
Stats atuais: Eco ${state.stats.economy} | Mil ${state.stats.military} | Est ${state.stats.stability} | Pop ${state.stats.population}
Tratados ativos: ${(state.treaties || []).filter(t => t.status === 'active').map(t => `${t.label} com ${t.partnerName}`).join('; ') || 'nenhum'}`;
}

export function parseStatsUpdate(text) {
  const match = String(text || '').match(/STATS_UPDATE:\s*(\{[\s\S]*?\})/i);
  if (!match) return null;
  try {
    return clampStats(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

export function stripStatsUpdate(text) {
  return String(text || '').replace(/STATS_UPDATE:\s*\{[\s\S]*?\}\s*/i, '').trim();
}

export function parseJsonFromText(text) {
  const source = String(text || '').replace(/```json|```/gi, '').trim();
  const firstArray = source.indexOf('[');
  const firstObject = source.indexOf('{');
  const start = [firstArray, firstObject].filter(index => index >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) throw new Error('JSON não encontrado.');

  const opener = source[start];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error('JSON incompleto.');
}

export function normalizeEvents(events) {
  if (!Array.isArray(events)) return fallbackEvents();
  return events.slice(0, 5).map((event, index) => ({
    id: event.id || `evt-${Date.now()}-${index}`,
    type: ['event', 'opportunity', 'crisis'].includes(event.type) ? event.type : (index === 1 ? 'opportunity' : index === 2 ? 'crisis' : 'event'),
    title: sentence(event.title, 'Evento de Corte').slice(0, 80),
    desc: sentence(event.desc, 'Rumores e memorandos atravessam a capital.').slice(0, 220),
  })).map((event, index) => ({ ...event, options: normalizeEventOptions(event, index) }));
}

export function normalizeReport(report, state) {
  const fallback = fallbackReport(state);
  return {
    summary: sentence(report?.summary, fallback.summary),
    population: sentence(report?.population, fallback.population),
    neighbors: sentence(report?.neighbors, fallback.neighbors),
    historicalEvent: report?.historicalEvent ?? fallback.historicalEvent,
    worldEvents: Array.isArray(report?.worldEvents) && report.worldEvents.length
      ? report.worldEvents.slice(0, 6).map(event => ({
          nation: sentence(event.nation, 'Potência estrangeira'),
          flag: sentence(event.flag, '🏳'),
          event: sentence(event.event, 'Mudanças políticas agitam a região.'),
          impact: sentence(event.impact, 'A corte acompanha com prudência.'),
        }))
      : fallback.worldEvents,
    statsChange: report?.statsChange ? clampStats(report.statsChange) : fallback.statsChange,
  };
}

export function fallbackEvents() {
  return normalizeEvents([
    { type: 'event', title: 'Início do Reinado', desc: 'A corte observa cada decisão do trono com expectativa.' },
    { type: 'opportunity', title: 'Rotas Comerciais', desc: 'Mercadores propõem novas ligações capazes de enriquecer o tesouro.' },
    { type: 'crisis', title: 'Tensões na Corte', desc: 'Facções rivais disputam influência sobre a próxima grande decisão.' },
  ]);
}

export function applyEventChoice(state, eventId, choiceId) {
  const eventIndex = state.events.findIndex(event => event.id === eventId);
  if (eventIndex < 0) return { ok: false, message: 'Crise não encontrada.' };
  const event = state.events[eventIndex];
  const choice = (event.options || []).find(option => option.id === choiceId);
  if (!choice) return { ok: false, message: 'Resposta inválida.' };
  if (choice.treasury < 0 && state.treasury < Math.abs(choice.treasury)) {
    return { ok: false, message: `Tesouro insuficiente. Precisas de ${Math.abs(choice.treasury)} moedas.` };
  }

  state.prevStats = { ...state.stats };
  state.treasury = Math.max(0, state.treasury + (choice.treasury || 0));
  for (const [stat, delta] of Object.entries(choice.deltas || {})) {
    state.stats[stat] = clamp((state.stats[stat] || 0) + delta);
  }
  state.events.splice(eventIndex, 1);

  return {
    ok: true,
    action: `${event.type === 'crisis' ? 'Crise' : 'Evento'}: ${event.title}`,
    result: `${choice.label}: ${choice.outcome}`,
  };
}

export function createTreaty(state, iso, country, treatyType) {
  const config = TREATY_TYPES[treatyType];
  if (!config || !iso || !country) return { ok: false, message: 'Tratado inválido.' };
  const duplicate = (state.treaties || []).find(treaty => treaty.status === 'active' && treaty.partnerIso === iso && treaty.type === treatyType);
  if (duplicate) return { ok: false, message: 'Esse tratado já está ativo.' };
  if (state.treasury < config.cost) return { ok: false, message: `Tesouro insuficiente. Precisas de ${config.cost} moedas.` };

  state.prevStats = { ...state.stats };
  state.treasury -= config.cost;
  for (const [stat, delta] of Object.entries(config.effects || {})) {
    state.stats[stat] = clamp((state.stats[stat] || 0) + delta);
  }
  state.relations[iso] = config.relation;
  const treaty = {
    id: `tr-${state.turn}-${iso}-${treatyType}-${Date.now()}`,
    type: treatyType,
    label: config.label,
    partnerIso: iso,
    partnerName: country.name,
    partnerFlag: country.flag,
    signedTurn: state.turn,
    signedYear: state.year,
    expiresTurn: state.turn + config.duration,
    status: 'active',
    effects: config.effects,
    income: config.income,
  };
  state.treaties.unshift(treaty);
  state.treaties = state.treaties.slice(0, 40);
  return {
    ok: true,
    treaty,
    action: config.label,
    result: `${config.label} assinado com ${country.name}. ${config.desc}`,
  };
}

export function advanceTreaties(state) {
  const expired = [];
  state.treaties = (state.treaties || []).map(treaty => {
    if (treaty.status === 'active' && treaty.expiresTurn <= state.turn) {
      expired.push(treaty);
      return { ...treaty, status: 'expired' };
    }
    return treaty;
  }).slice(0, 40);
  return expired;
}

export function treatySummary(treaty) {
  const effects = Object.entries(treaty.effects || {})
    .map(([stat, value]) => `${STAT_LABELS[stat] || stat} ${value > 0 ? '+' : ''}${value}`)
    .join(', ');
  const income = treaty.income ? `, rendimento ${treaty.income > 0 ? '+' : ''}${treaty.income}/turno` : '';
  return `${effects || 'sem efeito direto'}${income}`;
}

export function fallbackActionResult(state, action) {
  const text = normalizeText(action);
  const deltas = {
    economy: 0,
    military: 0,
    diplomacy: 0,
    stability: 0,
    culture: 0,
    technology: 0,
    population: 0,
  };

  if (/(econom|imposto|industr|comerc|porto|mercad|tesouro)/.test(text)) {
    deltas.economy += 6;
    deltas.stability -= 1;
  }
  if (/(guerra|invad|exerc|marinha|frota|militar|arma)/.test(text)) {
    deltas.military += 6;
    deltas.diplomacy -= 3;
    deltas.population -= 2;
  }
  if (/(alianc|tratad|diplom|casament|embaix)/.test(text)) {
    deltas.diplomacy += 7;
    deltas.stability += 1;
  }
  if (/(univers|escola|cient|tecnolog|investig|academ)/.test(text)) {
    deltas.technology += 7;
    deltas.culture += 3;
  }
  if (/(reform|lei|administr|justic|corrup)/.test(text)) {
    deltas.stability += 5;
    deltas.economy += 2;
  }
  if (/(cultura|arte|relig|festival|templo|igreja)/.test(text)) {
    deltas.culture += 6;
    deltas.population += 2;
  }
  if (Object.values(deltas).every(value => value === 0)) {
    deltas.stability += 2;
    deltas.diplomacy += 1;
  }

  const stats = {};
  for (const key of Object.keys(deltas)) stats[key] = clamp(state.stats[key] + deltas[key]);
  const narration = [
    `A ordem é recebida nos salões do poder com murmúrios prudentes: "${action}".`,
    `Sem contacto com a IA, o conselho régio avaliou a medida por regras locais. O resultado é plausível, mas deliberadamente conservador.`,
    `A corte ajusta prioridades, os oficiais registam os efeitos e os cronistas aguardam nova confirmação do soberano.`,
  ].join('\n\n');

  return { narration, stats };
}

export function fallbackReport(state) {
  const statsChange = {
    ...state.stats,
    economy: clamp(state.stats.economy + randomInt(-2, 4)),
    stability: clamp(state.stats.stability + randomInt(-3, 3)),
    population: clamp(state.stats.population + randomInt(-2, 3)),
  };
  return {
    summary: `O ano de ${state.year} avança sob administração cautelosa. ${state.nation} conserva margem de manobra, embora a corte perceba que cada decisão pesa sobre tesouro, povo e prestígio.`,
    population: 'Nas cidades e campos, a população reage com expectativa contida. As famílias esperam estabilidade, pão e sinais claros de autoridade.',
    neighbors: 'Os vizinhos observam sem romper protocolos diplomáticos. Alguns emissários sondam alianças, enquanto rivais medem a força real do trono.',
    historicalEvent: null,
    worldEvents: [
      { nation: 'Reinos vizinhos', flag: '🏳', event: 'Cortes regionais acompanham a política externa com prudência.', impact: 'A diplomacia torna-se mais importante no próximo turno.' },
      { nation: 'Mercadores estrangeiros', flag: '⚓', event: 'Novas rotas e preços incertos agitam os portos.', impact: 'A economia pode beneficiar de investimentos.' },
      { nation: 'Fronteiras disputadas', flag: '🛡', event: 'Rumores militares aumentam a tensão nas zonas limítrofes.', impact: 'O exército exige atenção.' },
    ],
    statsChange,
  };
}

export function fallbackDiplomacy(state, targetName, message) {
  return `Recebemos a tua mensagem sobre "${message}". Sem canal de IA disponível, a chancelaria de ${targetName} responde com reserva: manteremos conversações abertas, mas exigimos provas concretas de boa-fé de ${state.nation}.`;
}

function normalizeEventOptions(event, index) {
  if (Array.isArray(event.options) && event.options.length) {
    return event.options.slice(0, 3).map((option, optionIndex) => ({
      id: option.id || `opt-${index}-${optionIndex}`,
      label: sentence(option.label, `Resposta ${optionIndex + 1}`).slice(0, 44),
      desc: sentence(option.desc, option.outcome || '').slice(0, 120),
      outcome: sentence(option.outcome, 'A corte regista a decisão.').slice(0, 180),
      deltas: sanitizeDeltas(option.deltas),
      treasury: Number.parseInt(option.treasury || 0, 10),
    }));
  }

  if (event.type === 'crisis') {
    return [
      { id: 'negotiate', label: 'Negociar concessões', desc: 'Custa moedas, acalma a crise.', outcome: 'As facções recuam, mas o tesouro sente o peso das concessões.', deltas: { stability: 6, diplomacy: 2, economy: -1 }, treasury: -15 },
      { id: 'repress', label: 'Impor autoridade', desc: 'Restaura ordem com custo popular.', outcome: 'A autoridade do trono prevalece, embora o povo sinta a mão pesada do poder.', deltas: { military: 3, stability: 2, population: -6, diplomacy: -2 }, treasury: -5 },
      { id: 'reform', label: 'Prometer reformas', desc: 'Resposta lenta, mas modernizadora.', outcome: 'A promessa de reforma compra tempo e abre espaço para administração mais capaz.', deltas: { stability: 3, culture: 2, technology: 2 }, treasury: -10 },
    ];
  }

  if (event.type === 'opportunity') {
    return [
      { id: 'fund', label: 'Financiar já', desc: 'Investimento direto.', outcome: 'O investimento transforma a oportunidade em ganho concreto para o Estado.', deltas: { economy: 4, technology: 2, diplomacy: 1 }, treasury: -12 },
      { id: 'delegate', label: 'Delegar à corte', desc: 'Menor custo, menor ganho.', outcome: 'A corte conduz a oportunidade com prudência, colhendo benefícios moderados.', deltas: { economy: 2, stability: 1 }, treasury: -4 },
      { id: 'reserve', label: 'Guardar recursos', desc: 'Evita risco imediato.', outcome: 'O tesouro é preservado, mas alguns conselheiros lamentam a ocasião perdida.', deltas: { stability: 1 }, treasury: 0 },
    ];
  }

  return [
    { id: 'court', label: 'Mobilizar a corte', desc: 'Transforma notícia em política.', outcome: 'Os conselheiros convertem o acontecimento em agenda de governo.', deltas: { diplomacy: 1, culture: 1 }, treasury: -3 },
    { id: 'observe', label: 'Observar', desc: 'Sem custo imediato.', outcome: 'A coroa acompanha a situação sem se comprometer.', deltas: { stability: 1 }, treasury: 0 },
  ];
}

function sanitizeDeltas(deltas = {}) {
  const clean = {};
  for (const key of Object.keys(STAT_LABELS)) {
    if (Number.isFinite(Number(deltas[key]))) clean[key] = Math.max(-15, Math.min(15, Math.round(Number(deltas[key]))));
  }
  return clean;
}
