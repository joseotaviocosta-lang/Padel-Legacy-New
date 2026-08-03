import { advanceDay, CAREER_START_DATE, addDays } from '@/lib/career';
import { processGameStateDay } from './gameStateLifecycle';
import { getInjuryStatus } from './injuryRecoveryLifecycle';
import { isInjured } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';

export const MAX_INJURY_SKIP_DAYS = 60;

async function getCriticalEventBeforeAdvance(profile) {
  const nextDate = addDays(profile.career_date || CAREER_START_DATE, 1);
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  return (events || []).find((event) => {
    const ends = event.end_date || event.start_date;
    const occursNextDay = event.start_date <= nextDate && ends >= nextDate;
    return occursNextDay && (event.event_type === 'tournament' || event.requires_decision || event.is_mandatory);
  }) || null;
}

/**
 * Única porta de entrada para avançar o calendário do jogador.
 * A partir da versão 2.2, os demais sistemas são coordenados pelo GameState.
 */
export async function advanceCareerDay(profile) {
  const oldDate = profile?.career_date || CAREER_START_DATE;
  const advancedProfile = await advanceDay(profile);
  const newDate = advancedProfile?.career_date || oldDate;
  const result = await processGameStateDay(advancedProfile, oldDate, newDate);
  return result.profile || advancedProfile;
}

export function hasActiveInjury(profile) {
  return getInjuryStatus(profile).injured || isInjured(profile);
}

export async function advanceCareerUntilRecovered(profile, { maxDays = MAX_INJURY_SKIP_DAYS } = {}) {
  if (!hasActiveInjury(profile)) return { profile, daysAdvanced: 0, recovered: true, blockedBy: null };
  let current = profile;
  let daysAdvanced = 0;
  const initialEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  while (hasActiveInjury(current) && daysAdvanced < maxDays) {
    const blockingEvent = await getCriticalEventBeforeAdvance(current);
    if (blockingEvent) {
      return { profile: current, daysAdvanced, recovered: false, blockedBy: blockingEvent };
    }
    current = await advanceCareerDay(current);
    daysAdvanced += 1;
  }
  const finalEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  const changed = (finalEvents || []).filter((event) => {
    const before = (initialEvents || []).find((item) => item.id === event.id);
    return before && before.status !== event.status;
  });
  return {
    profile: current,
    daysAdvanced,
    recovered: !hasActiveInjury(current),
    blockedBy: null,
    summary: {
      eventsProcessed: changed.length,
      trainingsCancelled: changed.filter((event) => event.event_type === 'training_camp' && event.status === 'cancelled').length,
      tournamentsMissed: changed.filter((event) => event.event_type === 'tournament' && event.status === 'missed').length,
    },
  };
}
