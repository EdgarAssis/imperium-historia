// src/lib/engine/news.ts
// Fase 10 — Notícias dinâmicas.
//
// Gera notícias baseadas em eventos do mundo (guerras, golpes, mudanças económicas).
// As notícias são diferentes dos eventos do diário: são mais curtas e focam-se
// em países IA (não no jogador) para dar contexto de mundo vivo.

import type { GameState, NewsItem } from "@/types";
import { Rng, hashCombine, hashString } from "./rng";
import { rankByGdp } from "./ranking";
import { rankByMilitaryStrength as rankByFM } from "./metrics";

/**
 * Gera 1-3 notícias dinâmicas por turno, baseadas em:
 *   - Guerras activas (países IA)
 *   - Golpes recentes
 *   - Mudanças no ranking
 *   - Eventos económicos extremos
 */
export function generateNews(state: GameState): NewsItem[] {
  if (!state.playerCountryId) return [];
  const rng = new Rng(hashCombine(state.config.seed, hashString(`news-${state.turno}`)));
  const noticias: NewsItem[] = [];

  // 1. Notícia sobre guerras activas (excluindo o jogador).
  const guerrasIA = state.guerras.filter(
    (g) => g.estado === "ativa" &&
      g.agressor !== state.playerCountryId &&
      !g.defensores.includes(state.playerCountryId)
  );
  if (guerrasIA.length > 0 && rng.chance(0.6)) {
    const guerra = guerrasIA[Math.floor(rng.next() * guerrasIA.length)];
    const agressor = state.paises[guerra.agressor]?.nome ?? guerra.agressor;
    const defensor = state.paises[guerra.defensores[0]]?.nome ?? guerra.defensores[0];
    const progressoMedio = guerra.frentes.length > 0
      ? guerra.frentes.reduce((s, f) => s + f.progresso, 0) / guerra.frentes.length
      : 50;
    noticias.push({
      id: `news-war-${state.turno}-${noticias.length}`,
      turno: state.turno,
      data: state.dataAtual,
      categoria: "guerra",
      titulo: `Frente de batalha: ${agressor} vs ${defensor}`,
      texto: progressoMedio > 70
        ? `${agressor} está a ganhar terreno contra ${defensor} (progresso médio ${progressoMedio.toFixed(0)}%).`
        : progressoMedio < 30
          ? `${defensor} resistiu ao avanço de ${agressor} (progresso ${progressoMedio.toFixed(0)}%).`
          : `Guerra entre ${agressor} e ${defensor} continua estagnada (progresso ${progressoMedio.toFixed(0)}%).`,
      countryId: guerra.agressor,
    });
  }

  // 2. Notícia sobre ranking (top económico ou militar).
  if (rng.chance(0.3)) {
    const topPib = rankByGdp(state, 1)[0];
    if (topPib && topPib.id !== state.playerCountryId) {
      noticias.push({
        id: `news-rank-${state.turno}-${noticias.length}`,
        turno: state.turno,
        data: state.dataAtual,
        categoria: "economia",
        titulo: `${topPib.nome} lidera economia mundial`,
        texto: `${topPib.nome} mantém-se como maior economia do mundo com PIB de $${formatCompact(topPib.pib)}.`,
        countryId: topPib.id,
      });
    }
  }

  // 3. Notícia sobre golpes recentes (eventos de política no último turno).
  const golpesRecentes = state.eventos.filter(
    (e) => e.turno === state.turno && e.tipo === "politica" && e.titulo.includes("Golpe")
  );
  for (const golpe of golpesRecentes.slice(0, 1)) {
    noticias.push({
      id: `news-coup-${state.turno}-${noticias.length}`,
      turno: state.turno,
      data: state.dataAtual,
      categoria: "politica",
      titulo: golpe.titulo,
      texto: golpe.texto,
    });
  }

  // 4. Notícia sobre multinacionais (instalações recentes).
  const multsRecentes = state.multinacionais.filter((m) => m.turnoInstalacao === state.turno);
  if (multsRecentes.length > 0) {
    const mult = multsRecentes[0];
    const paisOp = state.paises[mult.paisOperacao]?.nome ?? mult.paisOperacao;
    noticias.push({
      id: `news-mult-${state.turno}-${noticias.length}`,
      turno: state.turno,
      data: state.dataAtual,
      categoria: "economia",
      titulo: `${mult.nome} instala-se em ${paisOp}`,
      texto: `A multinacional ${mult.nome} (sector: ${mult.sector}) abriu operações em ${paisOp}, criando ${mult.empregados} empregos.`,
      countryId: mult.paisOperacao,
    });
  }

  // 5. Notícia sobre refugiados (se houve fluxos este turno).
  const refugRecentes = state.refugiadosFluxos.filter((f) => f.turno === state.turno);
  if (refugRecentes.length > 0) {
    const fluxo = refugRecentes[0];
    const origem = state.paises[fluxo.origem]?.nome ?? fluxo.origem;
    const destino = state.paises[fluxo.destino]?.nome ?? fluxo.destino;
    noticias.push({
      id: `news-refug-${state.turno}-${noticias.length}`,
      turno: state.turno,
      data: state.dataAtual,
      categoria: "mundo",
      titulo: `Crise de refugiados: ${origem} → ${destino}`,
      texto: `${formatNumber(fluxo.numero)} refugiados de ${origem} procuraram asilo em ${destino}.`,
      countryId: fluxo.origem,
    });
  }

  // 6. Notícia aleatória de fundo (contexto mundial).
  if (noticias.length < 2 && rng.chance(0.4)) {
    const topForca = rankByFM(state, 1)[0];
    if (topForca) {
      noticias.push({
        id: `news-bg-${state.turno}-${noticias.length}`,
        turno: state.turno,
        data: state.dataAtual,
        categoria: "mundo",
        titulo: `${topForca.nome} reforça militarmente`,
        texto: `${topForca.nome} mantém a maior força militar do mundo, com orçamento de $${formatCompact(topForca.orcamentoMilitar)} anual.`,
        countryId: topForca.id,
      });
    }
  }

  return noticias;
}

/**
 * Processa notícias: gera novas e adiciona ao histórico (máx. 50).
 * Chamado pelo motor mensal.
 */
export function processNews(state: GameState): {
  state: GameState;
  novasNoticias: NewsItem[];
} {
  const novas = generateNews(state);
  if (novas.length === 0) return { state, novasNoticias: [] };
  const noticias = [...state.noticias, ...novas].slice(-50);
  return {
    state: { ...state, noticias },
    novasNoticias: novas,
  };
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)} MM`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}
