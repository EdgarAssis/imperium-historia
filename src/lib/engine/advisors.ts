// src/lib/engine/advisors.ts
// Fase 10 — Conselheiros.
//
// 4 conselheiros (económico, militar, diplomático, segurança) que dão sugestões
// baseadas no estado actual do país do jogador. As sugestões são geradas
// automaticamente (sem IA) com base em heurísticas simples.

import type { GameState, Advisor, AdvisorType } from "@/types";

/** Conselheiros iniciais do jogador. */
export function defaultAdvisors(): Advisor[] {
  return [
    { tipo: "economico", nome: "Ministro da Economia", confianca: 50 },
    { tipo: "militar", nome: "Chefe do Estado-Maior", confianca: 50 },
    { tipo: "diplomatico", nome: "Ministro dos Negócios Estrangeiros", confianca: 50 },
    { tipo: "seguranca", nome: "Diretor da Inteligência", confianca: 50 },
  ];
}

/** Sugestão de um conselheiro (texto + tipo). */
export interface AdvisorSuggestion {
  tipo: AdvisorType;
  conselheiro: string;
  sugestao: string;
  /** Prioridade (alta/media/baixa). */
  prioridade: "alta" | "media" | "baixa";
}

/**
 * Gera sugestões para todos os conselheiros baseadas no estado do jogador.
 * Devolve array de sugestões (1 por conselheiro).
 */
export function generateAdvisorSuggestions(state: GameState): AdvisorSuggestion[] {
  if (!state.playerCountryId) return [];
  const player = state.paises[state.playerCountryId];
  if (!player) return [];
  const suggestions: AdvisorSuggestion[] = [];

  // Económico.
  const economica = generateEconomicAdvice(state, player);
  suggestions.push({
    tipo: "economico",
    conselheiro: "Ministro da Economia",
    ...economica,
  });

  // Militar.
  const militar = generateMilitaryAdvice(state, player);
  suggestions.push({
    tipo: "militar",
    conselheiro: "Chefe do Estado-Maior",
    ...militar,
  });

  // Diplomático.
  const diplomatica = generateDiplomaticAdvice(state, player);
  suggestions.push({
    tipo: "diplomatico",
    conselheiro: "Ministro dos Negócios Estrangeiros",
    ...diplomatica,
  });

  // Segurança.
  const seguranca = generateSecurityAdvice(state, player);
  suggestions.push({
    tipo: "seguranca",
    conselheiro: "Diretor da Inteligência",
    ...seguranca,
  });

  return suggestions;
}

function generateEconomicAdvice(state: GameState, player: GameState["paises"][string]): { sugestao: string; prioridade: "alta" | "media" | "baixa" } {
  if (player.tesouro < 0) {
    return { sugestao: "O tesouro está negativo! Considera reduzir despesas ou aumentar impostos para evitar colapso económico.", prioridade: "alta" };
  }
  if (player.estabilidade < 40) {
    return { sugestao: "A instabilidade está a prejudicar a economia. Investe em saúde/educação para estabilizar.", prioridade: "alta" };
  }
  const orcamentoMilitarPct = player.orcamentoMilitar / Math.max(1, player.pib);
  if (orcamentoMilitarPct > 0.05) {
    return { sugestao: "O orçamento militar é elevado (>5% do PIB). Considera redirecionar para economia.", prioridade: "media" };
  }
  const emGuerra = state.guerras.some((g) => g.estado === "ativa" && (g.agressor === player.id || g.defensores.includes(player.id)));
  if (emGuerra) {
    return { sugestao: "A guerra está a drenar recursos. Considera assinar paz se a situação não for favorável.", prioridade: "media" };
  }
  return { sugestao: "A economia está saudável. Investe em infraestrutura para crescimento de longo prazo.", prioridade: "baixa" };
}

function generateMilitaryAdvice(state: GameState, player: GameState["paises"][string]): { sugestao: string; prioridade: "alta" | "media" | "baixa" } {
  const emGuerra = state.guerras.some((g) => g.estado === "ativa" && (g.agressor === player.id || g.defensores.includes(player.id)));
  if (emGuerra && player.tropas < 100_000) {
    return { sugestao: "Estás em guerra com poucas tropas. Mobiliza reservas ou pede apoio a aliados.", prioridade: "alta" };
  }
  if (!player.nuclear && player.orcamentoMilitar > 100e9) {
    return { sugestao: "Com orçamento militar elevado, considera desenvolver programa nuclear (dissuasão).", prioridade: "media" };
  }
  if (player.exercito < 100) {
    return { sugestao: "O exército é pequeno. Investe no orçamento militar para aumentar a força gradualmente.", prioridade: "media" };
  }
  return { sugestao: "As forças armadas estão em bom estado. Mantém o investimento regular.", prioridade: "baixa" };
}

function generateDiplomaticAdvice(state: GameState, player: GameState["paises"][string]): { sugestao: string; prioridade: "alta" | "media" | "baixa" } {
  const reputacao = player.reputacao ?? 0;
  if (reputacao < -30) {
    return { sugestao: "A reputação mundial está baixa. Considera acolher refugiados ou respeitar tratados para melhorar.", prioridade: "alta" };
  }
  const semBlocos = player.blocos.length === 0;
  if (semBlocos) {
    return { sugestao: "Não és membro de nenhum bloco. Candidata-te a um (NATO, UE, BRICS) para benefícios económicos.", prioridade: "media" };
  }
  // Verifica se há aliados com relação forte.
  const aliadosFortes = state.relacoes.filter((r) =>
    (r.a === player.id || r.b === player.id) && r.valor > 60
  ).length;
  if (aliadosFortes < 2) {
    return { sugestao: "Tens poucos aliados fortes. Propor tratados de aliança a países com relação boa.", prioridade: "media" };
  }
  return { sugestao: "A diplomacia está equilibrada. Mantém as relações e considera votações em blocos.", prioridade: "baixa" };
}

function generateSecurityAdvice(state: GameState, player: GameState["paises"][string]): { sugestao: string; prioridade: "alta" | "media" | "baixa" } {
  const colapsoTurnos = state.colapsoTurnos[player.id] ?? 0;
  if (colapsoTurnos > 0) {
    return { sugestao: "O país está em colapso! Risco de golpe iminente. Aumenta o orçamento de segurança urgentemente.", prioridade: "alta" };
  }
  if (player.aprovacao < 30) {
    return { sugestao: "A aprovação está muito baixa. Risco de protestos. Considera reformas populares.", prioridade: "alta" };
  }
  // Verifica se há países hostis nas proximidades.
  const hostis = state.relacoes.filter((r) =>
    (r.a === player.id || r.b === player.id) && r.valor < -50
  ).length;
  if (hostis > 2) {
    return { sugestao: "Há vários países hostis. Reforça a segurança interna e considera espionagem.", prioridade: "media" };
  }
  return { sugestao: "A segurança interna está estável. Mantém vigilância contra espionagem externa.", prioridade: "baixa" };
}

/**
 * Actualiza a confiança dos conselheiros (drift mensal).
 * Confiança sobe lentamente com estabilidade alta; cai com instabilidade.
 */
export function updateAdvisorConfidence(state: GameState): GameState {
  if (!state.playerCountryId) return state;
  const player = state.paises[state.playerCountryId];
  if (!player) return state;
  const stabFactor = (player.estabilidade - 50) / 100; // -0.5..+0.5
  const novosConselheiros = state.conselheiros.map((c) => {
    const delta = Math.round(stabFactor * 2); // ±1 por mês
    return { ...c, confianca: Math.max(0, Math.min(100, c.confianca + delta)) };
  });
  return { ...state, conselheiros: novosConselheiros };
}
