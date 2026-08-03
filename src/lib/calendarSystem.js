import { localGame } from '@/api/localGameClient.js';
import { addDays, CAREER_START_DATE } from '@/lib/career';
import { levelForXp, LEVELS, incrementMissionProgress, TOURNAMENT_ENERGY_COST } from '@/lib/padel';
import { buildAthleteEntryContext, evaluateTournamentEntry, getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';
import { executeTraining, TRAINING_ACTIVITIES, INTENSITY_LEVELS } from '@/lib/trainingSystem.js';

// ── Event type metadata ───────────────────────────────────────────────────
export const EVENT_TYPES = {
  tournament: { label: 'Torneio', icon: 'Trophy', color: 'text-amber-400', dot: 'bg-amber-500' },
  travel: { label: 'Viagem', icon: 'Plane', color: 'text-cyan-400', dot: 'bg-cyan-500' },
  rest: { label: 'Descanso', icon: 'Moon', color: 'text-blue-400', dot: 'bg-blue-500' },
  training_camp: { label: 'Treino', icon: 'Dumbbell', color: 'text-primary', dot: 'bg-primary' },
  press: { label: 'Imprensa', icon: 'Mic', color: 'text-purple-400', dot: 'bg-purple-500' },
  sponsor_event: { label: 'Patrocinador', icon: 'Handshake', color: 'text-green-400', dot: 'bg-green-500' },
  medical: { label: 'Médico', icon: 'Stethoscope', color: 'text-red-400', dot: 'bg-red-500' },
  personal: { label: 'Pessoal', icon: 'User', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

// ── Surface metadata ──────────────────────────────────────────────────────
export const SURFACE_META = {
  vidro: { label: 'Vidro', icon: 'Square', desc: 'Quadra de vidro — jogo rápido' },
  cimento: { label: 'Cimento', icon: 'Square', desc: 'Quadra de cimento — mais lento' },
  indoor: { label: 'Indoor', icon: 'Home', desc: 'Quadra coberta — sem clima' },
  outdoor: { label: 'Outdoor', icon: 'Sun', desc: 'Quadra aberta — sujeito ao clima' },
  areia: { label: 'Areia', icon: 'Waves', desc: 'Beach tennis — estilo diferente' },
  gramado: { label: 'Gramado', icon: 'Trees', desc: 'Quadra de grama — incomum' },
};

// ── Phase labels ──────────────────────────────────────────────────────────
export const PHASE_LABELS = {
  inscricoes: 'Inscrições Abertas',
  chaveamento: 'Montando Chaveamento',
  r64: 'Rodada de 64',
  r32: 'Rodada de 32',
  r16: 'Rodada de 16',
  quartas: 'Quartas de Final',
  semifinal: 'Semifinal',
  final: 'Final',
  concluido: 'Concluído',
};

// ── Entry requirement validation ───────────────────────────────────────────
export function checkTournamentRequirements(profile, tournament, teamRank = 0) {
  const reasons = [];
  const playerLevel = levelForXp(profile?.xp || 0);
  const playerLevelIdx = LEVELS.indexOf(playerLevel);

  if (tournament.min_level) {
    const minIdx = LEVELS.indexOf(tournament.min_level);
    if (playerLevelIdx < minIdx) reasons.push(`Nível mínimo: ${tournament.min_level}`);
  }

  const entry = evaluateTournamentEntry(
    tournament,
    buildAthleteEntryContext(profile, teamRank, tournament),
  );
  if (!entry.eligible) reasons.push(entry.reason);

  if ((tournament.entry_fee || 0) > 0 && (profile?.coins || 0) < tournament.entry_fee) {
    reasons.push(`Taxa de inscrição: ${tournament.entry_fee} moedas`);
  }
  if (!profile?.partner_id) reasons.push('Você precisa de um parceiro de dupla');

  const careerDate = profile?.career_date || CAREER_START_DATE;
  if (!isRegistrationOpen(tournament, careerDate)) {
    const opening = getRegistrationOpeningDate(tournament);
    const deadline = getRegistrationDeadline(tournament);
    if (opening && careerDate < opening) reasons.push(`Inscrições abrem em ${opening}`);
    else if (deadline && careerDate > deadline) reasons.push('Inscrições encerradas');
  }
  if (tournament.registration_deadline && careerDate > tournament.registration_deadline) reasons.push('Inscrições encerradas');

  return { canRegister: reasons.length === 0, reasons, entry };
}

// ── Schedule conflict detection ───────────────────────────────────────────
export function hasScheduleConflict(events, startDate, endDate, excludeId = null) {
  return events.filter(e =>
    e.id !== excludeId &&
    e.status === 'scheduled' &&
    !(endDate < e.start_date || startDate > (e.end_date || e.start_date))
  );
}

export const PLANNED_ACTIVITY_TYPES = [
  { id: 'training', label: 'Treino', eventType: 'training_camp' },
  { id: 'rest', label: 'Dia de descanso', eventType: 'rest' },
  { id: 'personal', label: 'Atividade pessoal', eventType: 'personal' },
];

export async function schedulePlannedActivity(profile, input) {
  const date = String(input?.date || '');
  const careerDate = profile?.career_date || CAREER_START_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= careerDate) {
    throw new Error('Escolha uma data futura válida.');
  }
  const kind = PLANNED_ACTIVITY_TYPES.find((item) => item.id === input?.kind);
  if (!kind) throw new Error('Escolha uma atividade válida.');

  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  const conflicts = hasScheduleConflict(events || [], date, date);
  if (conflicts.length) throw new Error(`Já existe um compromisso nesse dia: ${conflicts[0].title}.`);

  let title = String(input?.title || '').trim();
  let description = '';
  const metadata = { planner_created: true, planned_activity_kind: kind.id };
  if (kind.id === 'training') {
    const activity = TRAINING_ACTIVITIES.find((item) => item.id === input.activityId);
    const intensity = INTENSITY_LEVELS.find((item) => item.id === input.intensityId);
    if (!activity || !intensity) throw new Error('Escolha o treino e a intensidade.');
    title = activity.label;
    description = `${intensity.label} · ${activity.duration} min`;
    metadata.training_activity_id = activity.id;
    metadata.training_intensity_id = intensity.id;
  } else if (!title) {
    title = kind.label;
  }
  if (title.length > 60) throw new Error('O título deve ter no máximo 60 caracteres.');

  return localGame.entities.CalendarEvent.create({
    profile_id: profile.id,
    event_type: kind.eventType,
    title,
    description,
    start_date: date,
    end_date: date,
    status: 'scheduled',
    is_mandatory: false,
    requires_decision: false,
    metadata,
  });
}

export async function cancelPlannedActivity(profileId, event) {
  if (!event?.id || event.profile_id !== profileId || !event.metadata?.planner_created || event.status !== 'scheduled') {
    throw new Error('Somente atividades planejadas e ainda pendentes podem ser canceladas.');
  }
  return localGame.entities.CalendarEvent.update(event.id, { status: 'cancelled' });
}

export async function updatePlannedActivity(profile, event, date) {
  if (!event?.id || event.profile_id !== profile.id || !event.metadata?.planner_created || event.status !== 'scheduled') throw new Error('Somente atividades futuras pendentes podem ser alteradas.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= (profile.career_date || CAREER_START_DATE)) throw new Error('Escolha uma data futura válida.');
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  const conflicts = hasScheduleConflict(events || [], date, date, event.id);
  if (conflicts.length) throw new Error(`Já existe um compromisso nesse dia: ${conflicts[0].title}.`);
  return localGame.entities.CalendarEvent.update(event.id, { start_date: date, end_date: date });
}

export async function scheduleRecurringActivities(profile, input, weeks = 1) {
  const count = Math.max(1, Math.min(8, Number(weeks) || 1));
  const created = [];
  const skipped = [];
  for (let index = 0; index < count; index += 1) {
    const date = addDays(input.date, index * 7);
    try { created.push(await schedulePlannedActivity(profile, { ...input, date })); }
    catch (error) { skipped.push({ date, reason: error?.message || String(error) }); }
  }
  return { created, skipped };
}

export async function executePlannedActivities(profile, date) {
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled' });
  const due = (events || []).filter((event) => event.start_date === date && event.metadata?.planner_created);
  let currentProfile = profile;
  const results = [];
  for (const event of due) {
    let failure = null;
    if (event.metadata.planned_activity_kind === 'training') {
      const activity = TRAINING_ACTIVITIES.find((item) => item.id === event.metadata.training_activity_id);
      if (!activity) failure = 'Treino não encontrado.';
      else {
        const result = await executeTraining(currentProfile, activity, event.metadata.training_intensity_id);
        if (result.error) failure = result.error;
        else currentProfile = result.profile;
      }
    }
    const cancelledByInjury = failure && /lesionad/i.test(failure);
    const status = failure ? (cancelledByInjury ? 'cancelled' : 'missed') : 'completed';
    await localGame.entities.CalendarEvent.update(event.id, {
      status,
      metadata: { ...event.metadata, executed_at: date, failure_reason: failure, cancellation_reason: cancelledByInjury ? 'lesão' : null },
    });
    results.push({ event, status, error: failure });
  }
  return { profile: currentProfile, results };
}

// ── Tournament registration ───────────────────────────────────────────────
export async function registerForTournament(profile, tournament, teamRank = 0, options = {}) {
  const validation = checkTournamentRequirements(profile, tournament, teamRank);
  if (!validation.canRegister) {
    return { success: false, reasons: validation.reasons };
  }

  const entry = validation.entry;

  // Check for existing registration
  const existing = await localGame.entities.CalendarEvent.filter({
    profile_id: profile.id,
    related_id: tournament.id,
    status: 'scheduled',
  });
  if (existing && existing.length > 0) {
    return { success: false, reasons: ['Você já está inscrito neste torneio'] };
  }

  // Check schedule conflicts
  const allEvents = await localGame.entities.CalendarEvent.filter({
    profile_id: profile.id,
    status: 'scheduled',
  });
  const startDate = tournament.start_date;
  const endDate = tournament.end_date || tournament.start_date;
  const conflicts = hasScheduleConflict(allEvents, startDate, endDate);
  if (conflicts.length > 0 && !options.replaceConflicts) {
    return {
      success: false,
      requiresConfirmation: true,
      conflicts,
      reasons: [`Você já possui ${conflicts[0].title} neste período.`],
    };
  }
  if (conflicts.length > 0 && options.replaceConflicts) {
    for (const conflict of conflicts) {
      await cancelRegistration(profile.id, conflict.id, conflict.related_id);
    }
  }

  // Deduct entry fee if applicable
  let updatedProfile = profile;
  if ((tournament.entry_fee || 0) > 0) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      coins: (profile.coins || 0) - tournament.entry_fee,
    });
  }

  // Create calendar event
  await localGame.entities.CalendarEvent.create({
    profile_id: profile.id,
    event_type: 'tournament',
    title: tournament.name,
    description: `${tournament.tier_label || tournament.tier} · ${tournament.location || '—'} · ${getEntryPathLabel(entry.path)}`,
    start_date: startDate,
    end_date: endDate,
    related_id: tournament.id,
    related_name: tournament.name,
    status: 'scheduled',
    location: tournament.location || '',
    energy_cost: TOURNAMENT_ENERGY_COST,
    coin_cost: tournament.entry_fee || 0,
    is_mandatory: true,
    requires_decision: true,
    decision_type: 'play_tournament',
    metadata: {
      tier: tournament.tier,
      surface: tournament.surface,
      prize: tournament.prize_coins,
      rank_points: tournament.rank_points,
      conflict_group: tournament.conflict_group,
      prestige: tournament.prestige,
      exposure: tournament.exposure,
      entry_path: entry.path,
      entry_label: getEntryPathLabel(entry.path),
      entry_reason: entry.reason,
      qualifying_required: entry.path === 'qualifying',
      qualifying_status: entry.path === 'qualifying' ? 'pending' : 'not_required',
      team_rank: Number(teamRank || 0),
      replaced_event_ids: conflicts.map((event) => event.id),
    },
  });

  // Add to tournament participants
  if (tournament.max_participants) {
    const participants = [...(tournament.participants || [])];
    if (!participants.includes(profile.id)) {
      participants.push(profile.id);
      await localGame.entities.Tournament.update(tournament.id, { participants });
    }
  }

  await incrementMissionProgress(profile.id, 'join_tournament');

  return { success: true, profile: updatedProfile, entry: validation.entry, replacedConflicts: conflicts };
}

// ── Cancel registration ──────────────────────────────────────────────────
export async function cancelRegistration(profileId, eventId, tournamentId) {
  await localGame.entities.CalendarEvent.update(eventId, { status: 'cancelled' });
  if (tournamentId) {
    const t = await localGame.entities.Tournament.get(tournamentId);
    if (t) {
      const participants = (t.participants || []).filter(id => id !== profileId);
      await localGame.entities.Tournament.update(tournamentId, { participants });
    }
  }
}

// ── Pending decisions (blocks day advance) ───────────────────────────────
export async function getPendingDecisions(profileId, careerDate) {
  const events = await localGame.entities.CalendarEvent.filter({
    profile_id: profileId,
    status: 'scheduled',
    requires_decision: true,
  });
  // Only events on or before the current date require a decision before advancing
  return (events || []).filter(e => e.start_date <= careerDate);
}

// ── Can advance day check ────────────────────────────────────────────────
export async function canAdvanceDay(profileId, careerDate) {
  const pending = await getPendingDecisions(profileId, careerDate);
  if (pending.length > 0) {
    return {
      canAdvance: false,
      reason: `Decisão obrigatória pendente: ${pending[0].title}`,
      blockingEvent: pending[0],
    };
  }
  return { canAdvance: true, reason: null, blockingEvent: null };
}

// ── Process calendar events on day advance ───────────────────────────────
export async function processCalendarEvents(profile, newDate) {
  const events = await localGame.entities.CalendarEvent.filter({
    profile_id: profile.id,
    status: 'scheduled',
  });

  const updates = {};
  let coinChange = 0;
  let xpChange = 0;
  let energyChange = 0;
  const completed = [];

  for (const event of events || []) {
    // Mark past events as missed if they were tournaments requiring decisions
    const eventEnd = event.end_date || event.start_date;
    if (eventEnd < newDate && event.requires_decision && event.decision_type === 'play_tournament') {
      await localGame.entities.CalendarEvent.update(event.id, { status: 'missed' });
      // Penalty for missing a tournament
      coinChange -= 50;
      completed.push({ ...event, newStatus: 'missed' });
      continue;
    }

    // Complete non-tournament events that have ended
    if (eventEnd < newDate && !event.requires_decision) {
      await localGame.entities.CalendarEvent.update(event.id, { status: 'completed' });
      coinChange += event.coin_reward || 0;
      xpChange += event.xp_reward || 0;
      completed.push({ ...event, newStatus: 'completed' });
    }
  }

  if (coinChange !== 0) updates.coins = (profile.coins || 0) + coinChange;
  if (xpChange !== 0) updates.xp = (profile.xp || 0) + xpChange;

  return { updates, completed };
}

// ── Auto-generate travel events for tournaments ──────────────────────────
export async function autoCreateTravelForTournament(profile, tournament) {
  if (!tournament.location) return;
  const careerDate = profile.career_date || CAREER_START_DATE;
  const tournamentDate = tournament.start_date;
  if (!tournamentDate) return;

  // Check if travel is already planned
  const existing = await localGame.entities.CalendarEvent.filter({
    profile_id: profile.id,
    event_type: 'travel',
    related_id: tournament.id,
  });
  if (existing && existing.length > 0) return;

  // Travel 1 day before the tournament
  const travelDate = addDays(tournamentDate, -1);
  if (travelDate < careerDate) return; // Can't travel to the past

  await localGame.entities.CalendarEvent.create({
    profile_id: profile.id,
    event_type: 'travel',
    title: `Viagem para ${tournament.name}`,
    description: `Viagem até ${tournament.location}`,
    start_date: travelDate,
    end_date: travelDate,
    related_id: tournament.id,
    related_name: tournament.name,
    status: 'scheduled',
    location: tournament.location,
    energy_cost: 5,
    coin_cost: 100,
    travel_required: true,
  });
}

// ── Get events for a date range ───────────────────────────────────────────
export async function getEventsForRange(profileId, startDate, endDate) {
  const events = await localGame.entities.CalendarEvent.filter({
    profile_id: profileId,
    status: 'scheduled',
  });
  return (events || []).filter(e => !(e.end_date < startDate || e.start_date > endDate));
}

// ── Resolve a pending decision ────────────────────────────────────────────
export async function resolveDecision(eventId, action) {
  // action: 'play' | 'skip' | 'confirm'
  if (action === 'skip') {
    await localGame.entities.CalendarEvent.update(eventId, { status: 'cancelled', requires_decision: false });
  } else {
    await localGame.entities.CalendarEvent.update(eventId, { requires_decision: false });
  }
}

// ── Tournament phase computation ──────────────────────────────────────────
export function computeTournamentPhase(tournament, playerParticipated, roundIdx = 0) {
  if (tournament.status === 'finalizado' || tournament.champion) return 'concluido';
  if (!playerParticipated) return tournament.current_phase || 'inscricoes';

  const phases = ['r32', 'r16', 'quartas', 'semifinal', 'final'];
  return phases[roundIdx] || 'inscricoes';
}

// ── Get registration deadline (auto-compute if not set) ───────────────────
export function getRegistrationDeadline(tournament) {
  if (tournament.registration_deadline) return tournament.registration_deadline;
  if (!tournament.start_date) return null;
  // Default: 3 days before start
  return addDays(tournament.start_date, -3);
}

// ── Check if registration is still open ──────────────────────────────────
export function getRegistrationOpeningDate(tournament) {
  if (!tournament?.start_date) return null;
  return tournament.registration_open_date || addDays(tournament.start_date, -45);
}

export function isRegistrationOpen(tournament, careerDate) {
  if (!careerDate || !tournament?.start_date) return false;
  const opening = getRegistrationOpeningDate(tournament);
  const deadline = getRegistrationDeadline(tournament);
  return careerDate >= opening && careerDate <= deadline;
}
