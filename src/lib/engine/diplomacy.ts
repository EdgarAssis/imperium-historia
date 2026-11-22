// src/lib/engine/diplomacy.ts
// Lógica de propostas diplomáticas: aliança, comércio, não-agressão, paz, ultimato.
// A decisão do país alvo é calculada pelo motor com base em:
//   - relação atual entre os dois países
//   - poder relativo (PIB + exército)
//   - interesse (comércio beneficia economias; alianças beneficiam países fracos)
//   - fator aleatório (seed) para variar resultados

import type {
  Country,
  GameState,
  Treaty,
  DiplomaticProposal,
  DiplomaticProposalType,
} from "@/types";
import { Rng, rngForCountry, hashCombine, hashString } from "./rng";

/** Resultado de uma proposta: inclui novo estado + a proposta registada. */
export interface ProposalResult {
  state: GameState;
  proposal: DiplomaticProposal;
  /** Novo tratado criado (se a proposta foi aceite e é do tipo criar tratado). */
  novoTratado?: Treaty;
}

/**
 * Calcula a probabilidade (0–1) de o país `para` aceitar a proposta de `de`.
 * Considera relação, poder relativo, interesse, tipo de proposta e ruído.
 */
export function calculateAcceptanceProbability(
  state: GameState,
  de: Country,
  para: Country,
  tipo: DiplomaticProposalType,
  rng: Rng,
): { probabilidade: number; motivo: string } {
  const relacao = findRelation(state, de.id, para.id) ?? 0;
  const poderDe = de.pib + de.exercito * 1e9;
  const poderPara = para.pib + para.exercito * 1e9;
  const poderRelativo = poderDe / Math.max(1, poderPara); // >1 = de é mais forte

  let prob = 0.5; // base neutra
  let motivo = "";

  // Ajuste por relação (relação boa → mais fácil aceitar propostas amigáveis).
  prob += relacao / 200; // ±0.5

  switch (tipo) {
    case "alianca":
      // Alianças: mais prováveis se relação > 40 e o `para` for mais fraco
      // (precisa de proteção) ou se ambos forem potências médias.
      prob += 0.1;
      if (poderRelativo > 1.5) prob += 0.1; // aliado forte é bom
      if (relacao < 20) prob -= 0.3;
      motivo = relacao > 40
        ? "A relação é sólida; o aliado considera a proposta favoravelmente."
        : relacao > 0
          ? "A relação é cordial, mas reservada quanto a alianças formais."
          : "A relação é fraca; pouca vontade de se vincular.";
      break;
    case "comercio":
      // Comércio: quase sempre benéfico, baixa barreira.
      prob += 0.2;
      if (relacao < -50) prob -= 0.4; // hostilidade forte bloqueia
      motivo = "Tratado comercial oferece ganhos mútuos;aceitação mais provável.";
      break;
    case "nao_agressao":
      // Não-agressão: provável se relação ≥ -20; difícil se hostil.
      if (relacao < -20) prob -= 0.3;
      else prob += 0.15;
      motivo = "Pacto de não-agressão seenquadr a interesses mútuos de estabilidade.";
      break;
    case "paz":
      // Paz: só se houver guerra ativa entre os dois; quase sempre aceite
      // se ambos estiverem desgastados.
      const emGuerra = state.guerras.some(
        (g) =>
          g.estado === "ativa" &&
          ((g.agressor === de.id && g.defensores.includes(para.id)) ||
            (g.agressor === para.id && g.defensores.includes(de.id))),
      );
      if (!emGuerra) {
        prob = 0;
        motivo = "Não há guerra ativa entre os dois países; a proposta de paz é ignorada.";
      } else {
        prob += 0.4; // vontade de paz crescente
        if (para.estabilidade < 30) prob += 0.15; // desgaste aumenta vontade
        motivo = "Ambos estão cansados do conflito; a paz é bem-vinda.";
      }
      break;
    case "ultimato":
      // Ultimato: exigência unilateral. Só aceite se `de` for MUITO mais forte.
      if (poderRelativo > 3) prob = 0.7;
      else if (poderRelativo > 1.5) prob = 0.35;
      else prob = 0.05;
      // Relação hostil faz mais sentido para ultimatos.
      if (relacao > 0) prob -= 0.15;
      motivo = poderRelativo > 3
        ? "A assimetria de poder é esmagadora; aceitação sob coação."
        : "O país alvo recusa submeter-se sem mais provas de força.";
      break;
  }

  // Ruído determinístico (seed) para variar entre turnos.
  prob += rng.range(-0.08, 0.08);

  prob = clamp(prob, 0, 0.95);
  return { probabilidade: prob, motivo };
}

/**
 * Propõe um tratado de `de` para `para`. Decide se é aceite e aplica efeitos
 * (cria tratado se aceite). Devolve um NOVO estado + registo da proposta.
 *
 * NOTA: para a paz, o `signPeace` do módulo war é que efectua a cessação;
 * aqui só decidimos se o outro lado aceita.
 */
export function proposeTreaty(
  state: GameState,
  de: Country,
  para: Country,
  tipo: DiplomaticProposalType,
): ProposalResult {
  const rng = rngForCountry(state, `${de.id}-${para.id}-prop-${tipo}`);
  const { probabilidade, motivo } = calculateAcceptanceProbability(state, de, para, tipo, rng);
  const aceite = rng.chance(probabilidade);

  const proposal: DiplomaticProposal = {
    id: `prop-${state.turno.toString().padStart(4, "0")}-${state.propostas.length.toString().padStart(3, "0")}`,
    de: de.id,
    para: para.id,
    tipo,
    aceite,
    motivo,
    turno: state.turno,
    data: state.dataAtual,
  };

  let novoTratado: Treaty | undefined;
  let newState: GameState = {
    ...state,
    propostas: [...state.propostas, proposal],
  };

  if (aceite && (tipo === "alianca" || tipo === "comercio" || tipo === "nao_agressao")) {
    // ID determinístico derivado de (seed, turno, de, para, tipo).
    const idRng = new Rng(
      hashCombine(
        hashCombine(
          hashCombine(state.config.seed, state.turno),
          hashString(`${de.id}-${para.id}-${tipo}`),
        ),
        hashString("diplomacy"),
      ),
    );
    const r = idRng.int(0, 0xffffffff);
    novoTratado = {
      id: `tratado-prop-${state.turno.toString().padStart(4, "0")}-${r.toString(36).slice(-6)}`,
      tipo: tipo as Treaty["tipo"],
      paises: [de.id, para.id],
      inicio: state.dataAtual,
      rompido: false,
    };
    newState = { ...newState, tratados: [...newState.tratados, novoTratado] };
    // Aceitar uma proposta melhora ligeiramente a relação.
    newState = adjustRelation(newState, de.id, para.id, +5);
  } else if (aceite && tipo === "ultimato") {
    // Ultimato aceite: o alvo cede; relação deteriora muito.
    newState = adjustRelation(newState, de.id, para.id, -25);
    // Reduz tesouro do alvo (indemnização implícita).
    const tesouroLoss = Math.min(para.tesouro * 0.1, de.tesouro * 0.05);
    newState = {
      ...newState,
      paises: {
        ...newState.paises,
        [para.id]: { ...newState.paises[para.id], tesouro: newState.paises[para.id].tesouro - tesouroLoss },
      },
    };
  } else if (!aceite) {
    // Rejeição piora ligeiramente a relação (orgulho ferido).
    newState = adjustRelation(newState, de.id, para.id, -3);
  }

  return { state: newState, proposal, novoTratado };
}

// --- Helpers ---------------------------------------------------------------

function findRelation(state: GameState, a: string, b: string): number | null {
  for (const r of state.relacoes) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
      return r.valor;
    }
  }
  return null;
}

function adjustRelation(state: GameState, a: string, b: string, delta: number): GameState {
  let found = false;
  const relacoes = state.relacoes.map((r) => {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) {
      found = true;
      return { ...r, valor: clampInt(r.valor + delta, -100, 100) };
    }
    return r;
  });
  if (!found) {
    relacoes.push({ a, b, valor: clampInt(delta, -100, 100) });
  }
  return { ...state, relacoes };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
