// ─── Fan Base System ─────────────────────────────────────────────────────────
// Each club and athlete has a fan base with personality, metrics, and reactions.

// ─── Behavior Types ──────────────────────────────────────────────────────────

export const BEHAVIOR_TYPES = {
  apaixonado: {
    label: 'Apaixonado', emoji: '❤️', color: 'text-red-400', bg: 'bg-red-500/15',
    desc: 'Torcida dedicada que apoia nos momentos difíceis',
    loyaltyMod: 1.3, expectationMod: 0.7, influenceMod: 1.0, moraleRecovery: 1.2,
  },
  fanatico: {
    label: 'Fanático', emoji: '🔥', color: 'text-amber-400', bg: 'bg-amber-500/15',
    desc: 'Apoio extremo, mas cobra resultados constantemente',
    loyaltyMod: 1.5, expectationMod: 1.3, influenceMod: 1.4, moraleRecovery: 1.0,
  },
  casual: {
    label: 'Casual', emoji: '😎', color: 'text-cyan-400', bg: 'bg-cyan-500/15',
    desc: 'Comparece nos bons momentos, some nos ruins',
    loyaltyMod: 0.6, expectationMod: 0.4, influenceMod: 0.5, moraleRecovery: 0.7,
  },
  critico: {
    label: 'Crítico', emoji: '🧐', color: 'text-purple-400', bg: 'bg-purple-500/15',
    desc: 'Exigente e analítico, não perdoa erros fácil',
    loyaltyMod: 0.7, expectationMod: 1.6, influenceMod: 1.2, moraleRecovery: 0.8,
  },
  agressivo: {
    label: 'Agressivo', emoji: '⚡', color: 'text-orange-400', bg: 'bg-orange-500/15',
    desc: 'Pressiona duro, pode causar incidentes',
    loyaltyMod: 0.5, expectationMod: 1.4, influenceMod: 1.3, moraleRecovery: 0.6,
  },
};

// ─── Fan Events ─────────────────────────────────────────────────────────────
// Each event defines base changes to metrics + reaction message templates.

export const FAN_EVENTS = {
  match_win: {
    label: 'Vitória',
    changes: { morale: +10, popularity: +2, loyalty: +1 },
    reactions: [
      'A torcida está em festa! Que partida! 🎉',
      'VITÓRIA! A quadra tremeu hoje! 🔥',
      'Mais uma! O time tá voando! 💪',
      'Que jogão! Estamos radiantes! 🎾',
    ],
  },
  match_loss: {
    label: 'Derrota',
    changes: { morale: -10, popularity: -1, loyalty: -2 },
    reactions: [
      'Dia ruim... mas a torcida segue firme! 🙏',
      'Dói, mas amanhã tem mais. Fora! 💪',
      'Não foi dessa vez. Cobrança é necessária! 🧐',
      'Faltou atitude hoje. Esperamos mais! 😤',
    ],
  },
  title_win: {
    label: 'Título Conquistado',
    changes: { morale: +25, popularity: +12, loyalty: +10, influence: +5, fans: +2000 },
    reactions: [
      'CAMPEÕES! A torcida invadiu a quadra! 🏆🔥',
      'INACREDITÁVEL! Título histórico! Choramos de alegria! 😭🏆',
      'Somos os melhores! Que temporada épica! 🎉⭐',
    ],
  },
  title_loss: {
    label: 'Título Perdido',
    changes: { morale: -20, popularity: -5, loyalty: -5 },
    reactions: [
      'Coração partido... tão perto! 😢',
      'Não acredito... a taça escapou! 😤',
      'Dói demais. Mas vamos voltar mais fortes! 💪',
    ],
  },
  injury: {
    label: 'Lesão',
    changes: { morale: -8, popularity: -2, loyalty: -1 },
    reactions: [
      'Que tristeza... força, jogador! 🙏',
      'Não merece isso! Recupera logo! 😢',
      'A torcida sente sua dor. Voltamos juntos! 💪',
    ],
  },
  injury_recovery: {
    label: 'Recuperação de Lesão',
    changes: { morale: +8, popularity: +1, loyalty: +2 },
    reactions: [
      'Voltou! A torcida estava com saudade! 🎉',
      'Que alívio! Bem-vindo de volta! 💪',
      'Finalmente curado! Vamos pra cima! 🔥',
    ],
  },
  good_interview: {
    label: 'Boa Entrevista',
    changes: { morale: +3, popularity: +4, influence: +2 },
    reactions: [
      'Que entrevista! O cara sabe falar! 👏',
      'Ganha a torcida dentro e fora da quadra! 🎤',
      'Carisma de sobra! Fãs novos chegando! ⭐',
    ],
  },
  bad_interview: {
    label: 'Entrevista Ruim',
    changes: { morale: -3, popularity: -4, influence: -1 },
    reactions: [
      'Podia ter sido mais humilde... 🧐',
      'Não gostei da postura na entrevista 😤',
      'Falta de respeito com a torcida! 😡',
    ],
  },
  signing_good: {
    label: 'Contratação de Destaque',
    changes: { morale: +12, popularity: +6, fans: +800 },
    reactions: [
      'QUE CONTRATAÇÃO! A torcida está em choque! 🔥',
      'Topa tudo! Vamos dominar! 💪',
      'Contratação de mestre! Acredita no projeto! ⭐',
    ],
  },
  signing_bad: {
    label: 'Saída de Estrela',
    changes: { morale: -10, popularity: -5, loyalty: -8, fans: -300 },
    reactions: [
      'Não pode ser... ele era a nossa esperança! 😭',
      'Injusto! A diretoria decepcionou! 😡',
      'Adeus a um ídolo... que tristeza! 😢',
    ],
  },
  ranking_up: {
    label: 'Subiu no Ranking',
    changes: { morale: +6, popularity: +3, influence: +2 },
    reactions: [
      'Subindo! A torcida orgulhosa! 📈',
      'Cada vez mais alto! Vamos! 💪',
      'Ranking não mente: estamos crescendo! ⭐',
    ],
  },
  ranking_down: {
    label: 'Caiu no Ranking',
    changes: { morale: -6, popularity: -2 },
    reactions: [
      'Caiu... precisa reagir! 📉',
      'Não é o fim, mas precisa melhorar! 🧐',
      'A torcida cobra! Vamos subir de volta! 💪',
    ],
  },
  good_performance: {
    label: 'Desempenho de Destaque',
    changes: { morale: +5, popularity: +3, influence: +1 },
    reactions: [
      'Jogando muito! A torcida apaixonada! 🔥',
      'Que nível! Cada dia melhor! ⭐',
      'Arrepiou a quadra! Estamos juntos! 💪',
    ],
  },
  bad_performance: {
    label: 'Desempenho Ruim',
    changes: { morale: -5, popularity: -2, loyalty: -2 },
    reactions: [
      'Esperávamos mais hoje... 🧐',
      'Faltou intensidade. A torcida cobra! 😤',
      'Precisa de mais dedicação! Exigimos! ⚡',
    ],
  },
  retirement: {
    label: 'Aposentadoria',
    changes: { morale: -5, popularity: +3, loyalty: +5 },
    reactions: [
      'Fim de uma era. Obrigado por tudo! 🙏',
      'Lenda eterna! A torcida nunca esquece! ⭐',
      'Que carreira! Aposenta como ídolo! 🏆',
    ],
  },
};

// ─── Reaction Engine ─────────────────────────────────────────────────────────

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

export function reactToEvent(fanBase, eventType, context = {}) {
  const eventDef = FAN_EVENTS[eventType];
  if (!eventDef) return fanBase;

  const behavior = BEHAVIOR_TYPES[fanBase.behavior] || BEHAVIOR_TYPES.apaixonado;
  const changes = eventDef.changes;

  // Apply behavior modifiers
  const moraleChange = (changes.morale || 0) * behavior.moraleRecovery;
  const loyaltyChange = (changes.loyalty || 0) * behavior.loyaltyMod;
  const expectationAdjust = (changes.popularity || 0) * behavior.expectationMod;
  const influenceChange = (changes.influence || 0) * behavior.influenceMod;
  const fanChange = changes.fans || 0;

  const newMorale = clamp((fanBase.morale || 50) + moraleChange);
  const newPopularity = clamp((fanBase.popularity || 50) + (changes.popularity || 0));
  const newLoyalty = clamp((fanBase.loyalty || 50) + loyaltyChange);
  const newInfluence = clamp((fanBase.influence || 50) + influenceChange);
  const newFans = Math.max(0, (fanBase.total_fans || 0) + fanChange);

  // Determine trend
  const totalChange = moraleChange + loyaltyChange + (changes.popularity || 0);
  const trend = totalChange > 3 ? 'subindo' : totalChange < -3 ? 'caindo' : 'estavel';

  // Pick reaction
  const reactions = eventDef.reactions;
  const reaction = reactions[Math.floor(Math.random() * reactions.length)];

  // History entry
  const historyEntry = {
    date: new Date().toISOString().slice(0, 10),
    event: eventDef.label,
    reaction,
    morale_change: Math.round(moraleChange),
    context: context.description || null,
  };

  return {
    ...fanBase,
    morale: Math.round(newMorale),
    popularity: Math.round(newPopularity),
    loyalty: Math.round(newLoyalty),
    influence: Math.round(newInfluence),
    total_fans: newFans,
    trend,
    last_event: eventDef.label,
    last_reaction: reaction,
    last_reaction_date: new Date().toISOString().slice(0, 10),
    reaction_history: [historyEntry, ...(fanBase.reaction_history || [])].slice(0, 20),
  };
}

// ─── Fan Base Creation ───────────────────────────────────────────────────────

export function generateFanBase(entityType, entityName, options = {}) {
  const behaviors = Object.keys(BEHAVIOR_TYPES);
  const behavior = options.behavior || behaviors[Math.floor(Math.random() * behaviors.length)];

  // Clubs tend to have more fans, athletes fewer
  const baseFans = entityType === 'clube'
    ? Math.floor(Math.random() * 50000) + 5000
    : entityType === 'atleta'
      ? Math.floor(Math.random() * 15000) + 500
      : Math.floor(Math.random() * 5000) + 100;

  const popularity = options.popularity ?? Math.floor(Math.random() * 40) + 40;
  const morale = options.morale ?? Math.floor(Math.random() * 30) + 60;

  return {
    entity_type: entityType,
    entity_id: options.entity_id || null,
    entity_name: entityName,
    entity_country: options.country || null,
    total_fans: baseFans,
    popularity,
    loyalty: Math.floor(Math.random() * 40) + 50,
    expectation: Math.floor(Math.random() * 40) + 40,
    influence: Math.floor(Math.random() * 30) + 40,
    morale,
    behavior,
    trend: 'estavel',
    profile_id: options.profile_id || null,
    reaction_history: [],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getFanBaseStatus(fanBase) {
  const morale = fanBase.morale || 50;
  if (morale >= 80) return { label: 'Eufórica', color: 'text-green-400', bg: 'bg-green-500/15' };
  if (morale >= 60) return { label: 'Feliz', color: 'text-primary', bg: 'bg-primary/15' };
  if (morale >= 40) return { label: 'Neutra', color: 'text-muted-foreground', bg: 'bg-secondary/50' };
  if (morale >= 20) return { label: 'Insatisfeita', color: 'text-amber-400', bg: 'bg-amber-500/15' };
  return { label: 'Furiosa', color: 'text-destructive', bg: 'bg-destructive/15' };
}

export function getTrendIcon(trend) {
  if (trend === 'subindo') return { icon: '📈', color: 'text-green-400' };
  if (trend === 'caindo') return { icon: '📉', color: 'text-destructive' };
  return { icon: '➡️', color: 'text-muted-foreground' };
}