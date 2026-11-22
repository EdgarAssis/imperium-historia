// src/lib/engine/tech-tree.ts
// Fase 10 — Árvore tecnológica.
//
// ~20 techs em 5 categorias (militar, economia, saude, ciber, energia).
// O jogador pesquisa uma tech de cada vez; cada uma custa tesouro + turnos.
// Quando desbloqueada, aplica bónus permanentes ao país.

import type { GameState, TechNode, ResearchState } from "@/types";

/** Biblioteca de tecnologias disponíveis. */
export const TECH_TREE: readonly TechNode[] = [
  // Economia
  { id: "tech-industria", nome: "Indústria Avançada", descricao: "Aumenta crescimento do PIB em 0.5%/mês.", categoria: "economia", custo: 5_000_000_000, turnosPesquisa: 6, prereqs: [], bonus: "+0.5% crescimento PIB" },
  { id: "tech-financas", nome: "Mercados Financeiros", descricao: "Receita fiscal +10%.", categoria: "economia", custo: 8_000_000_000, turnosPesquisa: 8, prereqs: ["tech-industria"], bonus: "+10% receita fiscal" },
  { id: "tech-multiplicadoras", nome: "Multinacionais Globais", descricao: "Atrai 50% mais multinacionais.", categoria: "economia", custo: 12_000_000_000, turnosPesquisa: 12, prereqs: ["tech-financas"], bonus: "+50% attractividade" },
  // Militar
  { id: "tech-armas", nome: "Armas de Precisão", descricao: "Exército +5%.", categoria: "militar", custo: 6_000_000_000, turnosPesquisa: 6, prereqs: [], bonus: "+5% exército" },
  { id: "tech-defesa", nome: "Defesa Antimíssil", descricao: "Reduz perdas em guerra em 20%.", categoria: "militar", custo: 10_000_000_000, turnosPesquisa: 10, prereqs: ["tech-armas"], bonus: "-20% perdas guerra" },
  { id: "tech-nuclear", nome: "Armas Nucleares Tácticas", descricao: "Permite desenvolvimento nuclear (se não tiver).", categoria: "militar", custo: 20_000_000_000, turnosPesquisa: 18, prereqs: ["tech-defesa"], bonus: "Capacidade nuclear" },
  // Saúde
  { id: "tech-saude-publica", nome: "Saúde Pública", descricao: "Estabilidade +3/mês.", categoria: "saude", custo: 4_000_000_000, turnosPesquisa: 5, prereqs: [], bonus: "+3 estabilidade/mês" },
  { id: "tech-medicina", nome: "Medicina Avançada", descricao: "Aprovação +5/mês.", categoria: "saude", custo: 7_000_000_000, turnosPesquisa: 8, prereqs: ["tech-saude-publica"], bonus: "+5 aprovação/mês" },
  { id: "tech-biotecnologia", nome: "Biotecnologia", descricao: "Aumenta PIB +0.3%/mês via farma.", categoria: "saude", custo: 15_000_000_000, turnosPesquisa: 14, prereqs: ["tech-medicina"], bonus: "+0.3% PIB/mês" },
  // Cibersegurança
  { id: "tech-ciber", nome: "Ciberdefesa", descricao: "Reduz sucesso de espionagem contra ti em 30%.", categoria: "ciber", custo: 5_000_000_000, turnosPesquisa: 6, prereqs: [], bonus: "-30% espionagem inimiga" },
  { id: "tech-ciber-ofensiva", nome: "Ciberataque", descricao: "Espionagem ofensiva +20% sucesso.", categoria: "ciber", custo: 8_000_000_000, turnosPesquisa: 8, prereqs: ["tech-ciber"], bonus: "+20% espionagem própria" },
  { id: "tech-ia", nome: "Inteligência Artificial", descricao: "Todos os bónus de pesquisa +25%.", categoria: "ciber", custo: 25_000_000_000, turnosPesquisa: 20, prereqs: ["tech-ciber-ofensiva"], bonus: "+25% velocidade pesquisa" },
  // Energia
  { id: "tech-renovaveis", nome: "Energias Renováveis", descricao: "Receita +5% (exportação de tecnologia).", categoria: "energia", custo: 6_000_000_000, turnosPesquisa: 7, prereqs: [], bonus: "+5% receita" },
  { id: "tech-nuclear-civil", nome: "Energia Nuclear Civil", descricao: "PIB +0.4%/mês (energia barata).", categoria: "energia", custo: 12_000_000_000, turnosPesquisa: 12, prereqs: ["tech-renovaveis"], bonus: "+0.4% PIB/mês" },
  { id: "tech-fusao", nome: "Fusão Nuclear", descricao: "PIB +1%/mês (revolução energética).", categoria: "energia", custo: 30_000_000_000, turnosPesquisa: 24, prereqs: ["tech-nuclear-civil", "tech-ia"], bonus: "+1% PIB/mês" },
];

/** Devolve uma tech pelo ID. */
export function getTech(techId: string): TechNode | null {
  return TECH_TREE.find((t) => t.id === techId) ?? null;
}

/** Lista de techs disponíveis para pesquisa (prereqs satisfeitos, não desbloqueadas). */
export function availableTechs(state: GameState): TechNode[] {
  const desbloqueadas = new Set(state.pesquisa.desbloqueadas);
  return TECH_TREE.filter((t) => {
    if (desbloqueadas.has(t.id)) return false;
    // Verifica prereqs.
    return t.prereqs.every((prereq) => desbloqueadas.has(prereq));
  });
}

/**
 * Inicia a pesquisa de uma tech.
 * Pré-condições:
 *   - tech existe
 *   - prereqs satisfeitos
 *   - não há pesquisa em curso
 *   - tesouro >= custo
 */
export function startResearch(
  state: GameState,
  techId: string,
): { state: GameState; ok: boolean; mensagem: string } {
  if (!state.playerCountryId) {
    return { state, ok: false, mensagem: "Sem país do jogador." };
  }
  if (state.pesquisa.emPesquisa !== null) {
    return { state, ok: false, mensagem: `Já há pesquisa em curso: ${state.pesquisa.emPesquisa}.` };
  }
  const tech = getTech(techId);
  if (!tech) {
    return { state, ok: false, mensagem: `Tech inexistente: ${techId}.` };
  }
  const desbloqueadas = new Set(state.pesquisa.desbloqueadas);
  if (desbloqueadas.has(techId)) {
    return { state, ok: false, mensagem: `${tech.nome} já está desbloqueada.` };
  }
  // Verifica prereqs.
  for (const prereq of tech.prereqs) {
    if (!desbloqueadas.has(prereq)) {
      const prereqTech = getTech(prereq);
      return { state, ok: false, mensagem: `Pré-requisito em falta: ${prereqTech?.nome ?? prereq}.` };
    }
  }
  const player = state.paises[state.playerCountryId];
  if (player.tesouro < tech.custo) {
    return { state, ok: false, mensagem: `Tesouro insuficiente ($${formatCompact(player.tesouro)} < $${formatCompact(tech.custo)}).` };
  }
  // Paga custo e inicia pesquisa.
  return {
    state: {
      ...state,
      paises: {
        ...state.paises,
        [state.playerCountryId]: { ...player, tesouro: player.tesouro - tech.custo },
      },
      pesquisa: {
        ...state.pesquisa,
        emPesquisa: techId,
        turnosRestantes: tech.turnosPesquisa,
      },
    },
    ok: true,
    mensagem: `Pesquisa iniciada: ${tech.nome} (${tech.turnosPesquisa} meses).`,
  };
}

/**
 * Processa a pesquisa em curso: decrementa turnos restantes; se chegar a 0,
 * desbloqueia a tech. Devolve novo estado + eventos.
 */
export function processResearch(state: GameState): {
  state: GameState;
  eventos: { tipo: "tech_completa" | "tech_progresso"; techId: string; techNome: string }[];
} {
  const eventos: { tipo: "tech_completa" | "tech_progresso"; techId: string; techNome: string }[] = [];
  if (state.pesquisa.emPesquisa === null) return { state, eventos: [] };
  const tech = getTech(state.pesquisa.emPesquisa);
  if (!tech) {
    // Tech inválida — limpa.
    return {
      state: { ...state, pesquisa: { ...state.pesquisa, emPesquisa: null, turnosRestantes: 0 } },
      eventos: [],
    };
  }
  const novosTurnos = state.pesquisa.turnosRestantes - 1;
  if (novosTurnos <= 0) {
    // Completa.
    const novasDesbloqueadas = [...state.pesquisa.desbloqueadas, tech.id];
    eventos.push({ tipo: "tech_completa", techId: tech.id, techNome: tech.nome });
    return {
      state: {
        ...state,
        pesquisa: {
          desbloqueadas: novasDesbloqueadas,
          emPesquisa: null,
          turnosRestantes: 0,
        },
      },
      eventos,
    };
  }
  // Progresso.
  return {
    state: {
      ...state,
      pesquisa: { ...state.pesquisa, turnosRestantes: novosTurnos },
    },
    eventos: [{ tipo: "tech_progresso", techId: tech.id, techNome: tech.nome }],
  };
}

/** Aplica bónus das techs desbloqueadas ao país do jogador (chamado no motor mensal). */
export function applyTechBonuses(state: GameState): GameState {
  if (!state.playerCountryId) return state;
  const player = state.paises[state.playerCountryId];
  if (!player) return state;
  const desbloqueadas = new Set(state.pesquisa.desbloqueadas);
  let pibBonus = 0;
  let estabBonus = 0;
  let aprovBonus = 0;
  for (const tech of TECH_TREE) {
    if (!desbloqueadas.has(tech.id)) continue;
    switch (tech.id) {
      case "tech-industria": pibBonus += 0.005; break;
      case "tech-biotecnologia": pibBonus += 0.003; break;
      case "tech-nuclear-civil": pibBonus += 0.004; break;
      case "tech-fusao": pibBonus += 0.01; break;
      case "tech-saude-publica": estabBonus += 3; break;
      case "tech-medicina": aprovBonus += 5; break;
    }
  }
  if (pibBonus === 0 && estabBonus === 0 && aprovBonus === 0) return state;
  const novoPib = player.pib * (1 + pibBonus);
  const novaEstab = Math.min(100, player.estabilidade + estabBonus);
  const novaAprov = Math.min(100, player.aprovacao + aprovBonus);
  return {
    ...state,
    paises: {
      ...state.paises,
      [state.playerCountryId]: {
        ...player,
        pib: novoPib,
        estabilidade: novaEstab,
        aprovacao: novaAprov,
      },
    },
  };
}

/** Estado de pesquisa inicial (vazio). */
export function emptyResearchState(): ResearchState {
  return { desbloqueadas: [], emPesquisa: null, turnosRestantes: 0 };
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
