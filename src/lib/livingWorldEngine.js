import { localGame } from '@/api/localGameClient.js';
import { processWorldTourDay } from '@/gameplay/worldTour/WorldTourLifecycle.js';
import { generateEventObject } from '@/lib/world.js';
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
  if (!valid.length) return [];
  // Fase 2.5, item 3: cada evento pagava sua própria transação de create()
  // (a leitura de existência é barata — cache em memória, não clona o save;
  // só o create() é a transação completa). Mesmo padrão já corrigido em
  // dissolvePartnerships/circuitLifecycle.js/generateProspects — junta as
  // leituras de existência (em paralelo) e grava tudo que ainda não existe
  // num único bulkCreate, preservando "não sobrescreve o que já existe"
  // (create, não upsert).
  const existingChecks = await Promise.all(
    valid.map((event) => safeFilter(localGame.entities.WorldEvent, { id: event.id }, '-created_date', 1))
  );
  const toCreate = valid.filter((_, index) => existingChecks[index].length === 0);
  if (!toCreate.length) return [];
  try {
    return await localGame.entities.WorldEvent.bulkCreate(toCreate);
  } catch (error) {
    console.warn('[LivingWorld] Não foi possível persistir eventos:', error?.message || error);
    return [];
  }
}

// Onboarding 2.0 + Polish editorial da Central (docs/NOTIFICATION_EDITORIAL_POLISH.md):
// eventos com tier 'destaque' já são o sinal de relevância que este motor usa
// para si mesmo (buildRankEvent sempre marca 'destaque'; buildTournamentEvent
// só marca 'destaque' para torneios Major/Premier; eventos editoriais de
// generateWorldEvents nunca têm tier). Reaproveitado aqui para escolher o que
// vale citar no resumo semanal do jogador (gameStateLifecycle.js) em vez de
// listar tudo que aconteceu no circuito sem filtro.
export async function getWeeklyRelevantHighlights(date, { limit = 3 } = {}) {
  const weekStart = new Date(parseDate(date));
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const start = weekStart.toISOString().slice(0, 10);
  const recent = await safeList(localGame.entities.WorldEvent, '-event_date', 160);
  return recent
    .filter(event => event.event_date >= start && event.event_date <= date && event.event_type !== 'boletim_semanal' && event.tier === 'destaque')
    .slice(0, limit)
    .map(event => event.title)
    .filter(Boolean);
}

// Fase 2.7, item 1.1: extraído de createWeeklyWorldBulletin — SÓ monta o
// payload (ou devolve o boletim já existente), nunca persiste sozinho.
// processLivingWorldDay funde essa gravação com as outras do mesmo dia
// numa única transação (ver comentário em processLivingWorldDay).
async function buildWeeklyWorldBulletinPayload(profile, date) {
  if (!profile?.id || !isWeeklyBulletinDay(date)) return null;
  const weekKey = livingWorldWeekKey(date);
  const bulletinId = `weekly-bulletin-${profile.id}-${weekKey}`;
  const existing = await safeFilter(localGame.entities.WorldEvent, { id: bulletinId }, '-created_date', 1);
  if (existing.length) return { existing: existing[0] };

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

  // Polish editorial da Central (docs/NOTIFICATION_EDITORIAL_POLISH.md): este
  // boletim ainda vira um WorldEvent — continua alimentando a página
  // Mundo/Notícias normalmente. Só não vira mais uma CareerMessage própria no
  // sino: fazia isso duplicar o "Resumo semanal do universo"
  // (gameStateLifecycle.js), que agora cita os destaques relevantes da
  // semana (getWeeklyRelevantHighlights, acima) na própria mensagem única.
  return {
    payload: {
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
    },
  };
}

export async function createWeeklyWorldBulletin(profile, date) {
  const result = await buildWeeklyWorldBulletinPayload(profile, date);
  if (!result) return null;
  if (result.existing) return result.existing;
  const [created] = await persistEvents([result.payload]);
  return created || result.payload;
}

// Fase 2.7, item 1.2: dado medido antes de escolher o número (não um
// palpite) — a superfície mais vista (CareerHub, widget "Mundo", "só o
// essencial") mostra só 3 itens; o snapshot que a alimenta busca 8; o feed
// dedicado (Journal > aba Mundo) mostra 10/página (busca até 40); a
// página própria (Mundo/Notícias) mostra 12/página (busca até 50).
// Editorial gerava 1/dia (2 na sexta-feira, ~1,14/dia em média,
// incondicional) a partir de só 3 templates de ambientação — competindo
// pelas MESMAS janelas finas com resultados de torneio, notícias de
// parceria, lesões e marcos de ranking (que a categorização do snapshot
// nem reconhece como "circuito"/"mercado"/"saúde" — editorial não entra
// em nenhuma categoria, só polui a lista bruta). Reduzido pra 1 evento a
// cada 3 dias — corte de ~71% na geração, ainda garante ambientação
// várias vezes por semana sem dominar um widget de 3 itens.
const EDITORIAL_CADENCE_DAYS = 3;

function isEditorialDay(date) {
  const epochDay = Math.floor(parseDate(date).getTime() / DAY_MS);
  return epochDay % EDITORIAL_CADENCE_DAYS === 0;
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

  const editorialEvents = options.generateEditorial !== false && isEditorialDay(date)
    ? [generateEventObject(date)]
    : [];

  const bulletinResult = await buildWeeklyWorldBulletinPayload(profile, date);
  const bulletinToPersist = bulletinResult?.payload ? [bulletinResult.payload] : [];

  // Fase 2.7, item 1.1: as três gravações de WorldEvent do dia (contextual,
  // editorial, boletim) fundidas numa ÚNICA transação — cada
  // create()/bulkCreate()/bulkUpdate() clona o save inteiro
  // (ActiveCareerAdapter.js, achado #18 da tabela de classificação),
  // então 3 chamadas separadas pagavam 3× o clone mesmo em dias com só 1
  // item em cada. Mesmo conteúdo, mesma decisão de quais eventos existem —
  // só menos transações pra persisti-los.
  const persisted = await persistEvents([...contextualEvents, ...editorialEvents, ...bulletinToPersist]);
  summary.createdEvents.push(...persisted);
  summary.bulletin = bulletinResult?.existing || persisted.find((event) => event.event_type === 'boletim_semanal') || null;

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
