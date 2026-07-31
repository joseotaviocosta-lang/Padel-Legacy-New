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
import { buildSeasonTournaments, getTournamentTierConfig } from '@/lib/circuitCatalog.js';

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
  Regional: [
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
  Challenger: [
    { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
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

const TIER_DIFFICULTY_PATHS = {
  Regional: ['iniciante', 'iniciante', 'amador'],
  Challenger: ['iniciante', 'amador', 'amador', 'competitivo'],
  P2: ['amador', 'competitivo', 'competitivo', 'avancado', 'avancado'],
  P1: ['competitivo', 'avancado', 'avancado', 'elite', 'elite'],
  Major: ['avancado', 'elite', 'elite', 'lenda', 'lenda'],
};

const TIER_REWARD_TABLES = {
  Regional: {
    coins: [10, 30, 75, 180],
    xp: [10, 25, 55, 120],
    rankPoints: [2, 6, 15, 35],
  },
  Challenger: {
    coins: [20, 55, 120, 260, 500],
    xp: [15, 40, 90, 170, 300],
    rankPoints: [5, 12, 30, 60, 110],
  },
  P2: {
    coins: [40, 80, 160, 300, 550, 1000],
    xp: [25, 50, 100, 200, 400, 800],
    rankPoints: [10, 25, 50, 85, 130, 200],
  },
  P1: {
    coins: [80, 160, 320, 600, 1100, 2000],
    xp: [50, 100, 200, 400, 800, 1600],
    rankPoints: [20, 50, 100, 170, 260, 400],
  },
  Major: {
    coins: [140, 280, 560, 1050, 1925, 3500],
    xp: [88, 175, 350, 700, 1400, 2800],
    rankPoints: [35, 88, 175, 298, 455, 700],
  },
};

export function getTournamentRounds(tournament) {
  return TOURNAMENT_ROUNDS[tournament?.tier] || TOURNAMENT_ROUNDS.P2;
}

export function getTournamentDifficulty(tournament, profile, roundIdx = 0, teamRank = 0) {
  const path = TIER_DIFFICULTY_PATHS[tournament?.tier] || TIER_DIFFICULTY_PATHS.P2;
  const baseDifficulty = path[Math.min(roundIdx, path.length - 1)] || 'competitivo';
  let idx = BOT_DIFFICULTIES.findIndex((difficulty) => difficulty.id === baseDifficulty);
  if (idx < 0) idx = 0;

  // Cabeças de chave ganham uma estreia mais favorável nos eventos grandes.
  if (roundIdx === 0 && teamRank > 0) {
    if (teamRank <= 4) idx -= 2;
    else if (teamRank <= 8) idx -= 1;
  }

  // O modificador do torneio continua disponível para eventos especiais.
  const tierConfig = getTournamentTierConfig(tournament?.tier);
  const explicitModifier = Number(tournament?.bot_difficulty_modifier);
  const modifier = Number.isFinite(explicitModifier)
    ? explicitModifier - tierConfig.difficultyModifier
    : 0;
  idx += modifier;

  return BOT_DIFFICULTIES[Math.max(0, Math.min(BOT_DIFFICULTIES.length - 1, idx))].id;
}

export function generateTournamentOpponent(tournament, profile, roundIdx, excludeIds = [], teamRank = 0) {
  const diffId = getTournamentDifficulty(tournament, profile, roundIdx, teamRank);
  return getRandomBots(diffId, 2, excludeIds);
}

export function getTournamentRewards(tier, roundsWon) {
  const table = TIER_REWARD_TABLES[tier] || TIER_REWARD_TABLES.P2;
  const idx = Math.max(0, Math.min(table.coins.length - 1, roundsWon));
  return {
    coins: table.coins[idx],
    xp: table.xp[idx],
    rankPoints: table.rankPoints[idx],
  };
}

// ── Future tournament generation ──────────────────────────────────────────
// Mantém ao menos 15 meses de calendário, usando um circuito anual com etapas
// de desenvolvimento (Regional e Challenger) e eventos profissionais.
export async function ensureFutureTournaments(careerDate) {
  if (!careerDate) return { created: 0, repaired: 0 };
  try {
    const careerD = new Date(`${careerDate}T00:00:00`);
    const horizon = new Date(careerD);
    horizon.setMonth(horizon.getMonth() + 15);

    const tournaments = (await localGame.entities.Tournament.list('-start_date', 2000)) || [];
    const seasons = (await localGame.entities.Season.list('-start_date', 100)) || [];
    const seasonByYear = new Map();
    for (const season of seasons) {
      const year = Number(season?.season_number || String(season?.start_date || '').slice(0, 4));
      if (year) seasonByYear.set(year, season);
    }

    const existingByCodeAndYear = new Map();
    const existingByDate = new Map();
    for (const tournament of tournaments) {
      const year = Number(tournament?.year || String(tournament?.start_date || '').slice(0, 4));
      if (tournament?.circuit_code && year) {
        existingByCodeAndYear.set(`${year}:${tournament.circuit_code}`, tournament);
      }
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
            description: `Circuito Mundial de Padel ${year}`,
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

      const annualSchedule = buildSeasonTournaments(year, season?.id);
      for (const payload of annualSchedule) {
        const dateObj = new Date(`${payload.start_date}T00:00:00`);
        if (dateObj < careerD || dateObj > horizon) continue;

        const key = `${year}:${payload.circuit_code}`;
        const existing = existingByCodeAndYear.get(key) || existingByDate.get(payload.start_date);
        try {
          if (existing?.id) {
            const { id: _generatedId, ...updatePayload } = payload;
            await localGame.entities.Tournament.update(existing.id, {
              ...updatePayload,
              champion: existing.status === 'finalizado' ? existing.champion : null,
              runner_up: existing.status === 'finalizado' ? existing.runner_up : null,
              completed_date: existing.status === 'finalizado' ? existing.completed_date : null,
              participants: existing.participants || [],
            });
            repaired += 1;
          } else {
            const createdTournament = await localGame.entities.Tournament.create(payload);
            existingByCodeAndYear.set(key, createdTournament || payload);
            existingByDate.set(payload.start_date, createdTournament || payload);
            created += 1;
          }
        } catch (error) {
          console.warn('Não foi possível criar/corrigir torneio', payload.start_date, error);
        }
      }
    }
    return { created, repaired };
  } catch (error) {
    console.error('ensureFutureTournaments', error);
    return { created: 0, repaired: 0, error };
  }
}

function cleanTournamentName(name) {
  return String(name || '').trim().toLowerCase();
}
