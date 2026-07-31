import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gamepad2, Swords, Trophy, TrendingUp, User } from 'lucide-react';

const navItems = [
  { to: '/game', icon: Gamepad2, label: 'Carreira' },
  { to: '/matches', icon: Swords, label: 'Partidas' },
  { to: '/tournaments', icon: Trophy, label: 'Torneios' },
  { to: '/ranking', icon: TrendingUp, label: 'Ranking' },
  { to: '/profile', icon: User, label: 'Perfil' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden glass border-t border-border/60">
      <div className="flex items-center justify-around px-1 py-1.5 max-w-md mx-auto">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="relative">
            {({ isActive }) => (
              <div className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {isActive && (
                  <motion.div
                    layoutId="bottomNavPill"
                    className="absolute inset-0 bg-primary/15 rounded-lg"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon
                  className={`relative h-5 w-5 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="relative text-[10px] font-medium leading-none">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}