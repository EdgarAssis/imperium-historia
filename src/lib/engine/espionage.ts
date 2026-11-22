// src/lib/engine/espionage.ts
// Fase 10 — Espionagem.
//
// Operações secretas: roubar tech, sabotar infra, subornar, infiltrar, assassinar.
// Cada operação tem custo + probabilidade de sucesso + efeitos.

import type { GameState, SpyOperationType, SpyOperationResult } from "@/types";
import { rngForCountry } from "./rng";
import { adjustReputation } from "./reputation";
import { clampStat } from "./stability";

/** Custo base por tipo de operação (em dólares). */
const SPY_COST: Record<SpyOperationType, number> = {
  roubar_tech: 5_000_000_000,
  sabotar_infra: 10_000_000_000,
  subornar_oficial: 2_000_000_000,
  infiltrar_governo: 8_000_000_000,
  assassinar: 20_000_000_000,
};

/** Probabilidade base de sucesso (0-1) por tipo. */
const SPY_SUCCESS_BASE: Record<SpyOperationType, number> = {
  roubar_tech: 0.4,
  sabotar_infra: 0.5,
  subornar_oficial: 0.6,
  infiltrar_governo: 0.3,
  assassinar: 0.2,
};

/** Penalização de reputação se apanhado (por tipo). */
const SPY_REPUTATION_PENALTY: Record<SpyOperationType, number> = {
  roubar_tech: -5,
  sabotar_infra: -10,
  subornar_oficial: -3,
  infiltrar_governo: -8,
  assassinar: -25,
};

/**
 * Executa uma operação de espionagem contra `alvoId`.
 *
 * Pré-condições:
 *   - alvo não é o país do jogador
 *   - jogador tem tesouro >= custo
 *
 * Efeitos (se sucesso):
 *   - roubar_tech: copia uma tech aleatória do alvo para o jogador
 *   - sabotar_infra: PIB do alvo -1%
 *   - subornar_oficial: relação jogador-alvo +15
 *   - infiltrar_governo: revela info (eventos futuros)
 *   - assassinar: estabilidade do alvo -20, líder muda
 *
 * Se falhado: reputação do jogador cai (escândalo).
 */
export function executeSpyOperation(
  state: GameState,
  alvoId: string,
  tipo: SpyOperationType,
): { state: GameState; resultado: SpyOperationResult } {
  if (!state.playerCountryId) {
    return { state, resultado: { sucesso: false, mensagem: "Sem país do jogador.", efeitos: [] } };
  }
  const sponsor = state.paises[state.playerCountryId];
  const alvo = state.paises[alvoId];
  if (!sponsor || !alvo) {
    return { state, resultado: { sucesso: false, mensagem: "País inexistente.", efeitos: [] } };
  }
  if (alvoId === state.playerCountryId) {
    return { state, resultado: { sucesso: false, mensagem: "Não se pode espionar a si próprio.", efeitos: [] } };
  }
  if (alvo.donoJogador) {
    return { state, resultado: { sucesso: false, mensagem: "País do jogador não pode ser alvo.", efeitos: [] } };
  }
  const custo = SPY_COST[tipo];
  if (sponsor.tesouro < custo) {
    return {
      state,
      resultado: { sucesso: false, mensagem: `Tesouro insuficiente ($${formatCompact(sponsor.tesouro)} < $${formatCompact(custo)}).`, efeitos: [] },
    };
  }

  // Probabilidade de sucesso: base + bónus por diferença de influência.
  const rng = rngForCountry(state, `spy-${alvoId}-${tipo}-${state.turno}`);
  let probSucesso = SPY_SUCCESS_BASE[tipo];
  // Bónus: se o jogador tem maior influência que o alvo, +10%.
  // (Heurística simples; não calculamos métricas reais para evitar import circular.)
  if (sponsor.pib > alvo.pib * 2) probSucesso += 0.10;
  // Penalização: se alvo está em guerra, segurança aumenta (-10%).
  const alvoEmGuerra = state.guerras.some((g) => g.estado === "ativa" && (g.agressor === alvoId || g.defensores.includes(alvoId)));
  if (alvoEmGuerra) probSucesso -= 0.10;
  probSucesso = Math.max(0.05, Math.min(0.9, probSucesso));

  const sucesso = rng.chance(probSucesso);
  const efeitos: string[] = [];
  let newState = state;

  // Paga custo.
  newState = {
    ...newState,
    paises: {
      ...newState.paises,
      [state.playerCountryId]: {
        ...newState.paises[state.playerCountryId],
        tesouro: newState.paises[state.playerCountryId].tesouro - custo,
      },
    },
  };
  efeitos.push(`Custo: -$${formatCompact(custo)}`);

  if (sucesso) {
    // Aplica efeitos por tipo.
    switch (tipo) {
      case "roubar_tech": {
        // Copia tech aleatória do alvo (se tiver).
        // Heurística: 50% chance de copiar uma tech.
        if (rng.chance(0.5)) {
          newState = {
            ...newState,
            pesquisa: {
              ...newState.pesquisa,
              desbloqueadas: [...newState.pesquisa.desbloqueadas, `tech-roubada-${state.turno}`],
            },
          };
          efeitos.push("Tech roubada: tecnologia secreta adquirida.");
        } else {
          efeitos.push("Alvo não tinha techs valiosas.");
        }
        break;
      }
      case "sabotar_infra": {
        const pibAntes = alvo.pib;
        const novoPib = Math.max(1, pibAntes * 0.99);
        newState = {
          ...newState,
          paises: {
            ...newState.paises,
            [alvoId]: { ...alvo, pib: novoPib },
          },
        };
        efeitos.push(`PIB do alvo: -$${formatCompact(pibAntes - novoPib)} (-1%)`);
        break;
      }
      case "subornar_oficial": {
        // Relação +15.
        const relacoes = newState.relacoes.map((r) => {
          if ((r.a === state.playerCountryId && r.b === alvoId) || (r.a === alvoId && r.b === state.playerCountryId)) {
            return { ...r, valor: Math.max(-100, Math.min(100, r.valor + 15)) };
          }
          return r;
        });
        newState = { ...newState, relacoes };
        efeitos.push("Relação jogador↔alvo: +15");
        break;
      }
      case "infiltrar_governo": {
        efeitos.push("Informações obtidas: planos do alvo revelados.");
        break;
      }
      case "assassinar": {
        const stabAntes = alvo.estabilidade;
        newState = {
          ...newState,
          paises: {
            ...newState.paises,
            [alvoId]: {
              ...alvo,
              estabilidade: clampStat(stabAntes - 20),
              lider: "Novo líder (após assassinato)",
            },
          },
        };
        efeitos.push(`Estabilidade do alvo: -20; líder substituído.`);
        break;
      }
    }
    // Mesmo com sucesso, 30% chance de ser detectado (-reputação reduzida).
    if (rng.chance(0.30)) {
      const penalty = Math.round(SPY_REPUTATION_PENALTY[tipo] * 0.5);
      newState = adjustReputation(newState, state.playerCountryId, penalty, "espionagem detectada");
      efeitos.push(`Detectado! Reputação: ${penalty}`);
    }
    return {
      state: newState,
      resultado: {
        sucesso: true,
        mensagem: `Operação ${tipo} contra ${alvo.nome} bem-sucedida.`,
        efeitos,
      },
    };
  } else {
    // Falha: reputação cai completamente.
    const penalty = SPY_REPUTATION_PENALTY[tipo];
    newState = adjustReputation(newState, state.playerCountryId, penalty, "espionagem falhada");
    efeitos.push(`Falha! Reputação: ${penalty}`);
    return {
      state: newState,
      resultado: {
        sucesso: false,
        mensagem: `Operação ${tipo} contra ${alvo.nome} falhou e foi descoberta.`,
        efeitos,
      },
    };
  }
}

/** Lista de tipos de operação disponíveis (para UI). */
export const SPY_OPERATIONS: { tipo: SpyOperationType; label: string; custo: number; descricao: string }[] = [
  { tipo: "roubar_tech", label: "Roubar tecnologia", custo: SPY_COST.roubar_tech, descricao: "Copia uma tech do alvo (50% chance)." },
  { tipo: "sabotar_infra", label: "Sabotar infraestrutura", custo: SPY_COST.sabotar_infra, descricao: "PIB do alvo -1%." },
  { tipo: "subornar_oficial", label: "Subornar oficial", custo: SPY_COST.subornar_oficial, descricao: "Relação +15." },
  { tipo: "infiltrar_governo", label: "Infiltrar governo", custo: SPY_COST.infiltrar_governo, descricao: "Revela planos do alvo." },
  { tipo: "assassinar", label: "Assassinar líder", custo: SPY_COST.assassinar, descricao: "Estabilidade -20; líder substituído." },
];

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}
