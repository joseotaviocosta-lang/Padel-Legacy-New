import { advanceCareerDay } from './calendarLifecycle';
import { processGameStateDay } from './gameStateLifecycle.js';
import { createDayAdvanceController } from './dayAdvanceController.js';
import { localGame } from '@/api/localGameClient.js';
import { gameRepository } from '@/gameplay/services/runtime.js';
import { profileAction, timeAsync, createStageProfiler } from '@/dev/performanceProbe.js';

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
  advanceCore: (profile) => advanceCareerDay(profile, {
    deferGameState: true,
    deferGlobalProcessing: true,
    persistenceTransaction: false,
  }),
  processSecondary: async (profile, previousDate, currentDate) => {
    const entities = /** @type {any} */ (localGame.entities);
    const fresh = await entities.PlayerProfile.get(profile.id).catch(() => profile);
    // Contrato central preservado: processGameStateDay(fresh, previousDate, currentDate).
    // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md, item 10): processGameStateDay
    // já aceita um profiler opcional (stage() lá dentro) — nunca era passado,
    // então nenhuma medição por etapa existia. Reaproveita esse contrato em
    // vez de criar um mecanismo novo.
    const profiler = createStageProfiler();
    const result = await processGameStateDay(fresh, previousDate, currentDate, { profiler });
    profiler.finish();
    return result.profile || fresh;
  },
  publishProfile: broadcastProfileUpdate,
});

export function advanceCareerDayOnce(profile) {
  if (!profile?.id) return Promise.reject(new Error('Perfil da carreira indisponível.'));
  if (defaultDebugEnabled) console.debug('[GlobalAdvance] click');
  // M3.4 (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md, Partes 27/42): `timeAsync`
  // acima é cortado do bundle release (import.meta.env.DEV); `profileAction`
  // não é — precisa aparecer no overlay ?perfdebug=1 rodando no APK release,
  // que foi onde a lentidão real foi reportada.
  // Compatibilidade estrutural histórica: () => controller.run(profile).
  // No fluxo M3.7, core + GameState precisam terminar antes do commit único.
  return profileAction('advance-day', () => timeAsync('calendar: advance 1 day (transação completa)', async () => {
    const finalProfile = await gameRepository.withPersistenceTransaction(
      'advance-day',
      () => controller.runTransactional(profile),
    );
    broadcastProfileUpdate(finalProfile, 'day-advance-transaction');
    return finalProfile;
  }));
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
