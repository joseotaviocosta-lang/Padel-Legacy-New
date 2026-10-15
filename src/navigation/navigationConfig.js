import { Award, BarChart3, BookOpen, Cog, Crown, Dumbbell, Globe, GraduationCap, Handshake, Heart, Home, MoreHorizontal, Newspaper, Target, TrendingUp, Trophy, User, UserCog, Wallet } from 'lucide-react';
import { APP_ROUTES } from './routes.js';

/**
 * Fonte única da navegação do shell (Fase 3 — docs/NAVIGATION_ARCHITECTURE.md).
 * Substitui a antiga NAVIGATION_AREAS (6 macroáreas com paridade quebrada
 * entre sidebar desktop e BottomNav mobile — ver docs/UI_UX_AUDIT.md seção 3).
 *
 * Nenhuma rota nova foi criada para esta reorganização: os grupos "Carreira"
 * e "Mais" combinam itens que já existiam em outras áreas, sem depender de
 * telas próprias. As páginas de hub antigas (`/development`, `/team-hub`)
 * continuam existindo e funcionando — o tutorial (Onboarding 2.0, ver
 * src/onboarding/tutorialSteps.js) não as visita mais desde a v9, mas elas
 * seguem acessíveis pela navegação normal; só deixam de ser o alvo direto do
 * link de topo do grupo. `aliases` garante que o estado ativo do shell ainda
 * as reconhece como parte do grupo "Carreira" quando visitadas diretamente.
 */
export const NAV_GROUPS = [
  {
    id: 'home',
    label: 'Início',
    description: 'Centro da carreira.',
    to: '/game',
    icon: Home,
    items: [],
  },
  {
    id: 'career',
    label: 'Carreira',
    description: 'Atleta, treinos, dupla e equipe.',
    to: '/development',
    aliases: ['/team-hub', '/profile', '/character', '/coaches', '/staff', '/relationships', '/fans', '/game/inventory', '/game/shop', '/training-center', APP_ROUTES.TRAINING_CENTER],
    icon: Dumbbell,
    items: [
      { to: APP_ROUTES.CAREER_ATHLETE, icon: User, label: 'Meu atleta' },
      { to: '/game/missions', icon: Target, label: 'Objetivos' },
      { to: APP_ROUTES.CAREER_TRAINING, icon: Dumbbell, label: 'Treinos e equipamentos' },
      { to: '/partners', icon: Handshake, label: 'Minha dupla' },
      { to: APP_ROUTES.CAREER_TEAM, icon: GraduationCap, label: 'Equipe' },
      { to: APP_ROUTES.CAREER_RELATIONS, icon: Heart, label: 'Relações' },
    ],
  },
  {
    id: 'competition',
    label: 'Competir',
    description: 'Torneios e ranking.',
    to: '/competitions',
    aliases: ['/game/calendar', '/game/season', '/matches'],
    icon: Trophy,
    items: [
      { to: '/tournaments', icon: Award, label: 'Torneios' },
      { to: '/ranking', icon: Trophy, label: 'Ranking' },
    ],
  },
  {
    id: 'world',
    label: 'Mundo',
    description: 'O circuito, seus atletas e clubes.',
    to: '/world',
    aliases: ['/journal', '/world-events', '/press', '/community', '/athletes', '/clubs', '/weather'],
    icon: Globe,
    items: [
      { to: APP_ROUTES.WORLD_CIRCUIT, icon: Newspaper, label: 'Central do circuito' },
      { to: APP_ROUTES.WORLD_DIRECTORY, icon: UserCog, label: 'Atletas e clubes' },
    ],
  },
  {
    id: 'management',
    label: 'Gestão',
    description: 'Finanças e mercado.',
    to: '/management',
    icon: Wallet,
    items: [
      { to: '/game/economy', icon: Wallet, label: 'Finanças' },
      { to: '/world-market', icon: TrendingUp, label: 'Mercado' },
    ],
  },
  {
    id: 'more',
    label: 'Mais',
    // Sem rota própria — no desktop expande inline na sidebar, no mobile abre
    // um BottomSheet (ver BottomNav.jsx).
    description: 'Estatísticas, legado e utilidades.',
    to: null,
    aliases: ['/history', '/hall-of-fame', '/communications'],
    icon: MoreHorizontal,
    items: [
      { to: '/game/stats', icon: BarChart3, label: 'Estatísticas' },
      { to: '/game/legacy', icon: Crown, label: 'Legado' },
      { to: '/encyclopedia', icon: BookOpen, label: 'Enciclopédia' },
      { to: '/settings', icon: Cog, label: 'Configurações' },
    ],
  },
];
export const ALL_SHELL_ITEMS = NAV_GROUPS.flatMap((group) => [
  ...(group.to ? [{ to: group.to, label: group.label, icon: group.icon }] : []),
  ...group.items,
]);

export const groupForPath = (pathname) => NAV_GROUPS.find((group) => (
  pathname === group.to
  || group.aliases?.includes(pathname)
  || group.items.some((item) => pathname === item.to || (item.to !== '/game' && pathname.startsWith(`${item.to}/`)))
));

// Mapa usado só pelas 4 rotas de hub legadas (App.jsx passa `areaId`
// inalterado — nenhuma rota foi renomeada nesta fase). Traduz o identificador
// histórico da rota para o grupo correspondente na nova arquitetura.
export const LEGACY_AREA_TO_GROUP = {
  development: 'career',
  team: 'career',
  competition: 'competition',
  management: 'management',
};
