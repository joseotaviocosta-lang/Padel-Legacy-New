import { localGame } from '@/api/localGameClient.js';
import { BOT_DIFFICULTIES, BOTS_BY_DIFFICULTY, getRandomBots, getDifficultyForPlayer } from '@/lib/bots';
import { overallRating, levelForXp, LEVELS, MAX_ENERGY, ENERGY_RECOVERY_PER_DAY, ENERGY_RECOVERY_FATIGUED, ATTRIBUTE_KEYS, ageAtDate, RETIREMENT_AGE, incrementMissionProgress } from '@/lib/padel';
import { processMonthlyFinances } from '@/lib/economy';
import { processAllClubsMonthly } from '@/lib/clubs';
import { generateWorldEvents } from '@/lib/world';
import { maybeGenerateMacroEvent, expireMacroEvents } from '@/lib/worldEvents';
import { evolveAthletesMonthly } from '@/lib/athleteBehavior';
import { simulateProRankingWeek, simulatePastTournaments } from '@/lib/teamRanking';
import { canAdvanceDay, processCalendarEvents, executePlannedActivities } from '@/lib/calendarSystem';
import { buildSeasonTournaments, getTournamentTierConfig } from '@/lib/circuitCatalog.js';
import { processWorldTourDay } from '@/gameplay/worldTour/WorldTourLifecycle.js';

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

  // O tempo sozinho não cria entrosamento. A química cresce lentamente por
  // convivência semanal; ganhos relevantes continuam vindo de partidas e treinos.
  if (profile.partner_id) {
    const elapsedDays = daysBetween(CAREER_START_DATE, newCareerDate);
    if (elapsedDays > 0 && elapsedDays % 7 === 0) {
      updates.partner_chemistry = Math.min(100, (profile.partner_chemistry || 50) + 1);
    }
  }

  // Uma parceria não termina por uma rolagem diária isolada. É necessário um
  // período prolongado de baixa química e histórico mínimo em conjunto.
  if (profile.partner_id && (profile.partner_chemistry || 50) < 20) {
    const lowDays = Number(profile.low_chemistry_days || 0) + 1;
    updates.low_chemistry_days = lowDays;
    const sharedMatches = Number(profile.partnership_matches || profile.matches_with_partner || 0);
    if (lowDays >= 14 && sharedMatches >= 5 && Math.random() < 0.10) {
      updates.partner_id = null;
      updates.partner_name = null;
      updates.partner_locked_until = null;
      updates.partner_chemistry = 50;
      updates.low_chemistry_days = 0;
      updates.last_partnership_end_reason = 'Baixa química prolongada';
    }
  } else if (profile.low_chemistry_days) {
    updates.low_chemistry_days = 0;
  }

  let updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  const plannedResult = await executePlannedActivities(updated, newCareerDate);
  updated = plannedResult.profile || updated;
  // Aguarde efeitos globais antes de concluir o dia. Isso garante que avanço
  // manual e avanço em lote tenham exatamente a mesma ordem e persistência.
  if (oldMonth !== newMonth) {
    await simulatePastTournaments(newCareerDate).catch(e => console.error('simulatePastTournaments', e));
    await ensureFutureTournaments(newCareerDate).catch(e => console.error('ensureFutureTournaments', e));
    try {
      const result = await processMonthlyFinances(updated);
      if (result) updated.coins = result.newBalance;
    } catch (e) { console.error('processMonthlyFinances', e); }
    await processAllClubsMonthly().catch(e => console.error('processAllClubsMonthly', e));
    await evolveAthletesMonthly(newCareerDate).catch(e => console.error('evolveAthletesMonthly', e));
  }
  const totalDays = daysBetween(CAREER_START_DATE, newCareerDate);
  if (totalDays > 0 && totalDays % 7 === 0) {
    await simulateProRankingWeek().catch(e => console.error('simulateProRankingWeek', e));
  }
  await processWorldTourDay(newCareerDate).catch(e => console.error('world tour day', e));
  await generateWorldEvents(newCareerDate, 1 + Math.floor(Math.random() * 2)).catch(e => console.error('world events', e));
  await expireMacroEvents(newCareerDate).catch(e => console.error('expire macro events', e));
  await maybeGenerateMacroEvent(newCareerDate).catch(e => console.error('macro event', e));
  await incrementMissionProgress(updated.id, 'advance_days').catch(() => {});
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
  if (!profile?.court_side) return [];
  const oppositePosition = profile.court_side === 'direita' ? 'esquerda' : 'direita';
  return pool.filter(b => b.position === oppositePosition);
}

export function getLockedPartners(profile) {
  const playerLevelIdx = LEVELS.indexOf(levelForXp(profile?.xp || 0));
  const lockedDiffs = BOT_DIFFICULTIES.slice(playerLevelIdx + 1);
  let pool = [];
  lockedDiffs.forEach(diff => {
    pool = pool.concat(BOTS_BY_DIFFICULTY[diff.id] || []);
  });
  if (!profile?.court_side) return [];
  const oppositePosition = profile.court_side === 'direita' ? 'esquerda' : 'direita';
  return pool.filter(b => b.position === oppositePosition);
}

// Tournament helpers
const TOURNAMENT_ROUNDS = {
  Silver: [
    { label: 'Oitavas de Final', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ],
  Gold: [
    { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ],
  Platinum: [
    { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ],
  Masters: [
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ],
  Elite: [
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ],
  Crown: [
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ],
};

const TIER_DIFFICULTY_PATHS = {
  Silver: ['iniciante','iniciante','amador','competitivo'],
  Gold: ['iniciante','amador','competitivo','competitivo','avancado'],
  Platinum: ['amador','competitivo','competitivo','avancado','elite'],
  Masters: ['competitivo','competitivo','avancado','avancado','elite','elite'],
  Elite: ['avancado','avancado','elite','elite','lenda','lenda'],
  Crown: ['avancado','elite','elite','lenda','lenda','lenda'],
};

const TIER_REWARD_TABLES = {
  Silver: { coins:[15,45,110,260,650], xp:[12,30,70,130,220], rankPoints:[2,6,15,30,55] },
  Gold: { coins:[30,80,180,380,760,1300], xp:[20,50,110,220,340,420], rankPoints:[5,15,35,70,120,180] },
  Platinum: { coins:[55,140,320,700,1450,2800], xp:[35,90,190,360,560,760], rankPoints:[10,30,70,140,240,350] },
  Masters: { coins:[90,220,500,1050,2200,3900,6200], xp:[60,140,290,520,780,1020,1250], rankPoints:[20,50,110,220,380,600,900] },
  Elite: { coins:[140,350,800,1650,3400,7000,12500], xp:[90,220,430,760,1200,1700,2200], rankPoints:[35,85,180,350,600,950,1400] },
  Crown: { coins:[220,550,1250,2600,5400,11000,24000], xp:[140,340,650,1100,1800,2700,3600], rankPoints:[50,120,250,500,900,1500,2200] },
};

export function getTournamentRounds(tournament) {
  return TOURNAMENT_ROUNDS[tournament?.tier] || TOURNAMENT_ROUNDS.Silver;
}

export function getTournamentDifficulty(tournament, profile, roundIdx = 0, teamRank = 0) {
  const path = TIER_DIFFICULTY_PATHS[tournament?.tier] || TIER_DIFFICULTY_PATHS.Silver;
  const baseDifficulty = path[Math.min(roundIdx, path.length - 1)] || 'competitivo';
  let idx = BOT_DIFFICULTIES.findIndex((difficulty) => difficulty.id === baseDifficulty);
  if (idx < 0) idx = 0;
  if (roundIdx === 0 && teamRank > 0) {
    if (teamRank <= 8) idx -= 2;
    else if (teamRank <= 24) idx -= 1;
  }
  const tierConfig = getTournamentTierConfig(tournament?.tier);
  const explicitModifier = Number(tournament?.bot_difficulty_modifier);
  const modifier = Number.isFinite(explicitModifier) ? explicitModifier - tierConfig.difficultyModifier : 0;
  idx += modifier;
  return BOT_DIFFICULTIES[Math.max(0, Math.min(BOT_DIFFICULTIES.length - 1, idx))].id;
}

export function generateTournamentOpponent(tournament, profile, roundIdx, excludeIds = [], teamRank = 0) {
  const diffId = getTournamentDifficulty(tournament, profile, roundIdx, teamRank);
  return getRandomBots(diffId, 2, excludeIds);
}

export function getTournamentRewards(tier, roundsWon) {
  const table = TIER_REWARD_TABLES[tier] || TIER_REWARD_TABLES.Silver;
  const idx = Math.max(0, Math.min(table.coins.length - 1, roundsWon));
  return { coins:table.coins[idx], xp:table.xp[idx], rankPoints:table.rankPoints[idx] };
}

// ── Future tournament generation ──────────────────────────────────────────
// Mantém ao menos 15 meses de calendário, usando o Padel Legacy World Tour global, com eventos simultâneos e seis níveis.
export async function ensureFutureTournaments(careerDate) {
  if (!careerDate) return { created: 0, repaired: 0 };
  try {
    const careerD = new Date(`${careerDate}T00:00:00`);
    const horizon = new Date(careerD);
    horizon.setMonth(horizon.getMonth() + 15);

    const tournaments = (await localGame.entities.Tournament.list('-start_date', 5000)) || [];
    const legacyTiers = new Set(['Regional', 'Challenger', 'P2', 'P1', 'Major']);
    for (const legacy of tournaments.filter((item) => legacyTiers.has(item?.tier) && item?.start_date >= careerDate && !item?.champion && !(item?.participants || []).length)) {
      try { await localGame.entities.Tournament.delete(legacy.id); } catch (error) { console.warn('Torneio legado não removido', legacy.id, error); }
    }
    const activeTournaments = tournaments.filter((item) => !(legacyTiers.has(item?.tier) && item?.start_date >= careerDate && !item?.champion && !(item?.participants || []).length));
    const seasons = (await localGame.entities.Season.list('-start_date', 100)) || [];
    const seasonByYear = new Map();
    for (const season of seasons) {
      const year = Number(season?.season_number || String(season?.start_date || '').slice(0, 4));
      if (year) seasonByYear.set(year, season);
    }

    const existingByCodeAndYear = new Map();
    for (const tournament of activeTournaments) {
      const year = Number(tournament?.year || String(tournament?.start_date || '').slice(0, 4));
      if (tournament?.circuit_code && year) {
        existingByCodeAndYear.set(`${year}:${tournament.circuit_code}`, tournament);
      }
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
        const existing = existingByCodeAndYear.get(key);
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
