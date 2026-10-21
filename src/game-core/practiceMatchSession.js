import { getRandomBots, getDifficultyForPlayer } from '@/lib/bots';
import { getPartnerBot } from '@/lib/career';
import { getChemistryBonus, getEnergyPenalty } from '@/lib/padel';
import { getCoachEffects } from '@/lib/coaches';
import { calculatePartnershipPerformanceBonus } from '@/lib/partnerBondSystem.js';
import { applyEquipmentModifiers } from '@/lib/equipmentModifiers.js';

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * Prepara a sessÃ£o com as mesmas fontes do Match Engine. NÃ£o persiste,
 * nÃ£o pontua e nÃ£o possui RNG prÃ³prio; apenas centraliza a integraÃ§Ã£o que
 * antes ficava embutida no componente do modal.
 */
// LOCAL-9B: `equipmentModifiers` (equipmentLifecycle.loadEquipmentModifiers)
// entra só aqui, no jogador da partida — o perfil gravado guarda a base.
export function preparePracticeMatchSession(profile, coach = null, { equipmentModifiers = {} } = {}) {
  const startedAt = nowMs();
  const partner = getPartnerBot(profile);
  if (!partner) throw new Error('Selecione um parceiro antes de iniciar a partida treino.');
  const opponents = getRandomBots(getDifficultyForPlayer(profile), 2, [partner.id]);
  if (opponents.length !== 2) throw new Error('NÃ£o foi possÃ­vel resolver os adversÃ¡rios da partida treino.');

  const chemistryBonus = getChemistryBonus(profile.partner_chemistry || 50);
  const energyPenalty = getEnergyPenalty(profile.energy || 100);
  const coachEffects = getCoachEffects(coach, profile);
  const coachMatchBonus = coach
    ? Math.min(3, ((coachEffects?.strategyBonus || 0) + (coachEffects?.partnershipBonus || 0)) * 0.35)
    : 0;
  const partnerBondBonus = calculatePartnershipPerformanceBonus({
    chemistry: profile.partner_chemistry,
    partner_trust: profile.partner_trust,
    partner_morale: profile.partner_morale,
    natural_chemistry: profile.partner_chemistry,
    shared_matches: profile.matches_played || 0,
  }) * 40;
  const playerForMatch = {
    ...applyEquipmentModifiers(profile, equipmentModifiers),
    _chemistryBonus: chemistryBonus,
    _energyPenalty: energyPenalty,
    _coachMatchBonus: coachMatchBonus,
    _partnerBondBonus: partnerBondBonus,
  };
  return {
    partner,
    opponents,
    teamA: [playerForMatch, partner],
    teamB: opponents,
    timings: { preparationMs: nowMs() - startedAt },
  };
}
