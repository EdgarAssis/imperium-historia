// src/lib/ai/response-schema.ts
// Esquema zod da resposta da IA narradora. Mantém-se alinhado com o system
// prompt. Tudo o que a IA devolve é validado por este esquema antes de aplicar.

import { z } from "zod";

export const newsItemSchema = z.object({
  titulo: z.string().min(1).max(120),
  texto: z.string().min(1).max(400),
  tipo: z.enum(["guerra", "economia", "diplomacia", "politica", "evento"]),
});

/** Mudança num país. Todos os valores são DELTAS (variações percentuais). */
export const countryChangeSchema = z.object({
  id: z.string().min(2).max(4),
  pib_pct: z.number().finite().min(-15).max(15).default(0),
  estabilidade: z.number().finite().min(-20).max(20).default(0),
  aprovacao: z.number().finite().min(-20).max(20).default(0),
  tesouro_pct: z.number().finite().min(-50).max(50).default(0),
  exercito_pct: z.number().finite().min(-30).max(30).default(0),
});

/** Mudança numa relação bilateral. delta em pontos (-40..40). */
export const relationChangeSchema = z.object({
  a: z.string().min(2).max(4),
  b: z.string().min(2).max(4),
  delta: z.number().finite().min(-40).max(40),
});

export const treatyActionSchema = z.object({
  acao: z.enum(["criar", "romper"]),
  tipo: z.enum(["alianca", "comercio", "nao_agressao", "paz"]),
  paises: z.array(z.string().min(2).max(4)).min(2),
});

export const warActionSchema = z.object({
  acao: z.enum(["declarar", "terminar"]),
  agressor: z.string().min(2).max(4),
  defensores: z.array(z.string().min(2).max(4)).min(1),
});

export const provinceChangeSchema = z.object({
  id: z.string().min(1),
  novo_dono: z.string().min(2).max(4),
});

export const aiChangesSchema = z.object({
  paises: z.array(countryChangeSchema).max(20).default([]),
  relacoes: z.array(relationChangeSchema).max(20).default([]),
  tratados: z.array(treatyActionSchema).max(10).default([]),
  guerras: z.array(warActionSchema).max(10).default([]),
  provincias: z.array(provinceChangeSchema).max(10).default([]),
});

export const aiResponseSchema = z.object({
  narrativa: z.string().min(1).max(5000),
  noticias: z.array(newsItemSchema).max(10).default([]),
  mudancas: aiChangesSchema.default({ paises: [], relacoes: [], tratados: [], guerras: [], provincias: [] }),
  alertas: z.array(z.string().max(200)).max(10).default([]),
});

/** Tipo inferido das mudanças que a IA propõe. */
export type AiChanges = z.infer<typeof aiChangesSchema>;
/** Tipo inferido da resposta completa da IA. */
export type AiResponse = z.infer<typeof aiResponseSchema>;
