import { localGame } from '@/api/localGameClient.js';
import { generateFanBase, reactToEvent } from '@/lib/fanBase';

function monthKey(value) {
  return String(value || new Date().toISOString()).slice(0, 7);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function getDate(record) {
  return record?.played_date || record?.match_date || record?.date || record?.published_date || record?.created_date || '';
}

function isWin(match, profile) {
  return Boolean(match?.did_win || match?.winner_profile_id === profile?.id || match?.winner === profile?.sport_name);
}

async function safeList(entityName, filter = null) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity) return [];
    return filter && entity.filter ? await entity.filter(filter) : entity.list ? await entity.list('-created_date', 500) : [];
  } catch (error) {
    console.warn(`[Game Core] Falha ao consultar ${entityName}:`, error);
    return [];
  }
}

async function safeCreate(entityName, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    return entity?.create ? await entity.create(payload) : null;
  } catch (error) {
    console.warn(`[Game Core] Falha ao registrar ${entityName}:`, error);
    return null;
  }
}

export async function getOrCreatePlayerFanBase(profile) {
  if (!profile?.id) throw new Error('Perfil da carreira não encontrado.');
  const current = await safeList('FanBase', { profile_id: profile.id });
  if (current?.[0]) return current[0];

  const created = generateFanBase('jogador', profile.sport_name || profile.name || 'Novo atleta', {
    entity_id: profile.id,
    country: profile.country || 'Brasil',
    popularity: clamp(profile.popularity || 45),
    morale: 70,
  });
  return localGame.entities.FanBase.create({ ...created, profile_id: profile.id });
}

export async function evaluateMonthlyFanEngagement(profile) {
  if (!profile?.id) throw new Error('Perfil da carreira não encontrado.');
  const fanBase = await getOrCreatePlayerFanBase(profile);
  const month = monthKey(profile.career_date);

  if (fanBase.last_evaluated_month === month) {
    return { skipped: true, month, fanBase, message: 'A torcida já foi avaliada neste mês.' };
  }

  const [matches, posts, articles] = await Promise.all([
    safeList('Match', { profile_id: profile.id }),
    safeList('Post', { profile_id: profile.id }),
    safeList('PressArticle', { profile_id: profile.id }),
  ]);

  const monthlyMatches = matches.filter((item) => !getDate(item) || monthKey(getDate(item)) === month);
  const monthlyPosts = posts.filter((item) => !getDate(item) || monthKey(getDate(item)) === month);
  const monthlyArticles = articles.filter((item) => !getDate(item) || monthKey(getDate(item)) === month);
  const wins = monthlyMatches.filter((item) => isWin(item, profile)).length;
  const losses = Math.max(0, monthlyMatches.length - wins);
  const titles = monthlyMatches.filter((item) => isWin(item, profile) && (item.is_final || item.round === 'final')).length;

  let eventType = 'good_performance';
  if (titles > 0) eventType = 'title_win';
  else if (monthlyMatches.length > 0 && wins / monthlyMatches.length < 0.4) eventType = 'bad_performance';
  else if (monthlyMatches.length === 0 && monthlyPosts.length === 0) eventType = 'bad_performance';

  let updated = reactToEvent(fanBase, eventType, {
    description: `${wins} vitórias, ${losses} derrotas, ${monthlyPosts.length} publicações e ${monthlyArticles.length} matérias no mês.`,
  });

  const mediaBonus = monthlyPosts.length * 35 + monthlyArticles.length * 75;
  const performanceBonus = wins * 60 + titles * 600 - losses * 15;
  const fanChange = Math.max(-250, mediaBonus + performanceBonus);

  updated = {
    ...updated,
    total_fans: Math.max(0, Number(updated.total_fans || 0) + fanChange),
    popularity: clamp(Number(updated.popularity || 0) + Math.min(8, monthlyPosts.length + monthlyArticles.length)),
    last_evaluated_month: month,
    monthly_fan_change: fanChange,
    monthly_summary: { matches: monthlyMatches.length, wins, losses, titles, posts: monthlyPosts.length, articles: monthlyArticles.length },
  };

  const saved = await localGame.entities.FanBase.update(fanBase.id, updated);
  await safeCreate('CareerMessage', {
    profile_id: profile.id,
    sender: 'Equipe de Comunicação',
    subject: 'Relatório mensal da torcida',
    body: `Sua base de fãs variou ${fanChange >= 0 ? '+' : ''}${fanChange.toLocaleString('pt-BR')} neste mês. Moral: ${saved.morale}/100. Popularidade: ${saved.popularity}/100.`,
    message_type: 'fans',
    is_read: false,
    sent_date: profile.career_date || new Date().toISOString().slice(0, 10),
  });

  return { skipped: false, month, fanBase: saved, fanChange, stats: updated.monthly_summary };
}

export function getFanEvaluationStatus(fanBase, careerDate) {
  const month = monthKey(careerDate);
  return { month, isComplete: fanBase?.last_evaluated_month === month };
}
