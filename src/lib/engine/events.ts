// src/lib/engine/events.ts
// Biblioteca de eventos aleatórios + função de disparo.
// Cada evento tem: condition (estado do país), choices (2-3 com efeitos).
// A probabilidade de disparar depende do estado do país (instabilidade, dívida,
// colapso, etc.).
//
// Apenas eventos para o país do jogador; países IA não disparam eventos
// interactivos (apenas o motor pode afectá-los indirectamente).

import type { Country, GameState, RandomEvent } from "@/types";
import { Rng } from "./rng";
import { applyChangesToCountry } from "./apply-changes-helpers";

/** Chance base de um evento disparar por turno (0–1). */
const BASE_EVENT_CHANCE = 0.25;

/** Biblioteca canónica de eventos. */
export const EVENT_LIBRARY: readonly RandomEvent[] = [
  // 1. Crise económica
  {
    id: "crise-economica",
    tipo: "economia",
    titulo: "Crise económica",
    texto: "Os mercados abanam. Vários bancos centrais elevam taxas e os investidores recuam. O país precisa de reagir.",
    choices: [
      {
        id: "austeridade",
        label: "Plano de austeridade",
        descricao: "Corta despesa pública; o PIB contrai-se mas o tesouro recupera.",
        efeitos: { pib_pct: -2, estabilidade: -5, aprovacao: -8, tesouro_pct: 8, nota: "Austeridade imposta." },
      },
      {
        id: "estimulo",
        label: "Estímulo fiscal",
        descricao: "Gasta para reanimar a economia; tesouro cai mas PIB mantém-se.",
        efeitos: { pib_pct: 0, estabilidade: +2, aprovacao: +5, tesouro_pct: -10, nota: "Estímulo decretado." },
      },
      {
        id: "ignorar",
        label: "Não intervir",
        descricao: "Deixa o mercado ajustar-se sozinho.",
        efeitos: { pib_pct: -1.5, estabilidade: -3, aprovacao: -3, nota: "Inércia governamental." },
      },
    ],
  },
  // 2. Protestos populares
  {
    id: "protestos",
    tipo: "politica",
    titulo: "Protestos em massa",
    texto: "Milhares de pessoas nas ruas protestam contra o custo de vida. A polícia pede orientações.",
    choices: [
      {
        id: "repressao",
        label: "Reprimir com força",
        descricao: "A estabilidade sobe a curto prazo, mas a aprovação despenca.",
        efeitos: { estabilidade: +5, aprovacao: -10, nota: "Repressão dura." },
      },
      {
        id: "dialogo",
        label: "Diálogo e reformas",
        descricao: "Negocia com os manifestantes; sobe a aprovação mas requer recursos.",
        efeitos: { estabilidade: +2, aprovacao: +8, tesouro_pct: -3, nota: "Diálogo iniciado." },
      },
      {
        id: "ignorar",
        label: "Ignorar",
        descricao: "Deixa os protestos arrefecer sozinhos — arriscado.",
        efeitos: { estabilidade: -3, aprovacao: -5, nota: "Protestos ignorados." },
      },
    ],
  },
  // 3. Pandemia
  {
    id: "pandemia",
    tipo: "evento",
    titulo: "Surto epidémico",
    texto: "Um novo vírus começa a espalhar-se. A OMS recomenda medidas urgentes.",
    choices: [
      {
        id: "lockdown",
        label: "Confinamento total",
        descricao: "A economia contrai-se fortemente, mas a estabilidade mantém-se.",
        efeitos: { pib_pct: -3, estabilidade: +5, aprovacao: 0, nota: "Confinamento decretado." },
      },
      {
        id: "moderada",
        label: "Resposta moderada",
        descricao: "Restrições parciais; equilíbrio entre economia e saúde.",
        efeitos: { pib_pct: -1.5, estabilidade: -3, aprovacao: -2, nota: "Medidas moderadas." },
      },
      {
        id: "ignorar",
        label: "Não intervir",
        descricao: "Deixa a doença correr; custos humanos elevados.",
        efeitos: { pib_pct: -1, estabilidade: -15, aprovacao: -10, nota: "Inércia face à pandemia." },
      },
    ],
  },
  // 4. Descoberta de recursos
  {
    id: "descoberta-recursos",
    tipo: "economia",
    titulo: "Descoberta de recursos",
    texto: "Geólogos encontram um vasto jazigo de matérias-primas em território nacional.",
    choices: [
      {
        id: "explorar",
        label: "Exploração intensiva",
        descricao: "Injeta receita no tesouro, mas desgasta a estabilidade ambiental.",
        efeitos: { tesouro_pct: 15, estabilidade: -3, aprovacao: +3, nota: "Exploração iniciada." },
      },
      {
        id: "preservar",
        label: "Preservar e Explorar depois",
        descricao: "Adia a extração; sobe a aprovação dos ambientalistas.",
        efeitos: { estabilidade: +5, aprovacao: +5, nota: "Preservação decidida." },
      },
      {
        id: "joint",
        label: "Parceria internacional",
        descricao: "Convoca investidores estrangeiros; melhora relações.",
        efeitos: { tesouro_pct: 8, aprovacao: +2, nota: "Parceria assinada." },
      },
    ],
  },
  // 5. Desastre natural
  {
    id: "desastre-natural",
    tipo: "evento",
    titulo: "Desastre natural",
    texto: "Um sismo severo atinge uma região densamente povoada.",
    choices: [
      {
        id: "forte",
        label: "Resposta robusta",
        descricao: "Mobiliza recursos; tesouro cai mas aprovação sobe.",
        efeitos: { tesouro_pct: -5, estabilidade: -1, aprovacao: +6, nota: "Socorro robusto." },
      },
      {
        id: "fraca",
        label: "Resposta mínima",
        descricao: "Economiza recursos; sofre em popularidade.",
        efeitos: { tesouro_pct: -2, estabilidade: -3, aprovacao: -10, nota: "Resposta fraca." },
      },
      {
        id: "ajuda",
        label: "Pedir ajuda internacional",
        descricao: "Aceita apoio externo; relações melhoram.",
        efeitos: { tesouro_pct: -1, estabilidade: +1, nota: "Ajuda recebida." },
      },
    ],
  },
  // 6. Escândalo político
  {
    id: "escandalo",
    tipo: "politica",
    titulo: "Escândalo político",
    texto: "A imprensa revela esquemas de corrupção envolvendo ministros.",
    choices: [
      {
        id: "demitir",
        label: "Demitir os implicados",
        descricao: "Restaura credibilidade; aprovação sobe.",
        efeitos: { estabilidade: +2, aprovacao: +8, nota: "Demissões aceites." },
      },
      {
        id: "negar",
        label: "Negar tudo",
        descricao: "Risco alto; se a oposição pressionar, custa caro.",
        efeitos: { estabilidade: -5, aprovacao: -15, nota: "Negacionismo." },
      },
      {
        id: "investigar",
        label: "Abrir inquérito",
        descricao: "Demora; estabilidade sobe a custo de aprovação.",
        efeitos: { estabilidade: +5, aprovacao: -5, nota: "Inquérito aberto." },
      },
    ],
  },
  // 7. Boom económico
  {
    id: "boom-economico",
    tipo: "economia",
    titulo: "Boom económico",
    texto: "Investimentos externos e descobertas tecnológicas animam o país.",
    choices: [
      {
        id: "investir",
        label: "Reinvestir o boom",
        descricao: "Distribui ganhos pela população.",
        efeitos: { pib_pct: +2, aprovacao: +10, nota: "Boom capitalizado." },
      },
      {
        id: "poupar",
        label: "Poupar no tesouro",
        descricao: "Acumula reserves para o futuro.",
        efeitos: { tesouro_pct: 12, nota: "Reservas reforçadas." },
      },
    ],
  },
  // 8. Atentado terrorista
  {
    id: "atentado",
    tipo: "politica",
    titulo: "Atentado terrorista",
    texto: "Um ataque mortal abala a capital. A oposição pede medidas duras.",
    choices: [
      {
        id: "seguranca",
        label: "Reforçar segurança",
        descricao: "Exército cresce; aprovação sobe, estabilidade abana.",
        efeitos: { exercito_pct: 10, estabilidade: -3, aprovacao: +5, nota: "Segurança reforçada." },
      },
      {
        id: "negociar",
        label: "Diálogo com dissidentes",
        descricao: "Aproximação diplomática; relações regionais melhoram.",
        efeitos: { estabilidade: +3, aprovacao: -2, nota: "Diálogo arrancado." },
      },
    ],
  },
  // 9. Imigração massiva
  {
    id: "imigracao",
    tipo: "politica",
    titulo: "Imigração massiva",
    texto: "Um conflito regional faz milhares cruzar a fronteira.",
    choices: [
      {
        id: "acolher",
        label: "Acolher refugiados",
        descricao: "População cresce; estabilidade abana a curto prazo.",
        efeitos: { estabilidade: -3, aprovacao: +2, nota: "Refugiados acolhidos." },
      },
      {
        id: "recusar",
        label: "Fechar fronteira",
        descricao: "Estabilidade mantém-se; relações com vizinhos deterioram.",
        efeitos: { estabilidade: +3, aprovacao: -2, nota: "Fronteira fechada." },
      },
      {
        id: "quota",
        label: "Quota controlada",
        descricao: "Equilíbrio; aprovação sobe ligeiramente.",
        efeitos: { aprovacao: +3, nota: "Quota definida." },
      },
    ],
  },
  // 10. Ciberataque
  {
    id: "ciberataque",
    tipo: "economia",
    titulo: "Ciberataque generalizado",
    texto: "Infraestruturas críticas sofrem um ataque informático coordenado.",
    choices: [
      {
        id: "investir",
        label: "Investir em cibersegurança",
        descricao: "Custo imediato no tesouro; protege contra futuros ataques.",
        efeitos: { tesouro_pct: -3, estabilidade: +2, nota: "Defesas cibernéticas reforçadas." },
      },
      {
        id: "contra-atacar",
        label: "Contra-atacar",
        descricao: "Suspeita-se de origem estrangeira; tensão diplomática.",
        efeitos: { estabilidade: -2, nota: "Contra-ataque lançado; tensão diplomática." },
      },
      {
        id: "ignorar",
        label: "Restaurar e ignorar",
        descricao: "PIB contrai-se ligeiramente por inactividade.",
        efeitos: { pib_pct: -1, nota: "Restauração sem represálias." },
      },
    ],
  },
  // 11. Risco de guerra civil (só dispara em colapso prolongado)
  {
    id: "risco-guerra-civil",
    tipo: "politica",
    titulo: "Risco de guerra civil",
    texto: "Com o país em colapso prolongado, fações rivais armam-se. A cena está pronta para uma guerra civil.",
    choices: [
      {
        id: "reforma",
        label: "Reformas constitucionais",
        descricao: "Concede poderes limitados às fações; evita a guerra civil.",
        efeitos: { estabilidade: +15, aprovacao: +10, nota: "Reformas evitaram a guerra civil." },
      },
      {
        id: "repressao",
        label: "Reprimir as fações",
        descricao: "Pode adiar o conflito, mas aumenta o risco de golpe.",
        efeitos: { estabilidade: +8, aprovacao: -10, nota: "Repressão adiou o conflito, mas tensão persiste." },
      },
      {
        id: "ignorar",
        label: "Ignorar",
        descricao: "A guerra civil eclode — o país divide-se.",
        efeitos: { estabilidade: -5, nota: "GUERRA_CIVIL_TRIGGER", exercito_pct: -10 },
      },
    ],
  },
  // 12. Boicote internacional
  {
    id: "boicote",
    tipo: "diplomacia",
    titulo: "Boicote internacional",
    texto: "Vários parceiros comerciais ameaçam boicotes em resposta a políticas recentes.",
    choices: [
      {
        id: "ceder",
        label: "Ceder às pressões",
        descricao: "Relações estabilizam, mas a aprovação interna cai.",
        efeitos: { pib_pct: -0.5, aprovacao: -5, nota: "Cedências diplomáticas." },
      },
      {
        id: "endurecer",
        label: "Endurecer retórica",
        descricao: "Aprovação interna sobe, mas PIB contrai-se e relações pioram.",
        efeitos: { pib_pct: -1.5, aprovacao: +5, nota: "Retórica endurecida." },
      },
    ],
  },
  // 13. Crise energética
  {
    id: "crise-energetica",
    tipo: "economia",
    titulo: "Crise energética",
    texto: "Os preços dos combustíveis disparam. Indústrias pedem intervenção do governo.",
    choices: [
      {
        id: "subsidiar",
        label: "Subsidiar combustíveis",
        descricao: "Aprovação sobe, mas tesouro esvazia-se rapidamente.",
        efeitos: { tesouro_pct: -8, aprovacao: +6, estabilidade: +2, nota: "Subsídios energéticos." },
      },
      {
        id: "renovaveis",
        label: "Investir em renováveis",
        descricao: "Solução de longo prazo; custa caro agora.",
        efeitos: { tesouro_pct: -5, pib_pct: -0.5, estabilidade: +3, nota: "Plano de transição energética." },
      },
      {
        id: "deixar",
        label: "Deixar o mercado resolver",
        descricao: "Sem intervenção; PIB contrai-se.",
        efeitos: { pib_pct: -1.5, aprovacao: -8, nota: "Inércia energética." },
      },
    ],
  },
  // 14. Sanções internacionais
  {
    id: "sancoes-internacionais",
    tipo: "diplomacia",
    titulo: "Sanções internacionais",
    texto: "Uma coligação de países impõe sanções económicas ao teu país por alegadas violações de direitos humanos.",
    choices: [
      {
        id: "negociar",
        label: "Negociar levantamento",
        descricao: "Concorda em cooperar com observadores internacionais.",
        efeitos: { pib_pct: -0.5, estabilidade: +3, aprovacao: -5, nota: "Cooperação aceita." },
      },
      {
        id: "resistir",
        label: "Resistir e contra-sancionar",
        descricao: "Retalia com sanções próprias; custo económico elevado.",
        efeitos: { pib_pct: -2.5, aprovacao: +8, estabilidade: -3, nota: "Contra-sansões aplicadas." },
      },
      {
        id: "ignorar",
        label: "Ignorar",
        descricao: "Comércio redirecciona-se; perdas silenciosas.",
        efeitos: { pib_pct: -1.5, nota: "Impacto absorvido sem reposta." },
      },
    ],
  },
  // 15. Refugiados de guerra regional
  {
    id: "refugiados-guerra",
    tipo: "politica",
    titulo: "Refugiados de guerra regional",
    texto: "Um conflito armado num país vizinho manda ondas de refugiados à tua fronteira.",
    choices: [
      {
        id: "acolher-massivamente",
        label: "Acolher em massa",
        descricao: "Custos elevados, mas imagem internacional melhora.",
        efeitos: { tesouro_pct: -6, estabilidade: -4, aprovacao: +3, nota: "Fronteira aberta a refugiados." },
      },
      {
        id: "quota-humanitaria",
        label: "Quota humanitária",
        descricao: "Acolhe um número limitado com apoio internacional.",
        efeitos: { tesouro_pct: -2, estabilidade: -1, aprovacao: +1, nota: "Quota humanitária definida." },
      },
      {
        id: "fechar-fronteira",
        label: "Fechar a fronteira",
        descricao: "Evita custos, mas crítica internacional é forte.",
        efeitos: { estabilidade: +2, aprovacao: -5, nota: "Fronteira fechada a refugiados." },
      },
    ],
  },
  // 16. Quebra de bolsa
  {
    id: "quebra-bolsa",
    tipo: "economia",
    titulo: "Quebra da bolsa de valores",
    texto: "A bolsa nacional despenca 15% num único dia. Pânico entre investidores.",
    choices: [
      {
        id: "banco-central",
        label: "Intervenção do banco central",
        descricao: "Injeta liquidez; estabiliza mas infla tesouro.",
        efeitos: { tesouro_pct: -10, pib_pct: -1, estabilidade: +5, nota: "Intervenção bancária." },
      },
      {
        id: "calmaria",
        label: "Pedir calma ao mercado",
        descricao: "Declarações presidenciais; eficaz só se credibilidade alta.",
        efeitos: { pib_pct: -1, aprovacao: -3, nota: "Declaração pública." },
      },
      {
        id: "deixar-cair",
        label: "Deixar o mercado corrigir-se",
        descricao: "Não intervém; pode levar a recessão.",
        efeitos: { pib_pct: -2.5, estabilidade: -5, aprovacao: -8, nota: "Inércia face à quebra." },
      },
    ],
  },
  // 17. Greve geral
  {
    id: "greve-geral",
    tipo: "politica",
    titulo: "Greve geral",
    texto: "Os principais sindicatos convocam uma greve geral contra a política salarial.",
    choices: [
      {
        id: "negociar",
        label: "Negociar aumentos",
        descricao: "Cede parcialmente; custa tesouro mas acalma ânimos.",
        efeitos: { tesouro_pct: -5, estabilidade: +5, aprovacao: +8, nota: "Negociação sindical." },
      },
      {
        id: "reprimir",
        label: "Reprimir a greve",
        descricao: "Mantém a ordem à força; aprovação despenca.",
        efeitos: { estabilidade: +3, aprovacao: -12, nota: "Repressão da greve." },
      },
      {
        id: "ignorar",
        label: "Aguardar exaustão",
        descricao: "Sem negociações; a greve prolonga-se.",
        efeitos: { pib_pct: -1, estabilidade: -4, aprovacao: -5, nota: "Greve prolongada." },
      },
    ],
  },
  // 18. Descoberta científica nacional
  {
    id: "descoberta-cientifica",
    tipo: "economia",
    titulo: "Descoberta científica nacional",
    texto: "Cientistas do país anunciam uma descoberta revolucionária em biotecnologia.",
    choices: [
      {
        id: "financiar",
        label: "Financiar comercialização",
        descricao: "Tesouro investe; PIB cresce a médio prazo.",
        efeitos: { tesouro_pct: -4, pib_pct: +2, aprovacao: +5, nota: "Investimento em I&D." },
      },
      {
        id: "patente",
        label: "Vender patente a estrangeiros",
        descricao: "Receita imediata; perde soberania tecnológica.",
        efeitos: { tesouro_pct: +6, estabilidade: -2, nota: "Patente vendida ao exterior." },
      },
      {
        id: "abrir",
        label: "Publicar abertamente",
        descricao: "Reconhecimento internacional; sem ganhos financeiros directos.",
        efeitos: { aprovacao: +4, estabilidade: +2, nota: "Ciência aberta." },
      },
    ],
  },
  // 19. Conflito fronteiriço
  {
    id: "conflito-fronteirico",
    tipo: "guerra",
    titulo: "Conflito fronteiriço",
    texto: "Escaramuças militares com um país vizinho geram tensões. Há mortos de ambos os lados.",
    choices: [
      {
        id: "diplomacia",
        label: "Diplomacia e cessar-fogo",
        descricao: "Negocia imediatamente; evita escalada.",
        efeitos: { estabilidade: +3, aprovacao: -2, nota: "Cessar-fogo negociado." },
      },
      {
        id: "mobilizar",
        label: "Mobilizar tropas",
        descricao: "Mostra força; exército sobe, mas tensão cresce.",
        efeitos: { exercito_pct: +5, estabilidade: -3, aprovacao: +5, nota: "Tropas mobilizadas." },
      },
      {
        id: "retaliar",
        label: "Retaliar militarmente",
        descricao: "Ataque de retaliação; risco de guerra total.",
        efeitos: { exercito_pct: +8, estabilidade: -5, aprovacao: +8, nota: "Retaliação executada." },
      },
    ],
  },
  // 20. Revolta estudantil
  {
    id: "revolta-estudantil",
    tipo: "politica",
    titulo: "Revolta estudantil",
    texto: "Estudantes universitários ocupam edifícios públicos em protesto contra propinas e falta de emprego.",
    choices: [
      {
        id: "dialogo",
        label: "Diálogo com representantes",
        descricao: "Promete reformas educativas; aprovação juvenil sobe.",
        efeitos: { estabilidade: +3, aprovacao: +5, tesouro_pct: -2, nota: "Reforma educativa prometida." },
      },
      {
        id: "policiamento",
        label: "Policiamento reforçado",
        descricao: "Restabelece ordem; imagem internacional manchada.",
        efeitos: { estabilidade: +2, aprovacao: -6, nota: "Policiamento reforçado." },
      },
      {
        id: "congelar-propinas",
        label: "Congelar propinas",
        descricao: "Cede à exigência principal; custa receita futura.",
        efeitos: { tesouro_pct: -3, estabilidade: +5, aprovacao: +8, nota: "Propinas congeladas." },
      },
    ],
  },
];

/** Verifica se um evento pode disparar para o país dado (condition implícita). */
function canFire(event: RandomEvent, country: Country, state: GameState): boolean {
  switch (event.id) {
    case "crise-economica":
      // Dispara se PIB em contração (crescimento negativo no último turno) ou tesouro < 0.
      return country.tesouro < 0 || country.estabilidade < 50;
    case "protestos":
      return country.aprovacao < 40 || country.estabilidade < 40;
    case "pandemia":
      // Raro; não muito frequente.
      return country.populacao > 5_000_000;
    case "descoberta-recursos":
      // Raro; qualquer país pode.
      return true;
    case "desastre-natural":
      return true;
    case "escandalo":
      return country.aprovacao < 60;
    case "boom-economico":
      // Raro; só se estabilidade > 60.
      return country.estabilidade > 60;
    case "atentado":
      return country.estabilidade < 50;
    case "imigracao":
      return true;
    case "ciberataque":
      return country.pib > 100_000_000_000;
    case "risco-guerra-civil":
      // Só dispara em colapso prolongado.
      return (state.colapsoTurnos[country.id] ?? 0) >= 3;
    case "boicote":
      return country.estabilidade < 40;
    case "crise-energetica":
      // Dispara se dependente de importações (qualquer país com PIB alto).
      return country.pib > 50_000_000_000;
    case "sancoes-internacionais":
      // Mais provável em regimes autoritários com estabilidade baixa.
      return country.estabilidade < 50;
    case "refugiados-guerra":
      // Dispara se há guerra ativa em algum país (qualquer).
      return state.guerras.some((g) => g.estado === "ativa");
    case "quebra-bolsa":
      // Apenas economias com mercado de capitais desenvolvido.
      return country.pib > 200_000_000_000;
    case "greve-geral":
      return country.aprovacao < 50 || country.estabilidade < 50;
    case "descoberta-cientifica":
      // Raro; só economias desenvolvidas.
      return country.pib > 100_000_000_000;
    case "conflito-fronteirico":
      // Dispara se relação muito hostil com algum vizinho.
      return state.relacoes.some((r) => {
        const isCountry = r.a === country.id || r.b === country.id;
        return isCountry && r.valor < -40;
      });
    case "revolta-estudantil":
      return country.aprovacao < 45;
    default:
      return true;
  }
}

/**
 * Calcula a probabilidade (0–1) de um evento disparar este turno para o país.
 * - Base: 25%.
 * - Estabilidade baixa: +5% por cada 10 pontos abaixo de 50 (até +20%).
 * - Tesouro negativo: +10%.
 * - Em colapso: +20%.
 * - Aprovação < 30: +5%.
 */
export function calculateEventChance(country: Country, state: GameState): number {
  let chance = BASE_EVENT_CHANCE;
  if (country.estabilidade < 50) {
    chance += Math.min(0.20, (50 - country.estabilidade) / 50);
  }
  if (country.tesouro < 0) chance += 0.10;
  if ((state.colapsoTurnos[country.id] ?? 0) > 0) chance += 0.20;
  if (country.aprovacao < 30) chance += 0.05;
  return Math.min(0.85, chance);
}

/**
 * Sorteia um evento aleatório para o país do jogador. Devolve null se nenhum
 * evento dispara este turno. Usa o RNG para reprodutibilidade.
 */
export function rollForEvent(state: GameState, country: Country, rng: Rng): RandomEvent | null {
  if (state.pendingEvent) {
    // Há já um evento pendente — não dispara outro.
    return null;
  }
  const chance = calculateEventChance(country, state);
  if (!rng.chance(chance)) return null;
  // Filtra eventos aplicáveis.
  const candidates = EVENT_LIBRARY.filter((e) => canFire(e, country, state));
  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

/**
 * Aplica os efeitos de uma escolha de evento ao país do jogador.
 * Devolve novo estado + nota a registar no diário.
 * NOTA: a nota especial "GUERRA_CIVIL_TRIGGER" é tratada pelo chamador
 * (store/advanceTurn) para invocar triggerCivilWar.
 */
export function applyEventChoice(
  state: GameState,
  eventId: string,
  choiceId: string,
): { state: GameState; nota: string | null } {
  const event = EVENT_LIBRARY.find((e) => e.id === eventId);
  if (!event) {
    return { state, nota: null };
  }
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) {
    return { state, nota: null };
  }
  const effects = choice.efeitos;
  // Aplica deltas ao país do jogador.
  const newState = applyChangesToCountry(state, state.playerCountryId ?? "", effects);
  return { state: newState, nota: effects.nota ?? null };
}

/**
 * Helper exposto para uso interno: aplica EventChoiceEffects a um país.
 * (Mantido aqui por clareza; delega para o apply-changes-helpers.)
 */
export { applyChangesToCountry };
