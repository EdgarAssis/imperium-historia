// src/lib/ai/provider.ts
// Interface LLMProvider + 2 implementações:
//   - MockProvider: devolve JSON fixo válido, para testes sem chave API.
//   - ZAIProvider: usa z-ai-web-dev-sdk (apenas servidor).
// getProvider() devolve o ZAI se LLM_API_KEY estiver definida; caso contrário, Mock.

import type { GameState } from "@/types";
import type { AiChanges } from "./response-schema";

export interface LLMProvider {
  readonly name: string;
  /** Gera uma resposta de texto a partir de (system, user). */
  generate(system: string, user: string): Promise<string>;
}

/**
 * MockProvider — devolve uma resposta JSON válida e estável.
 * Útil para testar o fluxo completo sem gastar tokens.
 * Não valida o input; apenas repete uma resposta pré-feita.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async generate(_system: string, _user: string): Promise<string> {
    // Simula latência de rede.
    await new Promise((r) => setTimeout(r, 250));
    // Resposta com mudanças plausíveis e limites dentro do que o motor aceita.
    return JSON.stringify(buildMockResponse());
  }
}

/**
 * ZAIProvider — chama o modelo LLM via z-ai-web-dev-sdk.
 * Apenas servidor (a SDK não pode ir para o bundle do cliente).
 */
export class ZAIProvider implements LLMProvider {
  readonly name: string;
  private readonly model: string;

  constructor(model: string) {
    this.name = `zai:${model}`;
    this.model = model;
  }

  async generate(system: string, user: string): Promise<string> {
    // Import dinâmico para evitar que a SDK seja empacotada no cliente.
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
      // Limite de tokens para controlar custo. 2500 tokens ≈ 10000 chars;
      // suficiente para narrativa (2-4 parágrafos) + 3 notícias + mudanças
      // + alertas, mesmo com cenário expandido (40+ países, 20+ eventos).
      max_tokens: 2500,
    });
    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Resposta do LLM veio vazia.");
    }
    return content;
  }
}

/**
 * Devolve o provider ativo.
 * - Se LLM_API_KEY estiver definida em process.env, usa ZAIProvider.
 * - Caso contrário, usa MockProvider (não gasta tokens).
 *
 * O utilizador pode forçar o mock com LLM_PROVIDER=mock.
 */
export function getProvider(): LLMProvider {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const apiKey = env.LLM_API_KEY;
  const model = env.LLM_MODEL ?? "glm-4.6";
  const providerHint = env.LLM_PROVIDER ?? "auto";

  if (providerHint === "mock" || !apiKey) {
    return new MockProvider();
  }
  return new ZAIProvider(model);
}

// --- Helper interno do Mock ----------------------------------------------

function buildMockResponse(): unknown {
  // Mock simples: narrativa fixa + 2 notícias + alerta. Sem mudanças numéricas
  // (passa sempre na validação do schema, que requer IDs ISO de 2-4 chars).
  const changes: AiChanges = {
    paises: [],
    relacoes: [],
    tratados: [],
    guerras: [],
    provincias: [],
  };
  return {
    narrativa:
      "O mundo segue o seu curso. Os mercados reagem às últimas declarações, os diplomatas afinam contatos discretos, e pequenos sinais de instabilidade aparecem em cantos remotos. A tua liderança é observada por aliados e rivais. (Resposta do MockProvider — define LLM_API_KEY para usar a IA real.)",
    noticias: [
      {
        titulo: "Mercados em calmaria",
        texto: "As principais bolsas mundiais fecharam sem grandes oscilações.",
        tipo: "economia" as const,
      },
      {
        titulo: "Diplomacia discreta",
        texto: "Vários governos trocaram notas diplomáticas sobre comércio.",
        tipo: "diplomacia" as const,
      },
    ],
    mudancas: changes,
    alertas: ["Esta é uma resposta de simulação (Mock). Configure LLM_API_KEY para usar a IA real."],
  };
}

/**
 * Helper: marca o país do jogador no mock para que o applyChanges saiba qual afetar.
 * (O mock envia id="__PLAYER__" e o store converte para o ID real.)
 */
export const MOCK_PLAYER_MARKER = "__PLAYER__";

/**
 * Substitui o marcador __PLAYER__ pelo o ID real do país do jogador.
 */
export function resolveMockMarker(changes: AiChanges, playerId: string | null): AiChanges {
  if (!playerId) return changes;
  return {
    ...changes,
    paises: changes.paises.map((p) =>
      p.id === MOCK_PLAYER_MARKER ? { ...p, id: playerId } : p,
    ),
  };
}

/** Tipo auxiliar para evitar import circular do GameState em Mock. */
export type { GameState };
