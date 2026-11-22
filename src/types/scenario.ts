// src/types/scenario.ts
// Esquemas zod que validam o formato dos cenários e dos saves.
// Manter sincronizado com src/types/index.ts.

import { z } from "zod";

export const regimeSchema = z.enum([
  "democracia",
  "republica",
  "monarquia_constitucional",
  "autocracia",
  "regime_partido_unico",
  "teocracia",
  "junta_militar",
  "monarquia_absoluta",
]);

export const realismSchema = z.enum(["casual", "normal", "brutal"]);

export const taxPolicySchema = z.object({
  taxa: z.number().min(0).max(50).default(20),
  taxaCapital: z.number().min(0).max(50).default(15),
  taxaMercadorias: z.number().min(0).max(30).default(10),
});

export const countrySchema = z.object({
  id: z.string().min(2).max(4),
  nome: z.string().min(1),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "cor deve ser hex #RRGGBB"),
  capital: z.string().nullable(),
  populacao: z.number().nonnegative(),
  pib: z.number().finite(),
  tesouro: z.number().finite(),
  exercito: z.number().min(0),
  estabilidade: z.number().min(0).max(100),
  aprovacao: z.number().min(0).max(100),
  regime: regimeSchema,
  donoJogador: z.boolean().default(false),
  // --- Fase 2 (dados realistas). Opcionais com defaults p/ retrocompatibilidade. ---
  orcamentoMilitar: z.number().min(0).default(0),
  tropas: z.number().min(0).default(0),
  nuclear: z.boolean().default(false),
  blocos: z.array(z.string()).default([]),
  recursos: z.array(z.string()).default([]),
  lider: z.string().default(""),
  // --- Fase 5/6 (economia, fiscal, moeda). Opcionais para retrocompatibilidade. ---
  taxPolicy: taxPolicySchema.optional(),
  moeda: z.string().optional(),
  // --- Fase 7/8 (mundo vivo, refugiados, reputação). Opcionais. ---
  reputacao: z.number().min(-100).max(100).optional(),
  proxies: z.array(z.string()).optional(),
  refugiadosAcolhidos: z.number().nonnegative().optional(),
  refugiadosGerados: z.number().nonnegative().optional(),
});

export const multinationalSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  sede: z.string().min(2),
  paisOperacao: z.string().min(2),
  sector: z.string().min(1),
  receita: z.number().min(0),
  empregados: z.number().min(0),
  turnoInstalacao: z.number().int().nonnegative(),
});

export const blocVoteSchema = z.object({
  id: z.string().min(1),
  blocoId: z.string().min(1),
  proposta: z.string().min(1),
  tipo: z.enum(["admissao", "sancionar", "resolucao"]),
  alvos: z.array(z.string()).default([]),
  turnoAbertura: z.number().int().nonnegative(),
  votos: z.record(z.string(), z.enum(["sim", "nao", "abstencao"]).nullable()).default({}),
  fechada: z.boolean().default(false),
  resultado: z.enum(["aprovada", "rejeitada"]).optional(),
});

export const refugeeFlowSchema = z.object({
  id: z.string().min(1),
  origem: z.string().min(2),
  destino: z.string().min(2),
  numero: z.number().nonnegative(),
  turno: z.number().int().nonnegative(),
  motivo: z.string().min(1),
});

export const provinceSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  countryId: z.string().min(2),
  populacao: z.number().nonnegative(),
  pib: z.number().finite(),
  ocupadaPor: z.string().nullable().default(null),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // --- Fase 2 (dados regionais). Opcionais (o loader enriquece com defaults). ---
  cultura: z.string().optional(),
  lealdade: z.number().min(0).max(100).optional(),
  recursos: z.array(z.string()).optional(),
  valorEstrategico: z.number().min(1).max(5).optional(),
  // --- Fase 4 (ocupação): meses sob ocupação estrangeira ---
  mesesOcupada: z.number().int().nonnegative().default(0),
});

export const relationSchema = z.object({
  a: z.string().min(2),
  b: z.string().min(2),
  valor: z.number().min(-100).max(100),
});

export const treatyTypeSchema = z.enum([
  "alianca",
  "comercio",
  "nao_agressao",
  "paz",
]);

export const treatySchema = z.object({
  id: z.string().min(1),
  tipo: treatyTypeSchema,
  paises: z.array(z.string().min(2)).min(2),
  inicio: z.string().min(1),
  rompido: z.boolean().default(false),
});

export const warStatusSchema = z.enum(["ativa", "pausa", "terminada"]);

export const warFrontSchema = z.object({
  provinceId: z.string().min(1),
  progresso: z.number().min(0).max(100).default(0),
  ultimoDelta: z.number().default(0),
});

export const warObjectiveSchema = z.enum(["conquistar", "saquear", "humilhar", "defender"]);

export const warSchema = z.object({
  id: z.string().min(1),
  agressor: z.string().min(2),
  defensores: z.array(z.string().min(2)).min(1),
  provinciasDisputa: z.array(z.string().min(1)).default([]),
  frentes: z.array(warFrontSchema).default([]),
  objetivo: warObjectiveSchema.default("conquistar"),
  estado: warStatusSchema,
  inicio: z.string().min(1),
  indemnizacoes: z.number().default(0),
  turnoFim: z.number().int().nullable().default(null),
});

export const diplomaticProposalTypeSchema = z.enum([
  "alianca",
  "comercio",
  "nao_agressao",
  "paz",
  "ultimato",
]);

export const diplomaticProposalSchema = z.object({
  id: z.string().min(1),
  de: z.string().min(2),
  para: z.string().min(2),
  tipo: diplomaticProposalTypeSchema,
  aceite: z.boolean(),
  motivo: z.string().min(1),
  turno: z.number().int().nonnegative(),
  data: z.string().min(1),
});

export const gameEventTypeSchema = z.enum([
  "guerra",
  "economia",
  "diplomacia",
  "politica",
  "evento",
  "sistema",
]);

export const gameEventSchema = z.object({
  id: z.string().min(1),
  turno: z.number().int().nonnegative(),
  data: z.string().min(1),
  tipo: gameEventTypeSchema,
  titulo: z.string().min(1),
  texto: z.string().min(1),
  efeitos: z.array(z.string()).default([]),
});

export const gameConfigSchema = z.object({
  scenarioId: z.string().min(1),
  resolution: z.enum(["mensal", "anual"]),
  realism: realismSchema,
  seed: z.number().int(),
  version: z.number().int().nonnegative(),
});

export const budgetAllocationSchema = z.object({
  economia: z.number().min(0).max(100),
  exercito: z.number().min(0).max(100),
  saudeEducacao: z.number().min(0).max(100),
  seguranca: z.number().min(0).max(100),
});

export const gameSpeedSchema = z.union([
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(5),
  z.literal(10),
]);

export const timeStateSchema = z.object({
  pausado: z.boolean().default(true),
  velocidade: gameSpeedSchema.default(1),
  autoPauseEventos: z.boolean().default(true),
});

export const gameStateSchema = z.object({
  config: gameConfigSchema,
  dataAtual: z.string().min(1),
  turno: z.number().int().nonnegative(),
  // Fase 1 (tempo real): relógio global. Opcional para retrocompatibilidade.
  timeState: timeStateSchema.optional(),
  paises: z.record(z.string(), countrySchema),
  provincias: z.record(z.string(), provinceSchema),
  relacoes: z.array(relationSchema),
  tratados: z.array(treatySchema),
  guerras: z.array(warSchema),
  eventos: z.array(gameEventSchema),
  playerCountryId: z.string().nullable(),
  // Campos adicionados na Fase 3. Tornados opcionais para retrocompatibilidade
  // com saves da Fase 1/2 — o motor preenche defaults se em falta.
  playerBudget: budgetAllocationSchema.optional(),
  colapsoTurnos: z.record(z.string(), z.number().int().nonnegative()).optional(),
  // Campo adicionado na Fase 5: histórico de propostas diplomáticas.
  propostas: z.array(diplomaticProposalSchema).optional(),
  // Campos adicionados na Fase 6: eventos + ranking + histórico.
  pendingEvent: z.any().nullable().optional(),
  playerHistory: z.array(z.any()).optional(),
  turnosTop3: z.number().int().nonnegative().optional(),
  vitoriaDeclarada: z.boolean().optional(),
  // --- Fase 5/6 (economia, fiscal, moeda, votações). Opcionais para retrocompat. ---
  multinacionais: z.array(multinationalSchema).optional(),
  votacoes: z.array(blocVoteSchema).optional(),
  // --- Fase 8 (refugiados). Opcional para retrocompat. ---
  refugiadosFluxos: z.array(refugeeFlowSchema).optional(),
  // --- Fase 9/10 (missões, achievements, ranking, conselheiros, pesquisa, eleições, notícias). Opcionais. ---
  missoes: z.array(z.any()).optional(),
  achievements: z.array(z.any()).optional(),
  rankingsHistorico: z.array(z.any()).optional(),
  conselheiros: z.array(z.any()).optional(),
  pesquisa: z.any().optional(),
  eleicoes: z.array(z.any()).optional(),
  noticias: z.array(z.any()).optional(),
});

/** Esquema de um cenário (template inicial usado por `newGame`). */
export const scenarioSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().min(1),
  dataInicio: z.string().min(1),
  resolution: z.enum(["mensal", "anual"]),
  paises: z.array(countrySchema).min(1),
  provincias: z.array(provinceSchema).default([]),
  relacoes: z.array(relationSchema).default([]),
  tratados: z.array(treatySchema).default([]),
  guerras: z.array(warSchema).default([]),
});

export type Scenario = z.infer<typeof scenarioSchema>;
