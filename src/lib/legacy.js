import { base44 } from '@/api/base44Client';
import { RETIREMENT_AGE, overallRating, levelForXp } from '@/lib/padel';

export function computeLegacyScore(profile) {
  if (!profile) return 0;
  return Math.round(
    (profile.tournaments_won || 0) * 100 +
    (profile.wins || 0) * 10 +
    (profile.xp || 0) / 10 +
    (profile.titles?.length || 0) * 50
  );
}

export function computeLegacyBonuses(legacyRecord) {
  if (!legacyRecord) return { extraAttributePoints: 0, startingCoins: 100, startingXp: 0, description: '' };
  const gen = legacyRecord.generation || 1;
  const score = legacyRecord.legacy_score || 0;
  const titles = legacyRecord.tournaments_won || 0;
  return {
    extraAttributePoints: Math.min(25, 5 + Math.floor(score / 1000)),
    startingCoins: 100 + titles * 50 + Math.floor(score / 100),
    startingXp: Math.min(5000, Math.floor(score / 10)),
    description: `Geração ${gen + 1} — herança de ${legacyRecord.sport_name || 'seu treinador'}`,
  };
}

export async function retireProfile(profile) {
  const gen = profile.legacy_generation || 1;
  const existing = await base44.entities.CareerLegacy.filter({ user_id: profile.created_by_id, generation: gen });
  if (existing && existing.length > 0) return existing[0];

  const legacy = await base44.entities.CareerLegacy.create({
    profile_id: profile.id,
    user_id: profile.created_by_id,
    sport_name: profile.sport_name,
    avatar_url: profile.avatar_url || '',
    country: profile.country || '',
    city: profile.city || '',
    birth_date: profile.birth_date || '',
    career_start_date: '2026-01-01',
    career_end_date: profile.career_date || '',
    retirement_age: RETIREMENT_AGE,
    final_xp: profile.xp || 0,
    final_level: levelForXp(profile.xp || 0),
    final_overall: overallRating(profile),
    tournaments_won: profile.tournaments_won || 0,
    matches_played: profile.matches_played || 0,
    wins: profile.wins || 0,
    losses: profile.losses || 0,
    titles: profile.titles || [],
    medals: profile.medals || [],
    legacy_score: computeLegacyScore(profile),
    generation: gen,
    coach_legacy_id: profile.coach_legacy_id || null,
    inherited_bonuses: profile.legacy_bonuses || null,
    is_coach: false,
  });

  await base44.entities.PlayerProfile.update(profile.id, { retired: true });
  return legacy;
}

export async function startNewCareer(profile, legacyRecord, newAthleteName) {
  const bonuses = computeLegacyBonuses(legacyRecord);

  if (legacyRecord) {
    await base44.entities.CareerLegacy.update(legacyRecord.id, {
      is_coach: true,
      coached_athlete_name: newAthleteName,
    });
  }

  const careerDate = profile.career_date || '2026-01-01';
  const d = new Date(careerDate + 'T00:00:00');
  d.setFullYear(d.getFullYear() - 16);
  const newBirthDate = d.toISOString().slice(0, 10);

  return await base44.entities.PlayerProfile.update(profile.id, {
    sport_name: newAthleteName,
    avatar_url: '',
    level: 'Iniciante',
    play_style: 'Equilibrado',
    xp: Math.floor(bonuses.startingXp),
    coins: bonuses.startingCoins,
    unspent_attribute_points: 25 + bonuses.extraAttributePoints,
    matches_played: 0, wins: 0, losses: 0, tournaments_won: 0,
    titles: [], medals: [],
    serve: 5, forehand: 5, backhand: 5, volley: 5, bandeja: 5, smash: 5,
    defense: 5, agility: 5, strategy: 5, emotional_control: 5,
    career_date: '2026-01-01',
    birth_date: newBirthDate,
    retired: false,
    energy: 100,
    partner_id: null, partner_name: null, partner_locked_until: null, partner_chemistry: 50,
    trainings_today: 0, practice_matches_today: 0,
    last_training_date: null, injured_until: null,
    did_physio_today: false, last_physio_date: null,
    legacy_generation: (profile.legacy_generation || 1) + 1,
    coach_legacy_id: legacyRecord?.id || null,
    legacy_bonuses: bonuses,
  });
}

export async function getUserLegacies(userId) {
  if (!userId) return [];
  try {
    return await base44.entities.CareerLegacy.filter({ user_id: userId });
  } catch { return []; }
}

export async function getHallOfFame(limit = 20) {
  try {
    return await base44.entities.CareerLegacy.list('-legacy_score', limit);
  } catch { return []; }
}

export async function getCoachLegacy(coachLegacyId) {
  if (!coachLegacyId) return null;
  try {
    return await base44.entities.CareerLegacy.get(coachLegacyId);
  } catch { return null; }
}