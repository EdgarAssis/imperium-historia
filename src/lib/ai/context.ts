// src/lib/ai/context.ts
// buildContext(state): resume o GameState num bloco de texto curto que vai
// para o prompt do utilizador. Em vez de enviar o estado completo (caro),
// enviamos: data, país do jogador + stats principais, relações relevantes,
// guerras e tratados ativos, últimos 10 eventos.

import type { GameState } from "@/types";
import { formatDatePT } from "@/lib/state/date";

/**
 * Constrói o contexto a enviar à IA. Tudo em texto, sem JSON gigante.
 * Objectivo: ~1500–3000 caracteres, suficiente para a IA saber o que se passa.
 */
export function buildContext(state: GameState): string {
  const lines: string[] = [];
  lines.push(`DATA ATUAL: ${formatDatePT(state.dataAtual)} (turno ${state.turno})`);
  lines.push(`CENÁRIO: ${state.config.scenarioId}`);
  lines.push(`REALISMO: ${state.config.realism}`);
  lines.push("");

  // País do jogador
  if (state.playerCountryId && state.paises[state.playerCountryId]) {
    const p = state.paises[state.playerCountryId];
    lines.push("PAÍS DO JOGADOR:");
    lines.push(`- ${p.nome} (${p.id})`);
    lines.push(
      `  População: ${formatCompact(p.populacao)} | PIB: $${formatCompact(p.pib)} | Tesouro: $${formatCompact(p.tesouro)}`,
    );
    lines.push(`  Exército: ${p.exercito} | Estabilidade: ${p.estabilidade}/100 | Aprovação: ${p.aprovacao}/100`);
    lines.push(`  Regime: ${translateRegime(p.regime)}`);
  } else {
    lines.push("PAÍS DO JOGADOR: nenhum.");
  }
  lines.push("");

  // Outros países principais (top 10 por PIB, excluindo o jogador)
  const outras = Object.values(state.paises)
    .filter((p) => p.id !== state.playerCountryId)
    .sort((a, b) => b.pib - a.pib)
    .slice(0, 10);
  if (outras.length > 0) {
    lines.push("OUTROS PAÍSES RELEVANTES (top 10 por PIB):");
    for (const p of outras) {
      lines.push(
        `- ${p.nome} (${p.id}): PIB $${formatCompact(p.pib)} | Exército ${p.exercito} | Estab ${p.estabilidade} | Aprov ${p.aprovacao} | ${translateRegime(p.regime)}`,
      );
    }
    lines.push("");
  }

  // Relações relevantes: as do país do jogador + as mais extremas (hostis/aliadas)
  const relacoesJogador = state.playerCountryId
    ? state.relacoes.filter(
        (r) => r.a === state.playerCountryId || r.b === state.playerCountryId,
      )
    : [];
  if (relacoesJogador.length > 0) {
    lines.push("RELAÇÕES DO JOGADOR (valor -100..100):");
    for (const r of relacoesJogador) {
      const other = r.a === state.playerCountryId ? r.b : r.a;
      const otherCountry = state.paises[other];
      const otherName = otherCountry ? otherCountry.nome : other;
      lines.push(`- ${otherName} (${other}): ${r.valor > 0 ? "+" : ""}${r.valor}`);
    }
    lines.push("");
  }

  // Guerras ativas
  const guerrasAtivas = state.guerras.filter((g) => g.estado === "ativa");
  if (guerrasAtivas.length > 0) {
    lines.push("GUERRAS ATIVAS:");
    for (const g of guerrasAtivas) {
      const agressor = state.paises[g.agressor]?.nome ?? g.agressor;
      const defs = g.defensores.map((d) => state.paises[d]?.nome ?? d).join(", ");
      lines.push(
        `- ${agressor} (agressor) vs ${defs} | Início: ${g.inicio} | Províncias em disputa: ${g.provinciasDisputa.length}`,
      );
    }
    lines.push("");
  }

  // Tratados ativos
  const tratadosAtivos = state.tratados.filter((t) => !t.rompido);
  if (tratadosAtivos.length > 0) {
    lines.push("TRATADOS ATIVOS:");
    for (const t of tratadosAtivos) {
      const nomes = t.paises.map((id) => state.paises[id]?.nome ?? id).join(", ");
      lines.push(`- ${translateTreaty(t.tipo)}: ${nomes} (desde ${t.inicio})`);
    }
    lines.push("");
  }

  // Últimos 10 eventos
  const recentes = state.eventos.slice(-10);
  if (recentes.length > 0) {
    lines.push("ÚLTIMOS EVENTOS (mais antigo -> mais recente):");
    for (const e of recentes) {
      lines.push(`- [${e.turno}] ${e.titulo}: ${truncate(e.texto, 120)}`);
    }
  }

  return lines.join("\n");
}

// --- Helpers ---------------------------------------------------------------

function translateRegime(r: string): string {
  const map: Record<string, string> = {
    democracia: "Democracia",
    republica: "República",
    monarquia_constitucional: "Monarquia constitucional",
    autocracia: "Autocracia",
    regime_partido_unico: "Regime de partido único",
    teocracia: "Teocracia",
    junta_militar: "Junta militar",
    monarquia_absoluta: "Monarquia absoluta",
  };
  return map[r] ?? r;
}

function translateTreaty(t: string): string {
  const map: Record<string, string> = {
    alianca: "Aliança",
    comercio: "Comércio",
    nao_agressao: "Não-agressão",
    paz: "Paz",
  };
  return map[t] ?? t;
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
