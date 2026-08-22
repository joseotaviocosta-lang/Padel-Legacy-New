import { Award, BarChart3, BookOpen, Building2, Calendar, CloudSun, Cog, Crown, Database, Dumbbell, Globe, GraduationCap, Handshake, Heart, History, Home, Inbox, LayoutDashboard, MessageCircle, Mic, MoreHorizontal, Newspaper, Package, Palette, ShoppingBag, Target, TrendingUp, Trophy, User, UserCog, Users, Wallet } from 'lucide-react';
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
    description: 'Atleta, treinos, equipe e equipamentos.',
    to: '/development',
    aliases: ['/team-hub'],
    icon: Dumbbell,
    items: [
      { to: '/profile', icon: User, label: 'Atleta' },
      { to: '/character', icon: Palette, label: 'Aparência' },
      { to: '/game/missions', icon: Target, label: 'Objetivos' },
      { to: APP_ROUTES.TRAINING_CENTER, icon: Building2, label: 'Centro de treinamento' },
      { to: '/game/inventory', icon: Package, label: 'Equipamentos' },
      { to: '/game/shop', icon: ShoppingBag, label: 'Loja' },
      { to: '/partners', icon: Handshake, label: 'Minha dupla e propostas' },
      { to: '/coaches', icon: GraduationCap, label: 'Treinador principal' },
      { to: '/staff', icon: Users, label: 'Comissão técnica' },
      { to: '/relationships', icon: Heart, label: 'Relacionamentos' },
      { to: '/fans', icon: Users, label: 'Fãs e torcidas' },
    ],
  },
  {
    id: 'competition',
    label: 'Competir',
    description: 'Torneios, calendário, ranking e partidas.',
    to: '/competitions',
    icon: Trophy,
    items: [
      { to: '/tournaments', icon: Award, label: 'Torneios' },
      { to: '/game/calendar', icon: Calendar, label: 'Calendário' },
      { to: '/ranking', icon: Trophy, label: 'Ranking' },
      { to: '/game/season', icon: BarChart3, label: 'Temporada' },
    ],
  },
  {
    id: 'world',
    label: 'Mundo',
    description: 'Notícias, comunidade, imprensa e o circuito ao vivo.',
    to: '/world',
    icon: Globe,
    items: [
      { to: '/journal', icon: Newspaper, label: 'Notícias' },
      { to: '/world-events', icon: Globe, label: 'Eventos mundiais' },
      { to: '/press', icon: Mic, label: 'Imprensa' },
      { to: '/community', icon: MessageCircle, label: 'Comunidade e rede' },
      { to: '/athletes', icon: UserCog, label: 'Atletas' },
      { to: '/clubs', icon: Users, label: 'Clubes' },
      { to: '/weather', icon: CloudSun, label: 'Clima' },
    ],
  },
  {
    id: 'management',
    label: 'Gestão',
    description: 'Economia, mercado e administração da carreira.',
    to: '/management',
    icon: Wallet,
    items: [
      { to: '/game/economy', icon: Wallet, label: 'Economia' },
      { to: '/world-market', icon: TrendingUp, label: 'Mercado mundial' },
      { to: '/admin', icon: LayoutDashboard, label: 'Administração' },
      { to: '/database', icon: Database, label: 'Banco de dados' },
    ],
  },
  {
    id: 'more',
    label: 'Mais',
    description: 'Estatísticas, histórico e utilidades da carreira.',
    // Sem rota própria — no desktop expande inline na sidebar, no mobile
    // abre um BottomSheet (ver BottomNav.jsx). Nenhuma dessas páginas
    // depende de um hub dedicado para funcionar.
    to: null,
    icon: MoreHorizontal,
    items: [
      { to: '/game/stats', icon: BarChart3, label: 'Estatísticas' },
      { to: '/game/legacy', icon: Crown, label: 'Legado' },
      { to: '/communications', icon: Inbox, label: 'Notificações' },
      { to: '/history', icon: History, label: 'História do padel' },
      { to: '/hall-of-fame', icon: Crown, label: 'Hall da fama' },
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
