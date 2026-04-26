import { COUNTRIES, SCENARIOS } from './data.js';
import { getCountryInfo } from './state.js';
import { INVESTMENTS, STAT_COLORS, STAT_LABELS, TREATY_TYPES, treatySummary } from './simulation.js';
import { clear, el, formatSigned, qs, qsa, truncate } from './utils.js';

let notificationTimer = null;

export function showScreen(id) {
  qsa('.screen').forEach(screen => screen.classList.remove('screen-active'));
  qs(`#${id}`)?.classList.add('screen-active');
}

export function showLoading(text = 'A processar...') {
  qs('#loading-text').textContent = text;
  qs('#loading').classList.add('show');
}

export function hideLoading() {
  qs('#loading').classList.remove('show');
}

export function notify(text) {
  const node = qs('#notif');
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => node.classList.remove('show'), 3500);
}

export function renderScenarioCards(selectedIndex, onSelect) {
  const list = qs('#scenario-list');
  clear(list);
  SCENARIOS.forEach((scenario, index) => {
    const button = el('button', {
      className: `scenario-card${index === selectedIndex ? ' active' : ''}`,
      attrs: { type: 'button' },
      on: { click: () => onSelect(index) },
    }, [
      el('div', { className: 'flag', text: scenario.flag }),
      el('strong', { text: `${scenario.nation}, ${scenario.year}` }),
      el('p', { text: scenario.context }),
    ]);
    list.append(button);
  });
}

export function renderTopbar(state) {
  qs('#stat-nation').textContent = `${state.flag} ${state.nation}`;
  qs('#stat-year').textContent = String(state.year);
  qs('#stat-gdp').textContent = `${Math.round(state.stats.economy * 14)}M`;
  qs('#stat-stab').textContent = `${state.stats.stability}%`;
  qs('#stat-mil').textContent = String(state.stats.military);
  qs('#stat-treasury').textContent = `${state.treasury} moedas`;
  qs('#turn-num').textContent = String(state.turn);
  qs('#nation-flag').textContent = state.flag;
  qs('#nation-name').textContent = state.nation;
  qs('#nation-era').textContent = state.era;
  qs('#nation-gov').textContent = state.government;
}

export function renderStats(state) {
  const list = qs('#stats-list');
  clear(list);
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const value = state.stats[key] || 0;
    const diff = value - (state.prevStats[key] || 0);
    const deltaClass = diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-same';
    list.append(el('div', { className: 'stat-row' }, [
      el('div', { className: 'stat-name', text: label }),
      el('div', { className: 'stat-bar-bg' }, [
        el('div', { className: 'stat-bar', attrs: { style: `width:${value}%;background:${STAT_COLORS[key]}` } }),
      ]),
      el('div', { className: 'stat-val', text: String(value) }),
      el('div', { className: `stat-delta ${deltaClass}`, text: diff === 0 ? '—' : formatSigned(diff) }),
    ]));
  }
}

export function renderInvestments(onInvest) {
  const list = qs('#invest-list');
  clear(list);
  for (const [stat, investment] of Object.entries(INVESTMENTS)) {
    list.append(el('button', {
      className: 'invest-btn',
      attrs: { type: 'button' },
      on: { click: () => onInvest(stat) },
    }, [
      document.createTextNode(`${investment.icon} ${investment.label}`),
      el('span', { text: `${investment.cost} moedas` }),
    ]));
  }
}

export function renderEvents(events, onChoice) {
  const list = qs('#events-list');
  clear(list);
  if (!events.length) {
    list.append(el('div', { className: 'event-item', text: 'Sem crises ativas. Os mensageiros ainda recolhem notícias.' }));
    return;
  }
  for (const event of events) {
    const children = [
      el('span', { className: `event-type ${event.type}`, text: event.type === 'opportunity' ? 'Oportunidade' : event.type === 'crisis' ? 'Crise' : 'Evento' }),
      el('strong', { text: event.title }),
      document.createElement('br'),
      document.createTextNode(event.desc),
    ];
    if (event.options?.length) {
      children.push(el('div', { className: 'event-actions' }, event.options.map(option => (
        el('button', {
          className: 'event-choice',
          attrs: { type: 'button', title: option.desc },
          on: { click: () => onChoice?.(event.id, option.id) },
        }, [
          el('strong', { text: option.label }),
          el('span', { text: option.desc }),
        ])
      ))));
    }
    list.append(el('article', { className: `event-item event-${event.type}` }, children));
  }
}

export function renderHistory(history) {
  const log = qs('#action-log');
  clear(log);
  if (!history.length) {
    log.append(el('div', { className: 'log-entry', text: 'O teu reinado começa. Cada ação ficará registada.' }));
    return;
  }
  for (const entry of history.slice().reverse()) {
    log.append(el('article', { className: 'log-entry' }, [
      el('div', { className: 'log-turn', text: `T${entry.turn} · ${entry.year}` }),
      el('div', { className: 'log-action', text: `"${entry.action}"` }),
      el('div', { className: 'log-result', text: truncate(entry.result) }),
    ]));
  }
}

export function renderDiploSelect(state, onSelect) {
  const select = qs('#diplo-select');
  clear(select);
  select.append(el('option', { text: 'Seleciona um país...', attrs: { value: '' } }));
  Object.entries(COUNTRIES)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt'))
    .forEach(([iso, country]) => {
      if (country.name === state.nation) return;
      const option = el('option', { text: `${country.flag} ${country.name}`, attrs: { value: iso } });
      if (state.selectedIso === iso) option.selected = true;
      select.append(option);
    });
  select.onchange = () => onSelect(select.value);
}

export function renderDiploHeader(state) {
  if (!state.selectedIso) {
    qs('#diplo-flag').textContent = '🌍';
    qs('#diplo-name').textContent = 'Diplomacia';
    qs('#diplo-hint').textContent = 'Seleciona um país';
    return;
  }
  const country = getCountryInfo(state.selectedIso);
  qs('#diplo-flag').textContent = country.flag;
  qs('#diplo-name').textContent = country.name;
  qs('#diplo-hint').textContent = country.leader;
}

export function renderDiploThread(state) {
  const messages = qs('#diplo-messages');
  clear(messages);
  if (!state.selectedIso) {
    messages.append(el('div', { className: 'msg msg-ai' }, [
      el('span', { className: 'msg-leader', text: 'Sistema' }),
      document.createTextNode('Seleciona um país no mapa ou na lista para abrir um canal diplomático.'),
    ]));
    return;
  }
  const country = getCountryInfo(state.selectedIso);
  const thread = state.diploHistory[country.name] || [];
  if (!thread.length) {
    messages.append(el('div', { className: 'msg msg-ai' }, [
      el('span', { className: 'msg-leader', text: country.name }),
      document.createTextNode('A chancelaria aguarda a tua proposta.'),
    ]));
    return;
  }
  for (const message of thread) {
    appendDiploMessage(message.content, message.role === 'user' ? 'player' : 'ai', message.role === 'assistant' ? country.name : null);
  }
}

export function appendDiploMessage(text, type, leader = null) {
  const messages = qs('#diplo-messages');
  const children = [];
  if (leader) children.push(el('span', { className: 'msg-leader', text: leader }));
  children.push(document.createTextNode(text));
  messages.append(el('div', { className: `msg msg-${type}` }, children));
  messages.scrollTop = messages.scrollHeight;
}

export function addTypingMessage() {
  const id = `typing-${Date.now()}`;
  qs('#diplo-messages').append(el('div', { className: 'msg msg-ai', attrs: { id }, text: '...' }));
  return id;
}

export function removeTypingMessage(id) {
  qs(`#${id}`)?.remove();
}

export function renderIntel(state, onRelation, onTreaty) {
  const root = qs('#intel-content');
  clear(root);
  if (!state.selectedIso) {
    root.append(el('p', { text: 'Seleciona um país no mapa para ver informações de inteligência.' }));
    return;
  }
  const country = getCountryInfo(state.selectedIso);
  const relation = state.relations[state.selectedIso] || 'neutral';
  root.append(
    el('div', { className: 'intel-heading' }, [
      el('span', { text: country.flag }),
      el('div', {}, [
        el('strong', { text: country.name }),
        el('small', { text: relationLabel(relation) }),
      ]),
    ]),
    el('section', { className: 'intel-section' }, [
      el('h3', { text: 'Figura Histórica' }),
      el('p', { text: country.leader }),
    ]),
    el('section', { className: 'intel-section' }, [
      el('h3', { text: 'Personalidade & Estilo' }),
      el('p', { text: country.personality }),
    ]),
    el('div', { className: 'relation-actions' }, [
      el('button', { className: 'rel-btn rel-ally', text: 'ALIADO', attrs: { type: 'button' }, on: { click: () => onRelation(state.selectedIso, 'ally') } }),
      el('button', { className: 'rel-btn rel-rival', text: 'RIVAL', attrs: { type: 'button' }, on: { click: () => onRelation(state.selectedIso, 'rival') } }),
      el('button', { className: 'rel-btn rel-hostile', text: 'HOSTIL', attrs: { type: 'button' }, on: { click: () => onRelation(state.selectedIso, 'hostile') } }),
    ]),
    el('section', { className: 'intel-section treaty-proposals' }, [
      el('h3', { text: 'Propor Tratado' }),
      el('div', { className: 'treaty-action-grid' }, Object.entries(TREATY_TYPES).map(([type, treaty]) => (
        el('button', {
          className: `treaty-action treaty-${type}`,
          attrs: { type: 'button', title: treaty.desc },
          on: { click: () => onTreaty?.(type, state.selectedIso) },
        }, [
          el('strong', { text: treaty.shortLabel }),
          el('span', { text: `${treaty.cost} moedas · ${treaty.duration} turnos` }),
        ])
      ))),
    ]),
  );
}

export function renderTreaties(state) {
  const root = qs('#treaties-content');
  if (!root) return;
  clear(root);
  const treaties = state.treaties || [];
  const active = treaties.filter(treaty => treaty.status === 'active');
  const expired = treaties.filter(treaty => treaty.status !== 'active').slice(0, 6);
  if (!treaties.length) {
    root.append(el('p', { text: 'Ainda não há tratados. Seleciona um país e propõe acordos na aba Inteligência.' }));
    return;
  }
  if (active.length) {
    root.append(el('section', { className: 'treaty-section' }, [
      el('h3', { text: 'Tratados Ativos' }),
      ...active.map(renderTreatyCard),
    ]));
  }
  if (expired.length) {
    root.append(el('section', { className: 'treaty-section' }, [
      el('h3', { text: 'Arquivo Recente' }),
      ...expired.map(renderTreatyCard),
    ]));
  }
}

export function renderWorldTab(report) {
  const root = qs('#world-content');
  clear(root);
  if (!report) {
    root.append(el('p', { text: 'O relatório mundial aparecerá após o primeiro turno.' }));
    return;
  }
  root.append(
    el('section', { className: 'world-block' }, [
      el('h3', { text: 'Resumo' }),
      el('p', { text: report.summary }),
    ]),
    el('section', { className: 'world-block' }, [
      el('h3', { text: 'Voz do Povo' }),
      el('p', { text: report.population }),
    ]),
  );
  if (report.historicalEvent && report.historicalEvent !== 'null') {
    root.append(el('section', { className: 'world-block' }, [
      el('h3', { text: 'Evento Histórico' }),
      el('p', { text: report.historicalEvent }),
    ]));
  }
  const events = el('section', { className: 'world-block' }, [el('h3', { text: 'Acontecimentos Mundiais' })]);
  for (const item of report.worldEvents || []) {
    events.append(renderWorldEvent(item));
  }
  root.append(events);
}

export function showReport(report, state, income) {
  const modal = qs('#report-modal');
  const body = qs('#report-body');
  clear(body);
  body.append(
    reportSection(`Ano ${state.year} — Resumo`, [
      el('p', { text: report.summary }),
      statBadges(state),
      el('p', { text: `Receita: +${income} moedas · Tesouro atual: ${state.treasury} moedas` }),
    ]),
    reportSection('Voz do Povo', [el('p', { text: report.population })]),
  );
  if (report.historicalEvent && report.historicalEvent !== 'null') {
    body.append(reportSection('Evento Histórico Mundial', [el('p', { text: report.historicalEvent })]));
  }
  const worldEvents = reportSection('Acontecimentos no Mundo', []);
  for (const item of report.worldEvents || []) worldEvents.append(renderWorldEvent(item));
  body.append(worldEvents, reportSection('Reação dos Países Vizinhos', [el('p', { text: report.neighbors })]));
  modal.hidden = false;
}

export function closeReport() {
  qs('#report-modal').hidden = true;
}

export function switchTab(id) {
  qsa('.rpanel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${id}`));
  qsa('.rtab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === id));
}

export function updateSaveStatus(text) {
  qs('#save-status').textContent = text || '';
}

export function relationLabel(relation) {
  if (relation === 'ally') return '🤝 Aliado';
  if (relation === 'hostile') return '⚔ Hostil';
  if (relation === 'rival') return '⚡ Rival';
  return '— Neutro';
}

function reportSection(title, children) {
  return el('section', { className: 'report-section' }, [
    el('div', { className: 'rs-title', text: title }),
    ...children,
  ]);
}

function statBadges(state) {
  const row = el('div', { className: 'badge-row' });
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const diff = (state.stats[key] || 0) - (state.prevStats[key] || 0);
    row.append(el('span', {
      className: `stat-badge ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`,
      text: `${label}: ${diff === 0 ? '0' : formatSigned(diff)}`,
    }));
  }
  return row;
}

function renderWorldEvent(item) {
  return el('article', { className: 'world-event' }, [
    el('span', { text: item.flag || '🏳' }),
    el('div', {}, [
      el('strong', { text: item.nation || 'Desconhecido' }),
      el('p', { text: item.event || '' }),
      item.impact ? el('em', { text: `→ ${item.impact}` }) : null,
    ]),
  ]);
}

function renderTreatyCard(treaty) {
  const status = treaty.status === 'active' ? `até T${treaty.expiresTurn}` : 'expirado';
  return el('article', { className: `treaty-card ${treaty.status}` }, [
    el('div', { className: 'treaty-main' }, [
      el('span', { text: treaty.partnerFlag || '🏳' }),
      el('div', {}, [
        el('strong', { text: treaty.label }),
        el('small', { text: `${treaty.partnerName} · ${status}` }),
      ]),
    ]),
    el('p', { text: treatySummary(treaty) }),
  ]);
}
