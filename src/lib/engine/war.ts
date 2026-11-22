// src/lib/engine/war.ts
// Lógica de guerra: declarar, resolver turno por frente, assinar paz.
// Resultados do combate vêm do motor (com seed); o narrador apenas conta.
//
// Factores por frente:
//   - força militar do agressor vs defensor
//   - economia (PIB) — sustenta o esforço de guerra
//   - moral (estabilidade)
//   - apoio de aliados (tratados ativos)
//   - factor aleatório com seed (reprodutível)
//
// Guerras longas desgastam estabilidade e economia dos dois lados.

import type { Country, GameState, War, WarFront, WarObjective } from "@/types";
import { Rng, rngForCountry } from "./rng";
import { clampStat } from "./stability";
import { annexCountry, findAnnexableCountry } from "./annex";
import { calculateCulturalAffinity } from "./culture";
import { REPUTATION_IMPACTS } from "@/lib/config/reputation-impacts";
import { adjustReputation } from "./reputation";

/** Limite de progresso por frente (0–100). */
const MAX_PROGRESS = 100;
/** Delta máximo por turno por frente. */
const MAX_FRONT_DELTA = 10;

/**
 * Declara guerra. Verifica: países existem, não há tratado de paz/nao_agressao ativo,
 * não há guerra já ativa com o mesmo par.
 * Se válido, cria a guerra + frentes (uma por província disputada).
 * Também rompe tratados relevantes e ajusta relações.
 */
export function declareWar(
  state: GameState,
  agressorId: string,
  defensores: string[],
  provinciasDisputa: string[],
  objetivo: WarObjective = "conquistar",
): { state: GameState; war: War | null; motivo: string } {
  // Validações.
  if (!state.paises[agressorId]) {
    return { state, war: null, motivo: `Agressor inexistente: ${agressorId}` };
  }
  for (const d of defensores) {
    if (!state.paises[d]) {
      return { state, war: null, motivo: `Defensor inexistente: ${d}` };
    }
  }
  for (const p of provinciasDisputa) {
    const prov = state.provincias[p];
    if (!prov) {
      return { state, war: null, motivo: `Província disputada inexistente: ${p}` };
    }
    // A província deve pertencer a um dos defensores (ou ao agressor, em guerra total).
    if (!defensores.includes(prov.countryId) && prov.countryId !== agressorId) {
      return { state, war: null, motivo: `Província ${p} não pertence a nenhum dos defensores` };
    }
  }
  // Verifica duplicação.
  const existe = state.guerras.some(
    (g) =>
      g.estado === "ativa" &&
      g.agressor === agressorId &&
      defensores.every((d) => g.defensores.includes(d)),
  );
  if (existe) {
    return { state, war: null, motivo: "Já existe guerra ativa entre estes países" };
  }
  // Verifica tratado de não-agressão/paz ativo entre as partes.
  const bloqueia = state.tratados.some(
    (t) =>
      !t.rompido &&
      (t.tipo === "nao_agressao" || t.tipo === "paz") &&
      t.paises.includes(agressorId) &&
      defensores.some((d) => t.paises.includes(d)),
  );
  if (bloqueia) {
    return { state, war: null, motivo: "Existe tratado de não-agressão/paz ativo — deve ser rompido primeiro" };
  }

  // Cria guerra + frentes.
  const frentes: WarFront[] = provinciasDisputa.map((pid) => ({
    provinceId: pid,
    progresso: 0,
    ultimoDelta: 0,
  }));
  const war: War = {
    id: `guerra-${state.turno.toString().padStart(4, "0")}-${state.guerras.length}`,
    agressor: agressorId,
    defensores: [...defensores],
    provinciasDisputa: [...provinciasDisputa],
    frentes,
    objetivo,
    estado: "ativa",
    inicio: state.dataAtual,
    indemnizacoes: 0,
    turnoFim: null,
  };

  // Rompe tratados entre as partes (alianças/comércio são suspensas).
  const tratados = state.tratados.map((t) => {
    if (t.rompido) return t;
    if (!t.paises.includes(agressorId)) return t;
    if (!defensores.some((d) => t.paises.includes(d))) return t;
    return { ...t, rompido: true };
  });

  // Deteriora relações agressor↔defensores para -50 (hostilidade).
  const novosIds = new Set([agressorId, ...defensores]);
  const relacoes = state.relacoes.map((r) => {
    if (!novosIds.has(r.a) || !novosIds.has(r.b)) return r;
    if (r.a === agressorId || r.b === agressorId) {
      return { ...r, valor: Math.min(r.valor, -50) };
    }
    return r;
  });

  // Reduz estabilidade do agressor (declarar guerra tem custo político).
  const agressor = state.paises[agressorId];
  const paises = {
    ...state.paises,
    [agressorId]: {
      ...agressor,
      estabilidade: clampStat(agressor.estabilidade - 3),
    },
  };

  // BLOCO B5 — Impacto imediato de reputação: declarar guerra = -8.
  let newState: GameState = {
    ...state, guerras: [...state.guerras, war], tratados, relacoes, paises,
  };
  newState = adjustReputation(newState, agressorId, REPUTATION_IMPACTS.declarar_guerra, "declarar guerra");

  return {
    state: newState,
    war,
    motivo: "Guerra declarada com sucesso",
  };
}

/**
 * Resolve UM turno de guerra para todas as frentes ativas.
 * Devolve um novo estado com frentes actualizadas + danos económicos/estabilidade.
 * Também detecta vitórias/derrotas e marca guerras terminadas se uma frente
 * atinge progresso 100 (conquista) ou 0 após ter estado alta.
 */
export function resolveWarTurn(state: GameState): {
  state: GameState;
  eventos: { warId: string; provinceId: string; delta: number; conquered: boolean }[];
} {
  if (state.guerras.length === 0) {
    return { state, eventos: [] };
  }

  const eventos: { warId: string; provinceId: string; delta: number; conquered: boolean }[] = [];
  const paises = { ...state.paises };
  const provincias = { ...state.provincias };
  let relacoes = state.relacoes.map((r) => ({ ...r }));

  const guerras = state.guerras.map((war) => {
    if (war.estado !== "ativa") return war;

    const agressor = paises[war.agressor];
    if (!agressor) {
      // Agressor desapareceu — termina guerra (fantasma).
      return { ...war, estado: "terminada" as const, turnoFim: state.turno };
    }
    const defensorId = war.defensores[0]; // por simplicidade, defensor principal
    const defensor = paises[defensorId];
    if (!defensor) {
      return { ...war, estado: "terminada" as const, turnoFim: state.turno };
    }

    // Apoio de aliados: cada país com aliança ativa com o defensor dá +5% ao defensor.
    const aliadosDefensor = countAllies(state, defensorId, war.agressor);
    const aliadosAgressor = countAllies(state, war.agressor, defensorId);

    // Desgaste económico: -0.5% do PIB por turno ativo, ambos os lados.
    paises[war.agressor] = {
      ...paises[war.agressor],
      pib: Math.max(1, agressor.pib * 0.995),
      estabilidade: clampStat(agressor.estabilidade - 0.5),
    };
    paises[defensorId] = {
      ...paises[defensorId],
      pib: Math.max(1, defensor.pib * 0.995),
      estabilidade: clampStat(defensor.estabilidade - 0.8), // defensor desgasta mais
    };

    // Resolve cada frente.
    const novasFrentes = war.frentes.map((f) => {
      const rng = rngForCountry(state, `${war.id}-${f.provinceId}`);
      const provDisputada = provincias[f.provinceId];
      // Cultura do agressor (capital) — para bónus de revolta local.
      const agressorCulture = state.paises[war.agressor]?.capital
        ? state.provincias[state.paises[war.agressor].capital as string]?.cultura
        : undefined;
      const delta = calculateFrontOutcome(
        agressor,
        defensor,
        f,
        aliadosAgressor,
        aliadosDefensor,
        rng,
        provDisputada,
        agressorCulture,
      );
      let novoProgresso = f.progresso + delta;
      novoProgresso = clampInt(novoProgresso, 0, MAX_PROGRESS);
      const conquered = novoProgresso >= MAX_PROGRESS;
      // Se conquistada, muda o dono da província. Mantém lealdade actual
      // (será ajustada pelo applyOccupationResistance se cultura diferente).
      if (conquered) {
        const prov = provincias[f.provinceId];
        if (prov) {
          provincias[f.provinceId] = {
            ...prov,
            countryId: war.agressor,
            ocupadaPor: null,
            mesesOcupada: 0,
          };
        }
      }
      eventos.push({
        warId: war.id,
        provinceId: f.provinceId,
        delta,
        conquered,
      });
      return { ...f, progresso: novoProgresso, ultimoDelta: delta };
    });

    // Verifica se a guerra terminou: todas as frentes conquistadas (vitória do agressor)
    // OU frentes zeradas após o agressor estar em colapso.
    const todasConquistadas = war.frentes.length > 0 && novasFrentes.every((f) => f.progresso >= MAX_PROGRESS);
    const agressorDesgastado = paises[war.agressor].estabilidade <= 0;
    if (todasConquistadas || agressorDesgastado) {
      // Marca como terminada (vitória do agressor ou colapso).
      return {
        ...war,
        frentes: novasFrentes,
        estado: "terminada" as const,
        turnoFim: state.turno,
      };
    }

    // Aplica penalizações de relação para baixo com todos os signatários (desgaste prolongado).
    return { ...war, frentes: novasFrentes };
  });

  let finalState: GameState = {
    ...state,
    guerras,
    paises,
    provincias,
    relacoes,
  };

  // Verifica se algum país perdeu todas as províncias — se sim, anexa ao
  // agressor da guerra que o derrotou. Repete até não haver mais anexações.
  // Isto evita guerras «fantasma» com países sem território.
  let iteracoes = 0;
  while (iteracoes < 10) {
    const annexable = findAnnexableCountry(finalState);
    if (!annexable) break;
    const result = annexCountry(finalState, annexable.vencedorId, annexable.perdedorId, {
      motivo: "perda de todas as províncias em guerra",
    });
    if (!result.anexado) break;
    finalState = result.state;
    iteracoes++;
  }

  return {
    state: finalState,
    eventos,
  };
}

/**
 * Calcula o resultado de uma frente (delta em pontos, -10 a +10).
 * Positivo = agressor avança; negativo = defensor repeliu.
 *
 * Fase 4 — cultura: se a província disputada tem cultura diferente do
 * defensor e aparentada com a do agressor, a população local ajuda o invasor
 * (bónus até +3); se a cultura é a mesma do defensor, resistência local dá
 * bónus defensivo de até +3 ao defensor.
 */
export function calculateFrontOutcome(
  agressor: Country,
  defensor: Country,
  frente: WarFront,
  aliadosAgressor: number,
  aliadosDefensor: number,
  rng: Rng,
  provDisputada?: GameState["provincias"][string],
  agressorCulture?: string,
): number {
  // Poder militar (exército) + economia (PIB/12 = esforço mensal).
  const poderAgressor =
    agressor.exercito * 0.6 +
    (agressor.pib / 1e12) * 0.4 + // PIB normalizado em triliões
    aliadosAgressor * 5;
  const poderDefensor =
    defensor.exercito * 0.6 +
    (defensor.pib / 1e12) * 0.4 +
    aliadosDefensor * 5 +
    // Bonus defensivo: 30% (defender é mais fácil que atacar).
    15 +
    // Moral: estabilidade alta dá bonus ao defensor.
    (defensor.estabilidade - 50) * 0.1;

  // Fase 4 — Cultura: revolta local ajuda invasor culturalmente aparentado.
  let culturaBonusAgressor = 0;
  if (provDisputada && agressorCulture && provDisputada.cultura) {
    const affinityAgressor = calculateCulturalAffinity(provDisputada.cultura, agressorCulture);
    if (affinityAgressor >= 0.85) {
      culturaBonusAgressor = 3; // revolta local forte
    } else if (affinityAgressor >= 0.5) {
      culturaBonusAgressor = 1; // simpatia moderada
    }
    // Se a província está desleal ao defensor (< 30), o bónus dobra.
    const lealdadeProv = provDisputada.lealdade ?? 50;
    if (lealdadeProv < 30) {
      culturaBonusAgressor *= 2;
    }
  }

  const diff = (poderAgressor + culturaBonusAgressor) - poderDefensor;
  // Delta base: diff/5 (escala para pontos), clamp ±10.
  let delta = clamp(diff / 5, -MAX_FRONT_DELTA, MAX_FRONT_DELTA);

  // Factor aleatório determinístico: ±2 pontos.
  delta += rng.range(-2, 2);

  // Penalizações para guerras longas: se a frente estiver estagnada (progresso 30-70),
  // reduz-se o delta (atravancamento).
  if (frente.progresso > 30 && frente.progresso < 70) {
    delta *= 0.7;
  }

  return clamp(delta, -MAX_FRONT_DELTA, MAX_FRONT_DELTA);
}

/**
 * Conta quantos aliados (tratado alianca ativo) `countryId` tem, excluindo
 * `inimigoId` (que é o outro lado da guerra).
 */
function countAllies(state: GameState, countryId: string, inimigoId: string): number {
  return state.tratados.filter(
    (t) =>
      !t.rompido &&
      t.tipo === "alianca" &&
      t.paises.includes(countryId) &&
      !t.paises.includes(inimigoId),
  ).length;
}

/**
 * Assina paz: termina a guerra e aplica efeitos.
 * Opções:
 *   - cederProvincias: províncias que o perdedor cede ao vencedor
 *   - indemnizacoes: valor em dólares que o perdedor paga ao vencedor
 *   - retirada: se true, ambos os lados retiram (statu quo ante)
 */
export interface PeaceOptions {
  cederProvincias?: string[]; // IDs de províncias
  indemnizacoes?: number;
  retirada?: boolean;
}

export function signPeace(
  state: GameState,
  warId: string,
  vencedorId: string,
  options: PeaceOptions = {},
): { state: GameState; motivo: string } {
  const war = state.guerras.find((w) => w.id === warId);
  if (!war) {
    return { state, motivo: "Guerra não encontrada" };
  }
  if (war.estado === "terminada") {
    return { state, motivo: "Guerra já terminada" };
  }

  // Aplica cedência de províncias.
  let provincias = state.provincias;
  if (options.cederProvincias && options.cederProvincias.length > 0) {
    provincias = { ...state.provincias };
    for (const pid of options.cederProvincias) {
      const prov = provincias[pid];
      if (!prov) continue;
      provincias[pid] = {
        ...prov,
        countryId: vencedorId,
        ocupadaPor: null,
      };
    }
  }

  // Aplica indemnizações: transfere tesouro do perdedor para o vencedor.
  let paises = state.paises;
  const indemnizacoes = Math.max(0, options.indemnizacoes ?? 0);
  if (indemnizacoes > 0) {
    paises = { ...state.paises };
    // Identifica o perdedor: se o vencedor é o agressor, o perdedor é o 1º defensor.
    const perdedorId = war.agressor === vencedorId ? war.defensores[0] : war.agressor;
    const perdedor = paises[perdedorId];
    const vencedor = paises[vencedorId];
    if (perdedor && vencedor) {
      const pago = Math.min(indemnizacoes, perdedor.tesouro);
      paises[perdedorId] = { ...perdedor, tesouro: perdedor.tesouro - pago };
      paises[vencedorId] = { ...vencedor, tesouro: vencedor.tesouro + pago };
    }
  }

  // Marca guerra como terminada + cria tratado de paz.
  const guerras = state.guerras.map((w) =>
    w.id === warId
      ? {
          ...w,
          estado: "terminada" as const,
          turnoFim: state.turno,
          indemnizacoes: indemnizacoes,
        }
      : w,
  );
  const tratadoPaz = {
    id: `paz-${warId}-${state.turno}`,
    tipo: "paz" as const,
    paises: [war.agressor, ...war.defensores],
    inicio: state.dataAtual,
    rompido: false,
  };
  const tratados = [...state.tratados, tratadoPaz];

  // Melhora relações (paz traz alívio).
  const novosIds = new Set([war.agressor, ...war.defensores]);
  const relacoes = state.relacoes.map((r) => {
    if (!novosIds.has(r.a) || !novosIds.has(r.b)) return r;
    if (r.a === war.agressor || r.b === war.agressor) {
      return { ...r, valor: clampInt(r.valor + 15, -100, 100) };
    }
    return r;
  });

  // BLOCO B5 — Impacto imediato de reputação: assinar paz = +5 para o vencedor.
  let newState: GameState = {
    ...state, guerras, provincias, paises, tratados, relacoes,
  };
  newState = adjustReputation(newState, vencedorId, REPUTATION_IMPACTS.assinar_paz, "assinar paz");

  return {
    state: newState,
    motivo: "Paz assinada com sucesso",
  };
}

// --- Helpers ---------------------------------------------------------------

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
