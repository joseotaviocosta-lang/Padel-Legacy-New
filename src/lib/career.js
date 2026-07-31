import { localGame } from '@/api/localGameClient.js';
import { BOT_DIFFICULTIES, BOTS_BY_DIFFICULTY, getRandomBots, getDifficultyForPlayer } from '@/lib/bots';
import { overallRating, levelForXp, LEVELS, MAX_ENERGY, ENERGY_RECOVERY_PER_DAY, ENERGY_RECOVERY_FATIGUED, ATTRIBUTE_KEYS, ageAtDate, RETIREMENT_AGE, incrementMissionProgress } from '@/lib/padel';
import { processMonthlyFinances } from '@/lib/economy';
import { processAllClubsMonthly } from '@/lib/clubs';
import { generateWorldEvents } from '@/lib/world';
import { maybeGenerateMacroEvent, expireMacroEvents } from '@/lib/worldEvents';
import { evolveAthletesMonthly } from '@/lib/athleteBehavior';
import { simulateProRankingWeek, simulatePastTournaments } from '@/lib/teamRanking';
import { canAdvanceDay, processCalendarEvents } from '@/lib/calendarSystem';

import { emitDayAdvanced } from '@/lib/matchDay';
export const CAREER_START_DATE = '2026-01-01';
export const PARTNER_LOCK_DAYS = 60;
export const MATCH_ADVANCE_DAYS = 7;

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function canChangePartner(profile) {
  if (!profile?.partner_id) return true;
  // If partner bot no longer exists (stale data from old bot pool), allow change
  if (!getPartnerBot(profile)) return true;
  const lockedUntil = profile?.partner_locked_until;
  if (!lockedUntil) return true;
  const careerDate = profile?.career_date || CAREER_START_DATE;
  return new Date(careerDate + 'T00:00:00') >= new Date(lockedUntil + 'T00:00:00');
}

export function daysUntilPartnerUnlock(profile) {
  if (canChangePartner(profile)) return 0;
  const careerDate = profile?.career_date || CAREER_START_DATE;
  const lockedUntil = profile?.partner_locked_until;
  return Math.max(0, daysBetween(careerDate, lockedUntil));
}

export function careerMonth(profile) {
  const date = profile?.career_date || CAREER_START_DATE;
  return new Date(date + 'T00:00:00').getMonth() + 1;
}

export function careerMonthLabel(profile) {
  return MONTHS[careerMonth(profile) - 1] || '—';
}

export function careerDateLabel(profile) {
  const date = profile?.career_date || CAREER_START_DATE;
  try {
    return new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
}

export async function selectPartner(profile, bot) {
  const careerDate = profile?.career_date || CAREER_START_DATE;
  const lockedUntil = addDays(careerDate, PARTNER_LOCK_DAYS);
  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
    partner_id: bot.id,
    partner_name: bot.name,
    partner_locked_until: lockedUntil,
    partner_chemistry: 50,
  });
  return updated;
}

export async function advanceDay(profile) {
  // Libera espaço antes de qualquer evento do novo dia tentar gravar no banco.
  // ── Block advance if there's a pending mandatory decision ──
  const careerDateNow = profile.career_date || CAREER_START_DATE;
  const advanceCheck = await canAdvanceDay(profile.id, careerDateNow);
  if (!advanceCheck.canAdvance) {
    throw new Error(advanceCheck.reason);
  }

  const careerD = new Date((profile.career_date || CAREER_START_DATE) + 'T00:00:00');
  careerD.setDate(careerD.getDate() + 1);

  const newCareerDate = careerD.toISOString().slice(0, 10);
  const oldMonth = (profile.career_date || CAREER_START_DATE).slice(0, 7);
  const newMonth = newCareerDate.slice(0, 7);

  // Fatigued if played a practice match today — recovers less
  const fatigued = (profile.practice_matches_today || 0) > 0;
  const recovery = fatigued ? ENERGY_RECOVERY_FATIGUED : ENERGY_RECOVERY_PER_DAY;

  // ── Process calendar events for the new day ──
  const calendarResult = await processCalendarEvents(profile, newCareerDate);

  // ── Condition recovery on day advance ──
  // Fatigue decreases, morale and form recover slightly. If the player
  // didn't train at all yesterday (no trainings_today), they get bonus recovery.
  const restedFully = (profile.trainings_today || 0) === 0 && (profile.practice_matches_today || 0) === 0;
  const fatigueRecovery = restedFully ? 20 : (fatigued ? 8 : 14);
  const moraleRecovery = restedFully ? 4 : 2;
  const formRecovery = restedFully ? 3 : 1;

  const updates = {
    career_date: newCareerDate,
    trainings_today: 0,
    practice_matches_today: 0,
    did_physio_today: false,
    energy: Math.min(MAX_ENERGY, (profile.energy || 0) + recovery),
    fatigue: Math.max(0, (profile.fatigue || 0) - fatigueRecovery),
    morale: Math.max(0, Math.min(100, (profile.morale || 70) + moraleRecovery)),
    form: Math.max(0, Math.min(100, (profile.form || 50) + formRecovery)),
    ...calendarResult.updates,
  };

  // Clear injury if recovery period passed
  if (profile.injured_until && profile.injured_until <= newCareerDate) {
    updates.injured_until = null;
  }

  // Aging: check if birthday passed when advancing to the new date
  if (profile.birth_date) {
    const oldAge = ageAtDate(profile.birth_date, profile.career_date || CAREER_START_DATE);
    const newAge = ageAtDate(profile.birth_date, newCareerDate);
    if (newAge > oldAge) {
      if (newAge >= RETIREMENT_AGE) {
        updates.retired = true;
      } else if (newAge > 30) {
        const decay = newAge >= 35 ? 2 : 1;
        ATTRIBUTE_KEYS.forEach(key => {
          const current = Number(profile[key]) || 0;
          if (current > 5) {
            updates[key] = Math.max(5, current - decay);
          }
        });
      }
    }
  }

  // Chemistry: +1 per day together (familiarity)
  if (profile.partner_id) {
    updates.partner_chemistry = Math.min(100, (profile.partner_chemistry || 50) + 1);
  }

  // Partner may leave if chemistry too low (lower daily chance)
  if (profile.partner_id && (profile.partner_chemistry || 50) < 20) {
    if (Math.random() < 0.15) {
      updates.partner_id = null;
      updates.partner_name = null;
      updates.partner_locked_until = null;
      updates.partner_chemistry = 50;
    }
  }

  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  // Simulations are non-blocking — they don't affect the player's profile,
  // so we fire-and-forget to keep day advancement fast and responsive.
  if (oldMonth !== newMonth) {
    simulatePastTournaments(newCareerDate).catch(e => console.error('simulatePastTournaments', e));
    ensureFutureTournaments(newCareerDate).catch(e => console.error('ensureFutureTournaments', e));
    try {
      const result = await processMonthlyFinances(updated);
      if (result) updated.coins = result.newBalance;
    } catch (e) { console.error('processMonthlyFinances', e); }
    processAllClubsMonthly().catch(e => console.error('processAllClubsMonthly', e));
    evolveAthletesMonthly(newCareerDate).catch(e => console.error('evolveAthletesMonthly', e));
  }
  const totalDays = daysBetween(CAREER_START_DATE, newCareerDate);
  if (totalDays > 0 && totalDays % 7 === 0) {
    simulateProRankingWeek().catch(e => console.error('simulateProRankingWeek', e));
  }
  generateWorldEvents(newCareerDate, 1 + Math.floor(Math.random() * 2)).catch(e => console.error('world events', e));
  expireMacroEvents(newCareerDate).catch(e => console.error('expire macro events', e));
  maybeGenerateMacroEvent(newCareerDate).catch(e => console.error('macro event', e));
  incrementMissionProgress(updated.id, 'advance_days').catch(() => {});
  emitDayAdvanced(profile, updated);
  return updated;
}

export function getPartnerBot(profile) {
  if (!profile?.partner_id) return null;
  for (const diff of BOT_DIFFICULTIES) {
    const bot = BOTS_BY_DIFFICULTY[diff.id]?.find(b => b.id === profile.partner_id);
    if (bot) return bot;
  }
  return null;
}

export function getAvailablePartners(profile) {
  const playerLevelIdx = LEVELS.indexOf(levelForXp(profile?.xp || 0));
  const availableDiffs = BOT_DIFFICULTIES.slice(0, playerLevelIdx + 1);
  let pool = [];
  availableDiffs.forEach(diff => {
    pool = pool.concat(BOTS_BY_DIFFICULTY[diff.id] || []);
  });
  if (!profile?.position) return pool;
  const oppositePosition = profile.position === 'direita' ? 'esquerda' : 'direita';
  return pool.filter(b => b.position === oppositePosition);
}

export function getLockedPartners(profile) {
  const playerLevelIdx = LEVELS.indexOf(levelForXp(profile?.xp || 0));
  const lockedDiffs = BOT_DIFFICULTIES.slice(playerLevelIdx + 1);
  let pool = [];
  lockedDiffs.forEach(diff => {
    pool = pool.concat(BOTS_BY_DIFFICULTY[diff.id] || []);
  });
  if (!profile?.position) return pool;
  const oppositePosition = profile.position === 'direita' ? 'esquerda' : 'direita';
  return pool.filter(b => b.position === oppositePosition);
}

export async function selectPosition(profile, position) {
  const updated = await localGame.entities.PlayerProfile.update(profile.id, { position });
  return updated;
}

// Tournament helpers
const TOURNAMENT_ROUNDS = {
  P2: [
    { label: 'R32', short: 'R32' },
    { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
  P1: [
    { label: 'R32', short: 'R32' },
    { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
  Major: [
    { label: 'R32', short: 'R32' },
    { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
};

const TOURNAMENT_ROUND_DIFFS = ['avancado', 'avancado', 'elite', 'elite', 'lenda'];

export function getTournamentRounds(tournament) {
  return TOURNAMENT_ROUNDS[tournament?.tier] || TOURNAMENT_ROUNDS.P2;
}

export function getTournamentDifficulty(tournament, profile) {
  const baseDiffId = getDifficultyForPlayer(profile);
  const baseIdx = BOT_DIFFICULTIES.findIndex(d => d.id === baseDiffId);
  const modifier = tournament?.bot_difficulty_modifier ?? -1;
  const newIdx = Math.max(0, Math.min(BOT_DIFFICULTIES.length - 1, baseIdx + modifier));
  return BOT_DIFFICULTIES[newIdx].id;
}

export function generateTournamentOpponent(tournament, profile, roundIdx, excludeIds = []) {
  const diffId = TOURNAMENT_ROUND_DIFFS[roundIdx] || 'lenda';
  return getRandomBots(diffId, 2, excludeIds);
}

// ── Tournament reward system ──────────────────────────────────────────────
// Tier multipliers: P2 is baseline, P1 is 2x, Major is 3.5x — maintaining
// proportional prestige between tournament categories.
const TIER_MULTIPLIERS = { P2: 1, P1: 2, Major: 3.5 };

// Base rewards indexed by roundsWon (0 = eliminated in first round, 5 = champion).
// Each round advanced increases the reward; the title is worth the most.
const ROUND_REWARDS = {
  coins:      [40, 80, 160, 300, 550, 1000],
  xp:         [25, 50, 100, 200, 400, 800],
  rankPoints: [10, 25, 50, 85, 130, 200],
};

export function getTournamentRewards(tier, roundsWon) {
  const mult = TIER_MULTIPLIERS[tier] || 1;
  const idx = Math.max(0, Math.min(ROUND_REWARDS.coins.length - 1, roundsWon));
  return {
    coins: Math.round(ROUND_REWARDS.coins[idx] * mult),
    xp: Math.round(ROUND_REWARDS.xp[idx] * mult),
    rankPoints: Math.round(ROUND_REWARDS.rankPoints[idx] * mult),
  };
}

// ── Future tournament generation ──────────────────────────────────────────
// Ensures the calendar extends at least 6 months ahead of the current career
// date. When it doesn't, replicates the latest year's tournament template
// into the next year (new season + cloned tournaments with shifted dates).
export async function ensureFutureTournaments(careerDate) {
  if (!careerDate) return { created: 0, repaired: 0 };
  try {
    const careerD = new Date(`${careerDate}T00:00:00`);
    const horizon = new Date(careerD);
    horizon.setMonth(horizon.getMonth() + 15);

    const schedule = [
      { name: 'Aberto de São Paulo', tier: 'P2', month: 1, day: 15, location: 'São Paulo', surface: 'vidro' },
      { name: 'Madrid Open', tier: 'P1', month: 2, day: 15, location: 'Madrid', surface: 'vidro' },
      { name: 'Buenos Aires Masters', tier: 'Major', month: 3, day: 15, location: 'Buenos Aires', surface: 'vidro' },
      { name: 'Barcelona Padel Cup', tier: 'P1', month: 4, day: 15, location: 'Barcelona', surface: 'cimento' },
      { name: 'Lisbon Challenger', tier: 'P2', month: 5, day: 15, location: 'Lisboa', surface: 'vidro' },
      { name: 'Stockholm Open', tier: 'P2', month: 6, day: 15, location: 'Estocolmo', surface: 'indoor' },
      { name: 'Paris Padel Major', tier: 'Major', month: 7, day: 15, location: 'Paris', surface: 'vidro' },
      { name: 'Rome Classic', tier: 'P1', month: 8, day: 15, location: 'Roma', surface: 'cimento' },
      { name: 'Rio Padel Open', tier: 'P2', month: 9, day: 15, location: 'Rio de Janeiro', surface: 'outdoor' },
      { name: 'Dubai World Padel', tier: 'Major', month: 10, day: 15, location: 'Dubai', surface: 'vidro' },
      { name: 'Amsterdam Challenger', tier: 'P2', month: 11, day: 15, location: 'Amsterdã', surface: 'indoor' },
      { name: 'Copenhagen Open', tier: 'P1', month: 12, day: 15, location: 'Copenhague', surface: 'indoor' },
    ];
    const rewards = {
      P2: { prize: 1000, xp: 500, rank: 200, fee: 100, diff: -1 },
      P1: { prize: 2000, xp: 1000, rank: 400, fee: 250, diff: 0 },
      Major: { prize: 3500, xp: 1750, rank: 700, fee: 500, diff: 1 },
    };

    const tournaments = (await localGame.entities.Tournament.list('-start_date', 1000)) || [];
    const seasons = (await localGame.entities.Season.list('-start_date', 100)) || [];
    const seasonByYear = new Map();
    for (const season of seasons) {
      const year = Number(season?.season_number || String(season?.start_date || '').slice(0, 4));
      if (year) seasonByYear.set(year, season);
    }

    const existingByDate = new Map();
    for (const tournament of tournaments) {
      if (tournament?.start_date) existingByDate.set(tournament.start_date, tournament);
    }

    let created = 0;
    let repaired = 0;
    for (let year = careerD.getFullYear(); year <= horizon.getFullYear(); year += 1) {
      let season = seasonByYear.get(year);
      if (!season) {
        try {
          season = await localGame.entities.Season.create({
            name: `Temporada ${year}`,
            description: `Circuito profissional de padel ${year}`,
            start_date: `${year}-01-01`,
            end_date: `${year}-12-31`,
            is_active: year === careerD.getFullYear(),
            season_number: year,
          });
          seasonByYear.set(year, season);
        } catch (error) {
          console.warn('Não foi possível criar temporada', year, error);
        }
      }

      for (const stage of schedule) {
        const date = `${year}-${String(stage.month).padStart(2, '0')}-${String(stage.day).padStart(2, '0')}`;
        const dateObj = new Date(`${date}T00:00:00`);
        if (dateObj < careerD || dateObj > horizon) continue;
        const r = rewards[stage.tier];
        const existing = existingByDate.get(date);
        const payload = {
          name: stage.name,
          description: `${stage.tier === 'Major' ? 'Torneio Major' : stage.tier} em ${stage.location}`,
          tier: stage.tier,
          format: 'eliminacao_simples',
          status: 'inscricoes',
          start_date: date,
          month: stage.month,
          year,
          bot_difficulty_modifier: r.diff,
          max_participants: 32,
          prize_coins: r.prize,
          xp_reward: r.xp,
          rank_points: r.rank,
          season_id: season?.id,
          surface: stage.surface,
          entry_fee: r.fee,
          min_ranking: 0,
          min_level: 'Iniciante',
          current_phase: 'inscricoes',
          location: stage.location,
        };
        try {
          if (existing?.id) {
            // Registros futuros herdavam "concluído" e campeão de anos anteriores.
            await localGame.entities.Tournament.update(existing.id, {
              ...payload,
              champion: null,
              runner_up: null,
              completed_date: null,
            });
            repaired += 1;
          } else {
            const createdTournament = await localGame.entities.Tournament.create(payload);
            existingByDate.set(date, createdTournament || payload);
            created += 1;
          }
        } catch (error) {
          console.warn('Não foi possível criar/corrigir torneio', date, error);
        }
      }
    }
    return { created, repaired };
  } catch (e) {
    console.error('ensureFutureTournaments', e);
    return { created: 0, repaired: 0, error: e };
  }
}

function cleanTournamentName(name) {
  return String(name || '').trim().toLowerCase();
}
