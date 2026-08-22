import { findNextLockedAchievement } from './achievementEngine.js';
import { APP_ROUTES } from '../navigation/routes.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 14): esta
// escada de metas de ranking (Top 500→100→20→10→#1) era uma fonte de
// objetivo PRÓPRIA e paralela — a mesma progressão já existe como conquista
// real no catálogo (categoria "carreira", trigger_type "reach_rank": Top
// 100/50/10/3/#1). Em vez de manter duas, o "Próximo objetivo" da Home lê
// a próxima conquista de ranking ainda bloqueada — mesma fonte que a aba
// Conquistas usa, nunca uma terceira.
function rankingGoal(profile, context) {
  const rank = context?.worldRank?.rank || profile?.world_rank || profile?.ranking || 1001;
  const next = findNextLockedAchievement(profile, context, { category: 'carreira', triggerType: 'reach_rank' });
  if (!next) {
    return { title: 'Defender a liderança mundial', target: 1, progress: 100, route: '/ranking', category: 'competicao' };
  }
  return {
    title: next.achievement.name,
    target: next.achievement.threshold,
    progress: clamp(next.percent),
    route: '/ranking',
    category: 'competicao',
    _rank: rank,
  };
}

function developmentGoal(profile, trainings = []) {
  const season = String(profile?.career_date || '').slice(0, 4);
  const completed = trainings.filter((row) => String(row?.date || row?.training_date || row?.created_date || '').startsWith(season)).length;
  const target = 48;
  return {
    title: 'Construir uma temporada de evolução',
    description: `${completed}/${target} sessões realizadas na temporada`,
    progress: clamp((completed / target) * 100),
    route: APP_ROUTES.TRAINING,
    category: 'desenvolvimento',
  };
}

function partnershipGoal(profile, matches = []) {
  if (!profile?.partner_id) {
    return { title: 'Formar uma dupla estável', description: 'Escolha um parceiro compatível para competir.', progress: 0, route: '/partners', category: 'relacao' };
  }
  const chemistry = Number(profile?.partnership_chemistry ?? profile?.chemistry ?? 50);
  const trust = Number(profile?.partnership_trust ?? profile?.partner_trust ?? 50);
  const together = matches.filter((row) => row?.partner_id === profile.partner_id || row?.team_partner_id === profile.partner_id).length;
  return {
    title: 'Fortalecer a identidade da dupla',
    description: `${together} partidas juntos • confiança ${Math.round(trust)}`,
    progress: clamp((chemistry * 0.45) + (trust * 0.45) + Math.min(10, together / 2)),
    route: '/partners',
    category: 'relacao',
  };
}

function structureGoal(profile) {
  const hasCoach = Boolean(profile?.head_coach_id || profile?.coach_id || profile?.coach?.id);
  const staffCount = Array.isArray(profile?.staff) ? profile.staff.filter((member) => member?.active !== false).length : Number(profile?.staff_count || 0);
  const progress = clamp((hasCoach ? 45 : 0) + Math.min(55, staffCount * 18));
  return {
    title: 'Montar uma equipe de alto desempenho',
    description: hasCoach ? `${staffCount} profissional${staffCount === 1 ? '' : 'is'} de apoio ativo${staffCount === 1 ? '' : 's'}` : 'Defina seu treinador principal.',
    progress,
    route: hasCoach ? '/staff' : '/coaches',
    category: 'estrutura',
  };
}

// Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte 49-51): "próximo objetivo" geral
// da Home, não restrito à categoria de ranking (diferente de rankingGoal
// acima, que continua alimentando especificamente o card de ranking do
// plano de temporada). Mesma fonte que a aba Conquistas usa
// (findNextLockedAchievement, sem filtro de categoria) — nunca uma terceira
// escada paralela. Não bloqueia nada: é uma sugestão contextual, não uma
// ordem (Part 51).
export function getNextCareerObjective(profile, context = {}) {
  const next = findNextLockedAchievement(profile, context);
  if (!next) return null;
  return {
    title: next.achievement.name,
    description: next.achievement.description,
    progress: clamp(next.percent),
    category: next.achievement.category,
    achievementId: next.achievement.id,
  };
}

export function buildSeasonCareerPlan(profile, context = {}) {
  const ranking = rankingGoal(profile, context);
  const rank = ranking._rank;
  delete ranking._rank;
  ranking.description = !rank || rank > 1000 ? 'Comece a somar pontos no circuito.' : `Posição atual: #${rank}`;

  const goals = [
    ranking,
    developmentGoal(profile, context.trainings || []),
    partnershipGoal(profile, context.matches || []),
    structureGoal(profile),
  ];

  const overallProgress = Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length);
  return {
    season: String(profile?.career_date || '2026-01-01').slice(0, 4),
    overallProgress,
    completed: goals.filter((goal) => goal.progress >= 100).length,
    goals,
  };
}
