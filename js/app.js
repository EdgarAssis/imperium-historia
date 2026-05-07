import { SCENARIOS } from './data.js';
import { requestAI } from './ai.js';
import { clamp } from './utils.js';
import { applyMaintenance, applyDebt, aiTakeDecision, updateEconomicCrisis, updateMonetarySystem } from './simulation.js';
import { runWorldAI } from './simulation.js';
import { applyMonetaryPolicy } from './simulation.js';
import { runAdvancedWorldAI } from './simulation.js';
import { requestAlliance, processDiplomacy } from './simulation.js';
import { resolveWars, declareWar } from './simulation.js';
import { saveGame, loadSavedGame, hasSavedGame } from './save.js';
import { createState, getCountryInfo, makeSerializableState, sanitizeState, setRelation } from './state.js';
import {
  applyInvestment,
  advanceTreaties,
  applyEventChoice,
  buildGameSystem,
  buildInitialEventsPrompt,
  buildReportPrompt,
  calculateIncome,
  clampStats,
  createTreaty,
  fallbackActionResult,
  fallbackDiplomacy,
  fallbackEvents,
  fallbackReport,
  normalizeEvents,
  normalizeReport,
  parseJsonFromText,
  parseStatsUpdate,
  stripStatsUpdate,
} from './simulation.js';
import {
  addTypingMessage,
  appendDiploMessage,
  closeReport,
  hideLoading,
  notify,
  renderDiploHeader,
  renderDiploSelect,
  renderDiploThread,
  renderEvents,
  renderHistory,
  renderIntel,
  renderInvestments,
  renderScenarioCards,
  renderStats,
  renderTopbar,
  renderTreaties,
  renderWorldTab,
  removeTypingMessage,
  showLoading,
  showReport,
  showScreen,
  switchTab,
  updateSaveStatus,
} from './render.js';
import { initMap, resetZoom, resizeMap, updateMapColors, zoomIn, zoomOut } from './map.js';
import { qs, qsa, randomInt, setButtonBusy } from './utils.js';

let selectedScenarioIndex = 0;
let state = createState(SCENARIOS[selectedScenarioIndex]);
let mapReady = false;
let mapBooting = false;

boot();

function boot() {
  bindStaticEvents();
  renderScenarioCards(selectedScenarioIndex, handleScenarioSelect);
  renderInvestments(handleInvestment);
  renderLoadButtons();
  renderAll();
}

function handleScenarioSelect(index) {
  selectedScenarioIndex = index;
  renderScenarioCards(selectedScenarioIndex, handleScenarioSelect);
}

function bindStaticEvents() {
  qs('#btn-rate-up')?.addEventListener('click', () => {
    applyMonetaryPolicy(state, "raise");
    renderAll();
  });

  qs('#btn-rate-down')?.addEventListener('click', () => {
    applyMonetaryPolicy(state, "lower");
    renderAll();
  });
  qs('#btn-play').addEventListener('click', () => showScreen('setup-screen'));
  qs('#btn-back-desc').addEventListener('click', () => showScreen('desc-screen'));
  qs('#btn-start').addEventListener('click', startGame);
  qs('#btn-new-game').addEventListener('click', () => showScreen('setup-screen'));
  qs('#btn-save').addEventListener('click', () => {
    persist('Partida salva manualmente.');
    notify('Partida salva.');
  });
  qs('#btn-load').addEventListener('click', loadGameFromStorage);
  qs('#btn-load-hero').addEventListener('click', loadGameFromStorage);
  qs('#btn-turn').addEventListener('click', nextTurn);
  qs('#action-area').addEventListener('submit', handleAction);
  qs('#diplo-form').addEventListener('submit', handleDiplomacy);
  qs('#btn-close-report').addEventListener('click', closeReport);
  qs('#report-modal').addEventListener('click', event => {
    if (event.target === qs('#report-modal')) closeReport();
  });
  qs('#btn-zoom-in').addEventListener('click', zoomIn);
  qs('#btn-zoom-out').addEventListener('click', zoomOut);
  qs('#btn-zoom-reset').addEventListener('click', resetZoom);
  qsa('.rtab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  qsa('.layer-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.currentLayer = button.dataset.layer;
      qsa('.layer-btn').forEach(item => item.classList.toggle('active', item === button));
      if (mapReady) updateMapColors(state);
      persist('Mapa atualizado.');
    });
  });
  qsa('.suggestion').forEach(button => {
    button.addEventListener('click', () => {
      qs('#action-input').value = button.textContent;
      qs('#action-input').focus();
    });
  });
  qs('#action-input').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') handleAction(event);
  });
  qs('#diplo-input').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') handleDiplomacy(event);
  });
  window.addEventListener('resize', () => {
    if (mapReady) resizeMap(state);
  });
}

async function startGame() {
  const customNation = qs('#custom-nation').value.trim();
  const customYear = Number.parseInt(qs('#custom-year').value, 10);
  state = createState(SCENARIOS[selectedScenarioIndex], {
    nation: customNation,
    year: Number.isFinite(customYear) ? customYear : undefined,
  });
  showScreen('game-screen');
  renderAll();
  await ensureMap();
  showLoading('A despertar o mundo histórico...');
  await generateInitialEvents();
  hideLoading();
  persist('Partida iniciada.');
  notify(`Bem-vindo ao trono de ${state.nation}.`);
}

async function ensureMap() {
  if (mapReady || mapBooting) {
    if (mapReady) {
      resizeMap(state);
      updateMapColors(state);
    }
    return;
  }
  mapBooting = true;
  await initMap(state, selectCountry);
  mapReady = true;
  mapBooting = false;
  resizeMap(state);
  updateMapColors(state);
}

function renderAll() {
  renderTopbar(state);
  renderStats(state);
  renderEvents(state.events, handleEventChoice);
  renderHistory(state.history);
  renderDiploSelect(state, selectCountry);
  renderDiploHeader(state);
  renderDiploThread(state);
  renderIntel(state, handleRelationChange, handleTreatyProposal);
  renderTreaties(state);
  renderWorldTab(state.lastReport);
  renderLoadButtons();
  if (mapReady) updateMapColors(state);
}

async function generateInitialEvents() {
  try {
    const text = await requestAI({
      system: 'Historiador especialista. Responde apenas JSON válido, sem texto adicional.',
      messages: [{ role: 'user', content: buildInitialEventsPrompt(state) }],
      maxTokens: 900,
    });
    state.events = normalizeEvents(parseJsonFromText(text));
  } catch {
    state.events = fallbackEvents();
  }
  renderEvents(state.events, handleEventChoice);
}

async function handleAction(event) {
  event.preventDefault();
  const input = qs('#action-input');
  const action = input.value.trim();
  if (!action) {
    notify('Escreve uma ação, Majestade.');
    return;
  }
  input.value = '';
  setBusy(true);
  showLoading('O reino reage às tuas ordens...');
  let narration;
  let stats;
  state.prevStats = { ...state.stats };

  try {
    const response = await requestAI({
      system: buildGameSystem(state),
      messages: [{ role: 'user', content: `Ação: "${action}"\nNarra as consequências para ${state.nation} no ano ${state.year}.` }],
      maxTokens: 1500,
    });
    narration = stripStatsUpdate(response);
    stats = parseStatsUpdate(response);
    if (!stats) stats = fallbackActionResult(state, action).stats;
  } catch {
    const fallback = fallbackActionResult(state, action);
    narration = fallback.narration;
    stats = fallback.stats;
  }

  state.stats = clampStats(stats);
  state.history.push({ turn: state.turn, year: state.year, action, result: narration });
  state.history = state.history.slice(-80);
  persist('Partida salva após ação.');
  renderAll();
  hideLoading();
  setBusy(false);
  notify('Ação registada nas crónicas.');
}

async function nextTurn() {
  resolveWars(state);
  runWorldAI(state);
  runAdvancedWorldAI(state);
  setBusy(true);
  showLoading('A redigir o relatório do turno...');
  updateMonetarySystem(state);
  applyDebt(state);
  applyMaintenance(state);
  applyDebt(state);
  processDiplomacy(state);

  /* 🔥 SISTEMA MONETÁRIO */
  updateMonetarySystem(state);

  /* 🔥 CRISE ECONÓMICA */
  updateEconomicCrisis(state);

  /* 🤖 IA */
  aiTakeDecision(state);

  state.prevStats = { ...state.stats };

  /* 🔥 AVANÇO DO TEMPO */
  state.turn += 1;
  state.year += randomInt(1, 3);

  /* 🔥 ECONOMIA */
  const income = calculateIncome(state);
  state.treasury += income;

  /* 🔥 CUSTOS */
  

  /* 🔥 IA */

  runWorldAI(state);

  /* 🔥 TRATADOS */
  const expiredTreaties = advanceTreaties(state);

  let report;
  try {
    const text = await requestAI({
      system: 'Historiador e game master. Responde apenas JSON válido, sem texto adicional.',
      messages: [{ role: 'user', content: buildReportPrompt(state) }],
      maxTokens: 1800,
    });
    report = normalizeReport(parseJsonFromText(text), state);
  } catch {
    report = fallbackReport(state);
  }

  /* 🔥 APLICAR MUDANÇAS */
  // 🔥 aplicar mudanças SEM substituir stats

for (const stat in report.statsChange) {
  state.stats[stat] = clamp(
    state.stats[stat] + report.statsChange[stat],
    0,
    100
  );
}
  state.lastReport = report;

  /* 🔥 LOG DE TRATADOS */
  for (const treaty of expiredTreaties) {
    state.history.push({
      turn: state.turn,
      year: state.year,
      action: `Tratado expirado: ${treaty.label}`,
      result: `O acordo com ${treaty.partnerName} terminou.`,
    });
  }

  /* 🔥 ALERTA DE DÍVIDA */
  if (state.debt > 0) {
    state.history.push({
      turn: state.turn,
      year: state.year,
      action: "Dívida crescente",
      result: `A dívida nacional atingiu ${state.debt} moedas e cresce com juros.`,
    });

  /* 🔥 RESET DO IMPACTO DE INVESTIMENTO */
  state.lastInvestmentCost = 0;
  }

  await generateInitialEvents();

  persist('Partida salva após turno.');
  renderAll();
  showReport(report, state, income);

  hideLoading();
  setBusy(false);

}

function handleInvestment(stat) {
  const result = applyInvestment(state, stat);
  if (!result.ok) {
    notify(result.message);
    return;
  }
  state.history.push({ turn: state.turn, year: state.year, action: result.action, result: result.result });
  persist('Partida salva após investimento.');
  renderAll();
  notify(result.result);
}

function handleEventChoice(eventId, choiceId) {
  const result = applyEventChoice(state, choiceId);
  if (!result.ok) {
    notify(result.message);
    return;
  }
  state.history.push({ turn: state.turn, year: state.year, action: result.action, result: result.result });
  persist('Partida salva após crise.');
  renderAll();
  notify('Decisão aplicada à crise.');
}

async function handleDiplomacy(event) {
  event.preventDefault();
  const select = qs('#diplo-select');
  const input = qs('#diplo-input');
  const iso = select.value || state.selectedIso;
  const message = input.value.trim();

  if (!iso) {
    notify('Seleciona um país.');
    return;
  }

  if (!message) {
    notify('Escreve uma mensagem.');
    return;
  }

  /* 🔥 NOVO: DETETAR GUERRA */
  const msgLower = message.toLowerCase();

  if (
    msgLower.includes("guerra") ||
    msgLower.includes("atacar") ||
    msgLower.includes("invadir")
  ) {
    declareWar(state, state.nation, iso);

    state.history.push({
      turn: state.turn,
      year: state.year,
      action: "Guerra",
      result: `Declaraste guerra a ${iso}`
    });

    notify(`⚔️ Guerra iniciada contra ${iso}`);
  }

  /* 🤝 PEDIDO DE ALIANÇA */

if (
  msgLower.includes("aliança") ||
  msgLower.includes("aliado")
) {
  requestAlliance(state, iso);

  notify(`🤝 Pedido de aliança enviado para ${iso}`);
}

  selectCountry(iso, { quiet: true, tab: 'diplo' });
  const country = getCountryInfo(iso);
  const thread = state.diploHistory[country.name] || [];
  thread.push({ role: 'user', content: message });
  state.diploHistory[country.name] = thread;

  input.value = '';
  renderDiploThread(state);

  const typingId = addTypingMessage();
  setButtonBusy(qs('#btn-diplo'), true);

  let response;
  try {
    response = await requestAI({
      system: `És o governante de ${country.name} (${country.flag}) no ano ${state.year}.
Personalidade histórica: ${country.personality}
O teu interlocutor é o governante de ${state.nation} (${state.flag}).
Responde em português europeu culto, na primeira pessoa, como este líder ou chancelaria.
Usa linguagem da época e interesses nacionais. Máximo 3 parágrafos.`,
      messages: thread.slice(-8),
      maxTokens: 1000,
    });
  } catch {
    response = fallbackDiplomacy(state, country.name, message);
  }

  removeTypingMessage(typingId);
  thread.push({ role: 'assistant', content: response });
  state.diploHistory[country.name] = thread.slice(-20);

  appendDiploMessage(response, 'ai', country.name);

  setButtonBusy(qs('#btn-diplo'), false);

  persist('Partida salva após diplomacia.');
}

function selectCountry(iso, options = {}) {
  if (!iso) return;
  state.selectedIso = iso;
  state.diploTarget = getCountryInfo(iso).name;
  renderDiploSelect(state, selectCountry);
  renderDiploHeader(state);
  renderDiploThread(state);
  renderIntel(state, handleRelationChange, handleTreatyProposal);
  if (mapReady) updateMapColors(state);
  if (options.tab) switchTab(options.tab);
  else switchTab('intel');
  if (!options.quiet) notify(`Contactando: ${getCountryInfo(iso).flag} ${getCountryInfo(iso).name}`);
}

function handleRelationChange(iso, relation) {
  setRelation(state, iso, relation);
  renderIntel(state, handleRelationChange, handleTreatyProposal);
  if (mapReady) updateMapColors(state);
  persist('Relação diplomática atualizada.');
  notify(`Relação com ${getCountryInfo(iso).name}: ${relation}`);
}

function handleTreatyProposal(type, iso = state.selectedIso) {
  const country = getCountryInfo(iso);
  const result = createTreaty(state, iso, country, type);
  if (!result.ok) {
    notify(result.message);
    return;
  }
  state.history.push({ turn: state.turn, year: state.year, action: result.action, result: result.result });
  persist('Partida salva após tratado.');
  renderAll();
  switchTab('treaties');
  notify(`${result.treaty.label} assinado com ${country.name}.`);
}

function persist(statusText) {
  try {
    saveGame(makeSerializableState(state));
    updateSaveStatus(statusText);
    renderLoadButtons();
  } catch (error) {
    console.warn('Save failed:', error);
    updateSaveStatus('Não foi possível salvar esta partida.');
  }
}

async function loadGameFromStorage() {
  try {
    const payload = loadSavedGame();
    if (!payload) {
      notify('Nenhuma partida salva encontrada.');
      return;
    }
    state = sanitizeState(payload.state);
    state.events = normalizeEvents(state.events);
    showScreen('game-screen');
    renderAll();
    await ensureMap();
    updateSaveStatus(`Partida carregada: ${new Date(payload.savedAt).toLocaleString('pt-PT')}`);
    notify('Partida carregada.');
  } catch (error) {
    console.warn('Load failed:', error);
    notify('Não foi possível carregar a partida salva.');
  }
}

function renderLoadButtons() {
  const available = hasSavedGame();
  qs('#btn-load').disabled = !available;
  qs('#btn-load-hero').disabled = !available;
}

function setBusy(busy) {
  setButtonBusy(qs('#btn-action'), busy);
  setButtonBusy(qs('#btn-turn'), busy);
  setButtonBusy(qs('#btn-diplo'), busy);
}

  /* 🔥 export function advanceTreaties(state) {
  if (!state.treaties || state.treaties.length === 0) return [];

  const expired = [];

  state.treaties = state.treaties.filter(treaty => {
    // se não tiver duração, mantém
    if (!treaty.expiresTurn) return true;

    // expirou
    if (state.turn >= treaty.expiresTurn) {
      treaty.status = "expired";

      expired.push({
        name: treaty.type || "Tratado",
        target: treaty.target || "Desconhecido"
      });

      return false; // remove da lista ativa
    }

    // ainda ativo → aplicar efeitos
    if (treaty.effects) {
      for (const stat in treaty.effects) {
        state.stats[stat] = clamp(
          state.stats[stat] + treaty.effects[stat]
        );
      }
    }

    // renda
    if (treaty.income) {
      state.treasury += treaty.income;
    }

    return true;
  });

  return expired;
}*/
