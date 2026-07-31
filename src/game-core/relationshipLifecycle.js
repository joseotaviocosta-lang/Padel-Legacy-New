import { localGame } from '@/api/localGameClient.js';
import { getPlayerRelationships, getRelationshipType, seedInitialRelationships } from '@/lib/relationships';

function isNewWeek(previousDate, currentDate) {
  const prev = new Date(`${previousDate}T12:00:00`);
  const curr = new Date(`${currentDate}T12:00:00`);
  if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) return false;
  const prevWeek = Math.floor(prev.getTime() / 604800000);
  const currWeek = Math.floor(curr.getTime() / 604800000);
  return currWeek > prevWeek;
}

function deterministicDelta(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 5) - 2;
}

async function safeList(entityName, sort = '-overall_rating', limit = 80) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity?.list) return [];
    const rows = await entity.list(sort, limit);
    return Array.isArray(rows) ? rows.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function safeUpdate(entityName, id, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity?.update || !id) return null;
    return await entity.update(id, payload);
  } catch (error) {
    console.warn(`[Game Core] Falha ao atualizar ${entityName}:`, error?.message || error);
    return null;
  }
}

async function safeCreate(entityName, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch {
    return null;
  }
}

export async function ensurePlayerRelationships(profile) {
  if (!profile?.id) return { created: 0, total: 0 };
  const before = await getPlayerRelationships(profile.id);
  if (before.length >= 5) return { created: 0, total: before.length };

  const athletes = await safeList('AthleteProfile');
  if (athletes.length) await seedInitialRelationships(profile.id, athletes);
  const after = await getPlayerRelationships(profile.id);
  return { created: Math.max(0, after.length - before.length), total: after.length };
}

export async function processRelationshipWeek(profile, previousDate, currentDate) {
  const ensured = await ensurePlayerRelationships(profile);
  if (!isNewWeek(previousDate, currentDate)) {
    return { processed: false, reason: 'same_week', ...ensured };
  }

  const relationships = await getPlayerRelationships(profile?.id);
  let changed = 0;
  let headline = null;

  for (const rel of relationships.slice(0, 30)) {
    const oldScore = Number(rel?.score) || 0;
    let delta = deterministicDelta(`${rel.id || rel.target_name}:${currentDate}`);

    if (rel.relationship_type === 'amigo' || rel.relationship_type === 'parceiro') delta = Math.max(-1, delta);
    if (rel.relationship_type === 'rival' || rel.relationship_type === 'inimigo') delta = Math.min(1, delta);
    if (Math.abs(oldScore) > 85 && Math.sign(delta) === Math.sign(oldScore)) delta = 0;
    if (!delta) continue;

    const score = Math.max(-100, Math.min(100, oldScore + delta));
    const relationshipType = getRelationshipType(score, rel.relationship_type === 'mentor');
    const history = [...(Array.isArray(rel.history) ? rel.history : []), {
      date: currentDate,
      event: 'weekly_relationship_tick',
      score_change: delta,
      description: delta > 0 ? 'A convivência no circuito aproximou os atletas.' : 'A tensão competitiva aumentou durante a semana.',
    }].slice(-20);

    await safeUpdate('Relationship', rel.id, {
      score,
      relationship_type: relationshipType,
      history,
      last_interaction_date: currentDate,
    });
    changed += 1;

    if (!headline && relationshipType !== rel.relationship_type && ['rival', 'inimigo', 'amigo', 'parceiro'].includes(relationshipType)) {
      headline = { name: rel.target_name, type: relationshipType };
    }
  }

  if (headline) {
    const labels = { rival: 'nova rivalidade', inimigo: 'conflito aberto', amigo: 'nova amizade', parceiro: 'parceria de grande química' };
    await safeCreate('WorldEvent', {
      title: `${profile?.name || 'O jogador'} desenvolve ${labels[headline.type]}`,
      content: `A relação com ${headline.name} mudou após semanas de convivência e competição no circuito profissional.`,
      event_type: 'noticia',
      tier: headline.type === 'inimigo' ? 2 : 1,
      related_players: [profile?.name, headline.name].filter(Boolean),
      tags: ['relacionamentos', headline.type],
      likes: 0,
      is_macro: false,
      event_date: currentDate,
    });
  }

  return { processed: true, changed, headline, ...ensured };
}

export async function getRelationshipSnapshot(profileId) {
  const relationships = await getPlayerRelationships(profileId);
  return {
    total: relationships.length,
    friends: relationships.filter(r => ['amigo', 'parceiro', 'mentor'].includes(r.relationship_type)).length,
    rivals: relationships.filter(r => ['rival', 'inimigo'].includes(r.relationship_type)).length,
    strongest: [...relationships].sort((a, b) => Math.abs(Number(b.score) || 0) - Math.abs(Number(a.score) || 0))[0] || null,
  };
}
