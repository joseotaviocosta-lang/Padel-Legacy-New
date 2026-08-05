import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Dumbbell, Handshake, Trophy, Globe2 } from 'lucide-react';

const navItems = [
  { to: '/game', icon: Home, label: 'Carreira' },
  { to: '/development', icon: Dumbbell, label: 'Evoluir' },
  { to: '/team-hub', icon: Handshake, label: 'Dupla' },
  { to: '/competitions', icon: Trophy, label: 'Competir' },
  { to: '/world', icon: Globe2, label: 'Mundo' },
];

export default function BottomNav() {
  return (
    <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-50 border-t border-primary/10 bg-card/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_hsl(230_35%_2%/0.48)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[4.35rem] max-w-lg grid-cols-5 items-center px-1.5">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="relative flex h-full items-center justify-center">
            {({ isActive }) => (
              <div className={`relative flex min-w-[3.6rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}>
                {isActive && (
                  <motion.div
                    layoutId="bottomNavPill"
                    className="absolute inset-x-1 inset-y-1 rounded-2xl border border-primary/10 bg-primary/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <item.icon className={`relative h-5 w-5 transition-transform duration-200 ${isActive ? '-translate-y-0.5 scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`relative text-[9px] font-bold leading-none ${isActive ? 'opacity-100' : 'opacity-80'}`}>{item.label}</span>
                {isActive && <span className="absolute bottom-0.5 h-0.5 w-4 rounded-full bg-primary" />}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
