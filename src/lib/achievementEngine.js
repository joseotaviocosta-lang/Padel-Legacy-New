import { ACHIEVEMENT_CATALOG } from './achievementsData.js';
import { ATTRIBUTES, ATTRIBUTE_KEYS, calculateAge } from './padel.js';
import { CAREER_START_DATE, daysBetween } from './career.js';

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 9/10):
// nada no projeto avaliava conquistas de verdade antes desta fase — o
// catálogo rico (achievementsData.js) nunca era consultado em runtime.
// Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte A/C): a auditoria completa do
// catálogo (docs/ACHIEVEMENTS_AUDIT_V2.md) reclassificou boa parte do que
// ficou de fora antes — o achado central foi que `play_match`/`win_match`
// (agora renomeados play_official_match/win_official_match) SÃO seguros
// de avaliar, só não contra profile.matches_played/wins (que só contam
// treino — game-core/progression.js) e sim contra as linhas de Match já
// persistidas na finalização oficial (competition_type:'tournament',
// is_official:true, result:'vitória'|'derrota' — TournamentModal.jsx),
// computadas sob demanda via achievementContext.js. O mesmo raciocínio
// "usar o dado real, nunca o contador errado" foi aplicado a cada novo
// trigger abaixo — cada um documentado em achievementContext.js ou aqui,
// nenhum contador novo inventado sem necessidade.
const EVALUABLE_TRIGGER_TYPES = new Set([
  // Já eram seguros (Tutorial 4.0)
  'join_tournament', 'win_tournament', 'complete_training', 'advance_day', 'reach_age', 'reach_rank',
  // Partidas oficiais (Fase 12, Parte 6/7 — a correção central desta fase)
  'play_official_match', 'win_official_match',
  // Evolução do atleta
  'max_attribute', 'all_max_attributes', 'reach_level',
  // Comissão técnica
  'hire_coach', 'long_coach', 'max_coach_affinity',
  // Economia (nunca profile.coins — ver achievementContext.js)
  'reach_coins', 'buy_property', 'make_investment', 'sign_sponsor', 'multi_sponsor',
  // Equipamentos
  'own_items', 'own_legendary', 'own_mythic', 'own_exclusive', 'all_categories',
  // Fase 13 (Parte 10): mesma passada de inventário de own_items/
  // all_categories acima, só contando por categoria/raridade específica —
  // reclassificadas de "C" pra "A" porque o dado (ShopItem.category/rarity)
  // já era lido, só não quebrado por categoria.
  'own_rackets', 'own_shoes', 'own_apparel', 'own_tech', 'all_rarities',
  // Instalações
  'upgrade_facility',
  // Sequências/contadores leves novos (Parte C)
  'win_streak', 'recover_injury',
  // Marcos de partida derivados na própria finalização (Parte C)
  'beat_top10', 'beat_rank1',
  // Carreira
  'create_profile',
]);

const COACH_CAREER_LEVELS = ['Iniciante', 'Amador', 'Competitivo', 'Avançado', 'Elite', 'Lenda'];

function rawMetricValue(achievement, profile, context) {
  const triggerType = achievement.trigger_type;
  switch (triggerType) {
    case 'join_tournament': return Number(profile?.tournaments_played) || 0;
    case 'win_tournament': return Number(profile?.tournaments_won) || 0;
    case 'complete_training': return Number(profile?.trainings_completed ?? profile?.total_trainings) || 0;
    case 'advance_day': return profile?.career_date ? Math.max(0, daysBetween(CAREER_START_DATE, profile.career_date)) : 0;
    case 'reach_age': return Number(calculateAge(profile)) || 0;
    case 'reach_rank': return Number(context?.worldRank?.rank) || 0;

    case 'play_official_match': return Number(context?.officialMatches?.played) || 0;
    case 'win_official_match': return Number(context?.officialMatches?.won) || 0;
    case 'beat_top10': return context?.officialMatches?.beatTop10 ? 1 : 0;
    case 'beat_rank1': return context?.officialMatches?.beatRank1 ? 1 : 0;

    case 'max_attribute': return achievement.attribute_key ? Number(profile?.[achievement.attribute_key]) || 0 : null;
    // threshold é 1 (estilo booleano, como beat_top10/all_categories) — o
    // achado real é "todos os 10 atributos chegaram a 100", não o valor
    // mínimo cru (que faria qualquer perfil "desbloquear" com min>=1).
    case 'all_max_attributes': return ATTRIBUTE_KEYS.every((key) => (Number(profile?.[key]) || 0) >= 100) ? 1 : 0;
    case 'reach_level': return Math.max(0, COACH_CAREER_LEVELS.indexOf(profile?.level));

    case 'hire_coach': return profile?.coach_id ? 1 : 0;
    // dias de vínculo, não meses — calculado direto de duas datas já
    // persistidas (coach_hired_date/career_date), nunca um contador
    // separado que poderia dessincronizar.
    case 'long_coach': return profile?.coach_id && profile?.coach_hired_date && profile?.career_date ? Math.max(0, daysBetween(profile.coach_hired_date, profile.career_date)) : 0;
    case 'max_coach_affinity': return Number(context?.coachAffinity) || 0;

    case 'reach_coins': return Number(context?.careerEarnings) || 0;
    case 'buy_property': return Number(context?.propertyCount) || 0;
    case 'make_investment': return Number(context?.investmentCount) || 0;
    case 'sign_sponsor': return Number(context?.sponsorContracts?.active) || 0;
    case 'multi_sponsor': return Number(context?.sponsorContracts?.active) || 0;

    case 'own_items': return Number(context?.inventory?.totalOwned) || 0;
    case 'own_legendary': return Number(context?.inventory?.legendary) || 0;
    case 'own_mythic': return Number(context?.inventory?.mythic) || 0;
    case 'own_exclusive': return Number(context?.inventory?.exclusive) || 0;
    case 'all_categories': {
      const total = Number(context?.inventory?.totalCategoriesInCatalog) || 0;
      if (!total) return 0;
      return Number(context?.inventory?.categories) >= total ? 1 : 0;
    }
    case 'own_rackets': return Number(context?.inventory?.rackets) || 0;
    case 'own_shoes': return Number(context?.inventory?.shoes) || 0;
    case 'own_apparel': return Number(context?.inventory?.apparel) || 0;
    case 'own_tech': return Number(context?.inventory?.tech) || 0;
    case 'all_rarities': {
      const total = Number(context?.inventory?.totalRaritiesInCatalog) || 0;
      if (!total) return 0;
      return Number(context?.inventory?.rarities) >= total ? 1 : 0;
    }

    case 'upgrade_facility': {
      const center = context?.trainingCenter;
      if (!center) return 0;
      return [center.court_level, center.gym_level, center.physio_level, center.psychology_level, center.nutrition_level].some((level) => Number(level) > 1) ? 1 : 0;
    }

    case 'win_streak': return Number(profile?.current_win_streak) || 0;
    case 'recover_injury': return Number(profile?.injury_recoveries) || 0;

    case 'create_profile': return profile?.id ? 1 : 0;

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
  // Fase 12 (Parte 26/28): future_system (depende de mecânica que não
  // existe, ex.: aposentadoria) e is_active:false (placeholders "secret_N"
  // vazios arquivados) nunca aparecem como objetivo normal bloqueado —
  // tratados como não-avaliáveis, a mesma UI de "fora do catálogo
  // apresentado" que EVALUABLE_TRIGGER_TYPES já usava.
  if (achievement.future_system || achievement.is_active === false) return { evaluable: false, unlocked: false, value: null, percent: 0 };
  if (!EVALUABLE_TRIGGER_TYPES.has(triggerType)) return { evaluable: false, unlocked: false, value: null, percent: 0 };
  const value = rawMetricValue(achievement, profile, context);
  if (value == null) return { evaluable: false, unlocked: false, value: null, percent: 0 };
  // reach_rank é o único "quanto menor, melhor" — posição 0/ausente nunca
  // conta como progresso.
  const unlocked = triggerType === 'reach_rank' ? value > 0 && value <= achievement.threshold : value >= achievement.threshold;
  const percent = triggerType === 'reach_rank'
    ? (value > 0 ? Math.min(100, Math.round((achievement.threshold / Math.max(value, achievement.threshold)) * 100)) : 0)
    : Math.min(100, Math.round((value / Math.max(1, achievement.threshold)) * 100));
  return { evaluable: true, unlocked, value, percent };
}

// Fase 12 (Parte 26/28): o catálogo PRESENTÁVEL exclui future_system
// (mecânica que não existe ainda) e is_active:false (placeholders "secret_N"
// vazios arquivados) — nunca aparecem como objetivo normal, nem bloqueado
// nem "???". `ACHIEVEMENT_CATALOG` completo continua existindo (histórico/
// auditoria); só a UI e as contagens usam este subconjunto.
export function presentableAchievements() {
  return ACHIEVEMENT_CATALOG.filter((achievement) => !achievement.future_system && achievement.is_active !== false);
}

/** Progresso de TODO o catálogo presentável — usado pela aba Conquistas e por Legacy/Home. */
export function evaluateAchievements(profile, context = {}) {
  return presentableAchievements().map((achievement) => ({ achievement, ...getAchievementProgress(achievement, profile, context) }));
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
 *
 * Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte 33-36): `reconciliation:true` é
 * o caminho de um save antigo abrindo pela primeira vez sob a Fase 12, cujo
 * estado/histórico já prova uma conquista antes nunca avaliada (ex.:
 * profile.tournaments_won já é 3, mas "Tricampeão" nunca foi verificado).
 * Política deliberada (Parte 35, decisão de segurança documentada, não
 * assumida): a conquista é registrada como desbloqueada — mas SEM
 * recompensa e SEM notificação — porque não há como provar que a
 * recompensa nunca foi recebida por outro caminho no save antigo. Um
 * desbloqueio ao VIVO (reconciliation:false, o padrão) sempre concede
 * normalmente. Nunca revoga, nunca duplica, nunca reseta progresso — a
 * guarda `existingIds.has` de baixo já impedia re-concessão antes desta
 * fase e continua sendo a única fonte de idempotência.
 */
export async function syncPlayerAchievements(profile, context, { localGame, reconciliation = false }) {
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
      is_new: !reconciliation,
      progress: achievement.threshold,
      reconciled: reconciliation,
    });
    if (!reconciliation) {
      const patch = {};
      if (Number(achievement.xp_reward) > 0) patch.xp = (Number(updatedProfile.xp) || 0) + Number(achievement.xp_reward);
      if (Number(achievement.coins_reward) > 0) patch.coins = (Number(updatedProfile.coins) || 0) + Number(achievement.coins_reward);
      if (Object.keys(patch).length) updatedProfile = await localGame.entities.PlayerProfile.update(updatedProfile.id, patch);
    }
    unlocked.push(achievement);
  }

  if (!reconciliation && unlocked.length && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
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
