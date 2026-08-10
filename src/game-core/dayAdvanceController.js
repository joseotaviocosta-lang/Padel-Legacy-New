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

  const log = (...args) => { if (debug) logger(...args); };
  const scheduleSecondary = (descriptor) => {
    secondaryPending += 1;
    secondaryTail = secondaryTail
      .catch(() => null)
      .then(async () => {
        log('[GlobalAdvance] postDayEvents:start');
        try {
          const secondaryProfile = await processSecondary(descriptor.profile, descriptor.previousDate, descriptor.currentDate);
          if (secondaryProfile) publishProfile(secondaryProfile, 'day-advance-secondary');
          log('[GlobalAdvance] postDayEvents:done');
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
    log('[GlobalAdvance] advanceCareerDay:start');
    const updated = await advanceCore(profile);
    log('[GlobalAdvance] advanceCareerDay:done');
    log('[GlobalAdvance] persist:done');
    publishProfile(updated, 'day-advance-core');
    completedCore = { profile: updated, previousDate, currentDate: updated?.career_date };
    return updated;
  }, {
    source: 'dayAdvanceCoordinator',
    onStateChange: ({ previous, next, source }) => {
      log(`[AdvanceState] ${previous} -> ${next}`, `source: ${source}`);
      log(`[GlobalAdvance] lock=${next}`);
      if (!next && completedCore) {
        const descriptor = completedCore;
        completedCore = null;
        queueMicrotask(() => scheduleSecondary(descriptor));
      }
    },
  });

  return {
    run: (profile) => flight.run(profile),
    isProcessing: () => flight.isProcessing(),
    isSecondaryProcessing: () => secondaryPending > 0,
    subscribe: (listener) => flight.subscribe(listener),
    waitForSecondaryWork: () => secondaryTail,
  };
}
