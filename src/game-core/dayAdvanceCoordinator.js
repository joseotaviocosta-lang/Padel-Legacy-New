import { advanceCareerDay } from './calendarLifecycle';
import { createSingleFlightCoordinator } from './singleFlightCoordinator.js';

function broadcastProfileUpdate(profile) {
  if (typeof window === 'undefined' || !profile) return;
  window.dispatchEvent(new CustomEvent('padel:profile-updated', {
    detail: {
      profile,
      profileId: profile.id,
      careerDate: profile.career_date,
      source: 'day-advance-coordinator',
    },
  }));
  window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
}

/**
 * Coordenador global do avanço de exatamente um dia.
 * Todos os atalhos de UI compartilham a mesma Promise para impedir que dois
 * cliques concorrentes processem calendário, missões ou eventos em duplicidade.
 */
const coordinator = createSingleFlightCoordinator(async (profile) => {
  const updated = await advanceCareerDay(profile);
  broadcastProfileUpdate(updated);
  return updated;
});

export function advanceCareerDayOnce(profile) {
  if (!profile?.id) return Promise.reject(new Error('Perfil da carreira indisponível.'));
  return coordinator.run(profile);
}

export function isCareerDayAdvanceProcessing() {
  return coordinator.isProcessing();
}

export function subscribeCareerDayAdvance(listener) {
  return coordinator.subscribe(listener);
}
