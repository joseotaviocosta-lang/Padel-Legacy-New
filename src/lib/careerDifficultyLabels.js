// Textos e metadados de apresentação da dificuldade de carreira, em
// linguagem simples (sem multiplicadores técnicos) para a UI de criação de
// carreira e para o perfil do jogador. Fonte única para não espalhar textos
// duplicados entre a tela de onboarding e o perfil.
import { ALLOWED_CAREER_DIFFICULTIES, DEFAULT_NEW_CAREER_DIFFICULTY } from '@/gameplay/difficulty/difficultyConfig.js';

export { ALLOWED_CAREER_DIFFICULTIES, DEFAULT_NEW_CAREER_DIFFICULTY };

export const CAREER_DIFFICULTY_OPTIONS = [
  {
    id: 'easy',
    label: 'Fácil',
    tagline: 'Progressão rápida e acessível.',
    recommended: false,
    expectedPeakSeasons: { min: 2, max: 4 },
    bullets: [
      'Evolução técnica bem mais rápida',
      'Recuperação e fadiga mais favoráveis',
      'Economia e equipe técnica mais acessíveis',
    ],
    detail: 'Recomendado para conhecer o jogo e testar sistemas sem precisar de dezenas de horas.',
  },
  {
    id: 'normal',
    label: 'Médio',
    tagline: 'Experiência equilibrada.',
    recommended: true,
    expectedPeakSeasons: { min: 5, max: 7 },
    bullets: [
      'Evolução progressiva e recompensadora',
      'Ritmo sem pressa excessiva nem grind prolongado',
      'Equilíbrio entre desafio e acessibilidade',
    ],
    detail: 'Recomendado para a maioria dos jogadores — a experiência padrão do Padel Legacy.',
  },
  {
    id: 'hard',
    label: 'Difícil',
    tagline: 'Progressão longa e exigente.',
    recommended: false,
    expectedPeakSeasons: { min: 8, max: 10 },
    bullets: [
      'Evolução técnica no ritmo tradicional',
      'Recuperação, fadiga e lesões no padrão original',
      'Economia e equipe técnica exigem mais planejamento',
    ],
    detail: 'Experiência mais próxima do balanceamento original do jogo.',
  },
];

export function getCareerDifficultyOption(id) {
  return CAREER_DIFFICULTY_OPTIONS.find(option => option.id === id) || null;
}

export function formatExpectedPeakSeasons(id) {
  const option = getCareerDifficultyOption(id);
  if (!option) return '';
  const { min, max } = option.expectedPeakSeasons;
  return `Auge esperado: ${min}–${max} temporadas`;
}
