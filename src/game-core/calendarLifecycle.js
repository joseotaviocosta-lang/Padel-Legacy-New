import { advanceDay, CAREER_START_DATE, addDays } from '@/lib/career';
import { processGameStateDay } from './gameStateLifecycle';
import { getInjuryStatus } from './injuryRecoveryLifecycle';
import { isInjured } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import { shouldBlockBeforeAdvance, getInjuryAutoResolution } from './calendarAdvancePolicy';
import { compactGameStateReport } from './gameStateReport.js';
import { gameRepository } from '@/gameplay/services/runtime.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';
import { registerBetaDiagnostic } from '@/lib/betaDiagnostics.js';
import { restoreCareerSnapshotOnFailure } from './careerAdvanceTransaction.js';
import { buildTournamentRecoverySession, shouldBlockCareerAdvanceForMatchRecovery } from './tournamentMatchLifecycle.js';
import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';

export const MAX_INJURY_SKIP_DAYS = 60;

async function guardActiveMatchBeforeAdvance(profile, snapshot) {
  const careerId = snapshot?.career_id;
  if (!careerId) return null;
  const repository = getMatchCheckpointRepository();
  const checkpoint = await repository.read(careerId).catch(() => null);
  if (!checkpoint) return null;
  if (checkpoint.type === 'practice') {
    const error = /** @type {Error & { code?: string, recovery?: any }} */ (new Error('Existe uma partida treino em andamento. Continue ou encerre a partida antes de avançar o dia.'));
    error.code = 'ACTIVE_MATCH_RECOVERY_REQUIRED';
    throw error;
  }

  const events = snapshot?.entities?.CalendarEvent || [];
  const event = events.find((item) => item.event_type === 'tournament' && String(item.related_id) === String(checkpoint.tournament_id)) || null;
  const run = event?.metadata?.tournament_run || null;
  const match = getCurrentTournamentMatch(run);
  const tournaments = snapshot?.entities?.Tournament || [];
  const tournament = tournaments.find((item) => String(item.id) === String(checkpoint.tournament_id))
    || (event ? { id: event.related_id, name: run?.tournamentName || event.related_name } : null);
  const partnerId = profile?.partner_id || checkpoint.participant_ids?.A?.[1];
  const session = buildTournamentRecoverySession(checkpoint, {
    careerId,
    careerDate: profile?.career_date,
    tournament,
    run,
    match,
    teamA: [profile, partnerId ? { id: partnerId } : null].filter(Boolean),
    teamB: match?.opponent || [],
  });
  if (session.status === 'orphaned') {
    await repository.clearIfMatch(careerId, checkpoint.match_id).catch(() => {});
    return session;
  }
  if (shouldBlockCareerAdvanceForMatchRecovery(session)) {
    const error = /** @type {Error & { code?: string, recovery?: any }} */ (new Error(session.status === 'resumable'
      ? 'Existe uma partida de torneio em andamento. Continue a partida antes de avançar o dia.'
      : 'A rodada interrompida precisa ser reiniciada com segurança antes de avançar o dia.'));
    error.code = 'ACTIVE_MATCH_RECOVERY_REQUIRED';
    error.recovery = session;
    throw error;
  }
  return session;
}

async function buildAdvanceFailureContext(profile, snapshot, error) {
  const failedCareer = await gameRepository.getActiveCareer({ fresh: false }).catch(() => snapshot);
  const events = failedCareer?.entities?.CalendarEvent || [];
  const messages = failedCareer?.entities?.CareerMessage || [];
  const tournamentEvent = events.find((event) => event.status === 'scheduled' && event.event_type === 'tournament' && event.metadata?.tournament_run) || null;
  const tournamentRun = tournamentEvent?.metadata?.tournament_run || null;
  const activeMatch = tournamentRun?.matches?.[Number(tournamentRun?.currentRound || 0)] || null;
  const pendingDecision = events.find((event) => event.status === 'scheduled' && event.requires_decision && event.start_date <= profile?.career_date) || error?.blockingEvent || null;
  const pendingInterview = messages.find((message) => message.related_entity_type === 'PressInterview' && !message.is_read) || null;
  const checkpoint = snapshot?.career_id
    ? await getMatchCheckpointRepository().read(snapshot.career_id).catch(() => null)
    : null;
  return {
    stage: error?.advanceStage || 'unknown',
    date: profile?.career_date || null,
    tournamentId: tournamentEvent?.related_id || tournamentRun?.tournamentId || null,
    round: activeMatch?.round || null,
    activeMatchId: activeMatch?.id || null,
    checkpointState: checkpoint ? {
      matchId: checkpoint.match_id,
      round: checkpoint.round || null,
      status: checkpoint.checkpoint_status || 'active',
    } : null,
    pendingInterview: pendingInterview ? { id: pendingInterview.related_entity_id || pendingInterview.id } : null,
    pendingDecision: pendingDecision ? { id: pendingDecision.id, title: pendingDecision.title } : null,
  };
}

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
    // A rodada é marcada 'missed', mas sem isto a TournamentRegistration
    // correspondente ficava 'confirmed' para sempre: nenhum outro código
    // encerra a inscrição fora do fluxo normal de finalização/abandono do
    // torneio, o que acumula registros órfãos em carreiras longas com
    // várias lesões durante torneios (ver docs/BETA_READINESS_PHASE10.md).
    if (resolution.injury_resolution === 'tournament_missed' && event.related_id) {
      const registrations = await localGame.entities.TournamentRegistration.filter({
        profile_id: profile.id,
        tournament_id: event.related_id,
      });
      for (const registration of registrations || []) {
        if (!['pending', 'confirmed'].includes(registration.status)) continue;
        await localGame.entities.TournamentRegistration.update(registration.id, {
          status: 'withdrawn',
          withdrawal_reason: 'injury_auto_resolved',
        });
      }
    }
    resolved.push({ event, resolution });
  }

  return resolved;
}

/**
 * Única porta de entrada para avançar o calendário do jogador.
 * A partir da versão 2.2, os demais sistemas são coordenados pelo GameState.
 */
async function advanceCareerDayWork(profile, { deferGameState = false, deferGlobalProcessing = false, profiler = null } = {}) {
  const snapshot = profile?.id ? await gameRepository.getActiveCareer({ fresh: false }).catch(() => null) : null;
  try {
    await guardActiveMatchBeforeAdvance(profile, snapshot);
    let currentProfile = profile;
    const compacted = compactGameStateReport(profile?.game_state_last_report);
    if (profile?.id && compacted.changed) {
      currentProfile = await localGame.entities.PlayerProfile.update(profile.id, {
        game_state_last_report: compacted.report,
      });
    }

    const oldDate = currentProfile?.career_date || CAREER_START_DATE;
    const advancedProfile = await advanceDay(currentProfile, { deferGlobalProcessing, profiler });
    const newDate = advancedProfile?.career_date || oldDate;
    if (deferGameState) return advancedProfile;
    const result = profiler
      ? await profiler.measure('gameState', () => processGameStateDay(advancedProfile, oldDate, newDate))
      : await processGameStateDay(advancedProfile, oldDate, newDate);
    return result.profile || advancedProfile;
  } catch (error) {
    const context = await buildAdvanceFailureContext(profile, snapshot, error);
    const rollback = await restoreCareerSnapshotOnFailure({
      snapshot,
      restore: (career) => gameRepository.saveActiveCareer(career),
    });
    const rollbackError = rollback.rollbackError;
    const code = rollbackError ? 'advance_day_rollback_failed' : (error?.code || 'advance_day_failed');
    if (error && typeof error === 'object') {
      error.code = code;
      error.context = { ...context, rollbackApplied: rollback.rollbackApplied };
    }
    registerBetaDiagnostic({
      type: 'career-day-advance',
      code,
      message: error?.message || 'Falha ao avançar o dia.',
      context: { ...context, rollbackApplied: rollback.rollbackApplied },
      rollbackError: rollbackError?.message || null,
    });
    console.error('[CareerDayAdvance]', { code, ...context, rollbackApplied: rollback.rollbackApplied });
    throw error;
  }
}

export function advanceCareerDay(profile, options = {}) {
  if (options.persistenceTransaction === false) return advanceCareerDayWork(profile, options);
  return gameRepository.withPersistenceTransaction('advance-day-core', () => advanceCareerDayWork(profile, options));
}

/**
 * Finaliza em segundo plano os sistemas globais adiados por um avanço em lote.
 * O calendário e os treinos já foram persistidos dia a dia; aqui o mundo é
 * sincronizado uma única vez para o intervalo completo, evitando travar a UI.
 */
async function finalizeCareerAdvanceRangeWork(profile, previousDate, currentDate) {
  if (!profile?.id || !currentDate || previousDate === currentDate) return profile;
  const fresh = await localGame.entities.PlayerProfile.get(profile.id).catch(() => profile);
  if (fresh?.game_state_last_processed_date === currentDate) return fresh;
  const result = await processGameStateDay(fresh, previousDate || fresh.career_date, currentDate);
  return result.profile || fresh;
}

export function finalizeCareerAdvanceRange(profile, previousDate, currentDate, { persistenceTransaction = true } = {}) {
  if (!persistenceTransaction) return finalizeCareerAdvanceRangeWork(profile, previousDate, currentDate);
  return gameRepository.withPersistenceTransaction(
    'advance-range-finalization',
    () => finalizeCareerAdvanceRangeWork(profile, previousDate, currentDate),
  );
}


export async function advanceCareerDays(profile, days = 7, { stopBeforeCriticalEvent = true, onProgress } = {}) {
  const target = Math.max(1, Math.min(28, Number(days) || 1));
  let current = profile;
  const rangeStartDate = profile?.career_date || CAREER_START_DATE;
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
      const dayNumber = daysAdvanced + 1;
      const dayResult = await gameRepository.withPersistenceTransaction(`advance-day-range:${dayNumber}`, async () => {
        const next = await advanceCareerDay(current, {
          deferGameState: true,
          deferGlobalProcessing: true,
          persistenceTransaction: false,
        });
        if (!next?.career_date || next.career_date === before?.career_date) {
          throw new Error('O calendário não avançou; recarregue a carreira e tente novamente.');
        }
        const dayProfile = await localGame.entities.PlayerProfile.get(next.id).catch(() => next);
        const reachedTarget = dayNumber >= target;
        const upcomingBlock = !reachedTarget && stopBeforeCriticalEvent
          ? await getCriticalEventBeforeAdvance(dayProfile)
          : null;
        const finalProfile = reachedTarget || upcomingBlock
          ? await finalizeCareerAdvanceRangeWork(dayProfile, rangeStartDate, dayProfile.career_date)
          : dayProfile;
        return { profile: finalProfile, dayProfile, upcomingBlock };
      });
      current = dayResult.profile;
      const dailyProfile = dayResult.dayProfile;
      daysAdvanced = dayNumber;
      daily.push({
        date: dailyProfile.career_date,
        energy: dailyProfile.energy,
        fatigue: dailyProfile.fatigue,
        automaticTraining: dailyProfile.last_automatic_training_date === dailyProfile.career_date ? dailyProfile.last_automatic_training_label : null,
        rested: Boolean(dailyProfile.last_day_was_rest),
        xpGained: Math.max(0, Number(dailyProfile.xp || 0) - Number(before.xp || 0)),
      });
      onProgress?.({ current: daysAdvanced, total: target, profile: current, day: daily[daily.length - 1] });
      if (dayResult.upcomingBlock) {
        blockedBy = dayResult.upcomingBlock;
        break;
      }
    } catch (error) {
      blockedBy = { title: error?.message || 'Decisão obrigatória', error: true };
      break;
    }
  }

  return { profile: current, daysAdvanced, blockedBy, daily, rangeStartDate };
}

export function hasActiveInjury(profile) {
  return getInjuryStatus(profile).injured || isInjured(profile);
}

export async function advanceCareerUntilRecovered(profile, { maxDays = MAX_INJURY_SKIP_DAYS } = {}) {
  if (!hasActiveInjury(profile)) return { profile, daysAdvanced: 0, recovered: true, blockedBy: null, rangeStartDate: profile?.career_date || CAREER_START_DATE };
  let current = profile;
  const rangeStartDate = profile?.career_date || CAREER_START_DATE;
  let daysAdvanced = 0;
  const initialEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  const autoResolved = [];
  while (hasActiveInjury(current) && daysAdvanced < maxDays) {
    const dayNumber = daysAdvanced + 1;
    const dayResult = await gameRepository.withPersistenceTransaction(`advance-injury-day:${dayNumber}`, async () => {
      const fresh = await localGame.entities.PlayerProfile.get(current.id).catch(() => current);
      // Resoluções automáticas e o calendário do mesmo dia compartilham o
      // draft; nenhuma delas abre um save completo próprio.
      const resolutions = await resolveInjuryCalendarConflicts(fresh);
      const blockingEvent = await getCriticalEventBeforeAdvance(fresh);
      if (blockingEvent) {
        const finalized = daysAdvanced > 0
          ? await finalizeCareerAdvanceRangeWork(fresh, rangeStartDate, fresh.career_date)
          : fresh;
        return { profile: finalized, resolutions, blockingEvent, advanced: false };
      }
      const next = await advanceCareerDay(fresh, {
        deferGameState: true,
        deferGlobalProcessing: true,
        persistenceTransaction: false,
      });
      if (!next?.career_date || next.career_date === fresh?.career_date) {
        return { profile: fresh, resolutions, advanced: false, calendarFailed: true };
      }
      const dayProfile = await localGame.entities.PlayerProfile.get(next.id).catch(() => next);
      const shouldFinalize = !hasActiveInjury(dayProfile) || dayNumber >= maxDays;
      const finalProfile = shouldFinalize
        ? await finalizeCareerAdvanceRangeWork(dayProfile, rangeStartDate, dayProfile.career_date)
        : dayProfile;
      return { profile: finalProfile, resolutions, advanced: true };
    });
    autoResolved.push(...dayResult.resolutions);
    current = dayResult.profile;
    if (dayResult.blockingEvent) {
      return { profile: current, daysAdvanced, recovered: false, blockedBy: dayResult.blockingEvent, autoResolved, rangeStartDate };
    }
    if (dayResult.calendarFailed) {
      return {
        profile: current,
        daysAdvanced,
        recovered: false,
        blockedBy: { title: 'O calendário não avançou; recarregue a carreira e tente novamente.', error: true },
        autoResolved,
        rangeStartDate,
      };
    }
    if (dayResult.advanced) daysAdvanced = dayNumber;
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
    rangeStartDate,
    summary: {
      eventsProcessed: changed.length,
      trainingsCancelled: changed.filter((event) => event.event_type === 'training_camp' && event.status === 'cancelled').length,
      tournamentsMissed: changed.filter((event) => event.event_type === 'tournament' && event.status === 'missed').length,
      activitiesCancelledByInjury: autoResolved.filter((item) => item.resolution.injury_resolution === 'activity_cancelled').length,
    },
  };
}
