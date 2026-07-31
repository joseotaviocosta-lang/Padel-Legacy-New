import { localGame } from '@/api/localGameClient.js';

export async function runLocalRuntimeRegressionTest() {
  const user = await localGame.auth.me();
  const hasEntities = Boolean(localGame.entities?.PlayerProfile && localGame.entities?.AthleteProfile);
  const hasStorage = Boolean(localGame.storage?.status && localGame.storage?.checkpoint);
  const mockFunction = await localGame.functions.healthCheck({ source: 'v0.3.3' });
  const mockIntegration = await localGame.integrations.offlineCheck({ source: 'v0.3.3' });

  const result = {
    success: Boolean(
      user?.id &&
      hasEntities &&
      hasStorage &&
      mockFunction?.data?.local === true &&
      mockIntegration?.data?.local === true
    ),
    userReady: Boolean(user?.id),
    entitiesReady: hasEntities,
    storageReady: hasStorage,
    functionsOffline: mockFunction?.data?.local === true,
    integrationsOffline: mockIntegration?.data?.local === true,
    runtime: 'localGame',
    version: '0.3.3',
  };

  if (!result.success) {
    throw new Error(`Runtime local incompleto: ${JSON.stringify(result)}`);
  }
  return result;
}

export function setupLocalRuntimeRegressionTest() {
  if (typeof window !== 'undefined') {
    window.PadelLocalRuntimeTest = { run: runLocalRuntimeRegressionTest };
  }
}
