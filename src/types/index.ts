// src/types/index.ts
// Tipos partilhados do «Imperium História».
// Mantemos tipos pequenos e explícitos; `any` é proibido em todo o projeto.

export type RegimeType =
  | "democracia"
  | "republica"
  | "monarquia_constitucional"
  | "autocracia"
  | "regime_partido_unico"
  | "teocracia"
  | "junta_militar"
  | "monarquia_absoluta";

export type RealismLevel = "casual" | "normal" | "brutal";

export interface Country {
  /** Identificador ISO alfa-3 (ex.: «PRT», «USA») — chave estável em todo o jogo. */
  readonly id: string;
  /** Nome em português, presentation-only. */
  nome: string;
  /** Cor hexadecimal usada no mapa e nos painéis (ex.: «#1E90FF»). */
  cor: string;
  /** ID da província que contém a capital. */
  capital: string | null;
  /** População absoluta (habitantes). */
  populacao: number;
  /** PIB em dólares americanos (corrente). */
  pib: number;
  /** Tesouro público em dólares americanos. Pode ser negativo (dívida). */
  tesouro: number;
  /** Força militar agregada (índice 0–1000). Aproximação qualitativa usada pelo motor de guerra. */
  exercito: number;
  /** Estabilidade interna (0–100). Sempre clampada. */
  estabilidade: number;
  /** Aprovação popular do governo (0–100). Sempre clampada. */
  aprovacao: number;
  /** Tipo de regime atual. */
  regime: RegimeType;
  /** True se este país é controlado pelo jogador. */
  donoJogador: boolean;
  // --- Fase 2 (dados realistas) ---
  /** Orçamento militar anual em dólares (aprox. SIPRI 2023–24). */
  orcamentoMilitar: number;
  /** Número de efetivos militares ativos. */
  tropas: number;
  /** Possui armas nucleares. */
  nuclear: boolean;
  /** Blocos políticos/económicos/militares a que pertence (NATO, BRICS, UE, ...). */
  blocos: string[];
  /** Recursos económicos dominantes (petróleo, gás, mineração, tecnologia...). */
  recursos: string[];
  /** Nome do atual chefe de Estado/governo (apresentação). */
  lider: string;
  // --- Fase 5 (economia e política fiscal) ---
  /** Política fiscal do país (impostos). Defaults por regime se ausente. */
  taxPolicy?: TaxPolicy;
  /** Código ISO 4217 da moeda nacional (ex.: «USD», «EUR», «BRL»). */
  moeda?: string;
  // --- Fase 7/8 (mundo vivo, refugiados, reputação) ---
  /** Reputação mundial do país (-100 pária .. +100 parceiro). Default 0. */
  reputacao?: number;
  /** Países-proxy (rebeldes apadrinhados) criados por este país. */
  proxies?: string[];
  /** Refugiados acolhidos neste país (acumulados). */
  refugiadosAcolhidos?: number;
  /** Refugiados gerados por conflitos neste país (acumulados). */
  refugiadosGerados?: number;
}

/**
 * Política fiscal de um país (Fase 5). Valores em percentagem (0–50).
 * A taxa efetiva é ponderada: renda (60%) + capital (30%) + mercadorias (10%).
 */
export interface TaxPolicy {
  /** Imposto sobre o rendimento (trabalho). 0–50%. */
  taxa: number;
  /** Imposto sobre o capital (lucros, dividendos). 0–50%. */
  taxaCapital: number;
  /** IVA / imposto sobre mercadorias. 0–30%. */
  taxaMercadorias: number;
}

/** Multinacional instalada num país (Fase 5). */
export interface Multinational {
  readonly id: string;
  /** Nome fictício mas plausível (ex.: «TechCorp Global»). */
  nome: string;
  /** País onde tem a sede (lucros retornam para aqui). */
  sede: string;
  /** País onde opera (paga impostos aqui). */
  paisOperacao: string;
  /** Sector de atividade (tecnologia, petróleo, farmacêutica, ...). */
  sector: string;
  /** Receita anual em dólares. */
  receita: number;
  /** Número de empregados no país de operação. */
  empregados: number;
  /** Mês de instalação (turno). */
  turnoInstalacao: number;
}

/** Votação em curso num bloco político (Fase 6). */
export interface BlocVote {
  readonly id: string;
  /** ID do bloco (ex.: «NATO», «UE»). */
  blocoId: string;
  /** Descrição da proposta (ex.: «Admitir Ucrânia», «Sancionar Rússia»). */
  proposta: string;
  /** Tipo de proposta: admitir membro, sancionar, resolução política. */
  tipo: "admissao" | "sancionar" | "resolucao";
  /** Países-alvo da proposta (ex.: país a admitir, país a sancionar). */
  alvos: string[];
  /** Turno de abertura da votação. */
  turnoAbertura: number;
  /** Votos por país membro: país → (sim/não/abstenção). */
  votos: Record<string, "sim" | "nao" | "abstencao" | null>;
  /** True se a votação já fechou (maioria decidida). */
  fechada: boolean;
  /** Resultado final se fechada: aprovada/rejeitada. */
  resultado?: "aprovada" | "rejeitada";
}

/** Fluxo de refugiados entre países (Fase 8). */
export interface RefugeeFlow {
  readonly id: string;
  /** País de origem (em guerra/colapso). */
  origem: string;
  /** País de acolhimento. */
  destino: string;
  /** Número de refugiados. */
  numero: number;
  /** Turno do fluxo. */
  turno: number;
  /** Motivo (ex.: «Guerra X-Y», «Colapso de Z»). */
  motivo: string;
}

// === Fase 9: Missões / Achievements / Ranking histórico ==================

/** Tipo de objectivo de uma missão. */
export type MissionObjective =
  | "atingir_pib" // atingir um PIB específico
  | "conquistar_provincias" // conquistar N províncias
  | "manter_estabilidade" // manter estabilidade > threshold por N meses
  | "elevar_reputacao" // elevar reputação a N
  | "vencer_guerra" // vencer N guerras
  | "aliar_blocos" // juntar-se a N blocos
  | "pesquisar_tech"; // pesquisar N techs

/** Estado de uma missão. */
export type MissionStatus = "ativa" | "completa" | "falhada";

/** Missão: objectivo com prazo e recompensa (Fase 9). */
export interface Mission {
  readonly id: string;
  /** Título curto (ex.: «Potência Económica»). */
  titulo: string;
  /** Descrição legível. */
  descricao: string;
  /** Tipo de objectivo. */
  objetivo: MissionObjective;
  /** Valor-alvo (ex.: PIB $1T = 1e12; N províncias = 5). */
  alvo: number;
  /** Progresso actual (0..alvo). */
  progresso: number;
  /** Turno de atribuição. */
  turnoAtribuicao: number;
  /** Turno-limite (0 = sem prazo). */
  prazo: number;
  /** Recompensa em tesouro ($). */
  recompensaTesouro: number;
  /** Recompensa em reputação. */
  recompensaReputacao: number;
  /** Estado actual. */
  status: MissionStatus;
}

/** Achievement: marco histórico desbloqueado automaticamente (Fase 9). */
export interface Achievement {
  readonly id: string;
  /** Título (ex.: «Primeira Vitória Militar»). */
  titulo: string;
  /** Descrição. */
  descricao: string;
  /** Categoria (economia, guerra, diplomacia, politica, ciencia). */
  categoria: "economia" | "guerra" | "diplomacia" | "politica" | "ciencia";
  /** Turno em que foi desbloqueado (null se ainda bloqueado). */
  turnoDesbloqueio: number | null;
}

/** Snapshot periódico do ranking mundial (Fase 9). */
export interface RankingSnapshot {
  readonly id: string;
  turno: number;
  data: string;
  /** Top 10 por PIB (IDs dos países, ordenados). */
  top10Pib: string[];
  /** Top 10 por Força Militar (IDs). */
  top10Forca: string[];
  /** Posição do jogador no ranking PIB (0-indexed; -1 se não top 10). */
  posicaoJogadorPib: number;
  /** Posição do jogador no ranking Força. */
  posicaoJogadorForca: number;
}

// === Fase 10: Conselheiros / Espionagem / Tech Tree / Eleições / Notícias ==

/** Tipo de conselheiro. */
export type AdvisorType = "economico" | "militar" | "diplomatico" | "seguranca";

/** Conselheiro: dá sugestões baseadas no estado (Fase 10). */
export interface Advisor {
  /** Tipo (ex.: «economico»). */
  tipo: AdvisorType;
  /** Nome do conselheiro. */
  nome: string;
  /** Nível de confiança do jogador (0-100; afecta qualidade do conselho). */
  confianca: number;
}

/** Tipo de operação de espionagem. */
export type SpyOperationType =
  | "roubar_tech" // roubar tecnologia de outro país
  | "sabotar_infra" // sabotar infraestrutura (PIB -)
  | "subornar_oficial" // subornar (relação +)
  | "infiltrar_governo" // infiltrar (info sobre planos)
  | "assassinar"; // assassinar líder (estabilidade -)

/** Resultado de uma operação de espionagem. */
export interface SpyOperationResult {
  sucesso: boolean;
  mensagem: string;
  /** Efeitos aplicados (resumo legível). */
  efeitos: string[];
}

/** Nodo de árvore tecnológica (Fase 10). */
export interface TechNode {
  readonly id: string;
  /** Nome (ex.: «Semicondutores Avançados»). */
  nome: string;
  /** Descrição. */
  descricao: string;
  /** Categoria (militar, economia, saude, ciber, energia). */
  categoria: "militar" | "economia" | "saude" | "ciber" | "energia";
  /** Custo em tesouro ($). */
  custo: number;
  /** Turnos para pesquisar. */
  turnosPesquisa: number;
  /** Techs necessárias (IDs). */
  prereqs: string[];
  /** Bónus aplicado quando desbloqueada (resumo legível). */
  bonus: string;
}

/** Estado de pesquisa de um país. */
export interface ResearchState {
  /** IDs das techs já desbloqueadas. */
  desbloqueadas: string[];
  /** ID da tech em pesquisa (null se nenhuma). */
  emPesquisa: string | null;
  /** Turnos restantes para completar a pesquisa actual. */
  turnosRestantes: number;
}

/** Resultado de uma eleição (Fase 10). */
export interface ElectionResult {
  readonly id: string;
  turno: number;
  data: string;
  /** Aprovação do jogador na altura (% de votos). */
  votosJogador: number;
  /** Aprovação do opositor (% de votos). */
  votosOpositor: number;
  /** True se o jogador venceu (votos > 50). */
  venceu: boolean;
  /** Novo líder (se o jogador perdeu). */
  novoLider?: string;
}

/** Item de notícia dinâmica (Fase 10). */
export interface NewsItem {
  readonly id: string;
  turno: number;
  data: string;
  /** Categoria (igual a GameEventType + «mundo»). */
  categoria: "guerra" | "economia" | "diplomacia" | "politica" | "evento" | "sistema" | "mundo";
  /** Título curto. */
  titulo: string;
  /** Texto da notícia (1-2 frases). */
  texto: string;
  /** País relacionado (opcional). */
  countryId?: string;
}

export interface Province {
  readonly id: string;
  nome: string;
  /** ID do país que actualmente controla a província. */
  countryId: string;
  populacao: number;
  pib: number;
  /** ID do país ocupante, se diferente do dono formal. */
  ocupadaPor: string | null;
  /** Latitude do centro da província (para projecção no mapa). Opcional. */
  lat?: number;
  /** Longitude do centro da província (para projecção no mapa). Opcional. */
  lng?: number;
  // --- Fase 2 (dados regionais) ---
  /** Cultura/etnia dominante da província (afeta lealdade e ocupação). */
  cultura?: string;
  /** Lealdade da população ao governo central (0–100). */
  lealdade?: number;
  /** Recursos económicos locais. */
  recursos?: string[];
  /** Valor estratégico militar/económico (1–5). */
  valorEstrategico?: number;
  // --- Fase 4 (cultura e ocupação) ---
  /** Meses consecutivos sob ocupação estrangeira (0 se não ocupada). */
  mesesOcupada?: number;
}

/** Relação bilateral entre dois países. Valor entre -100 (inimizade) e 100 (aliança). */
export interface Relation {
  a: string;
  b: string;
  valor: number;
}

export type TreatyType = "alianca" | "comercio" | "nao_agressao" | "paz";

export interface Treaty {
  readonly id: string;
  tipo: TreatyType;
  /** IDs dos países signatários (≥2). */
  paises: string[];
  /** Data de início no jogo (formato ISO «YYYY-MM-DD»). */
  inicio: string;
  /** True se o tratado já foi rompido ou caducou. */
  rompido: boolean;
}

export type WarStatus = "ativa" | "pausa" | "terminada";

/** Resultado de uma frente de batalha num turno (província em disputa). */
export interface WarFront {
  /** ID da província disputada. */
  readonly provinceId: string;
  /** Progresso do agressor: 0 = sem avanço, 100 = conquista total. */
  progresso: number;
  /** Último resultado calculado (delta em pontos, -10 a +10). */
  ultimoDelta: number;
}

/** Objetivo declarado da guerra, pelo agressor. */
export type WarObjective =
  | "conquistar" // ganhar controlo das províncias disputadas
  | "saquear" // infligir danos económicos e retirar
  | "humilhar" // forçar tratado sem ganhos territoriais
  | "defender"; // warscore defensivo — manter statu quo

/**
 * Método de conquista (Fase 3). Cada país pode tentar conquistar outro por
 * qualquer destas 4 vias, com pré-condições próprias.
 */
export type ConquestMethod =
  | "militar" // guerra declarada, frentes avançam até 100
  | "rendicao" // país fraco cede sem luta (estabilidade < 30 OU exército < 50%)
  | "pressao_popular" // agitador financia revolta numa província desleal
  | "diplomacia"; // compra diplomática de província (país rico → país em crise)

export interface War {
  readonly id: string;
  /** ID do país agressor. */
  agressor: string;
  /** Lista de IDs dos países defensores. */
  defensores: string[];
  /** IDs das províncias disputadas. Pode ser vazio (guerra total). */
  provinciasDisputa: string[];
  /** Frentes ativas (uma por província em disputa). */
  frentes: WarFront[];
  /** Objetivo do agressor. */
  objetivo: WarObjective;
  estado: WarStatus;
  /** Data de início (ISO). */
  inicio: string;
  /** Indemnizações acordadas em caso de paz (0 se ainda em guerra). */
  indemnizacoes: number;
  /** Turno em que a guerra terminou (null se ainda ativa). */
  turnoFim: number | null;
}

/** Tipos de propostas diplomáticas que o jogador (ou IA) pode fazer. */
export type DiplomaticProposalType =
  | "alianca"
  | "comercio"
  | "nao_agressao"
  | "paz"
  | "ultimato";

export interface DiplomaticProposal {
  readonly id: string;
  de: string;
  para: string;
  tipo: DiplomaticProposalType;
  /** True se aceite, false se rejeitado. */
  aceite: boolean;
  /** Razão amigável da decisão. */
  motivo: string;
  turno: number;
  data: string;
}

/** Efeito de uma escolha de evento: deltas a aplicar ao país do jogador. */
export interface EventChoiceEffects {
  pib_pct?: number;
  estabilidade?: number;
  aprovacao?: number;
  tesouro_pct?: number;
  exercito_pct?: number;
  /** Mensagem adicional a registar no diário (ex.: «Guerra civil evitada»). */
  nota?: string;
}

/** Uma escolha possível para um evento aleatório. */
export interface EventChoice {
  readonly id: string;
  label: string;
  descricao?: string;
  efeitos: EventChoiceEffects;
}

/** Um evento aleatório que pode disparar para o país do jogador. */
export interface RandomEvent {
  readonly id: string;
  tipo: GameEventType;
  titulo: string;
  texto: string;
  choices: EventChoice[];
  /** Fase 7: true se este evento foi disparado em resposta a outro evento/acção. */
  encadeado?: boolean;
}

/** Snapshot periódico do país do jogador, para gráficos no resumo do mandato. */
export interface PlayerHistoryEntry {
  turno: number;
  data: string;
  pib: number;
  tesouro: number;
  estabilidade: number;
  aprovacao: number;
  exercito: number;
}

/** Evento pendente de resolução pelo jogador (mostrado num modal). */
export interface PendingEvent {
  evento: RandomEvent;
  turno: number;
  data: string;
}

export type GameEventType =
  | "guerra"
  | "economia"
  | "diplomacia"
  | "politica"
  | "evento"
  | "sistema";

export interface GameEvent {
  readonly id: string;
  /** Turno em que o evento ocorreu (0-indexado). */
  turno: number;
  /** Data ISO do evento no mundo do jogo. */
  data: string;
  tipo: GameEventType;
  titulo: string;
  texto: string;
  /** Efeitos aplicados ao estado (resumo legível, deltas já aplicados). */
  efeitos: string[];
}

/**
 * Velocidade do relógio do jogo em «dias de jogo por segundo real».
 * 0.5 = lento, 10 = muito rápido.
 */
export type GameSpeed = 0.5 | 1 | 2 | 5 | 10;

/** Lista ordenada das velocidades suportadas (para ciclar com +/-). */
export const GAME_SPEEDS: readonly GameSpeed[] = [0.5, 1, 2, 5, 10];

/** Estado do relógio global (Fase 1: tempo real). */
export interface TimeState {
  /** True quando o relógio está pausado. */
  pausado: boolean;
  /** Velocidade atual (dias de jogo por segundo real). */
  velocidade: GameSpeed;
  /** Pausa automática em eventos importantes (guerra, golpe, crise, diplomacia). */
  autoPauseEventos: boolean;
}

/** Configuração imutável de uma partida. */
export interface GameConfig {
  /** ID do cenário (ex.: «mundo-2025»). */
  readonly scenarioId: string;
  /** Resolução temporal do turno: «mensal» ou «anual». */
  resolution: "mensal" | "anual";
  realism: RealismLevel;
  /** Semente do gerador pseudo-aleatório, guardada para reprodutibilidade. */
  seed: number;
  /** Versão do formato de save — para migração. */
  version: number;
}

/**
 * Distribuição do orçamento por setores. Cada valor é uma percentagem (0–100).
 * Não precisa de somar 100 — o motor normaliza (soma > 100 escala para baixo,
 * soma < 100 mantém o excesso como poupança no tesouro).
 */
export interface BudgetAllocation {
  economia: number;
  exercito: number;
  saudeEducacao: number;
  seguranca: number;
}

export interface GameState {
  config: GameConfig;
  /** Data atual no mundo do jogo (ISO, com dia — o relógio avança dia a dia). */
  dataAtual: string;
  /** Turno atual (0-indexado; 1 turno = 1 mês de motor). */
  turno: number;
  /** Estado do relógio (pausa, velocidade, auto-pausa). */
  timeState: TimeState;
  /** Mapa ID -> Country. */
  paises: Record<string, Country>;
  /** Mapa ID -> Province. */
  provincias: Record<string, Province>;
  /** Lista de relações bilaterais (uma entrada por par). */
  relacoes: Relation[];
  /** Lista de tratados ativos/históricos. */
  tratados: Treaty[];
  /** Lista de guerras. */
  guerras: War[];
  /** Histórico de eventos, ordenado do mais antigo para o mais recente. */
  eventos: GameEvent[];
  /** ID do país controlado pelo jogador. */
  playerCountryId: string | null;
  /** Orçamento do jogador para o próximo turno. */
  playerBudget: BudgetAllocation;
  /** Política fiscal do jogador (Fase 5). */
  playerTaxPolicy?: TaxPolicy;
  /** Turnos consecutivos em colapso (estabilidade = 0), por país. */
  colapsoTurnos: Record<string, number>;
  /** Histórico de propostas diplomáticas (aceites e rejeitadas). */
  propostas: DiplomaticProposal[];
  /** Evento pendente de resolução pelo jogador (null se nenhum). */
  pendingEvent: PendingEvent | null;
  /** Snapshots periódicos do país do jogador (para gráficos). */
  playerHistory: PlayerHistoryEntry[];
  /** Turnos consecutivos em que o jogador esteve no top 3 (PIB ou militar). */
  turnosTop3: number;
  /** True se a vitória já foi declarada (alerta único). */
  vitoriaDeclarada: boolean;
  // --- Fase 5 (economia e política fiscal) ---
  /** Multinacionais instaladas em países do mundo. */
  multinacionais: Multinational[];
  // --- Fase 6 (blocos e moedas) ---
  /** Votações em curso ou encerradas em blocos políticos. */
  votacoes: BlocVote[];
  // --- Fase 8 (refugiados) ---
  /** Fluxos de refugiados registados (histórico). */
  refugiadosFluxos: RefugeeFlow[];
  // --- Fase 9 (missões / achievements / ranking histórico) ---
  /** Missões activas/completas/falhadas do jogador. */
  missoes: Mission[];
  /** Achievements desbloqueados. */
  achievements: Achievement[];
  /** Snapshots periódicos do ranking mundial. */
  rankingsHistorico: RankingSnapshot[];
  // --- Fase 10 (imersão extra) ---
  /** Conselheiros do país do jogador. */
  conselheiros: Advisor[];
  /** Estado de pesquisa tecnológica do país do jogador. */
  pesquisa: ResearchState;
  /** Resultados de eleições (histórico). */
  eleicoes: ElectionResult[];
  /** Notícias dinâmicas recentes (máx. 50). */
  noticias: NewsItem[];
}
