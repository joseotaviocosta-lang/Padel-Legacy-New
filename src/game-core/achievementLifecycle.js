import { localGame } from '@/api/localGameClient.js';
import { getWorldRank } from '@/lib/padel.js';
import { buildAchievementContext } from '@/lib/achievementContext.js';
import { syncPlayerAchievements } from '@/lib/achievementEngine.js';

// LOCAL-8F (8D-07) — desbloqueio de conquistas como ATUALIZAÇÃO TEMPORAL.
//
// Antes, além do fim de partida de torneio (TournamentModal), o único lugar
// que avaliava e pagava conquistas era a ABERTURA da aba Conquistas: quem
// nunca abria a aba nunca recebia as moedas de conquistas de treino,
// economia, loja etc.; quem abria recebia na hora. Agora o fechamento de cada
// dia avalia o mesmo motor (achievementEngine) com o mesmo contexto. A
// idempotência continua sendo a do motor: id determinístico por conquista
// (`pa-<conquista>-<perfil>`) gravado no mesmo lote das moedas — nunca paga
// duas vezes. Saves que ainda não passaram pela reconciliação da Fase 12
// (achievements_v2_reconciled ausente) são reconciliados aqui UMA vez, sem
// recompensa, exatamente como a aba fazia.
export async function processAchievementsDay(profile) {
  if (!profile?.id) return { profile, unlocked: 0, reconciliation: false };
  const fresh = (await localGame.entities.PlayerProfile.filter({ id: profile.id }).catch(() => []))?.[0] || profile;
  const worldRank = await getWorldRank(fresh).catch(() => ({ rank: 0 }));
  const context = await buildAchievementContext(fresh, { worldRank });
  const reconciliation = !fresh.achievements_v2_reconciled;
  const result = await syncPlayerAchievements(fresh, context, { localGame, reconciliation });
  let next = result?.profile || fresh;
  if (reconciliation) {
    next = await localGame.entities.PlayerProfile.update(profile.id, { achievements_v2_reconciled: true }).catch(() => next);
  }
  return { profile: { ...profile, ...next }, unlocked: result?.unlocked?.length || 0, reconciliation };
}
