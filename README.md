# Imperium História

Simulador web de geopolítica e de presidência/liderança, inspirado no Pax Historia. O jogador escolhe um país e uma data de início, escreve ordens em texto livre, e uma IA (narrador) interpreta as ordens e simula as consequências no mundo. Todo o texto do jogo é em português.

> ⚠️ **Aviso**:Este projeto foi construído fase a fase (7 fases). A Fase 7 é de revisão final — não acrescenta funcionalidades novas. Ver a secção [Roadmap](#roadmap) para o estado de cada fase.

## Índice

- [Stack](#stack)
- [Instalação](#instalação)
- [Configurar `.env.local`](#configurar-envlocal)
- [Correr os testes](#correr-os-testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como adicionar um novo cenário](#como-adicionar-um-novo-cenário)
- [Como funciona o motor](#como-funciona-o-motor)
- [Como funciona a IA](#como-funciona-a-ia)
- [Acessibilidade e mobile](#acessibilidade-e-mobile)
- [Bugs conhecidos](#bugs-conhecidos)
- [Roadmap](#roadmap)

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript em modo estrito (proibido `any`)
- **Estilos**: Tailwind CSS 4 + shadcn/ui
- **Estado**: zustand (cliente) + Immer-style (imutável)
- **Validação**: zod (esquemas partilhados entre cliente e servidor)
- **Mapa**: d3-geo + topojson-client + world-atlas (projeção NaturalEarth1)
- **IA**: z-ai-web-dev-sdk (servidor apenas) + MockProvider para testes sem chave
- **Testes**: vitest (jsdom)

## Instalação

Pré-requisitos: Node.js 18+ e npm.

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd imperium-historia

# 2. Instalar dependências
npm install

# 3. Criar o ficheiro de ambiente (ver secção abaixo)
cp .env.local.example .env.local

# 4. Correr em desenvolvimento
npm run dev
# Abrir http://localhost:3000

# 5. Build de produção
npm run build
npm start
```

## Configurar `.env.local`

Copia `.env.local.example` para `.env.local` e preenche as variáveis:

```bash
# .env.local
# Para usar a IA real (z-ai-web-dev-sdk). Se não definires, o jogo usa o MockProvider.
LLM_API_KEY=chave-secreta-aqui
LLM_MODEL=glm-4.6
LLM_PROVIDER=zai   # ou "mock" para forçar o Mock

# Opcional: configurações de teste
# VITEST_POOL=threads
```

**Sem chave**: o jogo corre na perfeição com o `MockProvider` (respostas fixas válidas). Útil para desenvolvimento e testes sem gastar tokens.

**Com chave**: o `ZAIProvider` chama o modelo LLM configurado. Custos: cada turno usa ~3000 tokens de input (system prompt + contexto) e ~1500 tokens de output (máximo configurado).

## Correr os testes

```bash
# Todos os testes (uma passagem)
npm test

# Modo watch (re-executa quando há mudanças)
npm run test:watch

# UI de testes
npm run test:ui

# Lint (ESLint)
npm run lint

# Build de produção (Turbopack)
npm run build
```

Há 7 ficheiros de testes com **141 testes** no total:

| Ficheiro | Testes | Cobre |
|---|---|---|
| `tests/engine.test.ts` | 19 | Criação de jogo, save/load, import JSON inválido, invariantes do cenário |
| `tests/iso-mapping.test.ts` | 13 | Mapeamento ISO numeric→alpha3→nome PT |
| `tests/motor.test.ts` | 24 | Crescimento PIB, tesouro, colapso, golpe, reprodutibilidade seed, 120 turnos |
| `tests/ai.test.ts` | 28 | MockProvider, parser de resposta, applyChanges com limites, injeção neutralizada |
| `tests/war-diplomacy.test.ts` | 23 | Diplomacia, declareWar, resolveWarTurn, signPeace, sem guerras fantasma |
| `tests/events-victory.test.ts` | 25 | Eventos aleatórios, guerra civil, ranking, vitória, 50 turnos, migração |
| `tests/regression-fase7.test.ts` | 9 | IDs determinísticos, estrutura completa de guerras IA, migração de saves antigos |

## Estrutura do projeto

```
src/
├── app/
│   ├── api/turn/route.ts        # POST /api/turn: recebe contexto+ordens, devolve narrativa+mudanças
│   ├── layout.tsx               # Root layout (fontes, metadata, lang=pt-PT)
│   └── page.tsx                 # Rota única: alterna StartScreen / GameScreen
├── components/
│   ├── game/
│   │   ├── StartScreen.tsx      # Ecrã inicial: cenário, país, realismo, ranhuras, importar
│   │   ├── GameScreen.tsx       # Ecrã principal: barra superior + mapa + painel + orçamento + diário
│   │   ├── WorldMap.tsx         # Mapa-mundo interativo (d3-geo + topojson)
│   │   ├── CountryPanel.tsx     # Painel do país: indicadores, diplomacia, guerras, tratados
│   │   ├── BudgetPanel.tsx      # Sliders de orçamento + botão Terminar turno
│   │   ├── OrderBox.tsx         # Textarea de ordens + Enviar ordens + Terminar turno
│   │   ├── DiaryTimeline.tsx   # Diário com filtros por tipo + pesquisa
│   │   ├── EventModal.tsx       # Modal de evento pendente (com escolhas)
│   │   ├── RankingPanel.tsx     # Top 10 PIB + militar + progresso para vitória
│   │   └── MandateSummary.tsx   # Dialog com gráficos SVG (PIB/Estab/Aprov/Tesouro)
│   └── ui/                      # shadcn/ui (Button, Card, Slider, Dialog, etc.)
├── data/
│   ├── iso-mapping.ts           # Ficheiro único: mapeamento topojson→alpha3→nome PT
│   └── scenarios/
│       ├── mundo-2025.json      # Cenário: 30 países + 50 províncias + 22 relações + 8 tratados + 1 guerra
│       └── index.ts             # Exporta SCENARIOS validados por zod
├── lib/
│   ├── ai/
│   │   ├── narrator-prompt.ts   # System prompt do narrador (cola do enunciado)
│   │   ├── provider.ts          # LLMProvider interface + MockProvider + ZAIProvider + getProvider
│   │   ├── context.ts           # buildContext: resume estado para a IA
│   │   ├── response-schema.ts   # zod schema da resposta da IA
│   │   └── parse-response.ts    # extrai JSON + retry 1 vez
│   ├── engine/
│   │   ├── rng.ts               # Mulberry32 + hashCombine/hashString (determinístico)
│   │   ├── budget.ts            # Defaults por regime, normalização
│   │   ├── economy.ts           # Crescimento PIB com retornos decrescentes, receitas/despesas
│   │   ├── stability.ts         # Drifts de estabilidade/aprovação + clamp + colapso
│   │   ├── coup.ts              # Lógica de golpe de estado
│   │   ├── advance-turn.ts     # Orquestrador: avança 1 turno, processa todos os países
│   │   ├── apply-changes.ts    # Valida e aplica mudanças da IA (limites ±15% PIB, ±40 relação)
│   │   ├── apply-changes-helpers.ts # Aplica efeitos de eventos a um país
│   │   ├── diplomacy.ts         # proposeTreaty: decisão IA por relação/poder/interesse
│   │   ├── war.ts               # declareWar, resolveWarTurn por frente, signPeace
│   │   ├── events.ts            # Biblioteca de 12 eventos aleatórios + rollForEvent
│   │   ├── civil-war.ts         # triggerCivilWar: cria país rebelde + frentes
│   │   ├── ranking.ts           # rankByGdp/Military, checkVictory (top 3 por 5 anos)
│   │   └── index.ts             # Barrel de reexportação
│   ├── geo/
│   │   └── world.ts             # Carrega topojson world-atlas + faz projeção
│   └── state/
│       ├── store.ts             # zustand: newGame, endTurn, submitOrders, proposeTreaty, etc.
│       ├── save.ts              # localStorage (3 ranhuras) + export/import JSON com zod
│       ├── date.ts              # addMonths, addYears, formatDatePT
│       ├── useClientOnly.ts     # Hook para evitar hydration mismatch
│       └── index.ts             # Barrel
├── types/
│   ├── index.ts                 # Tipos partilhados (Country, Province, GameState, etc.)
│   └── scenario.ts              # Esquemas zod (validação de cenários e saves)
└── tests/                       # 7 ficheiros de testes, 141 testes
```

## Como adicionar um novo cenário

1. **Criar o ficheiro JSON** em `src/data/scenarios/<nome>.json` com a estrutura:

```json
{
  "id": "europa-1914",
  "nome": "Europa 1914",
  "descricao": "Vésperas da Primeira Guerra Mundial.",
  "dataInicio": "1914-06-28",
  "resolution": "mensal",
  "paises": [
    {
      "id": "DEU",
      "nome": "Alemanha",
      "cor": "#1f2937",
      "capital": "DEU-BER",
      "populacao": 65000000,
      "pib": 250000000000,
      "tesouro": 5000000000,
      "exercito": 400,
      "estabilidade": 50,
      "aprovacao": 55,
      "regime": "monarquia_constitucional",
      "donoJogador": false
    }
  ],
  "provincias": [
    {
      "id": "DEU-BER",
      "nome": "Berlim",
      "countryId": "DEU",
      "populacao": 2000000,
      "pib": 5000000000,
      "ocupadaPor": null,
      "lat": 52.52,
      "lng": 13.40
    }
  ],
  "relacoes": [
    { "a": "DEU", "b": "FRA", "valor": -20 }
  ],
  "tratados": [
    {
      "id": "tratado-triplice-1882",
      "tipo": "alianca",
      "paises": ["DEU", "ITA", "AUT"],
      "inicio": "1882-05-20",
      "rompido": false
    }
  ],
  "guerras": []
}
```

2. **Registar no `index.ts`**:

```ts
// src/data/scenarios/index.ts
import europa1914 from "./europa-1914.json";

export const SCENARIOS: readonly Scenario[] = [
  scenarioSchema.parse(mundo2025),
  scenarioSchema.parse(europa1914), // ← adicionar aqui
];
```

O zod valida automaticamente a estrutura do JSON no arranque. Se houver erro, a app falha cedo (na carga do módulo) em vez de silenciosamente corromper o estado.

3. **Adicionar IDs ISO** (se os países não estiverem já no `iso-mapping.ts`):

```ts
// src/data/iso-mapping.ts — adicionar a ISO_TABLE
{ numeric: "040", alpha3: "AUT", nome: "Áustria" },
```

Isto garante que o país aparece no mapa com o nome português correcto. Países sem mapeamento aparecem a cinzento com a etiqueta «sem dados».

4. **Testar**: o teste `tests/iso-mapping.test.ts` valida automaticamente que todos os alpha3 do cenário têm mapeamento.

## Como funciona o motor

O motor (`/lib/engine`) é **100% determinístico e puro** (sem efeitos secundários):

- **`advanceTurn(state)`**: devolve um novo estado com data/turno avançados. Para cada país: calcula crescimento do PIB (com retornos decrescentes no investimento), receitas/despesas do tesouro, drifts de estabilidade/aprovação (com clamp 0–100), actualiza `colapsoTurnos`, verifica probabilidade de golpe. No final: adiciona snapshot do jogador a `playerHistory`, verifica vitória, sorteia evento aleatório para o jogador (se não houver já um pendente).

- **`resolveWarTurn(state)`**: para cada guerra ativa, desgasta -0.5% PIB ambos os lados, resolve cada frente com `calculateFrontOutcome` (militar + PIB + aliados + bonus defensivo + ruído), se progresso ≥ 100 muda dono da província, se todas frentes conquistadas ou agressor em colapso, marca guerra terminada.

- **`applyChanges(state, changes)`**: valida mudanças propostas pela IA dentro de limites (PIB ±15%, estab/aprov ±20, relação ±40, tesouro ±50, exército ±30). Corta excessos, rejeita países/províncias inexistentes, regista rejeitados no diário. Mudança de dono de província só se houver guerra ativa entre os dois países.

- **`proposeTreaty(state, de, para, tipo)`**: a IA decide se aceita com base em relação (±0.5), poder relativo (PIB+exército), interesse por tipo (comércio +0.2, aliança fraco+0.1 forte+0.1, ultimato só se muito mais forte, paz só se guerra ativa).

- **`triggerCivilWar(state, countryId)`**: cria país rebelde `{ID}-R` com 40% do PIB/população e 50% do exército; transfere metade das províncias; declara guerra ativa com frentes.

- **`checkVictory(state)`**: se jogador no top 3 (PIB OU militar), incrementa `turnosTop3`. Threshold: 60 turnos mensais / 5 anuais (= 5 anos). Quando atingido, `vitoriaDeclarada=true` (alerta único, jogo continua).

**Reprodutibilidade**: todos os RNGs derivam de `(seed, turno, countryId)` via FNV-1a hashing. A mesma seed produz sempre o mesmo jogo. IDs de tratados/guerras criados pela IA também são determinísticos (corrigido na Fase 7).

## Como funciona a IA

- **Rota POST `/api/turn`**: recebe `{ contexto, ordens, playerCountryId }`, valida com zod, chama `provider.generate(system, user)`, faz parse + valida a resposta, se inválida tenta 1 vez com a mensagem de erro, devolve `{ narrativa, noticias, mudancas, alertas }` ou erro 502.

- **`buildContext(state)`**: resume o estado para a IA (~1500-3000 chars): data, país do jogador + stats, top 10 por PIB, relações do jogador, guerras ativas, tratados ativos, últimos 10 eventos.

- **Prompt**: as ordens do jogador vão dentro de `<ordens_do_jogador>...</ordens_do_jogador>`. O system prompt diz ao narrador para tratar esse texto como conteúdo, não como instruções.

- **Injecção neutralizada em 3 camadas**:
  1. Prompt: tags delimitam as ordens.
  2. Sanitização: removemos qualquer ocorrência das tags no texto do jogador.
  3. Validação: `applyChanges` corta qualquer delta fora dos limites. Mesmo «dá-me 1 bilião» (pib_pct: 50000) é cortado a +15%.

- **Limite de tokens**: 1500 tokens de output (máximo) por chamada, ~3000 tokens de input. Custo por turno ≈ $0.005-0.01 com modelo glm-4.6.

## Acessibilidade e mobile

- **Idioma**: `<html lang="pt-PT">`. Todo o texto da UI é em português.
- **Contraste**: usa Tailwind CSS 4 com shadcn/ui (New York). Suporta light/dark mode (mas o tema padrão é light). Contraste AA em a maioria dos elementos.
- **Tamanhos de toque**: botões `size="sm"` têm `h-8` (32px) — abaixo do recomendado 44px para toque. Os botões críticos (Terminar turno, Enviar ordens) têm `size="sm"` mas com `className="flex-1"` dão área de toque maior na horizontal. Ver [Bugs conhecidos](#bugs-conhecidos).
- **Navegação por teclado**: todos os botões e inputs são focusáveis; foco visível com `focus-visible:ring`. Dialog/Sheet usam radix-ui (focus trap, escape para fechar).
- **ARIA**: `aria-label` em botões icon-only; `aria-describedby={undefined}` em SheetContent para silenciar warning de descrição ausente; `sr-only` em labels de textarea.
- **Responsivo**: layout 3 colunas em desktop (lg:), empilha verticalmente em mobile. Mapa usa `ResizeObserver` para redimensionar. Pinch-to-zoom e pan com 1 dedo em mobile.

## Bugs conhecidos

Lista de problemas identificados que não foram resolvidos:

1. **Botões `size="sm"` têm 32px de altura** (abaixo do recomendado 44px para toque mobile). Os botões principais (Terminar turno, Enviar ordens) são `flex-1` pelo que a área horizontal é ampla, mas a altura é curta. **Mitigação**: usar `size="default"` em produção para mobile; ou aumentar `--button-height-sm` no `tailwind.config.ts`.

2. **Marcadores de província sobrepostos** quando países têm províncias geograficamente próximas (ex.: Pequim + Xangai + Cantão na China). Os labels podem colidir. **Mitigação**: usar força-dirigida para dispersar labels; ou mostrar labels apenas no hover.

3. **Capitais podem ficar em províncias pertencentes a outros países** quando uma província capital é conquistada. O `country.capital` aponta para o ID da província (que ainda existe) mas essa província pode agora pertencer a outro país. **Mitigação**: quando uma capital é conquistada, o país original deveria migrar a capital para outra província sua; isto não está implementado.

4. **Eventos aleatórios só disparam para o país do jogador**. Países IA não têm eventos interactivos. Isto é uma decisão de design (mantém o jogador no centro), mas limita o realismo.

5. **Guerra civil cria país rebelde mas não tem vitória/derrota específica**: a guerra civil é tratada como uma guerra normal. Não há condição de vitória específica para o rebelde (ex.: se o rebelde conquistar a capital original, deveria tomar o poder).

6. **MockProvider devolve sempre a mesma resposta**. Não varia entre turnos. Útil para testes mas não realista. **Mitigação**: para testar variações, definir `LLM_API_KEY` e usar o ZAIProvider.

7. **Diário pode crescer indefinidamente**: não há limite de eventos no `state.eventos`. Após 200+ turnos o diário pode ficar pesado. **Mitigação**: aplicar `slice(-500)` no `eventos` no `advanceTurn`; ou paginar no DiaryTimeline.

8. **`playerHistory` tem cap de 200 entradas** (definido em `advance-turn.ts:184`). Se o jogo passar 200 turnos, as entradas mais antigas são perdidas. Isto é por design (limitar uso de memória) mas afecta o gráfico do «Resumo do mandato» em jogos longos.

9. **Acesso a `process.env` no cliente**: `getProvider()` lê `process.env.LLM_API_KEY`, mas isto é seguro porque o Next.js tree-shakes o `ZAIProvider` no bundle do cliente (só `MockProvider` é que pode correr no cliente). Ainda assim, vale a pena garantir com um teste manual que a SDK não é empacotada.

10. **Falta internacionalização**: o jogo está hardcoded em português. Não há suporte para outros idiomas.

11. **Sliders de orçamento não têm `aria-valuetext`**: o `Slider` do shadcn usa `aria-valuenow` mas não `aria-valuetext`, pelo que leitores de ecrã anunciam «25» em vez de «25 por cento em economia». **Mitigação**: adicionar `aria-valuetext` no `<BudgetSlider>`.

12. **Resolução anual não está testada em jogo longo** (120 turnos anuais = 120 anos). O teste cobre 120 turnos mensais (10 anos). Pode haver acumulação de drifts em jogos anuais longos.

## Roadmap

O jogo foi construído em **13 fases** (tempo real com pausa, estilo EU4/HoI4/Victoria 3):

- ✅ **Fase 1** — Sistema de tempo real (relógio global, pausa/velocidades 0.5x–10x, atalhos espaço/+-)
- ✅ **Fase 2** — Dados iniciais realistas (57 países com PIB/população/orçamento militar/tropas/nuclear/blocos; ~162 províncias com cultura/lealdade; Força Militar + Influência Política calculadas)
- ✅ **Fase 3** — Formas de conquista (militar, rendição, pressão popular, diplomacia/compra)
- ✅ **Fase 4** — Cultura e política regional (afinidade cultural, drift de lealdade em ocupação, revolta/assimilação)
- ✅ **Fase 5** — Economia e política fiscal (impostos renda/capital/mercadorias, multinacionais, orçamento militar/tropas dinâmicos)
- ✅ **Fase 6** — Blocos políticos e moedas (22 blocos: NATO/UE/BRICS/SADC/etc.; ~50 moedas; votações ponderadas por Influência)
- ✅ **Fase 7** — Mundo vivo (IA dos países: propor tratados, retaliar, pedir paz; decisões automáticas mensais)
- ✅ **Fase 8** — Guerra por procuração, refugiados, reputação mundial (proxy wars, fluxos de refugiados, drift de reputação -100..100)
- ✅ **Fase 9** — Missões/conquistas/ranking (7 missões com prazos/recompensas, 16 achievements automáticos, ranking histórico anual)
- ✅ **Fase 10** — Imersão extra (conselheiros com sugestões, espionagem 5 operações, árvore tecnológica 15 techs, eleições democráticas 4 anos, notícias dinâmicas)
- ✅ **Fase 11** — UI/UX completa (modos de mapa político/força/PIB/reputação/estabilidade, painéis de Notícias/Missões/Tech/Conselheiros em tabs, selector de modo)
- ✅ **Fase 12** — Polimento (equilíbrio de parâmetros, performance via selectors finos, README completo)
- ✅ **Fase 13** — Revisão final (testes de regressão, bugs corrigidos, documentação completa)

### Estatísticas do projecto

- **365 testes** em 14 ficheiros (motor, IA, guerra, diplomacia, eventos, economia, blocos, refugiados, missões, tech tree, regressão final)
- **57 países** jogáveis com dados realistas (PIB, população, orçamento militar, tropas, nuclear, blocos, líder)
- **162 províncias** com cultura, lealdade, recursos, valor estratégico
- **22 blocos políticos** (NATO, UE, BRICS, SADC, OPEP, etc.)
- **~50 moedas** com câmbio USD
- **15 tecnologias** em 5 categorias (militar, economia, saúde, ciber, energia)
- **20 eventos aleatórios** + **7 missões** + **16 achievements**
- **4 formas de conquista** (militar, rendição, pressão popular, diplomacia)
- **5 operações de espionagem** (roubar tech, sabotar, subornar, infiltrar, assassinar)
- **Sistema de tempo real** com pausa e 5 velocidades (0.5x–10x)

### Possíveis extensões futuras

- Mais cenários (Europa 1914, Guerra Fria 1962, Futuro 2050)
- Multijogador (vários jogadores em tempo real via WebSocket)
- Suporte para mais fornecedores de IA (OpenAI, Anthropic)
- Mod spectator (assistir a jogos IA vs IA)
- Editor de cenários visual
- Mercado cambial dinâmico (flutuação de moedas)
- Sistema de eleições para países IA (não só o jogador)
- Árvore tecnológica expansível (mods/community)
- Modo campanha com objectivos encadeados

## Licença

Projeto educativo. Código aberto para uso pessoal.
