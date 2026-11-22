// src/lib/engine/conquest.ts
// Fase 3 — 4 formas de conquista:
//   1. militar        — declarar guerra + resolver frentes + anexar (já existia;
//                        exposto aqui como função de alto nível)
//   2. rendicao       — país fraco cede províncias + indemnização sem guerra
//   3. pressao_popular — agitador financia revolta numa província desleal
//   4. diplomacia     — país rico compra província a país em crise
//
// Cada função devolve { state, resultado, mensagem }. São PURAS e determinísticas
// (usam RNG derivado da seed quando precisam de aleatório).
//
// Pré-condições (verificadas; se falham, devolvem `resultado = false` + motivo):
//   - Rendição: perdedor.estabilidade < 30 OU perdedor.exercito < 50% do vencedor
//   - Pressão popular: província.lealdade < 25 E cultura != cultura do país dono
//                      E agitador.pib > 5× província.pib
//   - Diplomacia: vendedor.tesouro < 0 OU vendedor.estabilidade < 30
//                 E comprador.tesouro >= preco
//
// Todas respeitam a regra de o país do jogador não poder ser alvo destas ações
// (excepto se for o próprio jogador a fazê-las — nesse caso, o alvo é IA).

import type { GameState, Country, GameEvent, ConquestMethod } from "@/types";
import { clampStat } from "./stability";
import { calculateCulturalAffinity } from "./culture";
import { rngForCountry } from "./rng";
import { REPUTATION_IMPACTS } from "@/lib/config/reputation-impacts";
import { adjustReputation } from "./reputation";

/** Resultado genérico de uma tentativa de conquista. */
export interface ConquestResult {
  state: GameState;
  /** True se a conquista foi efectuada. */
  resultado: boolean;
  /** Método usado (para registo). */
  metodo: ConquestMethod;
  /** Mensagem legível para o diário. */
  mensagem: string;
}

// ===========================================================================
// 1. RENDIÇÃO
// ===========================================================================

/** Termos de uma rendição: que províncias ceder e que indemnização pagar. */
export interface SurrenderTerms {
  /** IDs das províncias que o perdedor cede. */
  cederProvincias: string[];
  /** Indemnização em dólares (transferida do perdedor para o vencedor). */
  indemnizacoes: number;
}

/**
 * Conquista por rendição: o país `vencedorId` força o país `perdedorId` a ceder
 * território sem combate, baseado em disparidade de força.
 *
 * Pré-condições (todas têm de se verificar):
 *   - perdedor não é o país do jogador (proteção)
 *   - perdedor existe e não é o mesmo que vencedor
 *   - perdedor.estabilidade < 30 OU perdedor.exercito < 50% do vencedor.exercito
 *   - relação <= 0 (hostil/neutra — não se rende a aliados)
 *
 * Efeitos:
 *   - Transfere províncias cedidas ( countryId = vencedor )
 *   - Transfere indemnização do tesouro do perdedor para o vencedor (limitado ao tesouro do perdedor)
 *   - Reduz estabilidade do perdedor em 10 (humilhação)
 *   - Cria tratado de paz entre os dois
 *   - Evento no diário
 */
export function conquerBySurrender(
  state: GameState,
  vencedorId: string,
  perdedorId: string,
  terms: SurrenderTerms,
): ConquestResult {
  const vencedor = state.paises[vencedorId];
  const perdedor = state.paises[perdedorId];
  if (!vencedor || !perdedor) {
    return { state, resultado: false, metodo: "rendicao", mensagem: "País inexistente." };
  }
  if (vencedorId === perdedorId) {
    return { state, resultado: false, metodo: "rendicao", mensagem: "Não se pode render a si próprio." };
  }
  if (perdedor.donoJogador) {
    return { state, resultado: false, metodo: "rendicao", mensagem: "País do jogador não pode ser forçado a render-se." };
  }
  // Pré-condições: perdedor fraco.
  const fracoPorEstab = perdedor.estabilidade < 30;
  const fracoPorExercito = perdedor.exercito < vencedor.exercito * 0.5;
  if (!fracoPorEstab && !fracoPorExercito) {
    return {
      state,
      resultado: false,
      metodo: "rendicao",
      mensagem: `${perdedor.nome} não está suficientemente fraco para se render (estabilidade ${perdedor.estabilidade}, exército ${perdedor.exercito}).`,
    };
  }
  // Valida províncias.
  for (const pid of terms.cederProvincias) {
    const prov = state.provincias[pid];
    if (!prov) {
      return { state, resultado: false, metodo: "rendicao", mensagem: `Província inexistente: ${pid}` };
    }
    if (prov.countryId !== perdedorId) {
      return { state, resultado: false, metodo: "rendicao", mensagem: `Província ${pid} não pertence a ${perdedor.nome}.` };
    }
  }

  // Aplica: transfere províncias.
  const provincias = { ...state.provincias };
  for (const pid of terms.cederProvincias) {
    provincias[pid] = {
      ...provincias[pid],
      countryId: vencedorId,
      ocupadaPor: null,
      mesesOcupada: 0,
      // Lealdade inicial ao novo dono: baseada na afinidade cultural.
      lealdade: initialLoyaltyAfterConquest(provincias[pid], vencedor, state),
    };
  }

  // Aplica indemnização (limitada ao tesouro do perdedor).
  const indemnizacao = Math.max(0, Math.min(terms.indemnizacoes, perdedor.tesouro));
  const paises: GameState["paises"] = {
    ...state.paises,
    [perdedorId]: {
      ...perdedor,
      tesouro: perdedor.tesouro - indemnizacao,
      estabilidade: clampStat(perdedor.estabilidade - 10),
    },
    [vencedorId]: {
      ...vencedor,
      tesouro: vencedor.tesouro + indemnizacao,
    },
  };

  // Cria tratado de paz.
  const tratadoPaz = {
    id: `paz-rend-${state.turno.toString().padStart(4, "0")}-${state.tratados.length}`,
    tipo: "paz" as const,
    paises: [vencedorId, perdedorId],
    inicio: state.dataAtual,
    rompido: false,
  };
  const tratados = [...state.tratados, tratadoPaz];

  // Evento no diário.
  const eventos: GameEvent[] = [...state.eventos];
  eventos.push({
    id: `ev-rend-${state.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "diplomacia",
    titulo: `${perdedor.nome} rende-se a ${vencedor.nome}`,
    texto: `Sob pressão militar e política, ${perdedor.nome} aceitou ceder território a ${vencedor.nome} sem combate. ${terms.cederProvincias.length} província(s) transferida(s); indemnização de $${formatCompact(indemnizacao)}.`,
    efeitos: [
      `Cedidas: ${terms.cederProvincias.length} província(s)`,
      `Indemnização: $${formatCompact(indemnizacao)}`,
      `Estabilidade ${perdedor.nome}: -10`,
    ],
  });

  return {
    state: { ...state, provincias, paises, tratados, eventos },
    resultado: true,
    metodo: "rendicao",
    mensagem: `${perdedor.nome} rendeu-se e cedeu ${terms.cederProvincias.length} província(s).`,
  };
}

// ===========================================================================
// 2. PRESSÃO POPULAR
// ===========================================================================

/**
 * Conquista por pressão popular: o país `agitadorId` financia/orquestra uma
 * revolta numa província desleal do país `alvoId`, anexando-a se tiver
 * recursos económicos para "comprar" a lealdade da população.
 *
 * Pré-condições:
 *   - alvo não é o país do jogador
 *   - existe província `provinceId` pertencente a `alvoId`
 *   - província.lealdade < 25 (população descontente)
 *   - cultura da província != cultura do país dono (tensão étnica)
 *   - agitador.pib > 5 × província.pib (capacidade económica para financiar)
 *   - agitador.tesouro > 0.01 × agitador.pib (tem reservas)
 *
 * Efeitos:
 *   - Província muda de dono: countryId = agitadorId
 *   - Lealdade inicial ao agitador: 40 + afinidade cultural × 30
 *   - Tesouro do agitador -= 0.5 × província.pib (custo de suborno)
 *   - Estabilidade do alvo -= 5 (governo enfraquecido por perder território)
 *   - Relação alvo→agitador = -80 (hostilidade total)
 *   - 30% de chance de gerar guerra civil no alvo (estabilidade cai a < 20)
 *   - Evento no diário
 */
export function conquerByPopularPressure(
  state: GameState,
  agitadorId: string,
  alvoId: string,
  provinceId: string,
): ConquestResult {
  const agitador = state.paises[agitadorId];
  const alvo = state.paises[alvoId];
  if (!agitador || !alvo) {
    return { state, resultado: false, metodo: "pressao_popular", mensagem: "País inexistente." };
  }
  if (agitadorId === alvoId) {
    return { state, resultado: false, metodo: "pressao_popular", mensagem: "Não se pode pressionar a si próprio." };
  }
  if (alvo.donoJogador) {
    return { state, resultado: false, metodo: "pressao_popular", mensagem: "País do jogador não pode ser alvo de pressão popular." };
  }
  const prov = state.provincias[provinceId];
  if (!prov) {
    return { state, resultado: false, metodo: "pressao_popular", mensagem: `Província inexistente: ${provinceId}` };
  }
  if (prov.countryId !== alvoId) {
    return { state, resultado: false, metodo: "pressao_popular", mensagem: `Província ${provinceId} não pertence a ${alvo.nome}.` };
  }
  // Pré-condições.
  if ((prov.lealdade ?? 50) >= 25) {
    return {
      state,
      resultado: false,
      metodo: "pressao_popular",
      mensagem: `A população de ${prov.nome} está demasiado leal (${prov.lealdade ?? 50}/100) para se revoltar.`,
    };
  }
  // Cultura da província != cultura dominante do país dono.
  const alvoCulture = occupierCultureForCapital(state, alvoId);
  if (alvoCulture && prov.cultura && prov.cultura === alvoCulture) {
    return {
      state,
      resultado: false,
      metodo: "pressao_popular",
      mensagem: `A cultura da província (${prov.cultura}) é a mesma do governo central — não há tensão étnica aproveitável.`,
    };
  }
  if (agitador.pib <= 5 * prov.pib) {
    return {
      state,
      resultado: false,
      metodo: "pressao_popular",
      mensagem: `${agitador.nome} não tem economia suficiente (PIB $${formatCompact(agitador.pib)}) para financiar revolta numa província de PIB $${formatCompact(prov.pib)}.`,
    };
  }
  const custoMinimo = 0.5 * prov.pib;
  if (agitador.tesouro < custoMinimo) {
    return {
      state,
      resultado: false,
      metodo: "pressao_popular",
      mensagem: `${agitador.nome} não tem reservas suficientes no tesouro ($${formatCompact(agitador.tesouro)}) para custear a revolta ($${formatCompact(custoMinimo)}).`,
    };
  }

  // Afinidade cultural agitador↔província: determina lealdade inicial.
  const agitadorCulture = occupierCultureForCapital(state, agitadorId);
  const affinity = agitadorCulture && prov.cultura
    ? calculateCulturalAffinity(agitadorCulture, prov.cultura)
    : 0.3;
  const lealdadeInicial = Math.round(40 + affinity * 30); // 40-70

  // Aplica: muda dono da província, paga custo do tesouro.
  const provincias: GameState["provincias"] = {
    ...state.provincias,
    [provinceId]: {
      ...prov,
      countryId: agitadorId,
      ocupadaPor: null,
      mesesOcupada: 0,
      lealdade: lealdadeInicial,
    },
  };
  const paises: GameState["paises"] = {
    ...state.paises,
    [agitadorId]: {
      ...agitador,
      tesouro: agitador.tesouro - custoMinimo,
    },
    [alvoId]: {
      ...alvo,
      estabilidade: clampStat(alvo.estabilidade - 5),
    },
  };

  // Relação alvo→agitador cai para -80.
  const relacoes = adjustRelation(state.relacoes, alvoId, agitadorId, -80);

  // 30% de chance de o alvo entrar em colapso (estabilidade < 20)
  // se já estiver abaixo de 30.
  const rng = rngForCountry(state, `pressao-${alvoId}-${provinceId}`);
  const colapso = alvo.estabilidade < 30 && rng.chance(0.3);
  if (colapso) {
    paises[alvoId] = {
      ...paises[alvoId],
      estabilidade: clampStat(paises[alvoId].estabilidade - 15),
    };
  }

  // Evento no diário.
  const eventos: GameEvent[] = [...state.eventos];
  eventos.push({
    id: `ev-pressao-${state.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "politica",
    titulo: `Revolta popular em ${prov.nome}`,
    texto: `A província ${prov.nome} (lealdade ${prov.lealdade ?? 50}/100) revoltou-se contra ${alvo.nome} e juntou-se a ${agitador.nome}. Tensão étnica (${prov.cultura ?? "?"} vs ${alvoCulture ?? "?"}) e financiamento externo ($${formatCompact(custoMinimo)}) foram decisivos.`,
    efeitos: [
      `Província: ${prov.nome} → ${agitador.nome}`,
      `Custo: $${formatCompact(custoMinimo)}`,
      `Lealdade inicial: ${lealdadeInicial}/100 (afinidade cultural ${(affinity * 100).toFixed(0)}%)`,
      `Estabilidade ${alvo.nome}: -5${colapso ? " (colapso agravado!)" : ""}`,
      `Relação ${alvo.nome}→${agitador.nome}: -80`,
    ],
  });

  return {
    state: { ...state, provincias, paises, relacoes, eventos },
    resultado: true,
    metodo: "pressao_popular",
    mensagem: `${prov.nome} revoltou-se e juntou-se a ${agitador.nome}.`,
  };
}

// ===========================================================================
// 3. DIPLOMACIA (compra de província)
// ===========================================================================

/**
 * Conquista por diplomacia: o país `compradorId` compra a província ao país
 * `vendedorId`, pagando do seu tesouro. Só funciona se o vendedor estiver em
 * crise económica (tesouro < 0 OU estabilidade < 30).
 *
 * Pré-condições:
 *   - vendedor não é o país do jogador
 *   - província existe e pertence ao vendedor
 *   - vendedor.tesouro < 0 OU vendedor.estabilidade < 30
 *   - comprador.tesouro >= preco
 *   - relação comprador↔vendedor >= -50 (não inimigos declarados)
 *
 * Efeitos:
 *   - Província muda de dono: countryId = compradorId
 *   - Lealdade inicial ao comprador: 50 + afinidade cultural × 20
 *   - comprador.tesouro -= preco
 *   - vendedor.tesouro += preco
 *   - Relação comprador↔vendedor += 10 (boa vontade)
 *   - Evento no diário
 *
 * Custo recomendado: província.pib × 5 (mas caller pode passar outro valor).
 */
export function conquerByDiplomacy(
  state: GameState,
  compradorId: string,
  vendedorId: string,
  provinceId: string,
  preco: number,
): ConquestResult {
  const comprador = state.paises[compradorId];
  const vendedor = state.paises[vendedorId];
  if (!comprador || !vendedor) {
    return { state, resultado: false, metodo: "diplomacia", mensagem: "País inexistente." };
  }
  if (compradorId === vendedorId) {
    return { state, resultado: false, metodo: "diplomacia", mensagem: "Não se pode comprar a si próprio." };
  }
  if (vendedor.donoJogador) {
    return { state, resultado: false, metodo: "diplomacia", mensagem: "País do jogador não pode vender províncias." };
  }
  const prov = state.provincias[provinceId];
  if (!prov) {
    return { state, resultado: false, metodo: "diplomacia", mensagem: `Província inexistente: ${provinceId}` };
  }
  if (prov.countryId !== vendedorId) {
    return { state, resultado: false, metodo: "diplomacia", mensagem: `Província ${provinceId} não pertence a ${vendedor.nome}.` };
  }
  // Vendedor em crise.
  if (vendedor.tesouro >= 0 && vendedor.estabilidade >= 30) {
    return {
      state,
      resultado: false,
      metodo: "diplomacia",
      mensagem: `${vendedor.nome} não está em crise (tesouro $${formatCompact(vendedor.tesouro)}, estabilidade ${vendedor.estabilidade}) — não está disposto a vender.`,
    };
  }
  if (comprador.tesouro < preco) {
    return {
      state,
      resultado: false,
      metodo: "diplomacia",
      mensagem: `${comprador.nome} não tem tesouro suficiente ($${formatCompact(comprador.tesouro)}) para comprar por $${formatCompact(preco)}.`,
    };
  }
  const relacao = findRelationValue(state, compradorId, vendedorId);
  if (relacao < -50) {
    return {
      state,
      resultado: false,
      metodo: "diplomacia",
      mensagem: `Relação muito hostil (${relacao}) — ${vendedor.nome} recusa negociar com ${comprador.nome}.`,
    };
  }

  // Afinidade cultural comprador↔província: lealdade inicial.
  const compradorCulture = occupierCultureForCapital(state, compradorId);
  const affinity = compradorCulture && prov.cultura
    ? calculateCulturalAffinity(compradorCulture, prov.cultura)
    : 0.3;
  const lealdadeInicial = Math.round(50 + affinity * 20); // 50-70

  // Aplica.
  const provincias: GameState["provincias"] = {
    ...state.provincias,
    [provinceId]: {
      ...prov,
      countryId: compradorId,
      ocupadaPor: null,
      mesesOcupada: 0,
      lealdade: lealdadeInicial,
    },
  };
  const paises: GameState["paises"] = {
    ...state.paises,
    [compradorId]: { ...comprador, tesouro: comprador.tesouro - preco },
    [vendedorId]: { ...vendedor, tesouro: vendedor.tesouro + preco },
  };
  const relacoes = adjustRelation(state.relacoes, compradorId, vendedorId, +10);

  // Evento no diário.
  const eventos: GameEvent[] = [...state.eventos];
  eventos.push({
    id: `ev-diplo-${state.turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
    turno: state.turno,
    data: state.dataAtual,
    tipo: "diplomacia",
    titulo: `${comprador.nome} compra ${prov.nome} a ${vendedor.nome}`,
    texto: `Sob pressão económica, ${vendedor.nome} aceitou vender a província ${prov.nome} a ${comprador.nome} por $${formatCompact(preco)}. A transação foi registada como compra diplomática.`,
    efeitos: [
      `Província: ${prov.nome} → ${comprador.nome}`,
      `Preço: $${formatCompact(preco)}`,
      `Lealdade inicial: ${lealdadeInicial}/100 (afinidade ${(affinity * 100).toFixed(0)}%)`,
      `Relação ${comprador.nome}↔${vendedor.nome}: +10`,
    ],
  });

  return {
    state: { ...state, provincias, paises, relacoes, eventos },
    resultado: true,
    metodo: "diplomacia",
    mensagem: `${comprador.nome} comprou ${prov.nome} por $${formatCompact(preco)}.`,
  };
}

// ===========================================================================
// Helpers partilhados
// ===========================================================================

/** Devolve a cultura dominante do país (cultura da capital). */
function occupierCultureForCapital(state: GameState, countryId: string): string | undefined {
  const country = state.paises[countryId];
  if (!country || !country.capital) return undefined;
  return state.provincias[country.capital]?.cultura;
}

/** Lealdade inicial de uma província acabada de conquistar: 35 + afinidade × 30. */
function initialLoyaltyAfterConquest(prov: GameState["provincias"][string], conqueror: Country, state: GameState): number {
  const conquerorCulture = occupierCultureForCapital(state, conqueror.id);
  const affinity = conquerorCulture && prov.cultura
    ? calculateCulturalAffinity(conquerorCulture, prov.cultura)
    : 0.3;
  return Math.round(35 + affinity * 30); // 35-65
}

/** Procura o valor de relação bilateral (-100..100), ou 0 se não existir. */
function findRelationValue(state: GameState, a: string, b: string): number {
  for (const r of state.relacoes) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r.valor;
  }
  return 0;
}

/** Ajusta relação bilateral, criando-a se não existir. Devolve nova lista. */
function adjustRelation(relacoes: GameState["relacoes"], a: string, b: string, newValue: number): GameState["relacoes"] {
  let found = false;
  const clamped = clampInt(newValue, -100, 100);
  const result = relacoes.map((r) => {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
      found = true;
      return { ...r, valor: clamped };
    }
    return r;
  });
  if (!found) {
    result.push({ a, b, valor: clamped });
  }
  return result;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
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
