import { localGame } from '@/api/localGameClient.js';
import { processWorldTourDay } from '@/gameplay/worldTour/WorldTourLifecycle.js';
import { generateWorldEvents } from '@/lib/world.js';
import { expireMacroEvents, maybeGenerateMacroEvent } from '@/lib/worldEvents.js';
import { normalizeWorldEventIds, createWorldEventObjects } from '@/lib/worldEventIds.js';

const DAY_MS = 86400000;
const WEEKDAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function parseDate(date) {
  const parsed = new Date(`${String(date || '2026-01-01').slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date('2026-01-01T00:00:00Z') : parsed;
}

export function livingWorldWeekKey(date) {
  const d = parseDate(date);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday - yearStart) / DAY_MS) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isWeeklyBulletinDay(date) {
  return parseDate(date).getUTCDay() === 1;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function athleteDisplayName(athlete) {
  return athlete?.sport_name || athlete?.name || athlete?.full_name || 'Atleta do circuito';
}

function teamDisplayName(team) {
  return team?.team_name || team?.name || [team?.player1_name, team?.player2_name].filter(Boolean).join(' / ') || 'Dupla do circuito';
}

function uniqueById(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!row?.id || byId.has(row.id)) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function safeList(entity, sort = '-created_date', limit = 100) {
  try { return await entity.list(sort, limit); } catch { return []; }
}

async function safeFilter(entity, filter, sort = '-created_date', limit = 100) {
  try { return await entity.filter(filter, sort, limit); } catch { return []; }
}

function buildRankEvent(date, athletes) {
  const ranked = [...athletes]
    .filter(row => safeNumber(row.ranking_points) > 0)
    .sort((a, b) => safeNumber(b.ranking_points) - safeNumber(a.ranking_points));
  const leader = ranked[0];
  if (!leader) return null;
  return {
    id: `living-ranking-${date}-${leader.id}`,
    event_type: 'ranking',
    category: 'ranking',
    title: `${athleteDisplayName(leader)} lidera o ranking mundial`,
    content: `${athleteDisplayName(leader)} fecha o dia na liderança com ${safeNumber(leader.ranking_points).toLocaleString('pt-BR')} pontos.`,
    author_name: 'Central do Circuito',
    related_players: [athleteDisplayName(leader)],
    related_id: leader.id,
    event_date: date,
    tier: 'destaque',
    tags: ['circuito', 'ranking'],
    is_living_world: true,
  };
}

function buildTeamEvent(date, teams) {
  const ranked = [...teams]
    .filter(row => safeNumber(row.ranking_points ?? row.points) > 0)
    .sort((a, b) => safeNumber(b.ranking_points ?? b.points) - safeNumber(a.ranking_points ?? a.points));
  const leader = ranked[0];
  if (!leader) return null;
  return {
    id: `living-team-${date}-${leader.id}`,
    event_type: 'duplas',
    category: 'mercado',
    title: `${teamDisplayName(leader)} segue como dupla de referência`,
    content: `A dupla ocupa o topo da classificação com ${safeNumber(leader.ranking_points ?? leader.points).toLocaleString('pt-BR')} pontos.`,
    author_name: 'Radar das Duplas',
    related_id: leader.id,
    event_date: date,
    tier: 'normal',
    tags: ['duplas', 'ranking'],
    is_living_world: true,
  };
}

function buildTournamentEvent(date, tournaments) {
  const completed = tournaments.find(row => row?.end_date === date && ['concluido', 'completed', 'finalizado'].includes(String(row.status || '').toLowerCase()));
  if (!completed) return null;
  const champion = completed.champion_name || completed.winner_name || completed.champion_team;
  return {
    id: `living-tournament-${date}-${completed.id}`,
    event_type: 'resultado',
    category: 'resultados',
    title: champion ? `${champion} conquista ${completed.name || completed.title}` : `${completed.name || completed.title} chega ao fim`,
    content: champion
      ? `${champion} venceu o torneio e movimentou a classificação mundial.`
      : 'O evento foi concluído e seus resultados já impactam o circuito.',
    author_name: 'Jornal do Circuito',
    related_id: completed.id,
    event_date: date,
    tier: completed.tier === 'Major' || completed.category === 'Premier' ? 'destaque' : 'normal',
    tags: ['torneio', 'resultado'],
    is_living_world: true,
  };
}

async function persistEvents(events) {
  const valid = normalizeWorldEventIds(createWorldEventObjects(events.filter(Boolean)));
  const created = [];
  for (const event of valid) {
    const existing = await safeFilter(localGame.entities.WorldEvent, { id: event.id }, '-created_date', 1);
    if (existing.length) continue;
    try { created.push(await localGame.entities.WorldEvent.create(event)); } catch (error) {
      console.warn('[LivingWorld] Não foi possível persistir evento:', error?.message || error);
    }
  }
  return created;
}

export async function createWeeklyWorldBulletin(profile, date) {
  if (!profile?.id || !isWeeklyBulletinDay(date)) return null;
  const weekKey = livingWorldWeekKey(date);
  const bulletinId = `weekly-bulletin-${profile.id}-${weekKey}`;
  const existing = await safeFilter(localGame.entities.WorldEvent, { id: bulletinId }, '-created_date', 1);
  if (existing.length) return existing[0];

  const weekStart = new Date(parseDate(date));
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const start = weekStart.toISOString().slice(0, 10);
  const recent = await safeList(localGame.entities.WorldEvent, '-event_date', 160);
  const weekEvents = recent.filter(event => event.event_date >= start && event.event_date <= date && event.event_type !== 'boletim_semanal');
  const categories = {
    resultados: weekEvents.filter(event => ['resultado', 'campeao', 'torneio'].includes(event.event_type)).length,
    ranking: weekEvents.filter(event => event.event_type === 'ranking').length,
    mercado: weekEvents.filter(event => ['duplas', 'transferencia', 'mercado', 'aposentadoria', 'promessa'].includes(event.event_type)).length,
    saude: weekEvents.filter(event => ['lesao', 'recuperacao'].includes(event.event_type)).length,
  };
  const highlights = weekEvents.slice(0, 4).map(event => event.title).filter(Boolean);
  const fallback = 'O circuito teve uma semana estável, com atletas se preparando para os próximos eventos.';
  const content = highlights.length
    ? highlights.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : fallback;

  const bulletin = {
    id: bulletinId,
    event_type: 'boletim_semanal',
    category: 'resumo',
    title: `Resumo da semana · ${weekKey}`,
    content,
    description: content,
    author_name: 'Central do Padel',
    event_date: date,
    tier: 'destaque',
    tags: ['boletim', 'semanal'],
    is_living_world: true,
    metadata: { week_key: weekKey, categories, source_event_ids: weekEvents.slice(0, 20).map(event => event.id) },
  };
  const [created] = await persistEvents([bulletin]);
  if (created && localGame.entities.CareerMessage) {
    try {
      await localGame.entities.CareerMessage.create({
        id: `message-${bulletinId}`,
        profile_id: profile.id,
        message_type: 'world_bulletin',
        title: bulletin.title,
        content: bulletin.content,
        sender_name: 'Central do Circuito',
        status: 'nao_lida',
        priority: 'normal',
        career_date: date,
        related_id: bulletin.id,
      });
    } catch { /* mensagem é complementar */ }
  }
  return created || bulletin;
}

export async function processLivingWorldDay(profile, date, options = {}) {
  const summary = { date, weekday: WEEKDAY_NAMES[parseDate(date).getUTCDay()], createdEvents: [], bulletin: null };

  await processWorldTourDay(date).catch(error => console.error('[LivingWorld] circuito:', error));
  await expireMacroEvents(date).catch(error => console.error('[LivingWorld] expiração:', error));
  await maybeGenerateMacroEvent(date).catch(error => console.error('[LivingWorld] macroevento:', error));

  const [athletes, teams, tournaments] = await Promise.all([
    safeList(localGame.entities.AthleteProfile, '-ranking_points', options.athleteLimit || 120),
    safeList(localGame.entities.TeamRanking, '-ranking_points', options.teamLimit || 80),
    safeList(localGame.entities.Tournament, '-end_date', options.tournamentLimit || 80),
  ]);

  const contextualEvents = [
    buildTournamentEvent(date, tournaments),
    parseDate(date).getUTCDay() === 1 ? buildRankEvent(date, athletes) : null,
    parseDate(date).getUTCDate() === 1 ? buildTeamEvent(date, teams) : null,
  ];
  summary.createdEvents.push(...await persistEvents(contextualEvents));

  // Mantém variedade editorial já existente, mas em volume pequeno e controlado.
  if (options.generateEditorial !== false) {
    const editorialCount = parseDate(date).getUTCDay() === 5 ? 2 : 1;
    const editorial = await generateWorldEvents(date, editorialCount).catch(() => []);
    summary.createdEvents.push(...(editorial || []));
  }

  summary.bulletin = await createWeeklyWorldBulletin(profile, date);
  return summary;
}

export async function getLivingWorldSnapshot(profile, limit = 24) {
  const date = profile?.career_date || '2026-01-01';
  const rows = uniqueById(await safeList(localGame.entities.WorldEvent, '-event_date', Math.max(limit * 4, 80)))
    .filter(event => !event.event_date || event.event_date <= date)
    .slice(0, limit);
  const bulletin = rows.find(event => event.event_type === 'boletim_semanal') || null;
  return {
    date,
    events: rows,
    bulletin,
    breaking: rows.find(event => event.tier === 'breaking') || rows[0] || null,
    categories: {
      circuito: rows.filter(event => ['resultado', 'campeao', 'torneio', 'ranking'].includes(event.event_type)),
      mercado: rows.filter(event => ['duplas', 'transferencia', 'mercado', 'aposentadoria', 'promessa'].includes(event.event_type)),
      saude: rows.filter(event => ['lesao', 'recuperacao'].includes(event.event_type)),
    },
  };
}
