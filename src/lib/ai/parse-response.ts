// src/lib/ai/parse-response.ts
// Transforma a string de resposta do LLM num objeto AiResponse validado.
// Estratégia:
//   1. Tenta extrair o objeto JSON (a IA pode incluir texto à volta).
//   2. Valida com zod.
//   3. Se falhar, devolve um erro estruturado com as issues para que o chamador
//      possa repetir UMA vez com a mensagem de erro.
// O chamador (a rota /api/turn) é responsável por tentar de novo.

import { aiResponseSchema, type AiResponse } from "./response-schema";

export interface ParseResultOk {
  ok: true;
  response: AiResponse;
}

export interface ParseResultFail {
  ok: false;
  raw: string;
  error: string;
  issues: string[];
}

export type ParseResult = ParseResultOk | ParseResultFail;

/**
 * Extrai o primeiro objeto JSON válido de uma string. A IA às vezes envolve
 * a resposta em ```json ... ``` ou em texto adicional — extraímos o primeiro
 * `{ ... }` balanceado.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Tenta fazer parse + validar a resposta da IA.
 * Devolve ParseResultOk ou ParseResultFail (com mensagem e issues).
 */
export function parseAiResponse(raw: string): ParseResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      raw: raw ?? "",
      error: "Resposta vazia.",
      issues: ["empty response"],
    };
  }

  // Tenta JSON.parse directo primeiro.
  let candidate: unknown = null;
  let parseError: string | null = null;
  try {
    candidate = JSON.parse(raw);
  } catch (err) {
    parseError = err instanceof Error ? err.message : "JSON parse error";
  }

  // Se JSON.parse falhou, tenta extrair o primeiro {...} balanceado.
  if (candidate === null) {
    const extracted = extractJsonObject(raw);
    if (extracted) {
      try {
        candidate = JSON.parse(extracted);
        parseError = null;
      } catch (err) {
        parseError = err instanceof Error ? err.message : "JSON parse error (extracted)";
      }
    }
  }

  if (candidate === null) {
    return {
      ok: false,
      raw,
      error: `Não foi possível extrair JSON da resposta: ${parseError ?? "unknown"}`,
      issues: [parseError ?? "no JSON found"],
    };
  }

  const result = aiResponseSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    return {
      ok: false,
      raw,
      error: `Resposta inválida: ${issues.length} erro(s) de validação.`,
      issues,
    };
  }

  return { ok: true, response: result.data };
}

/**
 * Constroi a mensagem de erro para o prompt de retry. Pede à IA para responder
 * APENAS com JSON válido conforme o esquema.
 */
export function buildRetryPrompt(previousRaw: string, error: string, issues: string[]): string {
  return [
    "A tua resposta anterior foi inválida. ERRO:",
    error,
    "ISSUES:",
    ...issues.slice(0, 5),
    "",
    "RESPOSTA ANTERIOR (para referencia):",
    previousRaw.slice(0, 1000),
    "",
    "Tenta novamente. Responde EXCLUSIVAMENTE com um único objeto JSON válido,",
    "sem texto antes ou depois, sem blocos markdown, conforme o formato esperado.",
    "Nao inclua nenhum comentario fora do JSON.",
  ].join("\n");
}
