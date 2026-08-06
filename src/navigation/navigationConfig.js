import { Activity, Award, BarChart3, BookOpen, Building2, Calendar, CloudSun, Crown, Database, Dumbbell, Gamepad2, Globe, GraduationCap, Handshake, Heart, History, Inbox, LayoutDashboard, Medal, MessageCircle, Mic, Newspaper, Package, Palette, Radio, ShoppingBag, Sparkles, Swords, Target, TrendingUp, Trophy, User, UserCog, Users, Wallet } from 'lucide-react';

export const NAVIGATION_AREAS = [
  { id: 'career', label: 'Início', description: 'Resumo, identidade e progresso da carreira.', to: '/game', icon: Gamepad2, items: [
    { to: '/communications', icon: Inbox, label: 'Comunicações' }, { to: '/profile', icon: User, label: 'Perfil do atleta' }, { to: '/game/missions', icon: Target, label: 'Objetivos e missões' }, { to: '/character', icon: Palette, label: 'Aparência' }, { to: '/achievements', icon: Medal, label: 'Conquistas' }, { to: '/game/stats', icon: BarChart3, label: 'Estatísticas' }, { to: '/game/legacy', icon: Crown, label: 'Legado' },
  ]},
  { id: 'development', label: 'Desenvolvimento', description: 'Treino, recuperação, equipe e equipamentos.', to: '/development', icon: Dumbbell, items: [
    { to: '/game/training', icon: Dumbbell, label: 'Treinos' }, { to: '/training-center', icon: Building2, label: 'Centro de treinamento' }, { to: '/game/inventory', icon: Package, label: 'Equipamentos' }, { to: '/game/shop', icon: ShoppingBag, label: 'Loja' },
  ]},
  { id: 'team', label: 'Dupla e relações', description: 'Parceiros, propostas, contratos e reputação.', to: '/team-hub', icon: Handshake, items: [
    { to: '/partners', icon: Handshake, label: 'Minha dupla e propostas' }, { to: '/coaches', icon: GraduationCap, label: 'Treinador principal' }, { to: '/staff', icon: Users, label: 'Comissão técnica' }, { to: '/relationships', icon: Heart, label: 'Relacionamentos' }, { to: '/press', icon: Mic, label: 'Imprensa' }, { to: '/fans', icon: Users, label: 'Fãs e torcidas' },
  ]},
  { id: 'competition', label: 'Competições', description: 'Agenda competitiva, jogos, resultados e ranking.', to: '/competitions', icon: Trophy, items: [
    { to: '/tournaments', icon: Award, label: 'Torneios' }, { to: '/game/calendar', icon: Calendar, label: 'Calendário' }, { to: '/matches', icon: Swords, label: 'Partidas' }, { to: '/ranking', icon: Trophy, label: 'Ranking' }, { to: '/game/season', icon: BarChart3, label: 'Temporada' }, { to: '/world-tour/live', icon: Radio, label: 'Circuito ao vivo' },
  ]},
  { id: 'world', label: 'Mundo', description: 'Circuito, notícias, atletas e comunidade.', to: '/world', icon: Globe, items: [
    { to: '/journal', icon: Newspaper, label: 'Notícias' }, { to: '/world-events', icon: Globe, label: 'Eventos mundiais' }, { to: '/world-market', icon: TrendingUp, label: 'Mercado mundial' }, { to: '/weather', icon: CloudSun, label: 'Clima' }, { to: '/athletes', icon: UserCog, label: 'Atletas' }, { to: '/clubs', icon: Users, label: 'Clubes' }, { to: '/community', icon: MessageCircle, label: 'Comunidade' }, { to: '/social', icon: Sparkles, label: 'Rede social' }, { to: '/encyclopedia', icon: BookOpen, label: 'Enciclopédia' }, { to: '/history', icon: History, label: 'História do padel' }, { to: '/hall-of-fame', icon: Crown, label: 'Hall da fama' },
  ]},
  { id: 'management', label: 'Gestão', description: 'Finanças e ferramentas avançadas.', to: '/management', icon: Wallet, items: [
    { to: '/game/economy', icon: Wallet, label: 'Economia' }, { to: '/admin', icon: LayoutDashboard, label: 'Administração' }, { to: '/database', icon: Database, label: 'Banco de dados' },
  ]},
];

export const ALL_NAVIGATION_ITEMS = NAVIGATION_AREAS.flatMap(area => [{ to: area.to, label: area.label, icon: area.icon }, ...area.items]);
export const areaForPath = pathname => NAVIGATION_AREAS.find(area => pathname === area.to || area.items.some(item => pathname === item.to || (item.to !== '/game' && pathname.startsWith(`${item.to}/`))));
