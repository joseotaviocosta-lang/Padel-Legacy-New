import { ACHIEVEMENT_CATALOG } from './achievementsData.js';
import { ATTRIBUTES, calculateAge } from './padel.js';
import { CAREER_START_DATE, daysBetween } from './career.js';

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 9/10):
// nada no projeto avaliava conquistas de verdade antes desta fase — o
// catálogo rico (achievementsData.js) nunca era consultado em runtime, e o
// que a UI mostrava vinha de um seed de 4 itens com campos incompatíveis
// (title/is_hidden em vez de name/visibility). Isto não tenta ativar as
// ~175 conquistas de uma vez: por causa de "não alterar economia sem
// evidência" e "não criar mais sistemas" (regras explícitas desta fase),
// só os `trigger_type`s abaixo — cada um já lido de algum lugar seguro do
// projeto hoje, nenhum campo novo, nenhum sistema de economia/mercado/social
// tocado — são realmente avaliados. O resto do catálogo continua visível
// (browsable) mas bloqueado, exatamente como já estava antes desta fase —
// nunca pior, e agora corretamente renderizado.
//
// `play_match`/`win_match` foram DELIBERADAMENTE excluídos deste conjunto
// seguro: `profile.matches_played`/`profile.wins` só contam partidas de
// TREINO (game-core/progression.js) — partidas de torneio nunca os
// incrementam (confirmado lendo tournamentLifecycle.js/TournamentModal.jsx:
// só `tournaments_played`/`tournaments_won` avançam lá). Como a descrição
// dessas conquistas é explicitamente "partida OFICIAL", avaliá-las contra
// esse contador reintroduziria exatamente o mesmo bug que a Parte 2 desta
// fase corrigiu no tutorial (treino concluindo algo que só deveria contar
// para torneio) — ficam bloqueadas/visíveis, não avaliadas, até existir uma
// contagem real de partidas oficiais para consultar com segurança.
const EVALUABLE_TRIGGER_TYPES = new Set([
  'join_tournament', 'win_tournament',
  'complete_training', 'advance_day', 'reach_age', 'reach_rank',
]);

function rawMetricValue(triggerType, profile, context) {
  switch (triggerType) {
    case 'join_tournament': return Number(profile?.tournaments_played) || 0;
    case 'win_tournament': return Number(profile?.tournaments_won) || 0;
    case 'complete_training': return Number(profile?.trainings_completed ?? profile?.total_trainings) || 0;
    case 'advance_day': return profile?.career_date ? Math.max(0, daysBetween(CAREER_START_DATE, profile.career_date)) : 0;
    case 'reach_age': return Number(calculateAge(profile)) || 0;
    case 'reach_rank': return Number(context?.worldRank?.rank) || 0;
    default: return null;
  }
}

/**
 * Progresso de UMA conquista contra o perfil real — sem persistência, sem
 * chamada de rede própria (recebe tudo já carregado). `evaluable=false`
 * significa "fora do subconjunto seguro desta fase", não "não avaliada por
 * erro" — a UI trata isso como bloqueada, igual a hoje.
 */
export function getAchievementProgress(achievement, profile, context = {}) {
  const triggerType = achievement.trigger_type;
  if (!EVALUABLE_TRIGGER_TYPES.has(triggerType)) return { evaluable: false, unlocked: false, value: null, percent: 0 };
  const value = rawMetricValue(triggerType, profile, context);
  if (value == null) return { evaluable: false, unlocked: false, value: null, percent: 0 };
  // reach_rank é o único "quanto menor, melhor" — posição 0/ausente nunca
  // conta como progresso.
  const unlocked = triggerType === 'reach_rank' ? value > 0 && value <= achievement.threshold : value >= achievement.threshold;
  const percent = triggerType === 'reach_rank'
    ? (value > 0 ? Math.min(100, Math.round((achievement.threshold / Math.max(value, achievement.threshold)) * 100)) : 0)
    : Math.min(100, Math.round((value / Math.max(1, achievement.threshold)) * 100));
  return { evaluable: true, unlocked, value, percent };
}

/** Progresso de TODO o catálogo — usado pela aba Conquistas e por Legacy/Home. */
export function evaluateAchievements(profile, context = {}) {
  return ACHIEVEMENT_CATALOG.map((achievement) => ({ achievement, ...getAchievementProgress(achievement, profile, context) }));
}

/**
 * Próxima conquista bloqueada (menor threshold primeiro) de uma categoria —
 * usado por seasonCareerPlan.js (Parte 14) para o "próximo objetivo" da
 * Home ler da MESMA fonte que a aba Conquistas, em vez de uma escada de
 * ranking própria e paralela.
 */
export function findNextLockedAchievement(profile, context, { category, triggerType } = {}) {
  const rows = evaluateAchievements(profile, context).filter((row) => (
    row.evaluable && !row.unlocked
    && (!category || row.achievement.category === category)
    && (!triggerType || row.achievement.trigger_type === triggerType)
  ));
  if (!rows.length) return null;
  // Ordena pelo mais PERTO de desbloquear (percent), não pelo threshold cru
  // — para a maioria dos trigger_types o menor threshold é o mais fácil,
  // mas reach_rank é o oposto (Top 500 desbloqueia antes de Top 1), e
  // `percent` já resolve essa inversão dentro de getAchievementProgress.
  return rows.sort((a, b) => b.percent - a.percent)[0];
}

/**
 * Concede as conquistas recém-desbloqueadas (idempotente — nunca re-concede
 * uma já registrada) e cria a PlayerAchievement correspondente. Chamado ao
 * lado de incrementMissionProgress já existente (nunca dentro do Match
 * Engine/calendário) — mesmo nível de abstração, mesmo padrão de disparo.
 */
export async function syncPlayerAchievements(profile, context, { localGame }) {
  if (!profile?.id) return { profile, unlocked: [] };
  const candidates = evaluateAchievements(profile, context).filter((row) => row.evaluable && row.unlocked);
  if (!candidates.length) return { profile, unlocked: [] };

  const existing = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id }).catch(() => []);
  const existingIds = new Set((existing || []).map((row) => row.achievement_id));

  let updatedProfile = profile;
  const unlocked = [];
  for (const { achievement } of candidates) {
    if (existingIds.has(achievement.id)) continue;
    await localGame.entities.PlayerAchievement.create({
      id: `pa-${achievement.id}-${profile.id}`,
      profile_id: profile.id,
      achievement_id: achievement.id,
      achievement_name: achievement.name,
      unlocked_date: new Date().toISOString(),
      career_date: profile.career_date || null,
      is_new: true,
      progress: achievement.threshold,
    });
    const patch = {};
    if (Number(achievement.xp_reward) > 0) patch.xp = (Number(updatedProfile.xp) || 0) + Number(achievement.xp_reward);
    if (Number(achievement.coins_reward) > 0) patch.coins = (Number(updatedProfile.coins) || 0) + Number(achievement.coins_reward);
    if (Object.keys(patch).length) updatedProfile = await localGame.entities.PlayerProfile.update(updatedProfile.id, patch);
    unlocked.push(achievement);
  }

  if (unlocked.length && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('padel:achievement-unlocked', { detail: { achievements: unlocked } }));
  }

  return { profile: updatedProfile, unlocked };
}

/** Resumo compacto — usado pelo cabeçalho da página unificada (CompactStats). */
export function summarizeAchievements(profile, context = {}) {
  const rows = evaluateAchievements(profile, context);
  const unlocked = rows.filter((row) => row.unlocked).length;
  return { unlocked, total: rows.length };
}

export { EVALUABLE_TRIGGER_TYPES };
