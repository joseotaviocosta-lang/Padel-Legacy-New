import { advanceCareerDay } from './calendarLifecycle';
import { processGameStateDay } from './gameStateLifecycle.js';
import { createDayAdvanceController } from './dayAdvanceController.js';
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
const runtime = /** @type {any} */ (globalThis);
const defaultDebugEnabled = runtime.__PADEL_ADVANCE_DEBUG__ === true
  || ['localhost', '127.0.0.1'].includes(runtime.location?.hostname);

const controller = createDayAdvanceController({
  debug: defaultDebugEnabled,
  advanceCore: (profile) => advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true }),
  processSecondary: async (profile, previousDate, currentDate) => {
    const entities = /** @type {any} */ (localGame.entities);
    const fresh = await entities.PlayerProfile.get(profile.id).catch(() => profile);
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
