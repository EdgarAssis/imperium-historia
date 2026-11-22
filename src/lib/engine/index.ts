// src/lib/engine/index.ts
// Barrel de reexportação do motor.
// Todo o código do motor é puro (sem efeitos secundários), tipado e testável.

export { Rng, hashCombine, hashString, rngForTurn, rngForCountry, REGIMES_AUTORITARIOS } from "./rng";
export {
  BUDGET_DEFAULT,
  BUDGET_BY_REGIME,
  aiBudgetFor,
  normalizeBudget,
  budgetTotal,
} from "./budget";
export type { BudgetAllocation } from "@/types";
export {
  sectorInvestment,
  economyInvestmentBoost,
  calculateGdpGrowth,
  calculateRevenue,
  calculateFixedExpenses,
  calculateSectorSpending,
  calculateNewTreasury,
  getEffectiveBudget,
  BASE_MONTHLY_GROWTH,
} from "./economy";
export {
  calculateStabilityDelta,
  calculateApprovalDelta,
  clampStat,
  updateCollapseTurns,
} from "./stability";
export {
  calculateCoupProbability,
  shouldCoupOccur,
  pickNewRegime,
  applyCoup,
} from "./coup";
export { advanceTurn, runMonthlyPipeline, type MonthlyPipelineResult } from "./advance-turn";
export {
  tickDay,
  tickIntervalMs,
  nextSpeed,
  prevSpeed,
  type TickDayResult,
} from "./clock";
export { applyChanges, type AppliedChanges } from "./apply-changes";
export {
  proposeTreaty,
  calculateAcceptanceProbability,
  type ProposalResult,
} from "./diplomacy";
export {
  declareWar,
  resolveWarTurn,
  calculateFrontOutcome,
  signPeace,
  type PeaceOptions,
} from "./war";
export {
  EVENT_LIBRARY,
  rollForEvent,
  applyEventChoice,
  calculateEventChance,
} from "./events";
export { triggerCivilWar } from "./civil-war";
export {
  rankByGdp,
  rankByMilitary,
  isPlayerInTop3,
  checkVictory,
  victoryThreshold,
} from "./ranking";
export { annexCountry, findAnnexableCountry, type AnnexResult } from "./annex";
// Fase 2: métricas realistas (Força Militar e Influência Política, estilo GFP).
export {
  calculateMilitaryStrength,
  calculatePoliticalInfluence,
  rankByMilitaryStrength,
  rankByInfluence,
} from "./metrics";
// Fase 3: 4 formas de conquista (militar, rendição, pressão popular, diplomacia).
export {
  conquerBySurrender,
  conquerByPopularPressure,
  conquerByDiplomacy,
  type ConquestResult,
  type SurrenderTerms,
} from "./conquest";
// Fase 4: cultura e ocupação (afinidade, drift de lealdade, revolta, assimilação).
export {
  calculateCulturalAffinity,
  calculateLoyaltyDrift,
  applyOccupationResistance,
} from "./culture";
// Fase 5: economia e política fiscal (impostos, multinacionais, orçamento militar dinâmico).
export {
  TAX_POLICY_BY_REGIME,
  getEffectiveTaxPolicy,
  calculateTaxRevenue,
  calculateAttractiveness,
  tryAttractMultinational,
  processMultinationals,
  updateMilitaryBudget,
  updateTroops,
} from "./fiscal";
// Fase 6: blocos políticos e moedas (membros, comércio interno, votações).
export {
  getBlocMembers,
  calculateBlocTradeBonus,
  proposeBlocVote,
  processBlocVotes,
  joinBloc,
  leaveBloc,
  blocosDisponiveisPara,
} from "./blocs";
// Fase 7: mundo vivo (IA dos países, retaliações, alianças dinâmicas).
export { processAICountries, type AICountriesResult } from "./ai-countries";
// Fase 8: guerra por procuração, refugiados, reputação mundial.
export {
  supportRebels,
  processProxyWars,
  cancelProxy,
  type ProxyWarResult,
} from "./proxy-wars";
export { processRefugees, generateRefugees, distributeRefugees } from "./refugees";
export {
  adjustReputation,
  processReputationDrift,
  getReputationLabel,
  getReputationColor,
  calculateAverageReputation,
} from "./reputation";
// Fase 9: missões, achievements, ranking histórico.
export {
  MISSION_LIBRARY,
  ACHIEVEMENT_LIBRARY,
  rollInitialMissions,
  calculateMissionProgress,
  processMissions,
  checkAchievements,
  createRankingSnapshot,
  addRankingSnapshot,
  processMissionsAndAchievements,
} from "./missions";
// Fase 10: imersão extra.
export {
  defaultAdvisors,
  generateAdvisorSuggestions,
  updateAdvisorConfidence,
  type AdvisorSuggestion,
} from "./advisors";
export {
  executeSpyOperation,
  SPY_OPERATIONS,
} from "./espionage";
export {
  TECH_TREE,
  getTech,
  availableTechs,
  startResearch,
  processResearch,
  applyTechBonuses,
  emptyResearchState,
} from "./tech-tree";
export {
  ELECTION_INTERVAL,
  hasElections,
  calculateElectionResult,
  processElection,
  electionApproaching,
  turnsUntilElection,
} from "./elections";
export { processNews, generateNews } from "./news";
