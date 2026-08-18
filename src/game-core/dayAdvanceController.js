import { createSingleFlightCoordinator } from './singleFlightCoordinator.js';

/**
 * @param {{
 *   advanceCore: (profile: any) => Promise<any>,
 *   processSecondary?: (profile: any, previousDate?: string, currentDate?: string) => Promise<any>,
 *   publishProfile?: (profile: any, source?: string) => void,
 *   logger?: (...args: any[]) => void,
 *   debug?: boolean,
 * }} options
 */
export function createDayAdvanceController({
  advanceCore,
  processSecondary = async () => null,
  publishProfile = () => {},
  logger = console.debug,
  debug = false,
}) {
  let completedCore = null;
  let secondaryTail = Promise.resolve();
  let secondaryPending = 0;
  let legacyProcessing = false;
  let transactionalProcessing = false;
  const processingListeners = new Set();

  const log = (...args) => { if (debug) logger(...args); };
  const publishProcessing = () => {
    const processing = legacyProcessing || transactionalProcessing;
    processingListeners.forEach((listener) => listener(processing));
  };
  const scheduleSecondary = (descriptor) => {
    secondaryPending += 1;
    secondaryTail = secondaryTail
      .catch(() => null)
      .then(async () => {
        const startedAt = performance.now();
        log('[GlobalAdvance] postDayEvents:start');
        try {
          const secondaryProfile = await processSecondary(descriptor.profile, descriptor.previousDate, descriptor.currentDate);
          if (secondaryProfile) publishProfile(secondaryProfile, 'day-advance-secondary');
          log(`[GlobalAdvance] postDayEvents:done (${(performance.now() - startedAt).toFixed(1)}ms)`);
          return secondaryProfile;
        } catch (error) {
          console.error('[GlobalAdvance] pós-processamento diário falhou', error);
          return null;
        } finally {
          secondaryPending = Math.max(0, secondaryPending - 1);
        }
      });
  };

  const flight = createSingleFlightCoordinator(async (profile) => {
    const previousDate = profile?.career_date;
    const startedAt = performance.now();
    log('[GlobalAdvance] advanceCareerDay:start');
    const updated = await advanceCore(profile);
    log(`[GlobalAdvance] advanceCareerDay:done (${(performance.now() - startedAt).toFixed(1)}ms)`);
    log('[GlobalAdvance] persist:done');
    publishProfile(updated, 'day-advance-core');
    completedCore = { profile: updated, previousDate, currentDate: updated?.career_date };
    return updated;
  }, {
    source: 'dayAdvanceCoordinator',
    onStateChange: ({ previous, next, source }) => {
      legacyProcessing = next;
      publishProcessing();
      log(`[AdvanceState] ${previous} -> ${next}`, `source: ${source}`);
      log(`[GlobalAdvance] lock=${next}`);
      if (!next && completedCore) {
        const descriptor = completedCore;
        completedCore = null;
        queueMicrotask(() => scheduleSecondary(descriptor));
      }
    },
  });

  // Mobile M3.7: variante usada pelo APK para manter core + GameState dentro
  // da mesma unidade de persistência. O método legado `run` continua existindo
  // para os testes/consumidores que explicitamente exercitam secondary em fila.
  const transactionalFlight = createSingleFlightCoordinator(async (profile) => {
    const previousDate = profile?.career_date;
    const startedAt = performance.now();
    log('[GlobalAdvance] advanceCareerDay:start');
    const updated = await advanceCore(profile);
    log(`[GlobalAdvance] advanceCareerDay:done (${(performance.now() - startedAt).toFixed(1)}ms)`);
    log('[GlobalAdvance] postDayEvents:start');
    secondaryPending += 1;
    try {
      const secondaryProfile = await processSecondary(updated, previousDate, updated?.career_date);
      const finalProfile = secondaryProfile || updated;
      log(`[GlobalAdvance] postDayEvents:done (${(performance.now() - startedAt).toFixed(1)}ms)`);
      return finalProfile;
    } finally {
      secondaryPending = Math.max(0, secondaryPending - 1);
    }
  }, {
    source: 'dayAdvanceTransaction',
    onStateChange: ({ previous, next, source }) => {
      transactionalProcessing = next;
      publishProcessing();
      log(`[AdvanceState] ${previous} -> ${next}`, `source: ${source}`);
      log(`[GlobalAdvance] lock=${next}`);
    },
  });

  return {
    run: (profile) => flight.run(profile),
    runTransactional: (profile) => transactionalFlight.run(profile),
    isProcessing: () => flight.isProcessing() || transactionalFlight.isProcessing(),
    isSecondaryProcessing: () => secondaryPending > 0,
    subscribe(listener) {
      processingListeners.add(listener);
      listener(flight.isProcessing() || transactionalFlight.isProcessing());
      return () => { processingListeners.delete(listener); };
    },
    waitForSecondaryWork: () => secondaryTail,
  };
}
