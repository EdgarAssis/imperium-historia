// src/lib/config/reputation-impacts.ts
// Bloco B5 — Tabela central de impactos de reputação.
//
// Cada ação do jogo tem um impacto imediato na reputação do país que a executa.
// Esta tabela é a fonte única de verdade para todos os impactos. Editável.
//
// Valores em pontos (-100..100). Valores negativos = reputação pior.

export const REPUTATION_IMPACTS = {
  // Guerra e militar
  declarar_guerra: -8,
  declarar_guerra_defensiva: 0,
  vencer_guerra: -3,
  perder_guerra: 0,
  anexar_pais: -15,
  conquistar_provincia: -5,
  usar_nuclear: -30,
  bombardear_civis: -20,

  // Diplomacia
  romper_tratado: -10,
  assinar_paz: +5,
  propor_alianca: +2,
  juntar_bloco: +3,
  sair_bloco: -2,
  ultimato_aceite: -5,
  ultimato_recusado: +1,

  // Conquista não-militar
  rendicao_forcada: -10,
  pressao_popular: -12,
  compra_diplomatica: -3,
  acolher_refugiados: +5,
  recusar_refugiados: -3,

  // Proxy e espionagem
  proxy_war: -10,
  proxy_cancelado: +2,
  espionagem_sucedida: 0,
  espionagem_falhada: -8,
  assassinar_lider: -25,

  // Política interna
  golpe_estado: -15,
  eleicao_vencida: +8,
  eleicao_perdida: -3,
  reforma_politica: +3,

  // Economia
  ajuda_humanitaria: +5,
  sancoes_impostas: -2,
  receber_sancoes: -5,
} as const;

export type ReputationAction = keyof typeof REPUTATION_IMPACTS;

export function getReputationImpact(action: ReputationAction | string): number {
  if (action in REPUTATION_IMPACTS) {
    return REPUTATION_IMPACTS[action as ReputationAction];
  }
  return 0;
}
