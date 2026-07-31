import { base44 } from '@/api/base44Client';
import { addDays, CAREER_START_DATE } from '@/lib/career';
import { levelForXp, LEVELS, incrementMissionProgress, TOURNAMENT_ENERGY_COST } from '@/lib/padel';

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

  // Level check
  if (tournament.min_level) {
    const minIdx = LEVELS.indexOf(tournament.min_level);
    if (playerLevelIdx < minIdx) {
      reasons.push(`Nível mínimo: ${tournament.min_level}`);
    }
  }

  // Ranking check
  if (tournament.min_ranking && tournament.min_ranking > 0) {
    if (teamRank === 0 || teamRank > tournament.min_ranking) {
      reasons.push(`Ranking de dupla mínimo: top ${tournament.min_ranking}`);
    }
  }

  // Entry fee check
  if ((tournament.entry_fee || 0) > 0) {
    if ((profile?.coins || 0) < tournament.entry_fee) {
      reasons.push(`Taxa de inscrição: ${tournament.entry_fee} moedas`);
    }
  }

  // Partner check
  if (!profile?.partner_id) {
    reasons.push('Você precisa de um parceiro de dupla');
  }

  // Registration window check
  const careerDate = profile?.career_date || CAREER_START_DATE;
  if (!isRegistrationOpen(tournament, careerDate)) {
    const opening = getRegistrationOpeningDate(tournament);
    const deadline = getRegistrationDeadline(tournament);
    if (opening && careerDate < opening) reasons.push(`Inscrições abrem em ${opening}`);
    else if (deadline && careerDate > deadline) reasons.push('Inscrições encerradas');
  }

  // Registration deadline check
  if (tournament.registration_deadline) {
    if (careerDate > tournament.registration_deadline) {
      reasons.push('Inscrições encerradas');
    }
  }

  return {
    canRegister: reasons.length === 0,
    reasons,
  };
}

// ── Schedule conflict detection ───────────────────────────────────────────
export function hasScheduleConflict(events, startDate, endDate, excludeId = null) {
  return events.filter(e =>
    e.id !== excludeId &&
    e.status === 'scheduled' &&
    !(endDate < e.start_date || startDate > (e.end_date || e.start_date))
  );
}

// ── Tournament registration ───────────────────────────────────────────────
export async function registerForTournament(profile, tournament, teamRank = 0) {
  const validation = checkTournamentRequirements(profile, tournament, teamRank);
  if (!validation.canRegister) {
    return { success: false, reasons: validation.reasons };
  }

  // Check for existing registration
  const existing = await base44.entities.CalendarEvent.filter({
    profile_id: profile.id,
    related_id: tournament.id,
    status: 'scheduled',
  });
  if (existing && existing.length > 0) {
    return { success: false, reasons: ['Você já está inscrito neste torneio'] };
  }

  // Check schedule conflicts
  const allEvents = await base44.entities.CalendarEvent.filter({
    profile_id: profile.id,
    status: 'scheduled',
  });
  const startDate = tournament.start_date;
  const endDate = tournament.start_date; // Single-day for now
  const conflicts = hasScheduleConflict(allEvents, startDate, endDate);
  if (conflicts.length > 0) {
    return {
      success: false,
      reasons: [`Conflito de agenda: ${conflicts[0].title} em ${conflicts[0].start_date}`],
    };
  }

  // Deduct entry fee if applicable
  let updatedProfile = profile;
  if ((tournament.entry_fee || 0) > 0) {
    updatedProfile = await base44.entities.PlayerProfile.update(profile.id, {
      coins: (profile.coins || 0) - tournament.entry_fee,
    });
  }

  // Create calendar event
  await base44.entities.CalendarEvent.create({
    profile_id: profile.id,
    event_type: 'tournament',
    title: tournament.name,
    description: `${tournament.tier} · ${tournament.location || '—'} · ${tournament.surface || 'vidro'}`,
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
    },
  });

  // Add to tournament participants
  if (tournament.max_participants) {
    const participants = [...(tournament.participants || [])];
    if (!participants.includes(profile.id)) {
      participants.push(profile.id);
      await base44.entities.Tournament.update(tournament.id, { participants });
    }
  }

  await incrementMissionProgress(profile.id, 'join_tournament');

  return { success: true, profile: updatedProfile };
}

// ── Cancel registration ──────────────────────────────────────────────────
export async function cancelRegistration(profileId, eventId, tournamentId) {
  await base44.entities.CalendarEvent.update(eventId, { status: 'cancelled' });
  if (tournamentId) {
    const t = await base44.entities.Tournament.get(tournamentId);
    if (t) {
      const participants = (t.participants || []).filter(id => id !== profileId);
      await base44.entities.Tournament.update(tournamentId, { participants });
    }
  }
}

// ── Pending decisions (blocks day advance) ───────────────────────────────
export async function getPendingDecisions(profileId, careerDate) {
  const events = await base44.entities.CalendarEvent.filter({
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
  const events = await base44.entities.CalendarEvent.filter({
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
    if (event.end_date < newDate && event.requires_decision && event.decision_type === 'play_tournament') {
      await base44.entities.CalendarEvent.update(event.id, { status: 'missed' });
      // Penalty for missing a tournament
      coinChange -= 50;
      completed.push({ ...event, newStatus: 'missed' });
      continue;
    }

    // Complete non-tournament events that have ended
    if (event.end_date < newDate && !event.requires_decision) {
      await base44.entities.CalendarEvent.update(event.id, { status: 'completed' });
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
  const existing = await base44.entities.CalendarEvent.filter({
    profile_id: profile.id,
    event_type: 'travel',
    related_id: tournament.id,
  });
  if (existing && existing.length > 0) return;

  // Travel 1 day before the tournament
  const travelDate = addDays(tournamentDate, -1);
  if (travelDate < careerDate) return; // Can't travel to the past

  await base44.entities.CalendarEvent.create({
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
  const events = await base44.entities.CalendarEvent.filter({
    profile_id: profileId,
    status: 'scheduled',
  });
  return (events || []).filter(e => !(e.end_date < startDate || e.start_date > endDate));
}

// ── Resolve a pending decision ────────────────────────────────────────────
export async function resolveDecision(eventId, action) {
  // action: 'play' | 'skip' | 'confirm'
  if (action === 'skip') {
    await base44.entities.CalendarEvent.update(eventId, { status: 'cancelled', requires_decision: false });
  } else {
    await base44.entities.CalendarEvent.update(eventId, { requires_decision: false });
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
  return addDays(tournament.start_date, -45);
}

export function isRegistrationOpen(tournament, careerDate) {
  if (!careerDate || !tournament?.start_date) return false;
  const opening = getRegistrationOpeningDate(tournament);
  const deadline = getRegistrationDeadline(tournament);
  return careerDate >= opening && careerDate <= deadline;
}