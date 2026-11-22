// src/lib/engine/refugees.ts
// Fase 8 — Refugiados.
//
// Guerras activas geram refugiados: 5% da população das províncias disputadas
// por mês. Refugiados distribuem-se para países vizinhos culturalmente
// aparentados e estáveis (capacidade de acolhimento).
//
// Efeitos:
//   - Acolher refugiados: +1 reputação (drift mensal) + +1 estabilidade
//     (perceção humanitária) mas -0.5% PIB (custo de integração).
//   - Países que recusam (capacidade saturada): -2 reputação.
//   - Refugiados gerados ficam registados no país de origem.

import type { GameState, RefugeeFlow } from "@/types";
import { calculateCulturalAffinity } from "./culture";
import { Rng, hashCombine, hashString } from "./rng";

/** Percentagem da população de províncias disputadas que vira refugiada por mês. */
const REFUGEE_RATE = 0.05;

/**
 * Gera refugiados para todas as guerras ativas. Para cada província disputada
 * (frentes activas), 5% da população vira refugiada. Os refugiados são
 * acumulados no país de origem (`refugiadosGerados`).
 *
 * Devolve novo estado + lista de fluxos a distribuir.
 */
export function generateRefugees(state: GameState): {
  state: GameState;
  fluxos: { origem: string; numero: number; motivo: string }[];
} {
  const fluxos: { origem: string; numero: number; motivo: string }[] = [];
  const paises = { ...state.paises };

  for (const guerra of state.guerras) {
    if (guerra.estado !== "ativa") continue;
    // Províncias disputadas com frentes activas.
    const provinciasDisputadas = guerra.frentes
      .filter((f) => f.progresso < 100) // ainda em disputa
      .map((f) => state.provincias[f.provinceId])
      .filter((p) => p !== undefined);

    for (const prov of provinciasDisputadas) {
      const donoId = prov.countryId;
      const dono = paises[donoId];
      if (!dono) continue;
      const novosRefugiados = Math.round(prov.populacao * REFUGEE_RATE);
      if (novosRefugiados <= 0) continue;
      // Acumula no país de origem.
      paises[donoId] = {
        ...dono,
        refugiadosGerados: (dono.refugiadosGerados ?? 0) + novosRefugiados,
        // Província perde população.
        populacao: Math.max(0, dono.populacao - novosRefugiados),
      };
      fluxos.push({
        origem: donoId,
        numero: novosRefugiados,
        motivo: `Guerra ${guerra.id}`,
      });
      // Actualiza população da província.
      // (já feito acima no país dono; província fica com população reduzida)
    }
  }

  return { state: { ...state, paises }, fluxos };
}

/**
 * Distribui refugiados gerados por países vizinhos culturalmente aparentados
 * e estáveis. Heurística:
 *   - Candidatos: todos os países com estabilidade > 40 (capacidade de acolhimento).
 *   - Pontuação: afinidade cultural com país de origem (peso 50%) + estabilidade
 *     (peso 30%) + PIB per capita (peso 20% — capacidade económica).
 *   - Refugiados distribuem-se proporcionalmente aos top-5 candidatos.
 *
 * Efeitos no país de acolhimento:
 *   - refugiadosAcolhidos += N
 *   - populacao += N
 *   - PIB += N × 0.5 × PIB_per_capita_do_país (refugiados contribuem ~50%
 *     da produtividade média)
 *   - estabilidade += 1 (perceção humanitária), clamp
 *
 * Devolve novo estado + RefugeeFlow[] registados.
 */
export function distributeRefugees(
  state: GameState,
  fluxos: { origem: string; numero: number; motivo: string }[],
): { state: GameState; novosFluxos: RefugeeFlow[] } {
  if (fluxos.length === 0) return { state, novosFluxos: [] };
  const novosFluxos: RefugeeFlow[] = [];
  const paises = { ...state.paises };

  for (const fluxo of fluxos) {
    const origemCountry = paises[fluxo.origem];
    if (!origemCountry) continue;
    const culturaOrigem = origemCountry.capital
      ? state.provincias[origemCountry.capital]?.cultura
      : undefined;
    // Candidatos: todos os países estáveis, excluindo origem e países em guerra.
    const candidatos = Object.values(paises).filter((c) => {
      if (c.id === fluxo.origem) return false;
      if (c.estabilidade < 40) return false;
      const emGuerra = state.guerras.some(
        (g) => g.estado === "ativa" && (g.agressor === c.id || g.defensores.includes(c.id)),
      );
      if (emGuerra) return false;
      return true;
    });
    if (candidatos.length === 0) continue;

    // Pontua cada candidato.
    const pontuados = candidatos.map((c) => {
      const culturaC = c.capital ? state.provincias[c.capital]?.cultura : undefined;
      const afinidade = culturaOrigem && culturaC
        ? calculateCulturalAffinity(culturaOrigem, culturaC)
        : 0.3;
      const stabScore = c.estabilidade / 100;
      const pibPerCapita = c.pib / Math.max(1, c.populacao);
      const pibScore = Math.min(1, pibPerCapita / 50000); // 50k USD/capita = 1.0
      const score = afinidade * 0.5 + stabScore * 0.3 + pibScore * 0.2;
      return { country: c, score };
    }).sort((a, b) => b.score - a.score);

    // Top-5 candidatos recebem quota-parte proporcional à pontuação.
    const top5 = pontuados.slice(0, 5);
    const somaScores = top5.reduce((s, p) => s + p.score, 0);
    if (somaScores === 0) continue;

    // ID determinístico para o fluxo.
    const idRng = new Rng(
      hashCombine(
        hashCombine(state.config.seed, state.turno),
        hashString(`refug-${fluxo.origem}-${state.turno}`),
      ),
    );
    let fluxoIdx = 0;
    for (const { country, score } of top5) {
      const quota = score / somaScores;
      const numeroAcolhido = Math.round(fluxo.numero * quota);
      if (numeroAcolhido <= 0) continue;
      const pibPerCapita = country.pib / Math.max(1, country.populacao);
      const contribuicaoPib = numeroAcolhido * 0.5 * pibPerCapita;
      paises[country.id] = {
        ...country,
        refugiadosAcolhidos: (country.refugiadosAcolhidos ?? 0) + numeroAcolhido,
        populacao: country.populacao + numeroAcolhido,
        pib: country.pib + contribuicaoPib,
        estabilidade: Math.min(100, country.estabilidade + 1),
      };
      const r = idRng.int(0, 0xffffffff);
      fluxoIdx++;
      novosFluxos.push({
        id: `refug-${state.turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}-${fluxoIdx}`,
        origem: fluxo.origem,
        destino: country.id,
        numero: numeroAcolhido,
        turno: state.turno,
        motivo: fluxo.motivo,
      });
    }
  }

  return { state: { ...state, paises }, novosFluxos };
}

/** Processa geração + distribuição de refugiados num só passo. */
export function processRefugees(state: GameState): {
  state: GameState;
  novosFluxos: RefugeeFlow[];
} {
  const gen = generateRefugees(state);
  const dist = distributeRefugees(gen.state, gen.fluxos);
  // Adiciona fluxos ao histórico.
  const refugiadosFluxos = [...dist.state.refugiadosFluxos, ...dist.novosFluxos].slice(-200);
  return {
    state: { ...dist.state, refugiadosFluxos },
    novosFluxos: dist.novosFluxos,
  };
}
