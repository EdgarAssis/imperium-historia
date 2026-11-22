// src/lib/engine/proxy-wars.ts
// Fase 8 — Guerra por procuração.
//
// Um país rico (sponsor) financia rebeldes num país-alvo, criando um país
// rebelde "{alvoId}-PR" (proxy) que entra em guerra civil com o alvo. Se o
// proxy vencer (alvo em colapso), anexa-se ao sponsor.
//
// Custo para o sponsor: 0.1% do PIB/mês (manutenção). Custo político: -5
// reputação mundial (ação subversiva).
//
// Limitações:
//   - Só pode criar 1 proxy por alvo (não duplicar).
//   - Alvo não pode ser o país do jogador.
//   - Sponsor precisa de PIB > 5× alvo e tesouro > 0.

import type { GameState, Country, War, GameEvent } from "@/types";
import { clampStat } from "./stability";
import { Rng, hashCombine, hashString } from "./rng";
import { adjustReputation } from "./reputation";

/** Resultado de uma tentativa de criação de proxy. */
export interface ProxyWarResult {
  state: GameState;
  /** True se o proxy foi criado com sucesso. */
  criado: boolean;
  /** Mensagem para o diário. */
  mensagem: string;
  /** ID do país-proxy criado (se criado). */
  proxyId: string | null;
}

/**
 * Cria um país-proxy (rebeldes apadrinhados) que entra em guerra civil com
 * o `alvoId`. O `sponsorId` paga custo económico e perde reputação.
 *
 * Pré-condições:
 *   - alvo não é o país do jogador
 *   - alvo e sponsor existem e são diferentes
 *   - sponsor.pib > 5 × alvo.pib
 *   - sponsor.tesouro > custo (0.1% do PIB anual)
 *   - não existe já proxy "{alvoId}-PR"
 *
 * Efeitos:
 *   - Cria país "{alvoId}-PR" (proxy) com ~25% do PIB/população do alvo
 *   - Cria guerra civil (proxy vs alvo) com frentes nas províncias
 *   - sponsor.tesouro -= custo; sponsor.reputacao -= 10
 *   - sponsor.proxies += proxyId
 *   - Evento no diário
 */
export function supportRebels(
  state: GameState,
  sponsorId: string,
  alvoId: string,
): ProxyWarResult {
  const sponsor = state.paises[sponsorId];
  const alvo = state.paises[alvoId];
  if (!sponsor || !alvo) {
    return { state, criado: false, mensagem: "País inexistente.", proxyId: null };
  }
  if (sponsorId === alvoId) {
    return { state, criado: false, mensagem: "Não se pode apadrinhar rebeldes em si próprio.", proxyId: null };
  }
  if (alvo.donoJogador) {
    return { state, criado: false, mensagem: "País do jogador não pode ser alvo de proxy war.", proxyId: null };
  }
  if (sponsor.pib <= alvo.pib * 5) {
    return {
      state,
      criado: false,
      mensagem: `${sponsor.nome} não tem economia suficiente (PIB $${formatCompact(sponsor.pib)}) para apadrinhar rebeldes no alvo (PIB $${formatCompact(alvo.pib)}). Requer PIB > 5× o do alvo.`,
      proxyId: null,
    };
  }
  const custo = sponsor.pib * 0.001; // 0.1% do PIB (anual)
  if (sponsor.tesouro < custo) {
    return {
      state,
      criado: false,
      mensagem: `${sponsor.nome} não tem tesouro suficiente ($${formatCompact(sponsor.tesouro)}) para custear proxy war ($${formatCompact(custo)}).`,
      proxyId: null,
    };
  }
  const proxyId = `${alvoId}-PR`;
  if (state.paises[proxyId]) {
    return {
      state,
      criado: false,
      mensagem: `Já existe um proxy activo (${proxyId}) no alvo.`,
      proxyId: null,
    };
  }

  // Lista de províncias do alvo.
  const provinciasAlvo = Object.values(state.provincias).filter((p) => p.countryId === alvoId);
  if (provinciasAlvo.length < 2) {
    return {
      state,
      criado: false,
      mensagem: `${alvo.nome} não tem províncias suficientes para se dividir.`,
      proxyId: null,
    };
  }

  // Proxy fica com ~25% das províncias do alvo (as mais desleais).
  const provinciasOrdenadas = [...provinciasAlvo].sort((a, b) => (a.lealdade ?? 50) - (b.lealdade ?? 50));
  const nProxyProv = Math.max(1, Math.ceil(provinciasAlvo.length * 0.25));
  const provinciasProxy = provinciasOrdenadas.slice(0, nProxyProv);

  // PIB/tropas/população do proxy = 25% do alvo.
  const proxyPib = alvo.pib * 0.25;
  const proxyTropas = Math.round(alvo.tropas * 0.25);
  const proxyPop = Math.round(alvo.populacao * 0.25);
  const proxyExercito = Math.round(alvo.exercito * 0.25);

  // ID determinístico para o país-proxy.
  const idRng = new Rng(
    hashCombine(
      hashCombine(state.config.seed, state.turno),
      hashString(`proxy-${sponsorId}-${alvoId}`),
    ),
  );
  void idRng;

  // Cor: invertida do alvo (distinguir no mapa).
  const corProxy = invertColor(alvo.cor);

  // Cria país-proxy.
  const proxyCountry: Country = {
    id: proxyId,
    nome: `${alvo.nome} (Rebeldes apadrinhados)`,
    cor: corProxy,
    capital: provinciasProxy[0]?.id ?? alvo.capital,
    populacao: proxyPop,
    pib: proxyPib,
    tesouro: alvo.tesouro * 0.25,
    exercito: proxyExercito,
    estabilidade: 35, // governo rebelde frágil
    aprovacao: 70, // apoiantes do rebelde
    regime: alvo.regime,
    donoJogador: false,
    orcamentoMilitar: Math.round(alvo.orcamentoMilitar * 0.25),
    tropas: proxyTropas,
    nuclear: false,
    blocos: [], // não herda blocos
    recursos: [...alvo.recursos],
    lider: "Líder rebelde",
    reputacao: -20, // perceção negativa (subversivo)
    refugiadosAcolhidos: 0,
    refugiadosGerados: 0,
  };

  // Transfere províncias para o proxy.
  const provincias: GameState["provincias"] = { ...state.provincias };
  for (const p of provinciasProxy) {
    provincias[p.id] = { ...p, countryId: proxyId, ocupadaPor: null };
  }

  // Cria guerra civil proxy vs alvo.
  const guerra: War = {
    id: `guerra-proxy-${state.turno.toString().padStart(4, "0")}-${state.guerras.length}`,
    agressor: proxyId,
    defensores: [alvoId],
    provinciasDisputa: provinciasProxy.map((p) => p.id),
    frentes: provinciasProxy.map((p) => ({
      provinceId: p.id,
      progresso: 0,
      ultimoDelta: 0,
    })),
    objetivo: "conquistar",
    estado: "ativa",
    inicio: state.dataAtual,
    indemnizacoes: 0,
    turnoFim: null,
  };

  // Aplica custo ao sponsor.
  const paises = {
    ...state.paises,
    [sponsorId]: {
      ...sponsor,
      tesouro: sponsor.tesouro - custo,
      proxies: [...(sponsor.proxies ?? []), proxyId],
    },
    [alvoId]: {
      ...alvo,
      pib: alvo.pib - proxyPib,
      populacao: alvo.populacao - proxyPop,
      exercito: alvo.exercito - proxyExercito,
      estabilidade: clampStat(alvo.estabilidade - 10),
    },
    [proxyId]: proxyCountry,
  };

  // Reduz reputação do sponsor (-10 ação subversiva).
  let newState: GameState = {
    ...state,
    paises,
    provincias,
    guerras: [...state.guerras, guerra],
  };
  newState = adjustReputation(newState, sponsorId, -10, "guerra por procuração");

  // Evento no diário.
  const eventos: GameEvent[] = [...newState.eventos];
  eventos.push({
    id: `ev-proxy-${state.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "guerra",
    titulo: `${sponsor.nome} apadrinha rebeldes em ${alvo.nome}`,
    texto: `${sponsor.nome} financiou uma insurgência armada em ${alvo.nome}. Um movimento rebelde proclamou governo rival e tomou o controlo de ${provinciasProxy.length} província(s). Guerra civil declarada.`,
    efeitos: [
      `Sponsor: ${sponsor.nome} (-$${formatCompact(custo)} tesouro, -10 reputação)`,
      `Alvo: ${alvo.nome} (-10 estabilidade, perdeu 25% PIB/população/exército)`,
      `Proxy: ${proxyCountry.nome} (${proxyId})`,
      `Províncias disputadas: ${provinciasProxy.length}`,
    ],
  });
  newState = { ...newState, eventos };

  return {
    state: newState,
    criado: true,
    mensagem: `${proxyCountry.nome} criado por ${sponsor.nome}; guerra civil com ${alvo.nome} iniciada.`,
    proxyId,
  };
}

/**
 * Processa proxies ativos: para cada proxy ainda vivo (em guerra civil),
 * mantém o custo mensal do sponsor (0.1% PIB). Se o proxy foi anexado/
 * desapareceu, remove da lista de proxies do sponsor.
 *
 * BLOCO B4 — Corte automático: se o tesouro do sponsor ficar negativo,
 * o apoio é cortado (proxy perde sustento, estabilidade cai) e é gerado aviso.
 *
 * Não resolve a guerra civil aqui — isso é feito pelo resolveWarTurn normal.
 */
export function processProxyWars(state: GameState): {
  state: GameState;
  eventos: { sponsorId: string; proxyId: string; custo: number; status: "ativo" | "terminado" | "cortado" }[];
} {
  const eventos: { sponsorId: string; proxyId: string; custo: number; status: "ativo" | "terminado" | "cortado" }[] = [];
  if (!state.playerCountryId) return { state, eventos };
  const paises = { ...state.paises };
  const temProxy = Object.values(paises).some((c) => (c.proxies ?? []).length > 0);
  if (!temProxy) return { state, eventos };

  for (const sponsorId of Object.keys(paises)) {
    const sponsor = paises[sponsorId];
    const proxiesActivos = sponsor.proxies ?? [];
    if (proxiesActivos.length === 0) continue;
    const novosProxies: string[] = [];
    for (const proxyId of proxiesActivos) {
      const proxy = paises[proxyId];
      if (!proxy) {
        eventos.push({ sponsorId, proxyId, custo: 0, status: "terminado" });
        continue;
      }
      const guerraAtiva = state.guerras.some(
        (g) => g.estado === "ativa" && g.agressor === proxyId,
      );
      if (!guerraAtiva) {
        eventos.push({ sponsorId, proxyId, custo: 0, status: "terminado" });
        continue;
      }
      // BLOCO B4 — Corte automático se tesouro negativo.
      if (sponsor.tesouro < 0) {
        // Corta apoio: proxy perde 20 estabilidade (sem financiamento).
        paises[proxyId] = {
          ...proxy,
          estabilidade: clampStat(proxy.estabilidade - 20),
        };
        eventos.push({ sponsorId, proxyId, custo: 0, status: "cortado" });
        // Não adiciona aos novosProxies (apoio cortado).
        continue;
      }
      // Custo mensal: 0.1% PIB / 12 (anual → mensal).
      const custoMensal = sponsor.pib * 0.001 / 12;
      paises[sponsorId] = {
        ...sponsor,
        tesouro: sponsor.tesouro - custoMensal,
      };
      novosProxies.push(proxyId);
      eventos.push({ sponsorId, proxyId, custo: custoMensal, status: "ativo" });
    }
    if (novosProxies.length !== proxiesActivos.length) {
      paises[sponsorId] = {
        ...paises[sponsorId],
        proxies: novosProxies,
      };
    }
  }

  return { state: { ...state, paises }, eventos };
}

/**
 * BLOCO A4 — Cancela o apoio a um proxy activo.
 * O proxy perde 25 estabilidade (sem sustento externo) mas a guerra civil continua.
 * O proxy é removido da lista de proxies do sponsor.
 */
export function cancelProxy(state: GameState, sponsorId: string, proxyId: string): {
  state: GameState;
  cancelado: boolean;
  mensagem: string;
} {
  const sponsor = state.paises[sponsorId];
  if (!sponsor) return { state, cancelado: false, mensagem: "Sponsor inexistente." };
  if (!(sponsor.proxies ?? []).includes(proxyId)) {
    return { state, cancelado: false, mensagem: "Proxy não pertence a este sponsor." };
  }
  const proxy = state.paises[proxyId];
  const paises = { ...state.paises };
  // Remove proxy da lista do sponsor.
  paises[sponsorId] = {
    ...sponsor,
    proxies: (sponsor.proxies ?? []).filter((p) => p !== proxyId),
  };
  // Proxy perde estabilidade (sem financiamento).
  if (proxy) {
    paises[proxyId] = {
      ...proxy,
      estabilidade: clampStat(proxy.estabilidade - 25),
    };
  }
  // Adiciona evento ao diário.
  const eventos = [...state.eventos];
  eventos.push({
    id: `ev-proxy-cancel-${state.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "guerra",
    titulo: `Apoio a ${proxy?.nome ?? proxyId} cancelado`,
    texto: `${sponsor.nome} cancelou o apoio financeiro a ${proxy?.nome ?? proxyId}. O proxy perde 25 pontos de estabilidade por falta de financiamento externo.`,
    efeitos: [`Sponsor: ${sponsor.nome}`, `Proxy: ${proxyId}`, `Estabilidade do proxy: -25`],
  });
  return {
    state: { ...state, paises, eventos },
    cancelado: true,
    mensagem: `Apoio a ${proxy?.nome ?? proxyId} cancelado.`,
  };
}

// --- Helpers ---------------------------------------------------------------

/** Inverte um hex #RRGGBB para o complementar (distinguir proxy no mapa). */
function invertColor(hex: string): string {
  const match = /^#?([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) return "#888888";
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  const newR = Math.round(255 - r * 0.5);
  const newG = Math.round(255 - g * 0.5);
  const newB = Math.round(255 - b * 0.5);
  return `#${pad(newR)}${pad(newG)}${pad(newB)}`;
}

function pad(n: number): string {
  return n.toString(16).padStart(2, "0");
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
