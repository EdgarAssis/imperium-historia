import { clamp, normalizeText, randomInt, sentence } from './utils.js';

/* =========================
   📊 STATS
========================= */

export const STAT_LABELS = {
  economy: 'Economia',
  military: 'Militar',
  diplomacy: 'Diplomacia',
  stability: 'Estabilidade',
  culture: 'Cultura',
  technology: 'Tecnologia',
  population: 'Felicidade',
};

export const STAT_COLORS = {
  economy: '#4aab6a',
  military: '#4a8abf',
  diplomacy: '#c9a84c',
  stability: '#4aab6a',
  culture: '#a07adf',
  technology: '#df8a4a',
  population: '#ff9a5c',
};

/* =========================
   💰 INVESTIMENTOS
========================= */

export const INVESTMENTS = {
  economy: { label: 'Indústria', cost: 20, icon: '🏭' },
  military: { label: 'Exército', cost: 25, icon: '⚔' },
  technology: { label: 'Tecnologia', cost: 20, icon: '🔬' },
  stability: { label: 'Admin.', cost: 15, icon: '🏛' },
  culture: { label: 'Cultura', cost: 10, icon: '📜' },
  diplomacy: { label: 'Diplomacia', cost: 15, icon: '🤝' },
};

/* =========================
   🤝 TRATADOS
========================= */

export const TREATY_TYPES = {
  trade: {
    label: 'Tratado Comercial',
    cost: 12,
    duration: 8,
    relation: 'ally',
    effects: { economy: 3, diplomacy: 2 },
    income: 8,
  },
  alliance: {
    label: 'Aliança',
    cost: 20,
    duration: 10,
    relation: 'ally',
    effects: { diplomacy: 5, military: 2 },
    income: 0,
  },
};

export function treatySummary(country) {
  if (!country || !country.treaties || country.treaties.length === 0) {
    return "Nenhum tratado ativo.";
  }

  return country.treaties
    .map(t => {
      if (typeof t === "string") return t;

      const name = t.type || "Tratado";
      const status = t.status || "ativo";

      return `${name} (${status})`;
    })
    .join(", ");
}


/* =========================
   📈 PIB + ECONOMIA
========================= */


export function calculateGDP(state) {
  const baseGDP =
    state.stats.economy *
    state.stats.population *
    (state.stats.technology / 50);

  const penalty = state.lastInvestmentCost || 0;

  return Math.max(0, Math.floor(baseGDP - penalty));
}

export function calculateIncome(state) {
  const gdp = calculateGDP(state);

  const taxIncome = gdp * 0.02;

  /* 🔥 IMPACTO DA INFLAÇÃO */
  const inflationPenalty = state.currency.inflation * 0.02;

  return Math.max(5, Math.floor(taxIncome * (1 - inflationPenalty)));
}

/* =========================
   🏦 TESOURO
========================= */

export function applyMaintenance(state) {
  const cost = Math.floor(state.stats.military * 0.5);
  state.treasury -= cost;
}

export function applyDebt(state) {
  if (state.treasury < 0) {
    state.debt += Math.abs(state.treasury);
    state.treasury = 0;
  }

  const interest = Math.floor(state.debt * 0.05);
  state.debt += interest;
}

/* =========================
   🤖 IA
========================= */

export function aiTakeDecision(state) {
  if (Math.random() < 0.3) {
    state.stats.economy = clamp(state.stats.economy + 2);
  }

  if (Math.random() < 0.2) {
    state.stats.military = clamp(state.stats.military + 2);
  }

  if (Math.random() < 0.2) {
    state.stats.diplomacy = clamp(state.stats.diplomacy + 1);
  }
}

/* =========================
   🏗 INVESTIMENTO
========================= */

export function applyInvestment(state, stat) {
  const investment = INVESTMENTS[stat];

  if (!investment) return { ok: false };
  /* 🔥 custo ajustado pela inflação */
  const inflationFactor = 1 + (state.currency.inflation / 100);
  const realCost = Math.floor(investment.cost * inflationFactor);

  // 🔥 investimento usa PIB/economia e não tesouro

if (state.stats.economy < 5) {
  return {
    ok: false,
    message: "Economia demasiado fraca para investir."
  };
}

// impacto económico temporário
state.lastInvestmentCost =
  (state.lastInvestmentCost || 0) + realCost;

// pequeno impacto imediato
state.stats.economy = clamp(
  state.stats.economy - 2,
  0,
  100
);

  /* 🔥 REGISTA IMPACTO NO PIB */
  state.lastInvestmentCost = (state.lastInvestmentCost || 0) + investment.cost;

  const boost = stat === "economy" ? 10 : 8;
  state.stats[stat] = clamp(state.stats[stat] + boost);

  return {
    ok: true,
    action: investment.label,
    result: `${investment.label} melhorado`
  };


}

/* =========================
   🤝 TRATADOS
========================= */

export function createTreaty(state, iso, country, type) {
  const config = TREATY_TYPES[type];
  if (!config) return { ok: false };

  if (state.treasury < config.cost) {
    return { ok: false, message: "Sem dinheiro" };
  }

  state.treasury -= config.cost;

  /* 🔥 NOVO SISTEMA RELAÇÃO */
  state.relations[iso] = {
    value: config.relation === "ally" ? 80 : 20,
    status: config.relation
  };

  const treaty = {
    id: Date.now(),
    type,
    partnerIso: iso,
    partnerName: country.name,
    duration: config.duration,
    status: "active"
  };

  state.treaties.push(treaty);

  return {
    ok: true,
    action: config.label,
    result: `Tratado com ${country.name}`
  };
}

/* =========================
   ⚙ FALLBACK
========================= */

export function fallbackActionResult(state, action) {
  const deltas = {
    economy: 1,
    military: 1,
    diplomacy: 1,
    stability: 1,
    culture: 1,
    technology: 1,
    population: 1,
  };

  for (const key in deltas) {
    state.stats[key] = clamp(state.stats[key] + deltas[key]);
  }

  return {
    narration: "A decisão teve impacto moderado.",
    stats: state.stats
  };
}

/* =========================
   🌍 IA GLOBAL (TODOS OS PAÍSES)
========================= */

export function runWorldAI(state) {
  if (!state.world) state.world = {};

  for (const iso in state.relations) {
    if (!state.world[iso]) {
      state.world[iso] = {
        economy: randomInt(30, 70),
        military: randomInt(30, 70),
        diplomacy: randomInt(30, 70),
        stability: randomInt(30, 70),
      };
    }

    const country = state.world[iso];
    const rel = state.relations[iso];

    /* 🔥 DECISÕES */

    // crescer economia
    if (Math.random() < 0.3) {
      country.economy = clamp(country.economy + 2);
    }

    // reforçar exército
    if (Math.random() < 0.25) {
      country.military = clamp(country.military + 2);
    }

    // melhorar ou piorar relações
    if (Math.random() < 0.2 && rel) {
      rel.value += randomInt(-5, 5);
      rel.status =
        rel.value > 80 ? "ally" :
        rel.value > 50 ? "friendly" :
        rel.value > 0 ? "neutral" :
        rel.value > -50 ? "cold" :
        "hostile";
    }

    /* ⚔️ POSSÍVEL CONFLITO */
    if (rel && rel.status === "hostile" && Math.random() < 0.05) {
      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Conflito internacional",
        result: `Tensões escalam com ${iso}. O mundo torna-se mais instável.`,
      });

      country.military = clamp(country.military + 3);
      state.stats.stability = clamp(state.stats.stability - 2);
    }
  }
}

export function useGoldReserve(state, amount) {
  if (state.gold < amount) return false;

  state.gold -= amount;
  state.treasury += amount;

  return true;
}

export function calculateCurrencyStrength(state) {
  if (!state.gold) return 0;

  return Math.floor((state.gold / (state.debt + 1)) * 10);
}

/* =========================
   🏦 BANCO CENTRAL
========================= */

export function applyMonetaryPolicy(state, action) {
  if (!state.currency) return;

  if (action === "raise") {
    state.currency.interestRate += 1;
    state.currency.inflation -= 1;
  }

  if (action === "lower") {
    state.currency.interestRate -= 1;
    state.currency.inflation += 1;
  }

  state.currency.interestRate = clamp(state.currency.interestRate, 0, 20);
  state.currency.inflation = clamp(state.currency.inflation, 0, 50);

  if (!state.lastInterestChange) state.lastInterestChange = 0;

  if (state.turn === state.lastInterestChange) return;

  state.lastInterestChange = state.turn;
}

/* =========================
   📉 CRISES ECONÓMICAS
========================= */

export function updateEconomicCrisis(state) {
  const { inflation, strength } = state.currency;

  if (inflation > 15) {
    state.economyState = "crise";
  } else if (inflation > 8) {
    state.economyState = "recessao";
  } else if (strength > 70) {
    state.economyState = "crescimento";
  } else {
    state.economyState = "normal";
  }

  if (state.economyState === "crise") {
    state.stats.economy = clamp(state.stats.economy - 5);
    state.stats.stability = clamp(state.stats.stability - 6);
    state.stats.population = clamp(state.stats.population - 4);

    state.history.push({
      turn: state.turn,
      year: state.year,
      action: "Crise económica",
      result: "Inflação fora de controlo está a colapsar a economia.",
    });
  }

  if (state.economyState === "recessao") {
    state.stats.economy = clamp(state.stats.economy - 2);
    state.stats.stability = clamp(state.stats.stability - 2);
  }

  if (state.economyState === "crescimento") {
    state.stats.economy = clamp(state.stats.economy + 2);
    state.stats.population = clamp(state.stats.population + 2);
  }
  if (state.economyState === "crise" && Math.random() < 0.3) {
    state.history.push({
      turn: state.turn,
      year: state.year,
      action: "Colapso económico",
      result: "Empresas faliram, desemprego disparou e o país entrou em crise profunda.",
    });
  }
}

/* =========================
   💱 SISTEMA MONETÁRIO
========================= */

export function updateMonetarySystem(state) {
  if (!state.currency) return;

  const { gold, debt, stats } = state;

  let strength = 50;

  strength += gold * 0.05;
  strength -= debt * 0.03;
  strength += stats.economy * 0.3;

  state.currency.strength = clamp(Math.floor(strength), 0, 100);

  let inflation = state.currency.inflation || 2;

  if (state.treasury > stats.economy * 5) inflation += 2;
  if (debt > 100) inflation += 3;
  if (gold > debt) inflation -= 1;

  state.currency.inflation = clamp(Math.floor(inflation), 0, 50);
}

export function runAdvancedWorldAI(state) {
  if (!state.world) state.world = {};

  for (const iso in state.relations) {
    if (!state.world[iso]) {
      state.world[iso] = {
        economy: 50,
        military: 50,
        diplomacy: 50,
        goal: ["expandir", "economia", "defesa"][Math.floor(Math.random()*3)]
      };
    }

    const country = state.world[iso];
    const rel = state.relations[iso];

    // 🎯 comportamento baseado em objetivo
    if (country.goal === "economia") {
      country.economy = clamp(country.economy + 2);
    }

    if (country.goal === "expandir") {
      country.military = clamp(country.military + 3);
    }

    if (country.goal === "defesa") {
      country.diplomacy = clamp(country.diplomacy + 2);
    }

    // 🤝 relações mudam
    if (rel) {
      rel.value += Math.floor(Math.random() * 7 - 3);
      rel.status =
        rel.value > 80 ? "ally" :
        rel.value > 50 ? "friendly" :
        rel.value > 0 ? "neutral" :
        rel.value > -50 ? "cold" :
        "hostile";
    }

    // ⚔️ conflito
    if (rel?.status === "hostile" && Math.random() < 0.08) {
      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Tensão global",
        result: `${iso} está a preparar conflito.`,
      });
    }
  } // <-- A chaveta que faltava para fechar o ciclo "for"
} // <-- A chaveta que faltava para fechar a função "runAdvancedWorldAI"


export function advanceTreaties(state) {
  if (!state.treaties || state.treaties.length === 0) return [];

  const expired = [];

  state.treaties = state.treaties.filter(treaty => {
    // se não tiver duração, mantém
    if (!treaty.expiresTurn) return true;

    // expirou
    if (state.turn >= treaty.expiresTurn) {
      treaty.status = "expired";

      expired.push({
        name: treaty.type || "Tratado",
        target: treaty.target || "Desconhecido"
      });

      return false; // remove da lista ativa
    }

    // ainda ativo → aplicar efeitos
    if (treaty.effects) {
      for (const stat in treaty.effects) {
        state.stats[stat] = clamp(
          state.stats[stat] + treaty.effects[stat]
        );
      }
    }

    // renda
    if (treaty.income) {
      state.treasury += treaty.income;
    }

    return true;
  });

  return expired;
}

export function applyEventChoice(state, choiceIndex) {
  if (!state.activeEvent || !state.activeEvent.choices) return;

  const choice = state.activeEvent.choices[choiceIndex];
  if (!choice) return;

  /* 🔥 APLICAR EFEITOS NAS STATS */
  if (choice.effects) {
    for (const stat in choice.effects) {
      state.stats[stat] = clamp(
        state.stats[stat] + choice.effects[stat]
      );
    }
  }

  /* 💰 IMPACTO ECONÓMICO */
  if (choice.treasury) {
    state.treasury += choice.treasury;
  }

  if (choice.debt) {
    state.debt += choice.debt;
  }

  /* 💱 IMPACTO MONETÁRIO */
  if (choice.inflation) {
    state.currency.inflation = clamp(
      state.currency.inflation + choice.inflation,
      0,
      50
    );
  }

  /* 🤝 RELAÇÕES INTERNACIONAIS */
  if (choice.relations) {
    for (const iso in choice.relations) {
      if (!state.relations[iso]) {
        state.relations[iso] = { value: 0, status: "neutral" };
      }

      state.relations[iso].value += choice.relations[iso];

      // atualizar status automaticamente
      const v = state.relations[iso].value;

      state.relations[iso].status =
        v > 80 ? "ally" :
        v > 50 ? "friendly" :
        v > 0 ? "neutral" :
        v > -50 ? "cold" :
        "hostile";
    }
  }

  /* ⚔️ EVENTO PODE GERAR GUERRA */
  if (choice.war) {
    declareWar(state, state.nation, choice.war);
  }

  /* 📜 HISTÓRICO */
  state.history.push({
    turn: state.turn,
    year: state.year,
    action: `Evento: ${state.activeEvent.title}`,
    result: `Escolheste: ${choice.text}`
  });

  /* 🔥 LIMPAR EVENTO */
  state.activeEvent = null;
}

export function buildGameSystem(state) {
  return `
És um simulador histórico.

Estado atual:
Nação: ${state.nation}
Ano: ${state.year}

Economia: ${state.stats.economy}
Militar: ${state.stats.military}
Diplomacia: ${state.stats.diplomacy}
Estabilidade: ${state.stats.stability}

Responde de forma narrativa e estratégica.
`;
}

/* =========================
   🧠 PROMPTS IA
========================= */

export function buildInitialEventsPrompt(state) {
  return `
Cria 3 eventos históricos para ${state.nation} no ano ${state.year}.

Formato JSON:
[
  {
    "title": "Título",
    "description": "Descrição",
    "choices": [
      {
        "text": "Escolha",
        "effects": { "economy": 2 }
      }
    ]
  }
]

Sem texto fora do JSON.
`;
}

export function buildReportPrompt(state) {
  return `
Gera um relatório do turno para ${state.nation}.

Inclui:
- resumo do país
- situação mundial
- mudanças de stats

Formato JSON:
{
  "summary": "...",
  "statsChange": {
    "economy": 1
  }
}
`;
}


/* =========================
   📊 NORMALIZAR STATS
========================= */

export function clampStats(stats) {
  const result = {};

  for (const key in stats) {
    result[key] = clamp(stats[key], 0, 100);
  }

  return result;
}


/* =========================
   ⚔️ SISTEMA DE GUERRA
========================= */

export function declareWar(state, attacker, defender) {
  if (!state.wars) state.wars = [];

  state.wars.push({
    attacker,
    defender,
    progress: 0
  });

  state.history.push({
    turn: state.turn,
    year: state.year,
    action: "Guerra",
    result: `${attacker} declarou guerra a ${defender}`
  });
}

export function resolveWars(state) {
  if (!state.wars) return;

  state.wars = state.wars.filter(war => {
    const atk = state.stats.military + Math.random() * 20;
    const def = 50 + Math.random() * 20;

    war.progress += atk - def;

    if (war.progress > 100) {
      state.relations[war.defender] = {
        value: 100,
        status: "owned"
      };

      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Conquista",
        result: `${war.defender} foi conquistado`
      });

      return false;
    }

    if (war.progress < -100) {
      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Derrota",
        result: `Falhaste contra ${war.defender}`
      });

      return false;
    }

    return true;
  });
}

/* =========================
   🤝 FALLBACK DIPLOMACIA
========================= */

export function fallbackDiplomacy(state, countryName, message) {
  const lower = message.toLowerCase();

  // 🤝 amizade
  if (
    lower.includes("aliança") ||
    lower.includes("amizade") ||
    lower.includes("cooperação")
  ) {
    return `${countryName} considera a proposta interessante, mas necessita de mais garantias antes de aceitar formalmente.`;
  }

  // ⚔️ guerra
  if (
    lower.includes("guerra") ||
    lower.includes("atacar") ||
    lower.includes("invadir")
  ) {
    return `${countryName} condena fortemente essa ameaça militar e promete responder à altura.`;
  }

  // 💰 comércio
  if (
    lower.includes("comércio") ||
    lower.includes("troca") ||
    lower.includes("economia")
  ) {
    return `${countryName} demonstra interesse em fortalecer relações económicas.`;
  }

  // resposta genérica
  return `${countryName} recebeu a tua mensagem e irá analisá-la cuidadosamente.`;
}

/* =========================
   🎲 EVENTOS FALLBACK
========================= */

export function fallbackEvents(state) {
  return [
    {
      title: "Crise Económica",
      description: "A inflação e o desemprego estão a preocupar a população.",

      choices: [
        {
          text: "Investir na economia",
          effects: {
            economy: 5,
            stability: 2
          },
          treasury: -20
        },

        {
          text: "Aumentar impostos",
          effects: {
            economy: -2,
            stability: -3
          },
          treasury: 15
        }
      ]
    },

    {
      title: "Tensões Militares",
      description: "Países vizinhos aumentaram presença militar nas fronteiras.",

      choices: [
        {
          text: "Mobilizar exército",
          effects: {
            military: 5,
            stability: -1
          },
          treasury: -15
        },

        {
          text: "Negociar diplomaticamente",
          effects: {
            diplomacy: 4,
            stability: 1
          }
        }
      ]
    }
  ];
}
/* =========================
   📄 RELATÓRIO FALLBACK
========================= */

export function fallbackReport(state) {
  return {
    summary: `
${state.nation} continua no ano ${state.year} com uma economia de nível ${state.stats.economy},
capacidade militar ${state.stats.military}
e estabilidade ${state.stats.stability}.
`,

    statsChange: {
      economy: 0,
      military: 0,
      diplomacy: 0,
      stability: 0
    }
  };
}


/* =========================
   🤝 PEDIDOS DE ALIANÇA
========================= */

export function requestAlliance(state, iso) {
  if (!state.pendingDiplomacy) {
    state.pendingDiplomacy = [];
  }

  state.pendingDiplomacy.push({
    type: "alliance",
    target: iso,
    turn: state.turn
  });

  state.history.push({
    turn: state.turn,
    year: state.year,
    action: "Diplomacia",
    result: `Pedido de aliança enviado para ${iso}`
  });
}

export function processDiplomacy(state) {
  if (!state.pendingDiplomacy) return;

  state.pendingDiplomacy = state.pendingDiplomacy.filter(req => {

    if (state.turn <= req.turn) return true;

    const accepted = Math.random() < 0.6;

    if (accepted) {
      state.relations[req.target] = {
        value: 80,
        status: "ally"
      };

      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Aliança",
        result: `${req.target} aceitou a aliança`
      });

    } else {
      state.history.push({
        turn: state.turn,
        year: state.year,
        action: "Diplomacia",
        result: `${req.target} recusou a aliança`
      });
    }

    return false;
  });
}

/* =========================
   🧠 JSON / IA
========================= */

export function parseJsonFromText(text) {
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

    if (!match) return null;

    return JSON.parse(match[0]);

  } catch {
    return null;
  }
}

export function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];

  return events.map(event => ({
    title: event.title || "Evento",
    description: event.description || "",
    choices: Array.isArray(event.choices) ? event.choices : []
  }));
}

export function normalizeReport(report, state) {
  if (!report) {
    return fallbackReport(state);
  }

  return {
    summary: report.summary || "Sem alterações relevantes.",
    statsChange: report.statsChange || {}
  };
}

export function parseStatsUpdate(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) return null;

    return JSON.parse(match[0]);

  } catch {
    return null;
  }
}

export function stripStatsUpdate(text) {
  return text.replace(/\{[\s\S]*\}/, '').trim();
}
