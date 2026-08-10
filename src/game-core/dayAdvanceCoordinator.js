import { advanceCareerDay } from './calendarLifecycle';

let activeRequest = null;
let processing = false;
const listeners = new Set();

function publishProcessing(next) {
  processing = next;
  listeners.forEach((listener) => listener(next));
}

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
export function advanceCareerDayOnce(profile) {
  if (activeRequest) return activeRequest;
  if (!profile?.id) return Promise.reject(new Error('Perfil da carreira indisponível.'));

  publishProcessing(true);
  activeRequest = advanceCareerDay(profile)
    .then((updated) => {
      broadcastProfileUpdate(updated);
      return updated;
    })
    .finally(() => {
      activeRequest = null;
      publishProcessing(false);
    });
  return activeRequest;
}

export function isCareerDayAdvanceProcessing() {
  return processing;
}

export function subscribeCareerDayAdvance(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
