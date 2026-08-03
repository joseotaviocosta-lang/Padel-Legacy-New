export { GAME_CORE_VERSION, CORE_BALANCE } from './config';
export { finalizePracticeMatch } from './matchLifecycle';
export { finalizeTournamentRun } from './tournamentLifecycle';
export { advanceCareerDay, advanceCareerUntilRecovered, hasActiveInjury, MAX_INJURY_SKIP_DAYS } from './calendarLifecycle';
export { getSeasonSnapshot, getSeasonHistory, calculateSeasonAwards, finalizeSeason } from './seasonLifecycle';
export { calculatePracticeProgress } from './progression';
export { calculatePostMatchCondition } from './condition';
export {
  getSuggestedPartnerTerms,
  formPartnerContract,
  renewPartnerContract,
  releasePartner,
  processPartnerDay,
} from './partnerLifecycle';
export { finalizeTrainingSession, registerRecovery } from './trainingLifecycle';
export { evaluateSponsorContracts, getSponsorEvaluationStatus } from './sponsorLifecycle';
export { getOrCreatePlayerFanBase, evaluateMonthlyFanEngagement, getFanEvaluationStatus } from './fanLifecycle';
export { ensureWorldMarket, evolveWorldMarket, getWorldMarketSnapshot } from './worldMarketLifecycle';
export { getScoutingLevels, getPlayerScoutingReports, toggleShortlist, scoutAthlete } from './scoutingLifecycle';
export { getNegotiationPreview, submitPartnerOffer } from './marketNegotiationLifecycle';
export {
  CAREER_OPPORTUNITIES,
  getOpportunityStatus,
  getDailyOpportunityStatus,
  completeCareerOpportunity,
} from './opportunityLifecycle';

export { processGameStateDay, getGameStateSummary } from './gameStateLifecycle';
export { simulateWorldDay, getWorldSimulationStatus } from './worldSimulationLifecycle';
export { processAiPartnershipMarket, getAiPartnershipSnapshot } from './aiPartnershipLifecycle';
export { processWorldCircuit, getCircuitSnapshot } from './circuitLifecycle';

export { ensureAthleteIntelligenceProfiles, processAthletePersonalityWeek, getAthleteIntelligenceSnapshot } from './athletePersonalityLifecycle';

export { processInjuryRecoveryDay, getInjuryStatus } from './injuryRecoveryLifecycle';

export { ensurePlayerRelationships, processRelationshipWeek, getRelationshipSnapshot } from './relationshipLifecycle';

export { processStaffDay, getStaffSnapshot, getStaffCatalog } from './staffLifecycle';

export { processCircuitLifeWeek, getCircuitLifeSnapshot } from './circuitLifeLifecycle';
