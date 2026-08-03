import { careerManager } from '@/local/careerDataStore.js';
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {  Gamepad2, Dumbbell, Swords, Trophy, Target, MessageCircle, User, ShoppingBag, Package, Award, Newspaper, Users, Calendar, Crown, BarChart3, Wallet, UserCog, Palette, LayoutDashboard, Database, ScrollText, Star, Heart, Handshake, GraduationCap, Building2, Mic, Sparkles, Megaphone, Medal, Globe, CloudSun, BookOpen, TrendingUp } from 'lucide-react';
import BottomNav from './BottomNav';
import LogoutButton from './LogoutButton';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_GROUPS = [
  {
    label: 'Carreira',
    items: [
      { to: '/game', icon: Gamepad2, label: 'Carreira' },
      { to: '/game/training', icon: Dumbbell, label: 'Treinamento' },
      { to: '/training-center', icon: Building2, label: 'Centro de Treinamento' },
      { to: '/game/missions', icon: Target, label: 'Missões' },
      { to: '/achievements', icon: Medal, label: 'Conquistas' },
      { to: '/world-events', icon: Globe, label: 'Eventos Mundiais' },
      { to: '/world-market', icon: TrendingUp, label: 'Mercado Mundial' },
      { to: '/weather', icon: CloudSun, label: 'Clima' },
      { to: '/encyclopedia', icon: BookOpen, label: 'Enciclopédia' },
      { to: '/game/calendar', icon: Calendar, label: 'Calendário' },
      { to: '/game/season', icon: BarChart3, label: 'Temporada' },
      { to: '/game/legacy', icon: Crown, label: 'Legado' },
      { to: '/character', icon: Palette, label: 'Personagem' },
    ],
  },
  {
    label: 'Economia',
    items: [
      { to: '/game/economy', icon: Wallet, label: 'Economia' },
      { to: '/game/shop', icon: ShoppingBag, label: 'Loja' },
      { to: '/game/inventory', icon: Package, label: 'Inventário' },
    ],
  },
  {
    label: 'Competição',
    items: [
      { to: '/matches', icon: Swords, label: 'Partidas' },
      { to: '/tournaments', icon: Award, label: 'Torneios' },
      { to: '/ranking', icon: Trophy, label: 'Ranking' },
      { to: '/journal', icon: Newspaper, label: 'Jornal' },
      { to: '/press', icon: Mic, label: 'Imprensa' },
      { to: '/athletes', icon: UserCog, label: 'Atletas' },
      { to: '/game/stats', icon: BarChart3, label: 'Estatísticas' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Painel Admin' },
      { to: '/database', icon: Database, label: 'Banco de Dados' },
      { to: '/history', icon: ScrollText, label: 'História do Padel' },
      { to: '/hall-of-fame', icon: Star, label: 'Hall da Fama' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { to: '/partners', icon: Handshake, label: 'Parceiros' },
      { to: '/coaches', icon: GraduationCap, label: 'Treinadores' },
      { to: '/relationships', icon: Heart, label: 'Relacionamentos' },
      { to: '/community', icon: MessageCircle, label: 'Social' },
      { to: '/social', icon: Sparkles, label: 'Rede Social' },
      { to: '/fans', icon: Megaphone, label: 'Torcidas' },
      { to: '/clubs', icon: Users, label: 'Clubes' },
      { to: '/profile', icon: User, label: 'Perfil' },
    ],
  },
];

const PAGE_TITLES = {
  '/game': 'Carreira',
  '/game/training': 'Treinamento',
  '/game/missions': 'Missões',
  '/achievements': 'Conquistas',
  '/world-events': 'Eventos Mundiais',
  '/world-market': 'Mercado Mundial',
  '/weather': 'Clima',
  '/encyclopedia': 'Enciclopédia',
  '/partners': 'Parceiros',
  '/game/shop': 'Loja',
  '/game/inventory': 'Inventário',
  '/game/economy': 'Economia',
  '/game/calendar': 'Calendário',
  '/game/season': 'Temporada',
  '/game/legacy': 'Legado',
  '/character': 'Personagem',
  '/game/stats': 'Estatísticas',
  '/matches': 'Partidas',
  '/tournaments': 'Torneios',
  '/journal': 'Jornal',
  '/athletes': 'Atletas',
  '/ranking': 'Ranking',
  '/clubs': 'Clubes',
  '/community': 'Comunidade',
  '/relationships': 'Relacionamentos',
  '/coaches': 'Treinadores',
  '/press': 'Imprensa',
  '/social': 'Rede Social',
  '/fans': 'Torcidas',
  '/training-center': 'Centro de Treinamento',
  '/profile': 'Perfil',
  '/admin': 'Painel Admin',
  '/database': 'Banco de Dados',
  '/history': 'História',
  '/hall-of-fame': 'Hall da Fama',
};

export default function AppLayout() {
  const location = useLocation();
  const currentTitle = PAGE_TITLES[location.pathname] || 'Padel Legacy';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 glass border-b border-border/60 h-14 flex items-center justify-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/90 flex items-center justify-center">
            <span className="text-primary-foreground font-black text-sm">P</span>
          </div>
          <span className="font-bold text-sm">{currentTitle}</span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col glass border-r border-border/60 z-40">
        <div className="px-6 py-6 border-b border-border/40">
          <NavLink to="/game" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/90 flex items-center justify-center">
              <span className="text-primary-foreground font-black text-lg">P</span>
            </div>
            <div>
              <h1 className="font-heading font-black text-lg leading-none tracking-tight">PADEL</h1>
              <p className="text-primary font-bold text-[10px] tracking-[0.3em] leading-none mt-0.5">LEGACY</p>
            </div>
          </NavLink>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-none">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-3 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 font-medium text-sm ${
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:translate-x-0.5'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                    <span className="min-w-0 leading-tight">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-border/40 space-y-2">
          <LogoutButton variant="sidebar" />
          <p className="text-[10px] text-muted-foreground leading-relaxed px-3">
            “Criamos um universo onde cada jogador constrói seu legado.”
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:pl-64 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
            <button onClick={async () => { await careerManager.close(); window.location.href = '/'; }} className="fixed bottom-20 right-4 z-40 rounded-full border bg-card px-3 py-2 text-xs shadow-lg">Trocar carreira</button>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
