// src/lib/engine/apply-changes.ts
// applyChanges(state, changes): valida e aplica as mudanças propostas pela IA.
// - PIB nunca varia mais de ±15% por turno (o schema já corta, mas é defesa em profundidade).
// - Estabilidade/Aprovação: ±20 pontos.
// - Relações: ±40 pontos.
// - Países/IDs inexistentes são rejeitados (não aplicados).
// - Tratados: só se os países existirem.
// - Guerras: só se agressor e defensores existirem.
// - Províncias: só se a província e o novo dono existirem.
//
// Regista no diário o que foi rejeitado, sem alterar o resto.
// Devolve { state, applied, rejected } — novo estado + lista de rejeitados.

import type { GameState, GameEvent, Relation, Treaty, War } from "@/types";
import type { AiChanges } from "@/lib/ai/response-schema";
import { clampStat } from "./stability";
import { Rng, hashCombine, hashString } from "./rng";

const MAX_PIB_DELTA = 0.15; // ±15% por turno
const MAX_STAT_DELTA = 20; // ±20 pontos (estab/aprov)
const MAX_TESOURO_DELTA = 0.5; // ±50% do tesouro (defesa extra)
const MAX_EXERCITO_DELTA = 0.3; // ±30% do exército
const MAX_RELATION_DELTA = 40; // ±40 pontos

export interface AppliedChanges {
  state: GameState;
  /** Mudanças aceites e aplicadas, para registo no diário. */
  applied: string[];
  /** Mudanças rejeitadas, com motivo, para registo no diário. */
  rejected: { motivo: string; detalhe: string }[];
}

/**
 * Aplica as mudanças propostas pela IA, validando cada uma. Função PURA:
 * devolve um novo estado; o original permanece inalterado.
 *
 * Nota: usa RNG determinístico derivado de (seed, turno) para gerar IDs de
 * tratados/guerras, preservando a reprodutibilidade.
 */
export function applyChanges(
  state: GameState,
  changes: AiChanges,
  options?: { dataEvento?: string; turno?: number },
): AppliedChanges {
  const applied: string[] = [];
  const rejected: { motivo: string; detalhe: string }[] = [];
  const dataEvento = options?.dataEvento ?? state.dataAtual;
  const turno = options?.turno ?? state.turno;

  // RNG determinístico derivado de (seed, turno) — para IDs estáveis.
  const idRng = new Rng(hashCombine(hashCombine(state.config.seed, turno), hashString("apply-changes")));
  const nextId = (prefix: string): string => {
    const r = idRng.int(0, 0xffffffff);
    return `${prefix}-${turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}`;
  };

  // Clones para não mutar o original.
  const paises: GameState["paises"] = { ...state.paises };
  let relacoes: Relation[] = state.relacoes.map((r) => ({ ...r }));
  const tratados: Treaty[] = state.tratados.map((t) => ({ ...t }));
  let guerras: War[] = state.guerras.map((g) => ({ ...g }));
  const provincias: GameState["provincias"] = { ...state.provincias };

  // --- Mudanças por país ---
  for (const change of changes.paises) {
    const country = paises[change.id];
    if (!country) {
      rejected.push({ motivo: "País inexistente", detalhe: `id=${change.id}` });
      continue;
    }
    // PIB: aplica variação percentual com clamp.
    const pibPct = clamp(change.pib_pct ?? 0, -100, 100) / 100;
    const pibClamped = clamp(pibPct, -MAX_PIB_DELTA, MAX_PIB_DELTA);
    if (Math.abs(pibPct) > MAX_PIB_DELTA) {
      rejected.push({
        motivo: `PIB > ±${MAX_PIB_DELTA * 100}% (cortado)`,
        detalhe: `${change.id}: pib_pct=${change.pib_pct}%`,
      });
    }
    const newPib = Math.max(1, country.pib * (1 + pibClamped));

    // Estabilidade: clamp ±20.
    const stabDelta = clamp(change.estabilidade ?? 0, -100, 100);
    const stabClamped = clamp(stabDelta, -MAX_STAT_DELTA, MAX_STAT_DELTA);
    if (Math.abs(stabDelta) > MAX_STAT_DELTA) {
      rejected.push({
        motivo: `Estabilidade > ±${MAX_STAT_DELTA} (cortado)`,
        detalhe: `${change.id}: estabilidade=${change.estabilidade}`,
      });
    }

    // Aprovação: idem.
    const aprovDelta = clamp(change.aprovacao ?? 0, -100, 100);
    const aprovClamped = clamp(aprovDelta, -MAX_STAT_DELTA, MAX_STAT_DELTA);
    if (Math.abs(aprovDelta) > MAX_STAT_DELTA) {
      rejected.push({
        motivo: `Aprovação > ±${MAX_STAT_DELTA} (cortado)`,
        detalhe: `${change.id}: aprovacao=${change.aprovacao}`,
      });
    }

    // Tesouro: variação percentual com clamp extra.
    const tesPct = clamp(change.tesouro_pct ?? 0, -100, 100) / 100;
    const tesClamped = clamp(tesPct, -MAX_TESOURO_DELTA, MAX_TESOURO_DELTA);
    const newTesouro = country.tesouro * (1 + tesClamped);

    // Exército: variação percentual com clamp extra.
    const exPct = clamp(change.exercito_pct ?? 0, -100, 100) / 100;
    const exClamped = clamp(exPct, -MAX_EXERCITO_DELTA, MAX_EXERCITO_DELTA);
    const newExercito = clampInt(country.exercito * (1 + exClamped), 0, 1000);

    paises[change.id] = {
      ...country,
      pib: newPib,
      estabilidade: clampStat(country.estabilidade + stabClamped),
      aprovacao: clampStat(country.aprovacao + aprovClamped),
      tesouro: newTesouro,
      exercito: newExercito,
    };
    applied.push(
      `${change.id}: PIB ${pibClamped >= 0 ? "+" : ""}${(pibClamped * 100).toFixed(2)}%` +
        `, estab ${stabClamped >= 0 ? "+" : ""}${stabClamped}` +
        `, aprov ${aprovClamped >= 0 ? "+" : ""}${aprovClamped}` +
        `, tesouro ${tesClamped >= 0 ? "+" : ""}${(tesClamped * 100).toFixed(2)}%` +
        `, exército ${exClamped >= 0 ? "+" : ""}${(exClamped * 100).toFixed(2)}%`,
    );
  }

  // --- Mudanças de relações ---
  for (const change of changes.relacoes) {
    if (!paises[change.a] || !paises[change.b]) {
      rejected.push({ motivo: "Relação refere país inexistente", detalhe: `${change.a}/${change.b}` });
      continue;
    }
    if (change.a === change.b) {
      rejected.push({ motivo: "Relação entre o mesmo país", detalhe: change.a });
      continue;
    }
    const delta = clamp(change.delta, -100, 100);
    const deltaClamped = clamp(delta, -MAX_RELATION_DELTA, MAX_RELATION_DELTA);
    if (Math.abs(delta) > MAX_RELATION_DELTA) {
      rejected.push({
        motivo: `Relação > ±${MAX_RELATION_DELTA} (cortado)`,
        detalhe: `${change.a}-${change.b}: delta=${change.delta}`,
      });
    }
    // Procura a relação existente; se não houver, cria.
    const idx = relacoes.findIndex(
      (r) => (r.a === change.a && r.b === change.b) || (r.a === change.b && r.b === change.a),
    );
    if (idx >= 0) {
      relacoes = relacoes.map((r, i) =>
        i === idx ? { ...r, valor: clampInt(r.valor + deltaClamped, -100, 100) } : r,
      );
    } else {
      relacoes.push({ a: change.a, b: change.b, valor: clampInt(deltaClamped, -100, 100) });
    }
    applied.push(`Relação ${change.a}-${change.b}: ${deltaClamped >= 0 ? "+" : ""}${deltaClamped}`);
  }

  // --- Tratados (criar/romper) ---
  for (const t of changes.tratados) {
    const todosExistem = t.paises.every((id) => paises[id]);
    if (!todosExistem) {
      rejected.push({ motivo: "Tratado refere país inexistente", detalhe: t.paises.join(",") });
      continue;
    }
    if (t.acao === "criar") {
      const novoTratado: Treaty = {
        id: nextId("tratado-ia"),
        tipo: t.tipo,
        paises: [...t.paises],
        inicio: dataEvento,
        rompido: false,
      };
      tratados.push(novoTratado);
      applied.push(`Novo tratado (${t.tipo}) entre ${t.paises.join(", ")}`);
    } else if (t.acao === "romper") {
      // Procura tratados ativos entre estes países e marca como rompidos.
      let rompidoAlgum = false;
      for (let i = 0; i < tratados.length; i++) {
        const ex = tratados[i];
        if (ex.rompido) continue;
        if (t.tipo && ex.tipo !== t.tipo) continue;
        const todos = t.paises.every((id) => ex.paises.includes(id));
        if (todos) {
          tratados[i] = { ...ex, rompido: true };
          rompidoAlgum = true;
        }
      }
      if (rompidoAlgum) {
        applied.push(`Tratado (${t.tipo}) rompido entre ${t.paises.join(", ")}`);
      } else {
        rejected.push({ motivo: "Tratado ativo não encontrado para romper", detalhe: t.paises.join(",") });
      }
    }
  }

  // --- Guerras (declarar/terminar) ---
  for (const g of changes.guerras) {
    if (!paises[g.agressor]) {
      rejected.push({ motivo: "Guerra: agressor inexistente", detalhe: g.agressor });
      continue;
    }
    const defsOk = g.defensores.every((id) => paises[id]);
    if (!defsOk) {
      rejected.push({ motivo: "Guerra: defensor inexistente", detalhe: g.defensores.join(",") });
      continue;
    }
    if (g.acao === "declarar") {
      // Não cria guerra duplicada.
      const existe = guerras.some(
        (w) =>
          w.estado === "ativa" &&
          w.agressor === g.agressor &&
          g.defensores.every((d) => w.defensores.includes(d)),
      );
      if (existe) {
        rejected.push({ motivo: "Guerra já existe (ativa)", detalhe: `${g.agressor} vs ${g.defensores.join(",")}` });
        continue;
      }
      const novaGuerra: War = {
        id: nextId("guerra-ia"),
        agressor: g.agressor,
        defensores: [...g.defensores],
        provinciasDisputa: [],
        frentes: [],
        objetivo: "conquistar",
        estado: "ativa",
        inicio: dataEvento,
        indemnizacoes: 0,
        turnoFim: null,
      };
      guerras.push(novaGuerra);
      applied.push(`Guerra declarada: ${g.agressor} vs ${g.defensores.join(", ")}`);
    } else if (g.acao === "terminar") {
      let terminouAlgum = false;
      guerras = guerras.map((w) => {
        if (w.estado !== "ativa") return w;
        if (w.agressor !== g.agressor) return w;
        if (!g.defensores.every((d) => w.defensores.includes(d))) return w;
        terminouAlgum = true;
        return { ...w, estado: "terminada" as const };
      });
      if (terminouAlgum) {
        applied.push(`Guerra terminada: ${g.agressor} vs ${g.defensores.join(", ")}`);
      } else {
        rejected.push({ motivo: "Guerra ativa não encontrada para terminar", detalhe: `${g.agressor} vs ${g.defensores.join(",")}` });
      }
    }
  }

  // --- Mudanças de província (mudança de dono) ---
  for (const p of changes.provincias) {
    const prov = provincias[p.id];
    if (!prov) {
      rejected.push({ motivo: "Província inexistente", detalhe: p.id });
      continue;
    }
    if (!paises[p.novo_dono]) {
      rejected.push({ motivo: "Novo dono inexistente", detalhe: p.novo_dono });
      continue;
    }
    // Só permitimos mudança de dono se houver guerra ativa envolvendo o novo dono
    // e o dono atual (defesa contra "mágica" da IA).
    const donoAntigo = prov.countryId;
    const haGuerra = guerras.some(
      (w) =>
        w.estado === "ativa" &&
        ((w.agressor === p.novo_dono && w.defensores.includes(donoAntigo)) ||
          (w.agressor === donoAntigo && w.defensores.includes(p.novo_dono))),
    );
    if (!haGuerra) {
      rejected.push({
        motivo: "Mudança de dono sem guerra ativa entre os dois países",
        detalhe: `${p.id}: ${donoAntigo} -> ${p.novo_dono}`,
      });
      continue;
    }
    provincias[p.id] = { ...prov, countryId: p.novo_dono, ocupadaPor: null };
    applied.push(`Província ${p.id} mudou de dono: ${donoAntigo} -> ${p.novo_dono}`);
  }

  // --- Adiciona evento de IA ao diário ---
  const eventos: GameEvent[] = [...state.eventos];
  if (applied.length > 0 || rejected.length > 0) {
    eventos.push({
      id: `ev-ia-${turno.toString().padStart(4, "0")}-${eventos.length.toString().padStart(3, "0")}`,
      turno,
      data: dataEvento,
      tipo: "evento",
      titulo: `IA: ${applied.length} mudanças aplicadas, ${rejected.length} rejeitadas`,
      texto: applied.length > 0
        ? `A IA propôs alterações ao mundo. ${applied.length} foram aplicadas; ${rejected.length} rejeitadas por violarem limites ou incoerência.`
        : `A IA não propôs mudanças válidas.`,
      efeitos: applied,
    });
  }

  const newState: GameState = {
    ...state,
    paises,
    relacoes,
    tratados,
    guerras,
    provincias,
    eventos,
  };

  return { state: newState, applied, rejected };
}

// --- Helpers ---------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
