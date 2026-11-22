// src/lib/engine/advance-turn.ts
// Função principal do motor: avança 1 turno (mês ou ano, conforme config),
// devolvendo um NOVO estado. Não altera o original.
//
// Fluxo por país:
//   1. Determinar orçamento (jogador usa o seu; IA usa o default do regime).
//   2. Calcular crescimento do PIB (com retornos decrescentes no investimento).
//   3. Calcular tesouro novo (receitas - despesas fixas - despesas setoriais).
//   4. Calcular drifts de estabilidade e aprovação.
//   5. Aplicar clamp; actualizar contagem de turnos em colapso.
//   6. Verificar probabilidade de golpe; se ocorrer, aplicar.
//
// Pós-processamento (Fase 6):
//   7. Adicionar snapshot do jogador ao histórico (playerHistory).
//   8. Verificar condição de vitória (checkVictory).
//   9. Sortear evento aleatório para o jogador (pendingEvent) — resolvido na UI.
//
// O motor adiciona um evento «sistema» ao diário com o resumo das mudanças do
// país do jogador (PIB, estabilidade, aprovação, tesouro).

import type { Country, GameEvent, GameState, BudgetAllocation, PlayerHistoryEntry } from "@/types";
import { addMonths, addYears } from "@/lib/state/date";
import { Rng, rngForCountry } from "./rng";
import {
  calculateGdpGrowth,
  calculateNewTreasury,
  getEffectiveBudget,
} from "./economy";
import {
  calculateApprovalDelta,
  calculateStabilityDelta,
  clampStat,
  updateCollapseTurns,
} from "./stability";
import { shouldCoupOccur, applyCoup } from "./coup";
import { rollForEvent } from "./events";
import { checkVictory } from "./ranking";
import { applyOccupationResistance } from "./culture";
import { updateMilitaryBudget, updateTroops, tryAttractMultinational, processMultinationals } from "./fiscal";
import { processBlocVotes } from "./blocs";
import { processAICountries } from "./ai-countries";
import { processRefugees } from "./refugees";
import { processProxyWars } from "./proxy-wars";
import { processReputationDrift } from "./reputation";
import { processMissionsAndAchievements } from "./missions";
import { updateAdvisorConfidence } from "./advisors";
import { processResearch, applyTechBonuses } from "./tech-tree";
import { processElection, electionApproaching } from "./elections";
import { processNews } from "./news";

/** Resultado do avanço de um país individual (interno, não exportado). */
interface CountryResult {
  country: Country;
  growth: number;
  newTreasury: number;
  newStability: number;
  newApproval: number;
  budgetUsed: BudgetAllocation;
  entrouColapso: boolean;
  saiuColapso: boolean;
  coupEffects: string[] | null;
}

/**
 * Avança o jogo 1 turno. Função PURA: não altera `state`, devolve um novo estado.
 * Compatibilidade: usado por testes e pelo modo «avanço manual».
 *
 * @param state Estado atual (imutável).
 * @returns Novo estado com data/turno avançados, países actualizados, e
 *          evento de resumo adicionado ao diário.
 */
export function advanceTurn(state: GameState): GameState {
  // 1. Avança data (mês ou ano, conforme config).
  const novaData =
    state.config.resolution === "mensal"
      ? addMonths(state.dataAtual, 1)
      : addYears(state.dataAtual, 1);
  // 2. Corre o pipeline mensal com a nova data.
  return runMonthlyPipeline(state, novaData).state;
}

/** Flags do resultado do pipeline mensal (usadas pela pausa automática). */
export interface MonthlyPipelineResult {
  state: GameState;
  /** True se um golpe de estado ocorreu neste mês. */
  houveGolpe: boolean;
  /** True se um evento aleatório foi criado (pendente de resolução na UI). */
  houveEvento: boolean;
  /** True se a vitória foi declarada neste mês. */
  houveVitoria: boolean;
  /** True se houve revolta ou assimilação de província ocupada (Fase 4). */
  houveRevoltaOcupacao: boolean;
}

/**
 * Corre TODO o pipeline mensal do motor SEM avançar a data por si — recebe a
 * data alvo (o relógio diário já a terá rolado para o dia 1 do mês novo).
 * Função PURA. Usado pelo tick diário (Fase 1) e por advanceTurn.
 *
 * Processa: economia por país, colapso, golpes, snapshot do jogador,
 * verificação de vitória, sorteio de evento aleatório.
 */
export function runMonthlyPipeline(state: GameState, novaData: string): MonthlyPipelineResult {
  const novoTurno = state.turno + 1;

  // Estado base com data/turno actualizados. Os países são processados abaixo.
  const workingState: GameState = {
    ...state,
    dataAtual: novaData,
    turno: novoTurno,
  };

  // 2. Processa cada país. RNG determinístico por país (seed+turno+countryId).
  const newPaises: Record<string, Country> = {};
  let newColapso = { ...state.colapsoTurnos };
  const coupEvents: { countryId: string; effects: string[] }[] = [];
  const playerSummary: { pibPct: number; estab: number; aprov: number; tesouro: number } | null =
    state.playerCountryId
      ? { pibPct: 0, estab: 0, aprov: 0, tesouro: 0 }
      : null;

  for (const countryId of Object.keys(state.paises)) {
    const country = state.paises[countryId];
    const rng = rngForCountry(workingState, countryId);
    const result = processCountry(country, workingState, rng);
    newPaises[countryId] = result.country;

    // Actualiza contagem de colapso.
    const collapseUpdate = updateCollapseTurns(
      countryId,
      result.newStability,
      newColapso,
    );
    newColapso = collapseUpdate.colapso;

    // Verifica golpe (depois de actualizar estabilidade/colapso).
    const tempState: GameState = {
      ...workingState,
      paises: newPaises,
      colapsoTurnos: newColapso,
    };
    if (shouldCoupOccur(result.country, tempState, rng)) {
      const coupResult = applyCoup(tempState, countryId, rng);
      newPaises[countryId] = coupResult.state.paises[countryId];
      newColapso = coupResult.state.colapsoTurnos;
      coupEvents.push({ countryId, effects: coupResult.efeitos });
      // Aplica tratados/relações que o coup alterou ao workingState para os
      // próximos países verem a versão actualizada.
      workingState.tratados = coupResult.state.tratados;
      workingState.relacoes = coupResult.state.relacoes;
    }

    // Resumo do jogador (para o diário).
    if (state.playerCountryId === countryId && playerSummary) {
      playerSummary.pibPct = result.growth * 100;
      playerSummary.estab = result.newStability - country.estabilidade;
      playerSummary.aprov = result.newApproval - country.aprovacao;
      playerSummary.tesouro = result.newTreasury - country.tesouro;
    }
  }

  // 3. Cria eventos para o diário.
  const eventos: GameEvent[] = [...state.eventos];

  // Evento de resumo do jogador.
  if (state.playerCountryId && playerSummary) {
    const efeitos: string[] = [
      `PIB: ${playerSummary.pibPct >= 0 ? "+" : ""}${playerSummary.pibPct.toFixed(2)}%`,
      `Estabilidade: ${formatDelta(playerSummary.estab)}`,
      `Aprovação: ${formatDelta(playerSummary.aprov)}`,
      `Tesouro: ${formatDelta(playerSummary.tesouro)}`,
    ];
    eventos.push({
      id: `ev-${novoTurno.toString().padStart(4, "0")}-000`,
      turno: novoTurno,
      data: novaData,
      tipo: "sistema",
      titulo: `Resumo do turno ${novoTurno}`,
      texto: `Em ${formatDateShort(novaData)}, a economia do país ${
        state.paises[state.playerCountryId]?.nome ?? ""
      } evoluiu ${playerSummary.pibPct >= 0 ? "positivamente" : "negativamente"}.`,
      efeitos,
    });
  }

  // Eventos de golpe.
  coupEvents.forEach((ev, idx) => {
    const countryName = newPaises[ev.countryId]?.nome ?? ev.countryId;
    eventos.push({
      id: `ev-${novoTurno.toString().padStart(4, "0")}-${(idx + 1).toString().padStart(3, "0")}`,
      turno: novoTurno,
      data: novaData,
      tipo: "politica",
      titulo: `Golpe de estado em ${countryName}`,
      texto: `Um golpe de estado ocorreu em ${countryName}. O regime mudou e a estabilidade do país foi abalada.`,
      efeitos: ev.effects,
    });
  });

  // 4. Pós-processamento: snapshot do histórico do jogador, verificação de vitória,
  //    e sorteio de evento aleatório (pendurado em state.pendingEvent para a UI resolver).
  let finalState: GameState = {
    ...workingState,
    paises: newPaises,
    colapsoTurnos: newColapso,
    eventos,
  };

  // Snapshot do país do jogador.
  if (state.playerCountryId && finalState.paises[state.playerCountryId]) {
    const p = finalState.paises[state.playerCountryId];
    const snapshot: PlayerHistoryEntry = {
      turno: novoTurno,
      data: novaData,
      pib: p.pib,
      tesouro: p.tesouro,
      estabilidade: p.estabilidade,
      aprovacao: p.aprovacao,
      exercito: p.exercito,
    };
    finalState = {
      ...finalState,
      playerHistory: [...finalState.playerHistory, snapshot].slice(-200),
    };
  }

  // Verificação de vitória.
  const victoryResult = checkVictory(finalState);
  finalState = victoryResult.state;
  if (victoryResult.venceu && state.playerCountryId) {
    const country = finalState.paises[state.playerCountryId];
    eventos.push({
      id: `ev-vitoria-${novoTurno.toString().padStart(4, "0")}`,
      turno: novoTurno,
      data: novaData,
      tipo: "sistema",
      titulo: "Vitória declarada!",
      texto: `${country?.nome ?? "O país"} atingiu o top 3 mundial em PIB ou poder militar durante 5 anos consecutivos. O jogo continua, mas a vitória foi declarada.`,
      efeitos: ["Top 3 por 5 anos consecutivos"],
    });
  }

  // Sorteio de evento aleatório para o jogador.
  let houveEvento = false;
  if (state.playerCountryId && finalState.paises[state.playerCountryId] && !finalState.pendingEvent) {
    const playerCountry = finalState.paises[state.playerCountryId];
    const rngEvent = rngForCountry(finalState, `${state.playerCountryId}-event`);
    const event = rollForEvent(finalState, playerCountry, rngEvent);
    if (event) {
      finalState = {
        ...finalState,
        pendingEvent: { evento: event, turno: novoTurno, data: novaData },
      };
      houveEvento = true;
    }
  }

  // Fase 4 — Cultura e ocupação: aplica drift de lealdade nas províncias
  // ocupadas e detecta revoltas/assimilação. Corre depois de tudo para ver
  // o estado final (incluindo novas províncias conquistadas neste turno).
  const occupationResult = applyOccupationResistance(finalState);
  finalState = occupationResult.state;
  let houveRevoltaOcupacao = false;
  if (occupationResult.eventos.length > 0) {
    houveRevoltaOcupacao = true;
    for (const ev of occupationResult.eventos) {
      const provName = finalState.provincias[ev.provinceId]?.nome ?? ev.provinceId;
      const occupierName = finalState.paises[ev.occupierId]?.nome ?? ev.occupierId;
      eventos.push({
        id: `ev-ocup-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: ev.tipo === "revolta" ? "politica" : "diplomacia",
        titulo: ev.tipo === "revolta"
          ? `Revolta em ${provName}`
          : `${provName} assimilada por ${occupierName}`,
        texto: ev.tipo === "revolta"
          ? `A população de ${provName} (ocupada por ${occupierName}) está em revolta aberta. A lealdade caiu para níveis críticos.`
          : `Após longa ocupação, ${provName} foi formalmente assimilada por ${occupierName}. A lealdade ultrapassou 80 durante 12 meses seguidos.`,
        efeitos: [
          `Província: ${ev.provinceId}`,
          `Ocupante: ${ev.occupierId}`,
          ev.tipo === "revolta" ? "Lealdade < 20" : "Assimilação concluída",
        ],
      });
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 5 — Multinacionais: processa lucros e impostos das multinacionais instaladas.
  const multResult = processMultinationals(finalState);
  finalState = multResult.state;

  // Fase 5 — Atrair novas multinacionais: tenta para todos os países (probabilidade baixa).
  // O sorteio é determinístico (RNG por país).
  for (const countryId of Object.keys(finalState.paises)) {
    const rngMult = rngForCountry(finalState, `mult-attract-${countryId}`);
    const before = finalState.multinacionais.length;
    const r = tryAttractMultinational(finalState, countryId, rngMult);
    if (r.novaMultinacional) {
      finalState = r.state;
      const nova = r.novaMultinacional;
      const paisOp = finalState.paises[countryId]?.nome ?? countryId;
      const sede = finalState.paises[nova.sede]?.nome ?? nova.sede;
      eventos.push({
        id: `ev-mult-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: "economia",
        titulo: `Multinacional instalada em ${paisOp}`,
        texto: `${nova.nome} (sede: ${sede}, sector: ${nova.sector}) abriu operações em ${paisOp}. Receita anual estimada: $${formatCompact(nova.receita)}. Empregados: ${nova.empregados}.`,
        efeitos: [
          `Multinacional: ${nova.nome}`,
          `Sede: ${sede}`,
          `Sector: ${nova.sector}`,
          `Receita: $${formatCompact(nova.receita)}/ano`,
          `Empregados: ${nova.empregados}`,
        ],
      });
    }
    void before;
  }
  finalState = { ...finalState, eventos };

  // Fase 6 — Votações em blocos: processa votos pendentes e fecha votações.
  const votesResult = processBlocVotes(finalState);
  finalState = votesResult.state;
  if (votesResult.closedVotes.length > 0) {
    for (const vote of votesResult.closedVotes) {
      const blocoNome = vote.blocoId; // O blocoId é o ID; o nome é apresentado via BLOCOS na UI.
      eventos.push({
        id: `ev-vote-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: "diplomacia",
        titulo: `Votação ${vote.resultado === "aprovada" ? "aprovada" : "rejeitada"} em ${blocoNome}`,
        texto: `Proposta: ${vote.proposta}. Resultado: ${vote.resultado}. Votação encerrada com base na Influência Política dos membros.`,
        efeitos: [
          `Bloco: ${vote.blocoId}`,
          `Tipo: ${vote.tipo}`,
          `Resultado: ${vote.resultado}`,
          `Votos: ${Object.entries(vote.votos).map(([k, v]) => `${k}:${v ?? "?"}`).join(", ")}`,
        ],
      });
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 7 — Mundo vivo: decisões automáticas dos países IA.
  const aiResult = processAICountries(finalState);
  finalState = aiResult.state;
  let houveAIAcao = false;
  if (aiResult.eventos.length > 0) {
    houveAIAcao = true;
    for (const ev of aiResult.eventos) {
      const country = finalState.paises[ev.countryId];
      const countryName = country?.nome ?? ev.countryId;
      eventos.push({
        id: `ev-ai-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: ev.acao === "retaliar" ? "guerra" : "diplomacia",
        titulo: `${countryName}: ${ev.acao.replace("_", " ")}`,
        texto: ev.detalhe,
        efeitos: [`País: ${countryName}`, `Ação: ${ev.acao}`],
      });
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 8 — Refugiados: gera e distribui fluxos de refugiados.
  const refugeesResult = processRefugees(finalState);
  finalState = refugeesResult.state;
  let houveRefugiados = false;
  if (refugeesResult.novosFluxos.length > 0) {
    houveRefugiados = true;
    for (const fluxo of refugeesResult.novosFluxos) {
      const origem = finalState.paises[fluxo.origem]?.nome ?? fluxo.origem;
      const destino = finalState.paises[fluxo.destino]?.nome ?? fluxo.destino;
      eventos.push({
        id: `ev-refug-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: "politica",
        titulo: `Refugiados: ${origem} → ${destino}`,
        texto: `${formatNumber(fluxo.numero)} refugiados de ${origem} foram acolhidos por ${destino}. Motivo: ${fluxo.motivo}.`,
        efeitos: [
          `Origem: ${fluxo.origem}`,
          `Destino: ${fluxo.destino}`,
          `Número: ${formatNumber(fluxo.numero)}`,
        ],
      });
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 8 — Proxy wars: processa manutenção mensal de proxies activos.
  const proxyResult = processProxyWars(finalState);
  finalState = proxyResult.state;
  let houveProxy = false;
  if (proxyResult.eventos.length > 0) {
    houveProxy = true;
    for (const ev of proxyResult.eventos) {
      const sponsor = finalState.paises[ev.sponsorId]?.nome ?? ev.sponsorId;
      if (ev.status === "terminado") {
        eventos.push({
          id: `ev-proxy-end-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
          turno: novoTurno,
          data: novaData,
          tipo: "guerra",
          titulo: `Proxy war terminada: ${ev.proxyId}`,
          texto: `O proxy ${ev.proxyId} apadrinhado por ${sponsor} foi dissolvido (anexado ou derrotado).`,
          efeitos: [`Sponsor: ${sponsor}`, `Proxy: ${ev.proxyId}`, `Status: terminado`],
        });
      }
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 8 — Reputação: drift mensal de reputação mundial.
  const repResult = processReputationDrift(finalState);
  finalState = repResult.state;
  // Eventos de reputação só são registados se o jogador for afectado.
  if (state.playerCountryId) {
    const playerRepEvent = repResult.eventos.find((e) => e.countryId === state.playerCountryId);
    if (playerRepEvent && Math.abs(playerRepEvent.delta) >= 2) {
      const playerCountry = finalState.paises[state.playerCountryId];
      eventos.push({
        id: `ev-rep-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: "diplomacia",
        titulo: `Reputação: ${playerRepEvent.delta >= 0 ? "+" : ""}${playerRepEvent.delta}`,
        texto: `A reputação mundial de ${playerCountry?.nome ?? "o teu país"} mudou em ${playerRepEvent.delta >= 0 ? "+" : ""}${playerRepEvent.delta} pontos (${playerRepEvent.motivo}).`,
        efeitos: [`Delta: ${playerRepEvent.delta}`, `Motivo: ${playerRepEvent.motivo}`],
      });
      finalState = { ...finalState, eventos };
    }
  }

  // Fase 10 — Pesquisa tecnológica: processa pesquisa em curso + aplica bónus.
  const researchResult = processResearch(finalState);
  finalState = researchResult.state;
  for (const ev of researchResult.eventos) {
    if (ev.tipo === "tech_completa") {
      eventos.push({
        id: `ev-tech-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: "economia",
        titulo: `Tecnologia desbloqueada: ${ev.techNome}`,
        texto: `A pesquisa de ${ev.techNome} foi concluída com sucesso. Bónus permanentes aplicados ao país.`,
        efeitos: [`Tech: ${ev.techId}`],
      });
    }
  }
  if (researchResult.eventos.length > 0) {
    finalState = { ...finalState, eventos };
  }
  // Aplica bónus das techs desbloqueadas.
  finalState = applyTechBonuses(finalState);

  // Fase 10 — Eleições: verifica se é altura de eleições.
  const eleicaoAntes = electionApproaching(finalState);
  const electionResult = processElection(finalState);
  finalState = electionResult.state;
  let houveEleicao = false;
  if (electionResult.eleicao) {
    houveEleicao = true;
    const e = electionResult.eleicao;
    const playerCountry = state.playerCountryId ? finalState.paises[state.playerCountryId] : null;
    eventos.push({
      id: `ev-elec-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
      turno: novoTurno,
      data: novaData,
      tipo: "politica",
      titulo: e.venceu ? `Eleição vencida (${e.votosJogador}%)` : `Eleição perdida (${e.votosJogador}%)`,
      texto: e.venceu
        ? `${playerCountry?.nome ?? "O país"} reelegeu o governo com ${e.votosJogador}% dos votos. Oposição: ${e.votosOpositor}%.`
        : `${playerCountry?.nome ?? "O país"} elegeu a oposição com ${e.votosOpositor}% dos votos. O governo caiu; novo líder assumiu o poder.`,
      efeitos: [
        `Votos jogador: ${e.votosJogador}%`,
        `Votos oposição: ${e.votosOpositor}%`,
        e.venceu ? "Resultado: vitória" : "Resultado: derrota",
      ],
    });
    finalState = { ...finalState, eventos };
  }
  void eleicaoAntes;

  // Fase 10 — Conselheiros: drift de confiança mensal.
  finalState = updateAdvisorConfidence(finalState);

  // Fase 9 — Missões + Achievements + snapshot de ranking anual.
  const missionsResult = processMissionsAndAchievements(finalState);
  finalState = missionsResult.state;
  let houveMissaoAchievement = false;
  if (missionsResult.eventos.length > 0) {
    houveMissaoAchievement = true;
    for (const ev of missionsResult.eventos) {
      eventos.push({
        id: `ev-${ev.tipo}-${novoTurno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
        turno: novoTurno,
        data: novaData,
        tipo: ev.tipo === "ranking_snapshot" ? "sistema" : (ev.tipo === "achievement" ? "evento" : "sistema"),
        titulo: ev.titulo,
        texto: ev.texto,
        efeitos: [],
      });
    }
    finalState = { ...finalState, eventos };
  }

  // Fase 10 — Notícias dinâmicas: gera 1-3 notícias por turno.
  const newsResult = processNews(finalState);
  finalState = newsResult.state;
  // Notícias não são adicionadas ao diário de eventos (são separadas do diário).
  // A UI pode mostrar notícias num painel próprio.

  // 5. Devolve estado final + flags para pausa automática.
  return {
    state: finalState,
    houveGolpe: coupEvents.length > 0,
    houveEvento,
    houveVitoria: victoryResult.venceu,
    houveRevoltaOcupacao: houveRevoltaOcupacao || houveAIAcao || houveRefugiados || houveProxy || houveEleicao || houveMissaoAchievement,
  };
}

// --- Internos --------------------------------------------------------------

function processCountry(
  country: Country,
  state: GameState,
  rng: Rng,
): CountryResult {
  const budget = getEffectiveBudget(country, state);

  // PIB: calcula crescimento e aplica.
  const growth = calculateGdpGrowth(country, budget, state, rng);
  const newPib = Math.max(1, country.pib * (1 + growth)); // PIB nunca ≤ 0

  // Tesouro: receitas - despesas.
  const { tesouro: newTreasury } = calculateNewTreasury(country, budget, state);

  // Estabilidade e aprovação: drifts com clamp.
  const stabDelta = calculateStabilityDelta(country, budget, state, growth, rng);
  const aprovDelta = calculateApprovalDelta(country, budget, state, growth, rng);
  const newStability = Math.round(clampStat(country.estabilidade + stabDelta));
  const newApproval = Math.round(clampStat(country.aprovacao + aprovDelta));

  // Exército (índice 0-1000): pequeno crescimento se houver investimento, em guerra estagna.
  const investExercito = (budget.exercito / 100) * country.tesouro;
  const gdpMonthly = country.pib / 12;
  const exercitoBoost =
    investExercito > 0 && gdpMonthly > 0
      ? Math.min(3, (investExercito / gdpMonthly) * 20) // até +3 por turno
      : 0;
  const newExercito = clampInt(country.exercito + exercitoBoost, 0, 1000);

  // Fase 5 — Orçamento militar anual (dinâmico): atualiza com base no investimento mensal.
  const newOrcamentoMilitar = updateMilitaryBudget(country, state, investExercito);
  // Fase 5 — Tropas ativas (dinâmico): cresce com orçamento militar, perde em guerra.
  const { tropas: newTropas } = updateTroops(country, state);

  const newCountry: Country = {
    ...country,
    pib: newPib,
    tesouro: newTreasury,
    estabilidade: newStability,
    aprovacao: newApproval,
    exercito: newExercito,
    orcamentoMilitar: newOrcamentoMilitar,
    tropas: newTropas,
  };

  return {
    country: newCountry,
    growth,
    newTreasury,
    newStability,
    newApproval,
    budgetUsed: budget,
    entrouColapso: false,
    saiuColapso: false,
    coupEffects: null,
  };
}

function formatDelta(n: number): string {
  if (n >= 0) return `+${n.toFixed(1)}`;
  return n.toFixed(1);
}

function formatDateShort(iso: string): string {
  // Data curta: «jan/2025»
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.max(min, Math.min(max, value)));
}

/** Formata valor grande de forma compacta ($1.5 T, $920 MM, $1.2 M, $850 k). */
function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}

/** Formata número inteiro com separadores (1.234.567). */
function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}
