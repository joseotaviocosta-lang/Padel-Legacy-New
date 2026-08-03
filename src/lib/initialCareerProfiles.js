export const INITIAL_ATTRIBUTE_KEYS = [
  'serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash',
  'defense', 'agility', 'strategy', 'emotional_control',
];

export const CAREER_STYLE_PROFILES = {
  direita: {
    controle: {
      label: 'Controle',
      description: 'Constrói os pontos com precisão, leitura tática e regularidade.',
      strengths: ['forehand', 'strategy', 'emotional_control'],
    },
    defensivo: {
      label: 'Defensivo',
      description: 'Resiste sob pressão, recupera bolas difíceis e reduz erros.',
      strengths: ['defense', 'agility', 'emotional_control'],
    },
  },
  esquerda: {
    agressivo: {
      label: 'Agressivo',
      description: 'Pressiona, acelera o jogo e procura definir os pontos.',
      strengths: ['smash', 'volley', 'forehand'],
    },
    tecnico: {
      label: 'Ofensivo técnico',
      description: 'Ataca com variedade, precisão e domínio das bolas aéreas.',
      strengths: ['volley', 'bandeja', 'strategy'],
    },
  },
};

export const ATTRIBUTE_LABELS = {
  serve: 'Saque', forehand: 'Direita', backhand: 'Esquerda', volley: 'Voleio',
  bandeja: 'Bandeja', smash: 'Smash', defense: 'Defesa', agility: 'Agilidade',
  strategy: 'Estratégia', emotional_control: 'Controle emocional',
};

export function buildInitialAttributes(side, style) {
  const profile = CAREER_STYLE_PROFILES[side]?.[style];
  if (!profile) throw new Error('Perfil inicial inválido.');
  return Object.fromEntries(INITIAL_ATTRIBUTE_KEYS.map((key) => [key, profile.strengths.includes(key) ? 15 : 10]));
}
