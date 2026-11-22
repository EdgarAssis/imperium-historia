// src/lib/engine/reputation.ts
// Fase 8 — Reputação mundial / opinião pública.
//
// Cada país tem `reputacao` (-100..100, default 0), que reflecte como é visto
// pela comunidade internacional. Reputação alta abre portas (comércio, aliados);
// baixa traz sanções implícitas e hostilidade.
//
// Drift mensal (processReputationDrift):
//   - Guerra ofensiva (agressor): -2/mês
//   - Guerra defensiva: 0 (neutro)
//   - Sanções activas (país sob sanções de um bloco): -3/mês
//   - Acolher refugiados: +2/mês
//   - Respeitar tratados (sem romper): +1/mês
//   - Governação estável (estab > 70): +1/mês
//   - Regime autoritário: -1/mês (percepción negativa)
//
// Ações pontuais: adjustReputation(state, countryId, delta, motivo) — usado
// por conquista agressiva, golpe, etc.

import type { GameState } from "@/types";

/** Clamp reputação para [-100, 100] (intervalo diferente de clampStat que é [0,100]). */
function clampReputation(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100, Math.min(100, Math.round(n)));
}

/** Ajusta a reputação de um país por `delta`. Devolve novo estado. */
export function adjustReputation(
  state: GameState,
  countryId: string,
  delta: number,
  motivo?: string,
): GameState {
  const country = state.paises[countryId];
  if (!country) return state;
  const reputacaoActual = country.reputacao ?? 0;
  const novaReputacao = clampReputation(reputacaoActual + Math.round(delta));
  const paises = {
    ...state.paises,
    [countryId]: { ...country, reputacao: novaReputacao },
  };
  void motivo; // motivo seria para evento de diário; caller regista separadamente.
  return { ...state, paises };
}

/**
 * Drift mensal de reputação para TODOS os países. Devolve novo estado.
 * Adiciona eventos ao diário quando reputação muda significativamente.
 */
export function processReputationDrift(state: GameState): {
  state: GameState;
  eventos: { countryId: string; delta: number; motivo: string }[];
} {
  const eventos: { countryId: string; delta: number; motivo: string }[] = [];
  const paises = { ...state.paises };

  for (const countryId of Object.keys(paises)) {
    const country = paises[countryId];
    let delta = 0;
    const motivos: string[] = [];

    // Guerra ofensiva (é agressor numa guerra ativa).
    const guerraOfensiva = state.guerras.some(
      (g) => g.estado === "ativa" && g.agressor === countryId,
    );
    if (guerraOfensiva) {
      delta -= 2;
      motivos.push("guerra ofensiva");
    }

    // Guerra defensiva: neutro (sem penalização).

    // Sanções: país-alvo de votações aprovadas de sanção.
    const sobSancoes = state.votacoes.some(
      (v) => v.fechada && v.resultado === "aprovada" && v.tipo === "sancionar" && v.alvos.includes(countryId),
    );
    if (sobSancoes) {
      delta -= 3;
      motivos.push("sanções internacionais");
    }

    // Acolher refugiados: se acolheu no último turno (refugiadosAcolhidos cresceu).
    if ((country.refugiadosAcolhidos ?? 0) > 0) {
      delta += 1; // +1/mês genérico; ações pontuais dão +2.
      motivos.push("acolhimento de refugiados");
    }

    // Respeitar tratados: sem tratados rompidos neste turno.
    // Heurística: se nenhum tratado do país foi rompido recentemente, +1.
    const tratadosRompidosRecentes = state.tratados.some(
      (t) => t.rompido && t.paises.includes(countryId),
    );
    if (!tratadosRompidosRecentes) {
      delta += 1;
      motivos.push("respeito por tratados");
    }

    // Governação estável.
    if (country.estabilidade > 70) {
      delta += 1;
      motivos.push("governação estável");
    }

    // Regimes autoritários: percepção negativa.
    const regimesAutoritarios = ["autocracia", "regime_partido_unico", "teocracia", "junta_militar", "monarquia_absoluta"];
    if (regimesAutoritarios.includes(country.regime)) {
      delta -= 1;
      motivos.push("regime autoritário");
    }

    // Aplica drift apenas se delta != 0.
    if (delta !== 0) {
      const reputacaoActual = country.reputacao ?? 0;
      const novaReputacao = clampReputation(reputacaoActual + delta);
      if (novaReputacao !== reputacaoActual) {
        paises[countryId] = { ...country, reputacao: novaReputacao };
        eventos.push({
          countryId,
          delta,
          motivo: motivos.join(", "),
        });
      }
    }
  }

  return { state: { ...state, paises }, eventos };
}

/** Etiqueta qualitativa para a reputação. */
export function getReputationLabel(reputacao: number): string {
  if (reputacao >= 70) return "Parceiro de confiança";
  if (reputacao >= 40) return "Respeitado";
  if (reputacao >= 20) return "Favorável";
  if (reputacao >= -20) return "Neutro";
  if (reputacao >= -40) return "Suspeito";
  if (reputacao >= -70) return "Tensão";
  return "Pária internacional";
}

/** Cor para a badge de reputação (estilo semáforo). */
export function getReputationColor(reputacao: number): string {
  if (reputacao >= 40) return "#16a34a"; // verde
  if (reputacao >= 20) return "#84cc16"; // verde-amarelo
  if (reputacao >= -20) return "#6b7280"; // cinzento
  if (reputacao >= -40) return "#f59e0b"; // amarelo
  if (reputacao >= -70) return "#ea580c"; // laranja
  return "#dc2626"; // vermelho
}

/** Reputação média de um bloco de países (para votações ponderadas). */
export function calculateAverageReputation(state: GameState, countryIds: string[]): number {
  if (countryIds.length === 0) return 0;
  let soma = 0;
  for (const id of countryIds) {
    const c = state.paises[id];
    if (c) soma += c.reputacao ?? 0;
  }
  return Math.round(soma / countryIds.length);
}
