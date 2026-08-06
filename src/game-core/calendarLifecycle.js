import { advanceDay, CAREER_START_DATE, addDays } from '@/lib/career';
import { processGameStateDay } from './gameStateLifecycle';
import { getInjuryStatus } from './injuryRecoveryLifecycle';
import { isInjured } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import { shouldBlockBeforeAdvance, getInjuryAutoResolution } from './calendarAdvancePolicy';

export const MAX_INJURY_SKIP_DAYS = 60;

async function getCriticalEventBeforeAdvance(profile) {
  const nextDate = addDays(profile.career_date || CAREER_START_DATE, 1);
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  return (events || []).find((event) => shouldBlockBeforeAdvance(event, nextDate)) || null;
}

async function resolveInjuryCalendarConflicts(profile) {
  const nextDate = addDays(profile.career_date || CAREER_START_DATE, 1);
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  const resolved = [];

  for (const event of events || []) {
    const resolution = getInjuryAutoResolution(event, nextDate);
    if (!resolution) continue;
    const metadata = {
      ...(event.metadata || {}),
      auto_resolved_due_to_injury: true,
      auto_resolved_date: nextDate,
    };
    await localGame.entities.CalendarEvent.update(event.id, {
      status: resolution.status,
      requires_decision: false,
      metadata,
    });
    resolved.push({ event, resolution });
  }

  return resolved;
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


export async function advanceCareerDays(profile, days = 7, { stopBeforeCriticalEvent = true, onProgress } = {}) {
  const target = Math.max(1, Math.min(28, Number(days) || 1));
  let current = profile;
  let daysAdvanced = 0;
  const daily = [];
  let blockedBy = null;

  while (daysAdvanced < target) {
    // Recarrega o perfil antes de cada passo. Isso evita trabalhar com uma
    // cópia antiga após os sistemas diários persistirem energia, lesão, data
    // ou decisões no repositório da carreira.
    current = await localGame.entities.PlayerProfile.get(current.id).catch(() => current);
    if (stopBeforeCriticalEvent) {
      blockedBy = await getCriticalEventBeforeAdvance(current);
      if (blockedBy) break;
    }
    try {
      const before = current;
      const next = await advanceCareerDay(current);
      if (!next?.career_date || next.career_date === before?.career_date) {
        blockedBy = { title: 'O calendário não avançou; recarregue a carreira e tente novamente.', error: true };
        break;
      }
      current = await localGame.entities.PlayerProfile.get(next.id).catch(() => next);
      daysAdvanced += 1;
      daily.push({
        date: current.career_date,
        energy: current.energy,
        fatigue: current.fatigue,
        automaticTraining: current.last_automatic_training_date === current.career_date ? current.last_automatic_training_label : null,
        rested: Boolean(current.last_day_was_rest),
        xpGained: Math.max(0, Number(current.xp || 0) - Number(before.xp || 0)),
      });
      onProgress?.({ current: daysAdvanced, total: target, profile: current, day: daily[daily.length - 1] });
    } catch (error) {
      blockedBy = { title: error?.message || 'Decisão obrigatória', error: true };
      break;
    }
  }

  return { profile: current, daysAdvanced, blockedBy, daily };
}

export function hasActiveInjury(profile) {
  return getInjuryStatus(profile).injured || isInjured(profile);
}

export async function advanceCareerUntilRecovered(profile, { maxDays = MAX_INJURY_SKIP_DAYS } = {}) {
  if (!hasActiveInjury(profile)) return { profile, daysAdvanced: 0, recovered: true, blockedBy: null };
  let current = profile;
  let daysAdvanced = 0;
  const initialEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  const autoResolved = [];
  while (hasActiveInjury(current) && daysAdvanced < maxDays) {
    current = await localGame.entities.PlayerProfile.get(current.id).catch(() => current);
    // Durante uma lesão, treinos planejados são cancelados e torneios são
    // marcados como perdidos automaticamente. Apenas decisões não esportivas
    // realmente obrigatórias continuam interrompendo o avanço.
    const resolutions = await resolveInjuryCalendarConflicts(current);
    autoResolved.push(...resolutions);
    const blockingEvent = await getCriticalEventBeforeAdvance(current);
    if (blockingEvent) {
      return { profile: current, daysAdvanced, recovered: false, blockedBy: blockingEvent, autoResolved };
    }
    const beforeDate = current?.career_date;
    const next = await advanceCareerDay(current);
    if (!next?.career_date || next.career_date === beforeDate) {
      return {
        profile: current,
        daysAdvanced,
        recovered: false,
        blockedBy: { title: 'O calendário não avançou; recarregue a carreira e tente novamente.', error: true },
        autoResolved,
      };
    }
    current = await localGame.entities.PlayerProfile.get(next.id).catch(() => next);
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
      activitiesCancelledByInjury: autoResolved.filter((item) => item.resolution.injury_resolution === 'activity_cancelled').length,
    },
  };
}
