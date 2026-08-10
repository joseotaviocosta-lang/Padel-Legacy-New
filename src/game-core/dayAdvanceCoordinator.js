import { advanceCareerDay } from './calendarLifecycle';
import { processGameStateDay } from './gameStateLifecycle.js';
import { createSingleFlightCoordinator } from './singleFlightCoordinator.js';
import { localGame } from '@/api/localGameClient.js';

function broadcastProfileUpdate(profile, source = 'day-advance-coordinator') {
  if (typeof window === 'undefined' || !profile) return;
  window.dispatchEvent(new CustomEvent('padel:profile-updated', {
    detail: {
      profile,
      profileId: profile.id,
      careerDate: profile.career_date,
      source,
    },
  }));
  window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
}

/**
 * Coordenador global do avanço de exatamente um dia.
 * Todos os atalhos de UI compartilham a mesma Promise para impedir que dois
 * cliques concorrentes processem calendário, missões ou eventos em duplicidade.
 */
const defaultDebugEnabled = Boolean(import.meta.env?.DEV);

export function createDayAdvanceController({
  advanceCore,
  processSecondary = async () => null,
  publishProfile = () => {},
  logger = console.debug,
  debug = false,
} = {}) {
  let completedCore = null;
  let secondaryTail = Promise.resolve();
  let secondaryProcessing = false;

  const log = (...args) => { if (debug) logger(...args); };
  const scheduleSecondary = (descriptor) => {
    secondaryProcessing = true;
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
          secondaryProcessing = false;
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
    isSecondaryProcessing: () => secondaryProcessing,
    subscribe: (listener) => flight.subscribe(listener),
    waitForSecondaryWork: () => secondaryTail,
  };
}

const controller = createDayAdvanceController({
  debug: defaultDebugEnabled,
  advanceCore: (profile) => advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true }),
  processSecondary: async (profile, previousDate, currentDate) => {
    const fresh = await localGame.entities.PlayerProfile.get(profile.id).catch(() => profile);
    const result = await processGameStateDay(fresh, previousDate, currentDate);
    return result.profile || fresh;
  },
  publishProfile: broadcastProfileUpdate,
});

export function advanceCareerDayOnce(profile) {
  if (!profile?.id) return Promise.reject(new Error('Perfil da carreira indisponível.'));
  if (defaultDebugEnabled) console.debug('[GlobalAdvance] click');
  return controller.run(profile);
}

export function isCareerDayAdvanceProcessing() {
  return controller.isProcessing();
}

export function subscribeCareerDayAdvance(listener) {
  return controller.subscribe(listener);
}

export function isCareerDaySecondaryProcessing() {
  return controller.isSecondaryProcessing();
}

export function waitForCareerDaySecondaryWork() {
  return controller.waitForSecondaryWork();
}
