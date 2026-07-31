import { base44 } from '@/api/base44Client';
import { localDatabase } from '@/local/localDatabase';
import worldSeed from '@/data/worldSeed2025.json';

export const SAVE_FOUNDATION_VERSION = '3.4.4';

const safeList = async (entity, order='-created_date', limit=1000) => {
  try { return await base44.entities[entity].list(order, limit) || []; }
  catch (error) { console.warn(`[Save Foundation] list ${entity}`, error); return []; }
};

async function upsertBy(entity, existing, key, value, payload) {
  const found = existing.find(item => String(item?.[key] || '') === String(value));
  if (found?.id) {
    const patch = {};
    for (const [field, fieldValue] of Object.entries(payload)) {
      if (found[field] === undefined || found[field] === null || found[field] === '' ||
          (typeof found[field] === 'number' && !Number.isFinite(found[field]))) {
        patch[field] = fieldValue;
      }
    }
    if (Object.keys(patch).length) {
      try { await base44.entities[entity].update(found.id, patch); } catch (error) {
        console.warn(`[Save Foundation] update ${entity}`, error);
      }
    }
    return found;
  }
  try {
    const created = await base44.entities[entity].create(payload);
    existing.push(created || payload);
    return created;
  } catch (error) {
    console.warn(`[Save Foundation] create ${entity}`, error);
    return null;
  }
}

export async function createCriticalBackup() {
  try {
    await localDatabase.checkpoint('save-foundation-backup');
    return await localDatabase.exportPersistent();
  } catch (error) {
    console.warn('[Save Foundation] backup nativo não criado', error);
    return null;
  }
}

export async function ensureWorldSeed2025({ force = false } = {}) {
  const [athletes, teams, profiles] = await Promise.all([
    safeList('AthleteProfile', '-world_ranking_points', 500),
    safeList('TeamRanking', '-ranking_points', 500),
    safeList('PlayerProfile', '-created_date', 20),
  ]);

  await createCriticalBackup();

  for (const athlete of worldSeed.athletes) {
    await upsertBy('AthleteProfile', athletes, 'bot_id', athlete.bot_id, athlete);
  }
  for (const team of worldSeed.teams) {
    await upsertBy('TeamRanking', teams, 'team_key', team.team_key, team);
  }

  // Corrige somente campos estruturais ausentes. Nunca reinicia XP, moedas, data ou atributos.
  for (const profile of profiles) {
    if (!profile?.id) continue;
    const patch = {};
    if (!profile.career_date) patch.career_date = worldSeed.career_start_date;
    if (!profile.save_schema_version) patch.save_schema_version = SAVE_FOUNDATION_VERSION;
    if (profile.partner_id && !profile.partner_name) {
      const partner = worldSeed.athletes.find(a => a.bot_id === profile.partner_id);
      if (partner) patch.partner_name = partner.name;
    }
    if (Object.keys(patch).length) {
      try { await base44.entities.PlayerProfile.update(profile.id, patch); } catch (error) {
        console.warn('[Save Foundation] perfil preservado, patch ignorado', error);
      }
    }
  }

  window.dispatchEvent(new CustomEvent('padel-save-foundation-ready', {
    detail: { version:SAVE_FOUNDATION_VERSION, athletes:worldSeed.athletes.length, teams:worldSeed.teams.length }
  }));
  return { athletes: worldSeed.athletes.length, teams: worldSeed.teams.length };
}

export async function verifySaveFoundation() {
  const [athletes, teams] = await Promise.all([
    safeList('AthleteProfile', '-world_ranking_points', 500),
    safeList('TeamRanking', '-ranking_points', 500),
  ]);
  const athleteIds = new Set(athletes.map(a => a.bot_id));
  const teamIds = new Set(teams.map(t => t.team_key));
  return {
    ok: worldSeed.athletes.every(a => athleteIds.has(a.bot_id)) &&
        worldSeed.teams.every(t => teamIds.has(t.team_key)),
    athletes: athletes.length,
    teams: teams.length,
    version: SAVE_FOUNDATION_VERSION,
  };
}
