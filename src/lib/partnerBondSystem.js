export function clampBond(value, fallback = 50) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : fallback));
}

export function getPartnerBondState(partnership = {}) {
  return {
    chemistry: clampBond(partnership.chemistry, 50),
    trust: clampBond(partnership.partner_trust, 55),
    morale: clampBond(partnership.partner_morale, 70),
    naturalChemistry: clampBond(partnership.natural_chemistry ?? partnership.compatibility_score, 50),
  };
}

export function applyPartnerBondEvent(partnership = {}, event = {}) {
  const current = getPartnerBondState(partnership);
  const next = {
    chemistry: clampBond(current.chemistry + (event.chemistry || 0)),
    trust: clampBond(current.trust + (event.trust || 0)),
    morale: clampBond(current.morale + (event.morale || 0)),
    naturalChemistry: current.naturalChemistry,
  };
  return next;
}

export function getPartnerBondLabel(value) {
  const score = clampBond(value);
  if (score >= 85) return { label: 'Excelente', color: 'text-primary', bg: 'bg-primary/15' };
  if (score >= 70) return { label: 'Muito boa', color: 'text-green-400', bg: 'bg-green-500/15' };
  if (score >= 55) return { label: 'Boa', color: 'text-cyan-400', bg: 'bg-cyan-500/15' };
  if (score >= 40) return { label: 'Instável', color: 'text-amber-400', bg: 'bg-amber-500/15' };
  return { label: 'Crítica', color: 'text-red-400', bg: 'bg-red-500/15' };
}

export function calculatePartnershipPerformanceBonus(partnership = {}) {
  const { chemistry, trust, morale, naturalChemistry } = getPartnerBondState(partnership);
  const matches = Math.max(0, Number(partnership.shared_matches) || 0);
  const experience = Math.min(1, matches / 80);
  const weighted = chemistry * 0.36 + trust * 0.28 + morale * 0.18 + naturalChemistry * 0.18;
  const base = Math.max(0, (weighted - 50) / 50);
  return Number(Math.min(0.06, base * (0.025 + experience * 0.035)).toFixed(4));
}

export function derivePartnershipIdentity(partnership = {}) {
  const matches = Number(partnership.shared_matches) || 0;
  if (matches < 12) return { id: 'em_formacao', name: 'Dupla em formação', description: 'A identidade coletiva ainda está sendo construída.' };

  const wins = Number(partnership.shared_wins) || 0;
  const winRate = matches > 0 ? wins / matches : 0;
  const chemistry = clampBond(partnership.chemistry, 50);
  const trust = clampBond(partnership.partner_trust, 55);
  const style = String(partnership.partner_play_style || '').toLowerCase();

  if (chemistry >= 85 && trust >= 80 && matches >= 60) {
    return { id: 'sintonia_total', name: 'Sintonia Total', description: 'Movimentação e leitura de jogo construídas por uma parceria duradoura.' };
  }
  if (winRate >= 0.68 && (style.includes('agress') || style.includes('pot'))) {
    return { id: 'pressao_constante', name: 'Pressão Constante', description: 'A dupla impõe ritmo alto e busca decidir os pontos cedo.' };
  }
  if (chemistry >= 75 && winRate >= 0.58) {
    return { id: 'especialistas_decisivos', name: 'Especialistas em Momentos Decisivos', description: 'A parceria responde bem quando os jogos ficam equilibrados.' };
  }
  if (style.includes('defens') || style.includes('controle') || style.includes('tát')) {
    return { id: 'muralha_tatica', name: 'Muralha Tática', description: 'Consistência, paciência e ocupação inteligente dos espaços.' };
  }
  return { id: 'equilibrio_competitivo', name: 'Equilíbrio Competitivo', description: 'Uma parceria versátil, capaz de alternar ataque e controle.' };
}

export function getPartnerConversationEffect(tone = 'neutro') {
  const effects = {
    positivo: { chemistry: 1, trust: 3, morale: 4 },
    apoio: { chemistry: 1, trust: 4, morale: 5 },
    objetivo: { chemistry: 2, trust: 2, morale: 2 },
    neutro: { chemistry: 0, trust: 1, morale: 0 },
    negativo: { chemistry: -2, trust: -4, morale: -4 },
  };
  return effects[tone] || effects.neutro;
}
