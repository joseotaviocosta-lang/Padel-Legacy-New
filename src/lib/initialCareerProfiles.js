export const INITIAL_ATTRIBUTE_KEYS = [
  'serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash',
  'defense', 'agility', 'strategy', 'emotional_control',
];

export const INITIAL_PROFILE_BUDGET = 115;
export const DOMINANT_HANDS = [
  { id: 'right', label: 'Destro', description: 'Mão direita dominante. Não determina seu lado na quadra.' },
  { id: 'left', label: 'Canhoto', description: 'Mão esquerda dominante, com ângulos naturais diferentes.' },
];
export const COURT_SIDE_OPTIONS = [
  { id: 'direita', label: 'Direita', description: 'Preferência pelo lado direito; qualquer estilo continua disponível.' },
  { id: 'esquerda', label: 'Esquerda', description: 'Preferência pelo lado esquerdo; não exige perfil ofensivo.' },
  { id: 'versatil', label: 'Versátil', description: 'Maior adaptação entre os lados, com identidade tática flexível.' },
];

const STYLE_DEFINITIONS = {
  controle: { label: 'Controle', role: 'controlador', difficulty: 'Fácil de aprender', description: 'Prioriza precisão, regularidade e ritmo.', strengths: ['strategy', 'emotional_control', 'bandeja'], weaknesses: ['smash'], order: ['strategy', 'emotional_control', 'bandeja', 'forehand', 'defense', 'volley', 'backhand', 'agility', 'serve', 'smash'] },
  ofensivo: { label: 'Ofensivo', role: 'pressionador', difficulty: 'Exigente', description: 'Busca a rede e acelera para criar definições.', strengths: ['volley', 'smash', 'agility'], weaknesses: ['defense'], order: ['volley', 'smash', 'agility', 'forehand', 'serve', 'bandeja', 'strategy', 'emotional_control', 'backhand', 'defense'] },
  defensivo: { label: 'Defensivo', role: 'defensor', difficulty: 'Fácil de aprender', description: 'Absorve pressão, prolonga trocas e reduz erros.', strengths: ['defense', 'agility', 'emotional_control'], weaknesses: ['smash'], order: ['defense', 'agility', 'emotional_control', 'backhand', 'strategy', 'bandeja', 'forehand', 'serve', 'volley', 'smash'] },
  equilibrado: { label: 'Equilibrado', role: 'coringa', difficulty: 'Equilibrado', description: 'Combina construção, defesa e ataque sem especialização extrema.', strengths: ['forehand', 'strategy', 'volley'], weaknesses: ['smash'], order: ['forehand', 'strategy', 'volley', 'defense', 'agility', 'emotional_control', 'bandeja', 'serve', 'backhand', 'smash'] },
  contra_ataque: { label: 'Contra-atacador', role: 'defensor', difficulty: 'Técnico', description: 'Defende com segurança e acelera quando surge espaço.', strengths: ['defense', 'agility', 'forehand'], weaknesses: ['serve'], order: ['defense', 'agility', 'forehand', 'backhand', 'strategy', 'volley', 'emotional_control', 'bandeja', 'smash', 'serve'] },
  construtor: { label: 'Construtor', role: 'construtor', difficulty: 'Técnico', description: 'Organiza o ponto e prepara a melhor bola para a dupla.', strengths: ['strategy', 'bandeja', 'forehand'], weaknesses: ['smash'], order: ['strategy', 'bandeja', 'forehand', 'emotional_control', 'defense', 'backhand', 'volley', 'agility', 'serve', 'smash'] },
  finalizador: { label: 'Finalizador', role: 'finalizador', difficulty: 'Alto risco e recompensa', description: 'Assume bolas de definição e pressiona perto da rede.', strengths: ['smash', 'volley', 'serve'], weaknesses: ['defense'], order: ['smash', 'volley', 'serve', 'forehand', 'agility', 'bandeja', 'strategy', 'emotional_control', 'backhand', 'defense'] },
};

export const PLAY_STYLE_OPTIONS = Object.entries(STYLE_DEFINITIONS).map(([id, value]) => ({ id, ...value }));
export const CAREER_STYLE_PROFILES = Object.fromEntries(COURT_SIDE_OPTIONS.map(side => [side.id, STYLE_DEFINITIONS]));

export const ATTRIBUTE_LABELS = {
  serve: 'Saque', forehand: 'Direita', backhand: 'Esquerda', volley: 'Voleio',
  bandeja: 'Bandeja', smash: 'Smash', defense: 'Defesa', agility: 'Agilidade',
  strategy: 'Estratégia', emotional_control: 'Controle emocional',
};

const SCORE_CURVE = [15, 14, 13, 12, 11, 11, 10, 10, 10, 9];
const labels = { controlador: 'Controlador', pressionador: 'Pressionador', defensor: 'Defensor', coringa: 'Coringa', construtor: 'Construtor', finalizador: 'Finalizador' };

function adjust(attributes, from, to, amount = 1) {
  if (attributes[from] - amount < 8 || attributes[to] + amount > 16) return;
  attributes[from] -= amount; attributes[to] += amount;
}

export function evaluateBuildAffinity({ handedness = 'right', preferredSide = 'direita', playStyle = 'equilibrado' } = {}) {
  let score = 72;
  const strengths = [];
  const challenges = [];
  if (preferredSide === 'versatil') { score += 5; strengths.push('adaptação aos dois lados'); challenges.push('exige leitura tática ampla'); }
  if (preferredSide === 'direita' && ['controle', 'construtor', 'defensivo'].includes(playStyle)) { score += 10; strengths.push('boa participação na construção'); }
  if (preferredSide === 'esquerda' && ['ofensivo', 'finalizador'].includes(playStyle)) { score += 10; strengths.push('presença natural nas definições'); }
  if (handedness === 'left' && preferredSide === 'direita' && ['ofensivo', 'finalizador'].includes(playStyle)) { score += 14; strengths.push('ângulos ofensivos pelo centro'); challenges.push('maior exigência de posicionamento'); }
  if (handedness === 'right' && preferredSide === 'direita' && ['ofensivo', 'finalizador'].includes(playStyle)) { score -= 5; strengths.push('pressão ofensiva pouco convencional'); challenges.push('requer movimentação e seleção de bola'); }
  if (preferredSide === 'esquerda' && ['controle', 'defensivo', 'construtor'].includes(playStyle)) { score -= 3; strengths.push('variação tática no lado esquerdo'); challenges.push('a dupla precisa compartilhar as definições'); }
  score = Math.max(55, Math.min(98, score));
  const level = score >= 90 ? 'Excelente' : score >= 82 ? 'Muito boa' : score >= 72 ? 'Boa' : score >= 62 ? 'Exigente' : 'Especializada';
  return { score, level, strengths, challenges, recommendations: STYLE_DEFINITIONS[playStyle]?.strengths || [] };
}

export function buildInitialProfile({ handedness = 'right', preferredSide = 'direita', playStyle = 'equilibrado' } = {}) {
  const style = STYLE_DEFINITIONS[playStyle];
  if (!['right', 'left'].includes(handedness) || !COURT_SIDE_OPTIONS.some(side => side.id === preferredSide) || !style) throw new Error('Combinação inicial inválida.');
  const attributes = Object.fromEntries(style.order.map((key, index) => [key, SCORE_CURVE[index]]));
  if (handedness === 'left' && preferredSide === 'direita' && ['ofensivo', 'finalizador'].includes(playStyle)) adjust(attributes, 'emotional_control', 'smash');
  if (preferredSide === 'versatil') adjust(attributes, style.strengths[0], 'strategy');
  const affinity = evaluateBuildAffinity({ handedness, preferredSide, playStyle });
  const special = handedness === 'left' && preferredSide === 'direita' && ['ofensivo', 'finalizador'].includes(playStyle);
  const archetypeLabel = special ? 'Finalizador canhoto de direita' : `${labels[style.role]} ${preferredSide === 'versatil' ? 'versátil' : `de ${preferredSide}`}`;
  return {
    id: `${preferredSide}-${handedness}-${playStyle}`,
    handedness, preferred_side: preferredSide, play_style: playStyle,
    tactical_role: style.role, archetype_id: `${preferredSide}-${handedness}-${style.role}`,
    archetype_label: archetypeLabel, difficulty: style.difficulty, description: style.description,
    strengths: style.strengths, weaknesses: style.weaknesses,
    recommended_attributes: style.strengths, affinity, attributes,
  };
}

export function buildInitialAttributes(side, style, handedness = 'right') {
  return buildInitialProfile({ handedness, preferredSide: side, playStyle: style }).attributes;
}

export function calculateInitialProfileBudget(profile) {
  const attributes = profile?.attributes || profile || {};
  return INITIAL_ATTRIBUTE_KEYS.reduce((sum, key) => sum + Number(attributes[key] || 0), 0);
}

export function validatePlayerBuildProfile(profile) {
  const errors = [];
  if (!profile?.id || !profile?.archetype_id) errors.push('arquétipo ausente');
  if (!['right', 'left'].includes(profile?.handedness)) errors.push('mão dominante inválida');
  if (!COURT_SIDE_OPTIONS.some(side => side.id === profile?.preferred_side)) errors.push('lado inválido');
  if (!STYLE_DEFINITIONS[profile?.play_style]) errors.push('estilo inválido');
  if (!profile?.strengths?.length) errors.push('perfil sem pontos fortes');
  if (!profile?.weaknesses?.length) errors.push('perfil sem fraquezas');
  if (INITIAL_ATTRIBUTE_KEYS.some(key => !Number.isFinite(profile?.attributes?.[key]) || profile.attributes[key] < 1 || profile.attributes[key] > 100)) errors.push('atributo fora da escala');
  if (calculateInitialProfileBudget(profile) !== INITIAL_PROFILE_BUDGET) errors.push('orçamento inicial desequilibrado');
  return { valid: errors.length === 0, errors };
}
