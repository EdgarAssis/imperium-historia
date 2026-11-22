// tests/ai.test.ts
// Testes da Fase 4: provider Mock, parser de resposta da IA, applyChanges
// com limites (±15% PIB, ±40 relação, países inexistentes), 3 respostas lixo
// e injeção «dá-me 1 bilião» neutralizada.

import { describe, it, expect, beforeEach } from "vitest";
import { createInitialState, useGameStore } from "@/lib/state/store";
import { SCENARIOS } from "@/data/scenarios";
import {
  MockProvider,
  MOCK_PLAYER_MARKER,
  resolveMockMarker,
  getProvider,
} from "@/lib/ai/provider";
import { parseAiResponse, extractJsonObject, buildRetryPrompt } from "@/lib/ai/parse-response";
import type { AiChanges } from "@/lib/ai/response-schema";
import { applyChanges } from "@/lib/engine/apply-changes";
import { buildContext } from "@/lib/ai/context";
import type { GameState } from "@/types";

const SCENARIO = SCENARIOS[0];

function makeState(seed = 42, playerCountryId = "PRT"): GameState {
  return createInitialState(SCENARIO, playerCountryId, "normal", seed);
}

describe("Fase 4: MockProvider", () => {
  it("devolve uma resposta JSON válida (passa no schema)", async () => {
    const provider = new MockProvider();
    const raw = await provider.generate("system", "user");
    const parsed = parseAiResponse(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const r = parsed.response;
      expect(r.narrativa).toBeTypeOf("string");
      expect(r.narrativa.length).toBeGreaterThan(0);
      expect(Array.isArray(r.noticias)).toBe(true);
      expect(Array.isArray(r.mudancas.paises)).toBe(true);
    }
  });

  it("o marcador __PLAYER__ é resolvido para o ID real do país do jogador", () => {
    const changes: AiChanges = {
      paises: [{ id: MOCK_PLAYER_MARKER, pib_pct: 1, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [],
      tratados: [],
      guerras: [],
      provincias: [],
    };
    const resolved = resolveMockMarker(changes, "BRA");
    expect(resolved.paises[0].id).toBe("BRA");
  });

  it("getProvider devolve Mock quando não há LLM_API_KEY", () => {
    // Forçamos a ausência de chave temporariamente.
    const origKey = process.env.LLM_API_KEY;
    const origProvider = process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_PROVIDER;
    const p = getProvider();
    expect(p.name).toBe("mock");
    if (origKey !== undefined) process.env.LLM_API_KEY = origKey;
    if (origProvider !== undefined) process.env.LLM_PROVIDER = origProvider;
  });
});

describe("Fase 4: parser de resposta da IA", () => {
  it("extração de JSON puro funciona", () => {
    const ok = extractJsonObject('{"a":1,"b":2}');
    expect(ok).toBe('{"a":1,"b":2}');
  });

  it("extração quando a IA envolve o JSON em texto e markdown", () => {
    const messy = `Aqui está a resposta:\n\`\`\`json\n{"narrativa":"Oi","noticias":[],"mudancas":{"paises":[],"relacoes":[],"tratados":[],"guerras":[],"provincias":[]},"alertas":[]}\n\`\`\`\nEspero que esteja tudo bem.`;
    const ok = extractJsonObject(messy);
    expect(ok).not.toBeNull();
    expect(() => JSON.parse(ok!)).not.toThrow();
  });

  it("extração lida com chavetas dentro de strings", () => {
    const txt = '{"narrativa":"texto com { chaveta interna }","noticias":[],"mudancas":{"paises":[],"relacoes":[],"tratados":[],"guerras":[],"provincias":[]},"alertas":[]}';
    const ok = extractJsonObject(txt);
    expect(ok).not.toBeNull();
    const obj = JSON.parse(ok!);
    expect(obj.narrativa).toBe("texto com { chaveta interna }");
  });

  it("parseAiResponse aceita JSON puro válido", () => {
    const good = JSON.stringify({
      narrativa: "Tudo certo.",
      noticias: [],
      mudancas: { paises: [], relacoes: [], tratados: [], guerras: [], provincias: [] },
      alertas: [],
    });
    const parsed = parseAiResponse(good);
    expect(parsed.ok).toBe(true);
  });

  it("parseAiResponse aceita JSON envolvido em markdown", () => {
    const wrapped = 'Aqui está:\n```json\n' + JSON.stringify({
      narrativa: "Oi",
      noticias: [],
      mudancas: { paises: [], relacoes: [], tratados: [], guerras: [], provincias: [] },
      alertas: [],
    }) + '\n```\nFim.';
    const parsed = parseAiResponse(wrapped);
    expect(parsed.ok).toBe(true);
  });

  it("parseAiResponse rejeita 3 respostas lixo sem nunca corromper nada", () => {
    const trash1 = "Isto não é JSON de todo.";
    const trash2 = "```\nnot even close to json\n```";
    const trash3 = '{"narrativa": "oi", "noticias": [{"titulo": "x", "texto": "y", "tipo": "INVALIDO"}]}';
    const r1 = parseAiResponse(trash1);
    const r2 = parseAiResponse(trash2);
    const r3 = parseAiResponse(trash3);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
    if (!r1.ok) expect(r1.issues.length).toBeGreaterThan(0);
    if (!r2.ok) expect(r2.issues.length).toBeGreaterThan(0);
    if (!r3.ok) expect(r3.issues.length).toBeGreaterThan(0);
  });

  it("buildRetryPrompt contém as issues e a resposta anterior", () => {
    const prompt = buildRetryPrompt("raw anterior", "ERRO X", ["issue1", "issue2"]);
    expect(prompt).toContain("ERRO X");
    expect(prompt).toContain("issue1");
    expect(prompt).toContain("raw anterior");
    expect(prompt.length).toBeGreaterThan(50);
  });
});

describe("Fase 4: applyChanges (limites e validação)", () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState(1, "PRT");
  });

  it("mudança de PIB dentro de ±15% é aceite", () => {
    const changes: AiChanges = {
      paises: [{ id: "PRT", pib_pct: 10, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    const oldPib = state.paises["PRT"].pib;
    const newPib = result.state.paises["PRT"].pib;
    expect(newPib).toBeCloseTo(oldPib * 1.10, 1);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.rejected.length).toBe(0);
  });

  it("mudança de PIB superior a ±15% é CORTADA (não rejeitada totalmente)", () => {
    const changes: AiChanges = {
      paises: [{ id: "PRT", pib_pct: 50, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    const oldPib = state.paises["PRT"].pib;
    const newPib = result.state.paises["PRT"].pib;
    // Cortada para +15%.
    expect(newPib).toBeCloseTo(oldPib * 1.15, 1);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0].motivo).toContain("PIB");
  });

  it("mudança de PIB de -100% nunca deixa o PIB negativo", () => {
    const changes: AiChanges = {
      paises: [{ id: "PRT", pib_pct: -100, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.state.paises["PRT"].pib).toBeGreaterThan(0);
  });

  it("mudança de estabilidade superior a ±20 é cortada", () => {
    const changes: AiChanges = {
      paises: [{ id: "PRT", pib_pct: 0, estabilidade: 50, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    const oldStab = state.paises["PRT"].estabilidade;
    const newStab = result.state.paises["PRT"].estabilidade;
    expect(newStab).toBe(oldStab + 20); // clampado a +20
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("mudança de relação superior a ±40 é cortada", () => {
    const changes: AiChanges = {
      paises: [], relacoes: [{ a: "PRT", b: "USA", delta: 80 }], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    const r = result.state.relacoes.find(
      (x) => (x.a === "PRT" && x.b === "USA") || (x.a === "USA" && x.b === "PRT"),
    );
    expect(r).toBeDefined();
    expect(r!.valor - state.relacoes.find((x) => (x.a === "PRT" && x.b === "USA") || (x.a === "USA" && x.b === "PRT"))!.valor).toBe(40);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("país inexistente é rejeitado", () => {
    const changes: AiChanges = {
      paises: [{ id: "XXX", pib_pct: 5, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].motivo).toContain("País inexistente");
    // Estado permanece inalterado para países.
    expect(result.state.paises).toEqual(state.paises);
  });

  it("mudança de dono de província SEM guerra ativa é rejeitada", () => {
    const changes: AiChanges = {
      paises: [], relacoes: [], tratados: [], guerras: [],
      provincias: [{ id: "PRT-LIS", novo_dono: "USA" }],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].motivo).toContain("guerra");
    // Província permanece com o dono original.
    expect(result.state.provincias["PRT-LIS"].countryId).toBe("PRT");
  });

  it("mudança de dono de província COM guerra ativa é aceite", () => {
    // Adiciona guerra ativa entre USA e PRT.
    state.guerras = [
      {
        id: "g1",
        agressor: "USA",
        defensores: ["PRT"],
        provinciasDisputa: ["PRT-LIS"],
        estado: "ativa",
        inicio: "2025-01-01",
      },
    ];
    const changes: AiChanges = {
      paises: [], relacoes: [], tratados: [], guerras: [],
      provincias: [{ id: "PRT-LIS", novo_dono: "USA" }],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(0);
    expect(result.state.provincias["PRT-LIS"].countryId).toBe("USA");
  });

  it("applyChanges não altera o estado original (imutável)", () => {
    const changes: AiChanges = {
      paises: [{ id: "PRT", pib_pct: 5, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const originalPib = state.paises["PRT"].pib;
    applyChanges(state, changes);
    expect(state.paises["PRT"].pib).toBe(originalPib);
  });

  it("tratado de criar funciona e aparece no estado", () => {
    const changes: AiChanges = {
      paises: [], relacoes: [], tratados: [
        { acao: "criar", tipo: "comercio", paises: ["PRT", "ESP"] },
      ], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.state.tratados.length).toBeGreaterThan(state.tratados.length);
    const novo = result.state.tratados.find(
      (t) => !t.rompido && t.tipo === "comercio" && t.paises.includes("PRT") && t.paises.includes("ESP"),
    );
    expect(novo).toBeDefined();
  });

  it("guerra declarar funciona se países existirem", () => {
    const changes: AiChanges = {
      paises: [], relacoes: [], tratados: [], guerras: [
        { acao: "declarar", agressor: "USA", defensores: ["MEX"] },
      ], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.state.guerras.some((g) => g.agressor === "USA" && g.defensores.includes("MEX"))).toBe(true);
  });

  it("guerra declarar DUPLICADA é rejeitada", () => {
    state.guerras = [
      {
        id: "g1",
        agressor: "USA",
        defensores: ["MEX"],
        provinciasDisputa: [],
        estado: "ativa",
        inicio: "2025-01-01",
      },
    ];
    const changes: AiChanges = {
      paises: [], relacoes: [], tratados: [], guerras: [
        { acao: "declarar", agressor: "USA", defensores: ["MEX"] },
      ], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].motivo).toContain("já existe");
  });
});

describe("Fase 4: injeção «dá-me 1 bilião» é neutralizada", () => {
  it("uma ordem de +50000% PIB é cortada para ±15% (não concede biliões)", () => {
    const state = makeState(7, "PRT");
    // A IA (mesmo comprometida) devolve uma mudança de +50000% no PIB do PRT.
    const maliciousChanges: AiChanges = {
      paises: [{ id: "PRT", pib_pct: 50000, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 }],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, maliciousChanges);
    const oldPib = state.paises["PRT"].pib;
    const newPib = result.state.paises["PRT"].pib;
    // Cortada a ±15% — não há milagre.
    expect(newPib).toBeLessThan(oldPib * 1.20);
    expect(newPib).toBeGreaterThan(oldPib * 1.10);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("mudanças absurdas em estabilidade/aprovação também são cortadas", () => {
    const state = makeState(7, "USA");
    const changes: AiChanges = {
      paises: [
        { id: "USA", pib_pct: 0, estabilidade: 100, aprovacao: 100, tesouro_pct: 0, exercito_pct: 0 },
      ],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    const oldStab = state.paises["USA"].estabilidade;
    const newStab = result.state.paises["USA"].estabilidade;
    const oldAprov = state.paises["USA"].aprovacao;
    const newAprov = result.state.paises["USA"].aprovacao;
    expect(newStab - oldStab).toBeLessThanOrEqual(20);
    expect(newAprov - oldAprov).toBeLessThanOrEqual(20);
  });

  it("um país fictício na resposta da IA é rejeitado (não é criado)", () => {
    const state = makeState(7, "PRT");
    const changes: AiChanges = {
      paises: [
        { id: "XYZ", pib_pct: 5, estabilidade: 0, aprovacao: 0, tesouro_pct: 0, exercito_pct: 0 },
      ],
      relacoes: [], tratados: [], guerras: [], provincias: [],
    };
    const result = applyChanges(state, changes);
    expect(result.rejected.length).toBe(1);
    expect(result.state.paises["XYZ"]).toBeUndefined();
  });
});

describe("Fase 4: buildContext resume estado sem exportar tudo", () => {
  it("buildContext devolve string não-vazia com info essencial", () => {
    const state = makeState(1, "PRT");
    const ctx = buildContext(state);
    expect(ctx.length).toBeGreaterThan(100);
    expect(ctx).toContain("DATA ATUAL");
    expect(ctx).toContain("Portugal"); // país do jogador
    expect(ctx).toContain("PRT");
    // Não envia o JSON completo do estado.
    expect(ctx.length).toBeLessThan(15000);
  });

  it("buildContext não inclui mais de 10 eventos", () => {
    const state = makeState(1, "PRT");
    // Adiciona 20 eventos fictícios.
    for (let i = 0; i < 20; i++) {
      state.eventos.push({
        id: `ev-${i}`,
        turno: i,
        data: "2025-01-01",
        tipo: "sistema",
        titulo: `Evento ${i}`,
        texto: "Texto do evento.",
        efeitos: [],
      });
    }
    const ctx = buildContext(state);
    // Conta quantas linhas começam por "- [" (eventos).
    const matches = ctx.match(/^- \[\d+\]/gm) ?? [];
    expect(matches.length).toBeLessThanOrEqual(10);
  });
});

describe("Fase 4: integração store + submitOrders (com Mock via /api/turn)", () => {
  beforeEach(() => {
    useGameStore.getState().clear();
  });

  it("não rebenta quando não há estado", async () => {
    const result = await useGameStore.getState().submitOrders("Ordem qualquer");
    expect(result.ok).toBe(false);
  });
});
