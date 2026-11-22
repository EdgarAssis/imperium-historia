// src/app/api/turn/route.ts
// Rota POST /api/turn: recebe { estadoResumido (context), ordens } e devolve
// { narrativa, noticias, mudancas, alertas } ou { error }.
//
// Fluxo:
//   1. Valida o body com zod.
//   2. Constroi o prompt do utilizador (contexto + ordens delimitadas).
//   3. Chama o provider (ZAI se houver chave, Mock caso contrário).
//   4. Faz parse + valida a resposta.
//   5. Se inválida: TENTA UMA VEZ com a mensagem de erro; se falhar de novo,
//      devolve erro amigável e NÃO altera o estado.
//
// Proteção contra injeção: as ordens do jogador vão dentro de
// <ordens_do_jogador>…</ordens_do_jogador>. O system prompt já diz ao narrador
// para ignorar instruções nesse texto.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NARRATOR_SYSTEM_PROMPT } from "@/lib/ai/narrator-prompt";
import { getProvider, resolveMockMarker, MOCK_PLAYER_MARKER } from "@/lib/ai/provider";
import { parseAiResponse, buildRetryPrompt } from "@/lib/ai/parse-response";
import type { AiChanges } from "@/lib/ai/response-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ORDERS_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 12000;

const turnBodySchema = z.object({
  /** Resumo do estado (output de buildContext). */
  contexto: z.string().min(1).max(MAX_CONTEXT_LENGTH),
  /** Ordens em texto livre do jogador. Pode ser vazio. */
  ordens: z.string().max(MAX_ORDERS_LENGTH).default(""),
  /** ID do país do jogador, para resolver o marcador __PLAYER__ do mock. */
  playerCountryId: z.string().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (esperado JSON)." },
      { status: 400 },
    );
  }

  const parsed = turnBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pedido inválido.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { contexto, ordens, playerCountryId } = parsed.data;

  // Constroi o prompt do utilizador. As ordens vão delimitadas.
  const userPrompt = buildUserPrompt(contexto, ordens);

  const provider = getProvider();

  try {
    // Primeira tentativa.
    let raw = await withTimeout(
      provider.generate(NARRATOR_SYSTEM_PROMPT, userPrompt),
      60_000,
      `Timeout: a IA demorou mais de 60s a responder.`,
    );

    let parsedResp = parseAiResponse(raw);

    // Se falhou, TENTA UMA VEZ com a mensagem de erro.
    if (!parsedResp.ok) {
      const retryPrompt = buildRetryPrompt(parsedResp.raw, parsedResp.error, parsedResp.issues);
      raw = await withTimeout(
        provider.generate(NARRATOR_SYSTEM_PROMPT, retryPrompt),
        60_000,
        `Timeout no segundo pedido.`,
      );
      parsedResp = parseAiResponse(raw);
    }

    if (!parsedResp.ok) {
      // Não altera o estado; devolve erro amigável.
      return NextResponse.json(
        {
          error: "A IA devolveu uma resposta inválida e não foi possível recuperar. O estado não foi alterado.",
          detalhe: parsedResp.error,
          issues: parsedResp.issues,
        },
        { status: 502 },
      );
    }

    // Resolve marcador __PLAYER__ usado pelo Mock para o ID real.
    const mudancas: AiChanges = resolveMockMarker(parsedResp.response.mudancas, playerCountryId);

    return NextResponse.json({
      narrativa: parsedResp.response.narrativa,
      noticias: parsedResp.response.noticias,
      mudancas,
      alertas: parsedResp.response.alertas,
      provider: provider.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Falha ao contactar a IA: ${message}` },
      { status: 502 },
    );
  }
}

/**
 * Constrói o prompt do utilizador. As ordens vão dentro de
 * <ordens_do_jogador>...</ordens_do_jogador> para o narrador as tratar como
 * conteúdo, não como instruções. Se as ordens forem vazias, simulamos apenas
 * a evolução natural do mundo.
 */
function buildUserPrompt(contexto: string, ordens: string): string {
  // Sanitiza: remove qualquer ocorrência das tags de delimitação no texto
  // do jogador, para evitar fecho prematuro.
  const safeOrders = ordens
    .replace(/<\/?ordens_do_jogador>/g, "")
    .slice(0, MAX_ORDERS_LENGTH);

  if (safeOrders.trim().length === 0) {
    return [
      "CONTEXTO ATUAL:",
      contexto,
      "",
      "<ordens_do_jogador>",
      "(Sem ordens — simula apenas a evolução natural do mundo durante o período do turno.)",
      "</ordens_do_jogador>",
    ].join("\n");
  }

  return [
    "CONTEXTO ATUAL:",
    contexto,
    "",
    "<ordens_do_jogador>",
    safeOrders,
    "</ordens_do_jogador>",
  ].join("\n");
}

/**
 * Aplica um timeout a uma promise. Rejeita com a mensagem dada se demorar.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Marca o export do MOCK_PLAYER_MARKER para evitar "unused" — é usado no store.
export { MOCK_PLAYER_MARKER };
