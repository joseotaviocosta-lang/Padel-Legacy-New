const ATTRIBUTE_KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];

export const TRAINING_GROUPS = {
  court: { id: 'court', label: 'Treino de Quadra', category: 'technical', description: 'Fundamentos técnicos aplicados à construção do ponto.' },
  physical: { id: 'physical', label: 'Treino Físico', category: 'physical', description: 'Capacidade de movimento, resistência e preparação corporal.' },
  mental: { id: 'mental', label: 'Treino Mental', category: 'mental', description: 'Estabilidade emocional, confiança e decisões sob pressão.' },
  tactical: { id: 'tactical', label: 'Tático de Dupla', category: 'tactical', description: 'Estratégia, cobertura e entrosamento com o parceiro.' },
};

export const TRAINING_GROUP_ORDER = ['court', 'physical', 'mental', 'tactical'];

export const TRAINING_INTENSITIES = [
  { id: 'leve', label: 'Leve', energyCost: 6, fatigueCost: 3, gainMult: 0.72, durationMult: 0.75, injuryRisk: 0.006, moraleImpact: 2, color: 'text-green-400', description: 'Carga baixa e recuperação rápida.' },
  { id: 'moderado', label: 'Normal', energyCost: 10, fatigueCost: 7, gainMult: 1, durationMult: 1, injuryRisk: 0.02, moraleImpact: 0, color: 'text-primary', description: 'Equilíbrio entre evolução e desgaste.' },
  { id: 'intenso', label: 'Intensa', energyCost: 16, fatigueCost: 12, gainMult: 1.28, durationMult: 1.35, injuryRisk: 0.05, moraleImpact: -3, color: 'text-red-400', description: 'Mais progresso, fadiga e risco reais.' },
];

const focus = (definition) => ({ duration: 50, xp: 18, coins: 10, baseGainBudget: 0.9, ...definition });

export const TRAINING_FOCUSES = [
  focus({ id: 'court-groundstrokes', groupId: 'court', focusId: 'groundstrokes', label: 'Golpes de fundo', icon: 'Target', description: 'Desenvolve forehand e backhand em conjunto.', primaryAttributes: { forehand: 1, backhand: 1 }, secondaryAttributes: { strategy: 0.3, agility: 0.2 } }),
  focus({ id: 'court-net-control', groupId: 'court', focusId: 'net-control', label: 'Controle de rede', icon: 'Waves', description: 'Prioriza voleio e posicionamento na rede.', primaryAttributes: { volley: 1, bandeja: 0.65 }, secondaryAttributes: { strategy: 0.35, agility: 0.25 } }),
  focus({ id: 'court-aerials', groupId: 'court', focusId: 'aerials', label: 'Golpes aéreos', icon: 'Circle', description: 'Integra bandeja, smash e domínio aéreo.', primaryAttributes: { bandeja: 1, smash: 0.75 }, secondaryAttributes: { volley: 0.4, strategy: 0.25 } }),
  focus({ id: 'court-finishing', groupId: 'court', focusId: 'finishing', label: 'Definição', icon: 'Hammer', description: 'Trabalha finalização sem abandonar o controle de rede.', primaryAttributes: { smash: 1, volley: 0.55 }, secondaryAttributes: { forehand: 0.3, agility: 0.2 } }),
  focus({ id: 'court-defense-transition', groupId: 'court', focusId: 'defense-transition', label: 'Defesa e transição', icon: 'Shield', description: 'Melhora defesa, mobilidade e saída para o ataque.', primaryAttributes: { defense: 1, agility: 0.65 }, secondaryAttributes: { backhand: 0.3, strategy: 0.35 } }),
  focus({ id: 'court-serve-return', groupId: 'court', focusId: 'serve-return', label: 'Saque e devolução', icon: 'Zap', description: 'Aprimora o início do ponto e a resposta.', primaryAttributes: { serve: 1, defense: 0.6 }, secondaryAttributes: { forehand: 0.25, backhand: 0.25, strategy: 0.3 } }),
  focus({ id: 'physical-conditioning', groupId: 'physical', focusId: 'conditioning', label: 'Condicionamento', icon: 'Heart', description: 'Eleva capacidade física e manutenção de forma.', primaryAttributes: { agility: 1 }, secondaryAttributes: { defense: 0.3 }, formBoost: 3 }),
  focus({ id: 'physical-agility', groupId: 'physical', focusId: 'agility', label: 'Agilidade', icon: 'Gauge', description: 'Prioriza deslocamento e cobertura de quadra.', primaryAttributes: { agility: 1 }, secondaryAttributes: { defense: 0.45, volley: 0.2 } }),
  focus({ id: 'physical-power', groupId: 'physical', focusId: 'power', label: 'Potência', icon: 'Dumbbell', description: 'Prepara explosão aplicada a golpes ofensivos.', primaryAttributes: { agility: 0.7, smash: 0.65 }, secondaryAttributes: { serve: 0.3 }, fatigueExtra: 3 }),
  focus({ id: 'mental-concentration', groupId: 'mental', focusId: 'concentration', label: 'Concentração', icon: 'Brain', description: 'Trabalha controle emocional e leitura consistente.', primaryAttributes: { emotional_control: 1 }, secondaryAttributes: { strategy: 0.45 }, confidenceBoost: 1 }),
  focus({ id: 'mental-confidence', groupId: 'mental', focusId: 'confidence', label: 'Confiança', icon: 'Flame', description: 'Fortalece confiança e recuperação após erros.', primaryAttributes: { emotional_control: 1 }, secondaryAttributes: { forehand: 0.2, smash: 0.2 }, moraleBoost: 3, confidenceBoost: 3 }),
  focus({ id: 'mental-pressure', groupId: 'mental', focusId: 'pressure', label: 'Controle de pressão', icon: 'Eye', description: 'Prepara decisões e estabilidade nos pontos importantes.', primaryAttributes: { emotional_control: 1, strategy: 0.55 }, secondaryAttributes: {}, confidenceBoost: 2 }),
  focus({ id: 'tactical-chemistry', groupId: 'tactical', focusId: 'chemistry', label: 'Entrosamento', icon: 'Users', description: 'Desenvolve estratégia e experiência prática da dupla.', primaryAttributes: { strategy: 1 }, secondaryAttributes: { emotional_control: 0.3 }, requiresPartner: true, chemistryGain: 2 }),
  focus({ id: 'tactical-positioning', groupId: 'tactical', focusId: 'positioning', label: 'Posicionamento', icon: 'Map', description: 'Melhora cobertura e transições coordenadas.', primaryAttributes: { strategy: 1 }, secondaryAttributes: { defense: 0.35, agility: 0.25 }, requiresPartner: true, chemistryGain: 1 }),
  focus({ id: 'tactical-strategy', groupId: 'tactical', focusId: 'strategy', label: 'Estratégia', icon: 'Brain', description: 'Aprimora decisões coletivas e leitura de adversários.', primaryAttributes: { strategy: 1 }, secondaryAttributes: { emotional_control: 0.35 }, requiresPartner: false }),
];

export const LEGACY_TRAINING_ALIASES = {
  serve_drill: 'court-serve-return', forehand_drill: 'court-groundstrokes', backhand_drill: 'court-groundstrokes',
  volley_drill: 'court-net-control', bandeja_drill: 'court-aerials', smash_drill: 'court-finishing', defense_drill: 'court-defense-transition',
  sprint_training: 'physical-agility', strength_training: 'physical-power', endurance_training: 'physical-conditioning',
  match_analysis: 'tactical-strategy', court_positioning: 'tactical-positioning', opponent_study: 'tactical-strategy',
  meditation: 'mental-concentration', pressure_drills: 'mental-pressure', visualization: 'mental-confidence',
};

export function normalizeTrainingId(id) { return LEGACY_TRAINING_ALIASES[id] || id; }
export function getTrainingFocus(id) { return TRAINING_FOCUSES.find(item => item.id === normalizeTrainingId(id)) || null; }
export function getTrainingWeights(training) { return { ...(training?.primaryAttributes || {}), ...(training?.secondaryAttributes || {}) }; }
export function validateTrainingCatalog() {
  const ids = new Set();
  const errors = [];
  for (const item of TRAINING_FOCUSES) {
    if (ids.has(item.id)) errors.push(`ID duplicado: ${item.id}`);
    ids.add(item.id);
    if (!TRAINING_GROUPS[item.groupId]) errors.push(`Grupo inválido: ${item.id}`);
    for (const [attribute, weight] of Object.entries(getTrainingWeights(item))) {
      if (!ATTRIBUTE_KEYS.includes(attribute)) errors.push(`Atributo inválido: ${attribute}`);
      if (!(weight > 0)) errors.push(`Peso inválido: ${item.id}/${attribute}`);
    }
  }
  return { valid: errors.length === 0, errors, count: ids.size };
}

export function migrateTrainingReference(value) {
  if (!value || typeof value !== 'object') return value;
  const trainingId = normalizeTrainingId(value.training_type || value.activity_id || value.training_id);
  const training = getTrainingFocus(trainingId);
  if (!training) return value;
  return {
    ...value,
    training_type: value.training_type ? training.id : value.training_type,
    activity_id: value.activity_id ? training.id : value.activity_id,
    training_id: value.training_id ? training.id : value.training_id,
    group_id: value.group_id || training.groupId,
    focus_id: value.focus_id || training.focusId,
    training_label: value.training_label || training.label,
    training_schema_version: 2,
  };
}
