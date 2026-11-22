// src/lib/state/store.ts
// Store zustand central do jogo. Estado é imutável — ações devolvem novos estados.
// Fase 3: motor determinístico. Fase 4: IA narradora via /api/turn.
// Fase 1 (tempo real): relógio global dia a dia com pausa/velocidade;
// o motor mensal corre quando o relógio rola o mês. endTurn/advanceDate
// mantêm-se por compatibilidade (avanço manual e testes).

import { create } from "zustand";
import {
  type BudgetAllocation,
  type GameConfig,
  type GameEvent,
  type GameState,
  type GameSpeed,
  type RealismLevel,
} from "@/types";
import { scenarioSchema, type Scenario } from "@/types/scenario";
import { getScenarioById } from "@/data/scenarios";
import { SAVE_VERSION } from "./save";
import { addMonths, addYears } from "./date";
import { applyChanges, declareWar, proposeTreaty, resolveWarTurn, signPeace, BUDGET_DEFAULT, applyEventChoice, triggerCivilWar, annexCountry, runMonthlyPipeline, conquerBySurrender, conquerByPopularPressure, conquerByDiplomacy, proposeBlocVote, joinBloc, leaveBloc, supportRebels, cancelProxy, startResearch, executeSpyOperation, defaultAdvisors, emptyResearchState, rollInitialMissions, ACHIEVEMENT_LIBRARY } from "@/lib/engine";
import { tickDay as tickDayPure } from "@/lib/engine/clock";
import { buildContext } from "@/lib/ai/context";
import type { AiResponse } from "@/lib/ai/response-schema";
import type { DiplomaticProposalType, WarObjective, TaxPolicy, SpyOperationType } from "@/types";
import type { SurrenderTerms } from "@/lib/engine/conquest";

/** Estado inicial do relógio (Fase 1): pausado, velocidade 1x, auto-pausa ligada. */
const TIME_STATE_DEFAULT = { pausado: true, velocidade: 1 as GameSpeed, autoPauseEventos: true };

/** Inputs para criar um jogo novo. */
export interface NewGameInput {
  scenarioId: string;
  playerCountryId: string;
  realism: RealismLevel;
  /** Semente opcional; se omitida, gerada com Date.now(). */
  seed?: number;
}

/** Resultado de submissão de ordens. */
export interface SubmitOrdersResult {
  ok: boolean;
  error?: string;
}

export interface GameStore {
  state: GameState | null;
  /** Erro de última operação (import inválido, etc). Limpo pelo UI. */
  erro: string | null;
  /** True quando a IA está a processar ordens. */
  submitting: boolean;
  /** Erro específico da última submissão de ordens (None se OK). */
  submitError: string | null;

  // Ações
  newGame: (input: NewGameInput) => void;
  setPlayerCountry: (countryId: string) => void;
  /** Avança 1 turno pelo motor determinístico (economia, estabilidade, etc.). */
  endTurn: () => void;
  /** Avança a data sem aplicar o motor — usado pelo modo de teste rápido. */
  advanceDate: () => void;
  setBudget: (budget: BudgetAllocation) => void;
  addEvent: (event: Omit<GameEvent, "id">) => void;

  // --- Fase 1: relógio global ---
  /** Avança 1 dia de jogo; se o mês rolou, corre o motor mensal. Chamado pelo loop. */
  tickDay: () => void;
  /** Alterna pausa/continuação do relógio. */
  togglePause: () => void;
  /** Define a velocidade do relógio (0.5x a 10x). */
  setSpeed: (velocidade: GameSpeed) => void;
  /** Liga/desliga a pausa automática em eventos importantes. */
  setAutoPauseEventos: (enabled: boolean) => void;

  /**
   * Envia ordens em texto livre para /api/turn. Aplica as mudanças devolvidas
   * pela IA (validadas pelo motor) e adiciona narrativa + noticias ao diário.
   * NÃO avança o turno — para isso, chama endTurn separadamente.
   */
  submitOrders: (orders: string) => Promise<SubmitOrdersResult>;

  /**
   * Propõe um tratado diplomático do país do jogador para outro país.
   * Decisão calculada pelo motor (relação + poder + interesse).
   */
  proposeTreaty: (toCountryId: string, tipo: DiplomaticProposalType) => void;

  /**
   * Declara guerra a um país. Cria frentes pelas províncias disputadas.
   */
  declareWar: (toCountryId: string, provinciasDisputa: string[], objetivo: WarObjective) => void;

  /**
   * Assina paz numa guerra ativa.
   */
  signPeace: (warId: string, vencedorId: string, options: {
    cederProvincias?: string[];
    indemnizacoes?: number;
    retirada?: boolean;
  }) => void;

  /**
   * Resolve um evento pendente: aplica efeitos da escolha ao país do jogador
   * e regista no diário. Trata nota especial "GUERRA_CIVIL_TRIGGER".
   */
  resolveEvent: (eventId: string, choiceId: string) => void;

  /**
   * Anexa um país derrotado (perdeu todas as províncias) ao país do jogador.
   * O jogador absorve parte do PIB/tesouro/exército do país anexado.
   */
  annexCountry: (perdedorId: string) => void;

  // --- Fase 3: outras formas de conquista ---
  /**
   * Força a rendição de `perdedorId`: cede províncias + indemnização sem guerra.
   * Pré-condições verificadas pelo motor (país fraco: estab<30 OU exército<50%).
   */
  conquerBySurrender: (perdedorId: string, terms: SurrenderTerms) => void;

  /**
   * Financia revolta popular numa província desleal do `alvoId` para que se
   * junte ao país do jogador. Pré-condições: lealdade<25, cultura!=alvo,
   * PIB do agitador > 5× o da província, tesouro suficiente.
   */
  conquerByPopularPressure: (alvoId: string, provinceId: string) => void;

  /**
   * Compra diplomática: o jogador paga `preco` do seu tesouro para anexar
   * `provinceId` de `vendedorId` (em crise económica). Pré-condições: tesouro
   * do vendedor <0 OU estab<30; comprador tem tesouro >= preco.
   */
  conquerByDiplomacy: (vendedorId: string, provinceId: string, preco: number) => void;

  // --- Fase 5: política fiscal ---
  /** Define a política fiscal do jogador (impostos). */
  setTaxPolicy: (policy: TaxPolicy) => void;

  // --- Fase 6: blocos políticos ---
  /** Propõe uma votação num bloco (o jogador tem de ser membro). */
  proposeBlocVote: (blocoId: string, proposal: { tipo: "admissao" | "sancionar" | "resolucao"; proposta: string; alvos: string[] }) => void;
  /** Junta o país do jogador a um bloco. */
  joinBloc: (blocoId: string) => void;
  /** Sai de um bloco (custo: estabilidade -5). */
  leaveBloc: (blocoId: string) => void;
  /** Bloco A3 — O jogador vota manualmente numa votação pendente. */
  voteInBloc: (voteId: string, voto: "sim" | "nao" | "abstencao") => void;

  // --- Fase 8: guerra por procuração ---
  /** O país do jogador apadrinha rebeldes num país-alvo (cria proxy war). */
  supportRebels: (alvoId: string) => void;
  /** Bloco A4 — Cancela o apoio a um proxy activo (o proxy perde sustento). */
  cancelProxy: (proxyId: string) => void;

  // --- Fase 10: pesquisa + espionagem ---
  /** Inicia a pesquisa de uma tecnologia (paga custo do tesouro). */
  startResearch: (techId: string) => void;
  /** Executa uma operação de espionagem contra um país-alvo. */
  executeSpyOperation: (alvoId: string, tipo: SpyOperationType) => void;

  // Ações de carregar/guardar (usadas pelos ecrãs)
  loadState: (state: GameState) => void;
  clear: () => void;
  setErro: (msg: string | null) => void;
}

/**
 * Cria um GameState novo a partir de um cenário validado.
 * Função pura — não toca em zustand nem em localStorage. Facilmente testável.
 */
export function createInitialState(
  scenario: Scenario,
  playerCountryId: string,
  realism: RealismLevel,
  seed: number,
): GameState {
  // Constrói os mapas de países e províncias.
  const paises: Record<string, GameState["paises"][string]> = {};
  for (const c of scenario.paises) {
    paises[c.id] = { ...c, donoJogador: c.id === playerCountryId };
  }
  if (!paises[playerCountryId]) {
    throw new Error(`País do jogador não existe no cenário: ${playerCountryId}`);
  }

  const provincias: Record<string, GameState["provincias"][string]> = {};
  for (const p of scenario.provincias) {
    provincias[p.id] = { ...p };
  }

  const config: GameConfig = {
    scenarioId: scenario.id,
    resolution: scenario.resolution,
    realism,
    seed,
    version: SAVE_VERSION,
  };

  return {
    config,
    dataAtual: scenario.dataInicio,
    turno: 0,
    timeState: { ...TIME_STATE_DEFAULT },
    paises,
    provincias,
    relacoes: scenario.relacoes.map((r) => ({ ...r })),
    tratados: scenario.tratados.map((t) => ({ ...t })),
    guerras: scenario.guerras.map((g) => ({ ...g })),
    eventos: [],
    playerCountryId,
    playerBudget: { ...BUDGET_DEFAULT },
    colapsoTurnos: {},
    propostas: [],
    pendingEvent: null,
    playerHistory: [],
    turnosTop3: 0,
    vitoriaDeclarada: false,
    // Fase 5/6: listas vazias iniciais.
    multinacionais: [],
    votacoes: [],
    // Fase 8: histórico de fluxos de refugiados.
    refugiadosFluxos: [],
    // Fase 9: missões iniciais + achievements (todos bloqueados) + ranking histórico.
    missoes: rollInitialMissions({
      config,
      dataAtual: scenario.dataInicio,
      turno: 0,
      timeState: { ...TIME_STATE_DEFAULT },
      paises,
      provincias,
      relacoes: scenario.relacoes.map((r) => ({ ...r })),
      tratados: scenario.tratados.map((t) => ({ ...t })),
      guerras: scenario.guerras.map((g) => ({ ...g })),
      eventos: [],
      playerCountryId,
      playerBudget: { ...BUDGET_DEFAULT },
      colapsoTurnos: {},
      propostas: [],
      pendingEvent: null,
      playerHistory: [],
      turnosTop3: 0,
      vitoriaDeclarada: false,
      multinacionais: [],
      votacoes: [],
      refugiadosFluxos: [],
      missoes: [],
      achievements: ACHIEVEMENT_LIBRARY.map((a) => ({ ...a })),
      rankingsHistorico: [],
      conselheiros: defaultAdvisors(),
      pesquisa: emptyResearchState(),
      eleicoes: [],
      noticias: [],
    }),
    achievements: ACHIEVEMENT_LIBRARY.map((a) => ({ ...a })),
    rankingsHistorico: [],
    // Fase 10: conselheiros + pesquisa + eleições + notícias.
    conselheiros: defaultAdvisors(),
    pesquisa: emptyResearchState(),
    eleicoes: [],
    noticias: [],
  };
}

/**
 * Migra um GameState carregado de um save antigo para a versão atual.
 * Preenche campos novos (Fase 3/5/6) com defaults se em falta.
 */
export function migrateState(state: GameState): GameState {
  return {
    ...state,
    // Fase 1 (tempo real): relógio. Saves antigos começam pausados a 1x.
    timeState: state.timeState ?? { ...TIME_STATE_DEFAULT },
    playerBudget: state.playerBudget ?? { ...BUDGET_DEFAULT },
    colapsoTurnos: state.colapsoTurnos ?? {},
    propostas: state.propostas ?? [],
    pendingEvent: state.pendingEvent ?? null,
    playerHistory: state.playerHistory ?? [],
    turnosTop3: state.turnosTop3 ?? 0,
    vitoriaDeclarada: state.vitoriaDeclarada ?? false,
    // Fase 5/6: listas vazias se em falta.
    multinacionais: state.multinacionais ?? [],
    votacoes: state.votacoes ?? [],
    // Fase 8: histórico de refugiados.
    refugiadosFluxos: state.refugiadosFluxos ?? [],
    // Fase 9: missões, achievements, ranking histórico.
    missoes: state.missoes ?? [],
    achievements: state.achievements ?? ACHIEVEMENT_LIBRARY.map((a) => ({ ...a })),
    rankingsHistorico: state.rankingsHistorico ?? [],
    // Fase 10: conselheiros, pesquisa, eleições, notícias.
    conselheiros: state.conselheiros ?? defaultAdvisors(),
    pesquisa: state.pesquisa ?? emptyResearchState(),
    eleicoes: state.eleicoes ?? [],
    noticias: state.noticias ?? [],
    guerras: state.guerras.map((g) => ({
      ...g,
      frentes: g.frentes ?? g.provinciasDisputa.map((pid) => ({
        provinceId: pid,
        progresso: 0,
        ultimoDelta: 0,
      })),
      objetivo: g.objetivo ?? "conquistar",
      indemnizacoes: g.indemnizacoes ?? 0,
      turnoFim: g.turnoFim ?? null,
    })),
  };
}

/** Cria um ID estável para um evento (turno + índice dentro do turno). */
function makeEventId(turno: number, index: number): string {
  return `ev-${turno.toString().padStart(4, "0")}-${index.toString().padStart(3, "0")}`;
}

/**
 * Helper interno do store: corre o «tick mensal» completo (guerras + motor
 * mensal + eventos de guerra no diário). Partilhado por endTurn (avanço
 * manual) e tickDay (relógio automático).
 * Devolve o novo estado e as flags de pausa automática.
 */
function processMonthlyTick(state: GameState): {
  state: GameState;
  houveGolpe: boolean;
  houveEvento: boolean;
  houveVitoria: boolean;
  houveRevoltaOcupacao: boolean;
} {
  // 1. Resolve guerras ativas (frentes avançam, províncias mudam de dono).
  const warResolved = resolveWarTurn(state);
  // 2. Corre o motor mensal (economia, estabilidade, golpes, vitória, eventos).
  const pipe = runMonthlyPipeline(warResolved.state, warResolved.state.dataAtual);
  // 3. Adiciona eventos de guerra ao diário (resumo das frentes).
  const next = pipe.state;
  const eventos: GameEvent[] = [...next.eventos];
  for (const ev of warResolved.eventos) {
    const provName = next.provincias[ev.provinceId]?.nome ?? ev.provinceId;
    eventos.push({
      id: `ev-war-${next.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
      turno: next.turno,
      data: next.dataAtual,
      tipo: "guerra",
      titulo: ev.conquered ? `Conquista de ${provName}` : `Frente de ${provName}`,
      texto: ev.conquered
        ? `A província ${provName} foi conquistada pelo agressor.`
        : `Frente de ${provName}: progresso ${ev.delta >= 0 ? "+" : ""}${ev.delta} pontos.`,
      efeitos: [`${ev.provinceId}: ${ev.delta >= 0 ? "+" : ""}${ev.delta} progresso`],
    });
  }
  return {
    state: { ...next, eventos },
    houveGolpe: pipe.houveGolpe,
    houveEvento: pipe.houveEvento,
    houveVitoria: pipe.houveVitoria,
    houveRevoltaOcupacao: pipe.houveRevoltaOcupacao,
  };
}

/** Hook principal do jogo. */
export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  erro: null,
  submitting: false,
  submitError: null,

  newGame: (input) => {
    const scenario = getScenarioById(input.scenarioId);
    const parsed = scenarioSchema.parse(scenario);
    const seed = input.seed ?? Number(Date.now() % 2147483647);
    try {
      const state = createInitialState(
        parsed,
        input.playerCountryId,
        input.realism,
        seed,
      );
      set({ state, erro: null, submitting: false, submitError: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao criar jogo" });
    }
  },

  setPlayerCountry: (countryId) => {
    const current = get().state;
    if (!current) return;
    if (!current.paises[countryId]) {
      set({ erro: `País inválido: ${countryId}` });
      return;
    }
    const paises: GameState["paises"] = {};
    for (const id of Object.keys(current.paises)) {
      paises[id] = {
        ...current.paises[id],
        donoJogador: id === countryId,
      };
    }
    set({
      state: { ...current, paises, playerCountryId: countryId },
      erro: null,
    });
  },

  endTurn: () => {
    const current = get().state;
    if (!current) return;
    try {
      // Modo manual (compatibilidade/testes): avança 1 mês e corre o tick mensal.
      const novaData =
        current.config.resolution === "mensal"
          ? addMonths(current.dataAtual, 1)
          : addYears(current.dataAtual, 1);
      const resultado = processMonthlyTick({ ...current, dataAtual: novaData });
      set({ state: resultado.state, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao avançar turno" });
    }
  },

  tickDay: () => {
    const current = get().state;
    if (!current) return;
    // Relógio parado não avança.
    if (current.timeState.pausado) return;
    try {
      const tick = tickDayPure(current);
      let next = tick.state;
      if (tick.monthRolled) {
        // O mês rolou (dia 01): corre o motor mensal completo.
        const resultado = processMonthlyTick(next);
        next = resultado.state;
        // Pausa automática em eventos importantes (configurável).
        if (
          next.timeState.autoPauseEventos &&
          (resultado.houveGolpe || resultado.houveEvento || resultado.houveVitoria || resultado.houveRevoltaOcupacao)
        ) {
          next = {
            ...next,
            timeState: { ...next.timeState, pausado: true },
          };
        }
      }
      set({ state: next, erro: null });
    } catch (err) {
      // Um tick falho não deve rebentar o jogo: pausa e regista o erro.
      set({
        erro: err instanceof Error ? err.message : "Erro no relógio do jogo",
        state: current.timeState ? { ...current, timeState: { ...current.timeState, pausado: true } } : current,
      });
    }
  },

  togglePause: () => {
    const current = get().state;
    if (!current) return;
    set({
      state: {
        ...current,
        timeState: { ...current.timeState, pausado: !current.timeState.pausado },
      },
    });
  },

  setSpeed: (velocidade) => {
    const current = get().state;
    if (!current) return;
    set({
      state: {
        ...current,
        timeState: { ...current.timeState, velocidade, pausado: false },
      },
    });
  },

  setAutoPauseEventos: (enabled) => {
    const current = get().state;
    if (!current) return;
    set({
      state: {
        ...current,
        timeState: { ...current.timeState, autoPauseEventos: enabled },
      },
    });
  },

  advanceDate: () => {
    const current = get().state;
    if (!current) return;
    const { resolution, scenarioId, realism, seed, version } = current.config;
    const novaData =
      resolution === "mensal"
        ? addMonths(current.dataAtual, 1)
        : addYears(current.dataAtual, 1);
    set({
      state: {
        ...current,
        dataAtual: novaData,
        turno: current.turno + 1,
        config: { scenarioId, resolution, realism, seed, version },
      },
    });
  },

  setBudget: (budget) => {
    const current = get().state;
    if (!current) return;
    set({
      state: { ...current, playerBudget: { ...budget } },
      erro: null,
    });
  },

  addEvent: (event) => {
    const current = get().state;
    if (!current) return;
    const index = current.eventos.length;
    const newEvent: GameEvent = {
      ...event,
      id: makeEventId(current.turno, index),
    };
    set({
      state: {
        ...current,
        eventos: [...current.eventos, newEvent],
      },
    });
  },

  submitOrders: async (orders) => {
    const current = get().state;
    if (!current) {
      return { ok: false, error: "Sem estado de jogo." };
    }
    if (get().submitting) {
      return { ok: false, error: "Já existe uma submissão em curso." };
    }
    set({ submitting: true, submitError: null });
    try {
      // Constrói o contexto a partir do estado atual (resumo para a IA).
      const contexto = buildContext(current);
      const trimmedOrders = orders.slice(0, 500);

      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto,
          ordens: trimmedOrders,
          playerCountryId: current.playerCountryId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        const msg = body?.error ?? `Erro ${response.status} ao contactar a IA.`;
        set({ submitting: false, submitError: msg });
        return { ok: false, error: msg };
      }

      const data = (await response.json()) as AiResponse & { provider?: string };
      // Aplica as mudanças via motor (validação em applyChanges).
      const result = applyChanges(current, data.mudancas, {
        dataEvento: current.dataAtual,
        turno: current.turno,
      });

      // Adiciona a narrativa e as notícias como eventos no diário.
      const eventos: GameEvent[] = [...result.state.eventos];
      eventos.push({
        id: `ev-narrativa-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "evento",
        titulo: "Narrador",
        texto: data.narrativa,
        efeitos: result.applied.length > 0
          ? [...result.applied, ...(result.rejected.length > 0 ? [`${result.rejected.length} mudança(s) rejeitada(s)`] : [])]
          : result.rejected.length > 0 ? [`${result.rejected.length} mudança(s) rejeitada(s)`] : [],
      });
      for (const noticia of data.noticias) {
        eventos.push({
          id: `ev-noticia-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
          turno: current.turno,
          data: current.dataAtual,
          tipo: noticia.tipo as GameEvent["tipo"],
          titulo: noticia.titulo,
          texto: noticia.texto,
          efeitos: [],
        });
      }

      // Estado actualizado: applyChanges + novos eventos.
      const newState: GameState = {
        ...result.state,
        eventos,
      };

      set({ state: newState, submitting: false, submitError: null });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      set({ submitting: false, submitError: msg });
      return { ok: false, error: msg };
    }
  },

  annexCountry: (perdedorId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = annexCountry(current, current.playerCountryId, perdedorId, {
        motivo: "ordem directa de anexação",
      });
      if (!result.anexado) {
        set({ erro: result.mensagem });
        return;
      }
      // A função annexCountry já adiciona o evento ao diário.
      set({ state: result.state, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao anexar país" });
    }
  },

  // --- Fase 3: outras formas de conquista ---
  conquerBySurrender: (perdedorId, terms) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = conquerBySurrender(current, current.playerCountryId, perdedorId, terms);
      if (!result.resultado) {
        set({ erro: result.mensagem });
        return;
      }
      // Pausa automática: rendição é um evento importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao forçar rendição" });
    }
  },

  conquerByPopularPressure: (alvoId, provinceId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = conquerByPopularPressure(current, current.playerCountryId, alvoId, provinceId);
      if (!result.resultado) {
        set({ erro: result.mensagem });
        return;
      }
      // Pausa automática: revolta é um evento político importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro a orquestrar revolta popular" });
    }
  },

  conquerByDiplomacy: (vendedorId, provinceId, preco) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = conquerByDiplomacy(current, current.playerCountryId, vendedorId, provinceId, preco);
      if (!result.resultado) {
        set({ erro: result.mensagem });
        return;
      }
      // Pausa automática: compra diplomática é um evento diplomático importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro na compra diplomática" });
    }
  },

  // --- Fase 5: política fiscal ---
  setTaxPolicy: (policy) => {
    const current = get().state;
    if (!current) return;
    // Validação: cada taxa no seu intervalo.
    const clamped: TaxPolicy = {
      taxa: clampIntLocal(policy.taxa, 0, 50),
      taxaCapital: clampIntLocal(policy.taxaCapital, 0, 50),
      taxaMercadorias: clampIntLocal(policy.taxaMercadorias, 0, 30),
    };
    set({ state: { ...current, playerTaxPolicy: clamped }, erro: null });
  },

  // --- Fase 6: blocos políticos ---
  proposeBlocVote: (blocoId, proposal) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    const player = current.paises[current.playerCountryId];
    if (!player.blocos.includes(blocoId)) {
      set({ erro: `Não és membro do bloco ${blocoId}.` });
      return;
    }
    try {
      const result = proposeBlocVote(current, blocoId, proposal);
      if (!result.vote) {
        set({ erro: "Não foi possível criar a votação (bloco vazio?)." });
        return;
      }
      const eventos = [...result.state.eventos];
      eventos.push({
        id: `ev-propvote-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "diplomacia",
        titulo: `Votação aberta em ${blocoId}`,
        texto: `Proposta: ${proposal.proposta}. Tipo: ${proposal.tipo}. Alvos: ${proposal.alvos.join(", ") || "—"}. Os membros votam nos próximos turnos.`,
        efeitos: [
          `Bloco: ${blocoId}`,
          `Tipo: ${proposal.tipo}`,
          `Proposta: ${proposal.proposta}`,
        ],
      });
      // Pausa automática: votação em bloco é evento diplomático importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, eventos, timeState: { ...result.state.timeState, pausado: true } }
        : { ...result.state, eventos };
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao propor votação" });
    }
  },

  joinBloc: (blocoId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const newState = joinBloc(current, current.playerCountryId, blocoId);
      const eventos = [...newState.eventos];
      eventos.push({
        id: `ev-joinbloc-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "diplomacia",
        titulo: `${current.paises[current.playerCountryId].nome} juntou-se a ${blocoId}`,
        texto: `O país do jogador tornou-se membro do bloco ${blocoId}. Os outros membros melhoraram a relação (+5).`,
        efeitos: [`Bloco: ${blocoId}`, `Relação com membros: +5`],
      });
      set({ state: { ...newState, eventos }, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao juntar-se ao bloco" });
    }
  },

  leaveBloc: (blocoId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const newState = leaveBloc(current, current.playerCountryId, blocoId);
      const eventos = [...newState.eventos];
      eventos.push({
        id: `ev-leavebloc-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "diplomacia",
        titulo: `${current.paises[current.playerCountryId].nome} saiu de ${blocoId}`,
        texto: `O país do jogador abandonou o bloco ${blocoId}. Custo político: estabilidade -5. Antigos membros deterioraram a relação (-10).`,
        efeitos: [`Bloco: ${blocoId}`, `Estabilidade: -5`, `Relação com antigos membros: -10`],
      });
      // Pausa automática: saída de bloco é evento importante.
      const finalState = current.timeState.autoPauseEventos
        ? { ...newState, eventos, timeState: { ...newState.timeState, pausado: true } }
        : { ...newState, eventos };
      set({ state: finalState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao sair do bloco" });
    }
  },

  // Bloco A3 — Voto manual do jogador em votação de bloco.
  voteInBloc: (voteId, voto) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    const vote = current.votacoes.find((v) => v.id === voteId);
    if (!vote) {
      set({ erro: "Votação não encontrada." });
      return;
    }
    if (vote.fechada) {
      set({ erro: "Votação já fechada." });
      return;
    }
    // Regista o voto do jogador.
    const votacoes = current.votacoes.map((v) =>
      v.id === voteId
        ? { ...v, votos: { ...v.votos, [current.playerCountryId!]: voto } }
        : v
    );
    set({ state: { ...current, votacoes }, erro: null });
  },

  // --- Fase 8: guerra por procuração ---
  supportRebels: (alvoId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = supportRebels(current, current.playerCountryId, alvoId);
      if (!result.criado) {
        set({ erro: result.mensagem });
        return;
      }
      // Pausa automática: proxy war é evento importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao apadrinhar rebeldes" });
    }
  },

  // Bloco A4 — Cancelar apoio a proxy.
  cancelProxy: (proxyId) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = cancelProxy(current, current.playerCountryId, proxyId);
      if (!result.cancelado) {
        set({ erro: result.mensagem });
        return;
      }
      // Pausa automática: cancelamento é evento importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao cancelar proxy" });
    }
  },

  // --- Fase 10: pesquisa + espionagem ---
  startResearch: (techId) => {
    const current = get().state;
    if (!current) return;
    try {
      const result = startResearch(current, techId);
      if (!result.ok) {
        set({ erro: result.mensagem });
        return;
      }
      // Adiciona evento ao diário.
      const eventos = [...result.state.eventos];
      eventos.push({
        id: `ev-research-start-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "economia",
        titulo: "Pesquisa iniciada",
        texto: result.mensagem,
        efeitos: [`Tech: ${techId}`],
      });
      set({ state: { ...result.state, eventos }, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao iniciar pesquisa" });
    }
  },

  executeSpyOperation: (alvoId, tipo) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = executeSpyOperation(current, alvoId, tipo);
      // Adiciona evento ao diário (sempre, sucesso ou falha).
      const eventos = [...result.state.eventos];
      eventos.push({
        id: `ev-spy-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "politica",
        titulo: result.resultado.sucesso ? "Operação secreta bem-sucedida" : "Operação secreta falhou",
        texto: result.resultado.mensagem,
        efeitos: result.resultado.efeitos,
      });
      // Pausa automática: espionagem é evento importante.
      const newState = current.timeState.autoPauseEventos
        ? { ...result.state, eventos, timeState: { ...result.state.timeState, pausado: true } }
        : { ...result.state, eventos };
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro na operação de espionagem" });
    }
  },

  loadState: (state) => {
    try {
      const migrated = migrateState(state);
      set({ state: migrated, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao carregar estado" });
    }
  },
  clear: () => set({ state: null, erro: null, submitting: false, submitError: null }),
  setErro: (msg) => set({ erro: msg }),

  proposeTreaty: (toCountryId, tipo) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    const de = current.paises[current.playerCountryId];
    const para = current.paises[toCountryId];
    if (!de || !para) {
      set({ erro: `País inválido: ${toCountryId}` });
      return;
    }
    try {
      const result = proposeTreaty(current, de, para, tipo);
      const eventos: GameEvent[] = [...result.state.eventos];
      eventos.push({
        id: `ev-prop-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "diplomacia",
        titulo: `Proposta de ${translateProposalType(tipo)} a ${para.nome}`,
        texto: result.proposal.aceite
          ? `Aceite: ${result.proposal.motivo}`
          : `Recusada: ${result.proposal.motivo}`,
        efeitos: [
          `Decisão: ${result.proposal.aceite ? "Aceite" : "Recusada"}`,
          ...(result.novoTratado ? [`Novo tratado criado: ${result.novoTratado.tipo}`] : []),
        ],
      });
      // Pausa automática em proposta diplomática (configurável).
      const newState = result.state.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: { ...newState, eventos }, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao propor tratado" });
    }
  },

  declareWar: (toCountryId, provinciasDisputa, objetivo) => {
    const current = get().state;
    if (!current || !current.playerCountryId) {
      set({ erro: "Sem país do jogador" });
      return;
    }
    try {
      const result = declareWar(
        current,
        current.playerCountryId,
        [toCountryId],
        provinciasDisputa,
        objetivo,
      );
      if (!result.war) {
        set({ erro: result.motivo });
        return;
      }
      const efeitos: string[] = [`Frentes: ${provinciasDisputa.length}`, `Objetivo: ${objetivo}`];
      const eventos: GameEvent[] = [...result.state.eventos];
      const defName = current.paises[toCountryId]?.nome ?? toCountryId;
      eventos.push({
        id: `ev-wardecl-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "guerra",
        titulo: `Guerra declarada a ${defName}`,
        texto: `O país do jogador declarou guerra a ${defName}. Objetivo: ${translateWarObjective(objetivo)}.`,
        efeitos,
      });
      // Pausa automática em declaração de guerra (configurável).
      const newState = result.state.timeState.autoPauseEventos
        ? { ...result.state, timeState: { ...result.state.timeState, pausado: true } }
        : result.state;
      set({ state: { ...newState, eventos }, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao declarar guerra" });
    }
  },

  signPeace: (warId, vencedorId, options) => {
    const current = get().state;
    if (!current) return;
    try {
      const result = signPeace(current, warId, vencedorId, options);
      if (!result.motivo.includes("sucesso")) {
        set({ erro: result.motivo });
        return;
      }
      const eventos: GameEvent[] = [...result.state.eventos];
      eventos.push({
        id: `ev-peace-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: "diplomacia",
        titulo: "Paz assinada",
        texto: `A guerra ${warId} terminou. ${result.motivo}.`,
        efeitos: [
          ...(options.cederProvincias ? [`Províncias cedidas: ${options.cederProvincias.join(", ")}`] : []),
          ...(options.indemnizacoes ? [`Indemnizações: $${options.indemnizacoes.toLocaleString("pt-PT")}`] : []),
        ],
      });
      set({ state: { ...result.state, eventos }, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao assinar paz" });
    }
  },

  resolveEvent: (eventId, choiceId) => {
    const current = get().state;
    if (!current || !current.pendingEvent) return;
    try {
      const { evento } = current.pendingEvent;
      const result = applyEventChoice(current, eventId, choiceId);
      let newState = result.state;
      const eventos: GameEvent[] = [...newState.eventos];
      const choiceLabel = evento.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
      const efeitosLista: string[] = [`Escolha: ${choiceLabel}`];
      if (result.nota) {
        efeitosLista.push(result.nota);
      }

      // Trata nota especial: GUERRA_CIVIL_TRIGGER
      if (result.nota === "GUERRA_CIVIL_TRIGGER" && current.playerCountryId) {
        const cw = triggerCivilWar(newState, current.playerCountryId);
        if (cw.rebeldeId) {
          newState = cw.state;
          eventos.push({
            id: `ev-cw-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
            turno: current.turno,
            data: current.dataAtual,
            tipo: "guerra",
            titulo: "Guerra civil!",
            texto: `O país dividir-se em duas fações. Um governo rebelde foi proclamado e tomou o controlo de várias províncias.`,
            efeitos: [`Rebelde: ${cw.rebeldeId}`, ...efeitosLista],
          });
        }
      }

      eventos.push({
        id: `ev-event-${current.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: current.turno,
        data: current.dataAtual,
        tipo: evento.tipo as GameEvent["tipo"],
        titulo: evento.titulo,
        texto: `${evento.texto} Resolução: ${choiceLabel}.`,
        efeitos: efeitosLista,
      });

      // Limpa o pendingEvent.
      newState = { ...newState, pendingEvent: null, eventos };
      set({ state: newState, erro: null });
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : "Erro ao resolver evento" });
    }
  },
}));

// --- Helpers de tradução para o diário -----------------------------------

function translateProposalType(t: DiplomaticProposalType): string {
  const map: Record<DiplomaticProposalType, string> = {
    alianca: "aliança",
    comercio: "comércio",
    nao_agressao: "não-agressão",
    paz: "paz",
    ultimato: "ultimato",
  };
  return map[t] ?? t;
}

function translateWarObjective(o: WarObjective): string {
  const map: Record<WarObjective, string> = {
    conquistar: "conquistar províncias",
    saquear: "saquear recursos",
    humilhar: "humilhar o adversário",
    defender: "defender o statu quo",
  };
  return map[o] ?? o;
}

/** Helper local para clamp de inteiros (usado em setTaxPolicy). */
function clampIntLocal(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
