import { setupAdvancedNarrativeStatsTest } from '@/engine/match/AdvancedNarrativeStatsTest.js';
import { setupTeamCoordinationTest } from '@/engine/match/TeamCoordinationTest.js';
import { setupMatchBalanceTest } from '@/engine/match/MatchBalanceTest.js';
import { runMatchEngineTest } from '@/engine/match/MatchEngineTest.js';
import { setupPersonalityModelTest } from '@/engine/match/PersonalityModelTest.js';
import { setupContextualDecisionTest } from '@/engine/match/ContextualDecisionTest.js';
import { setupStorageTest } from '@/storage';
import { setupCareerTest, setupCareerFlowTest } from '@/careers';
import { setupCareerMigrationTest } from '@/careers/CareerMigrationTest.js';
import { setupGameplayIntegrationTest } from '@/gameplay/tests/GameplayIntegrationTest.js';
import { setupSprint2IntegrationTest } from '@/gameplay/tests/Sprint2IntegrationTest.js';
import { setupProfileLoadingHotfixTest } from '@/gameplay/tests/ProfileLoadingHotfixTest.js';
import { setupInitializationRegressionTest } from '@/gameplay/tests/InitializationRegressionTest.js';
import { setupInitialDataRegressionTest } from '@/gameplay/tests/InitialDataRegressionTest.js';
import { setupModuleStabilityTest } from '@/gameplay/tests/ModuleStabilityTest.js';
import { setupLocalRuntimeRegressionTest } from '@/gameplay/tests/LocalRuntimeRegressionTest.js';
import { setupCircuitSeasonTest } from '@/gameplay/tests/CircuitSeasonTest.js';
import { setupWorldTourBrainTest } from '@/gameplay/tests/WorldTourBrainTest.js';

function register(label, callback) {
  try {
    callback();
  } catch (error) {
    console.error(`[${label}] Não foi possível registrar o teste.`, error);
  }
}

register('storage-test', setupStorageTest);
register('career-test', setupCareerTest);
register('migration-test', setupCareerMigrationTest);
register('gameplay-test', () => {
  setupGameplayIntegrationTest();
  setupSprint2IntegrationTest();
  setupProfileLoadingHotfixTest();
  setupInitializationRegressionTest();
  setupInitialDataRegressionTest();
  setupModuleStabilityTest();
  setupLocalRuntimeRegressionTest();
  setupCircuitSeasonTest();
  setupWorldTourBrainTest();
  setupPersonalityModelTest();
  setupContextualDecisionTest();
  setupAdvancedNarrativeStatsTest();
  setupTeamCoordinationTest();
  setupMatchBalanceTest();
});
register('career-flow-test', setupCareerFlowTest);

window.PadelMatchEngineTest = { run: runMatchEngineTest };
