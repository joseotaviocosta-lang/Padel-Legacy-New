import React from 'react';
import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { careerExperienceSummary } from '@/lib/padel';

export const RARITY_STYLES = {
  comum: { badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', card: 'from-slate-500/10 to-transparent', label: 'Comum' },
  raro: { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30', card: 'from-blue-500/10 to-transparent', label: 'Raro' },
  epico: { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', card: 'from-purple-500/10 to-transparent', label: 'Épico' },
  lendario: { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', card: 'from-amber-500/10 to-transparent', label: 'Lendário' },
};

export function RarityBadge({ rarity }) {
  const r = RARITY_STYLES[rarity] || RARITY_STYLES.comum;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${r.badge}`}>{r.label}</span>;
}

export function CoinBadge({ coins, size = 'sm' }) {
  const sizes = { sm: 'text-xs px-2.5 py-1', md: 'text-sm px-3 py-1.5' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-yellow-500/15 text-yellow-400 font-bold ${sizes[size]}`}>
      <Coins className="h-3.5 w-3.5" />
      {Number(coins || 0).toLocaleString('pt-BR')}
    </span>
  );
}

export function ProgressBar({ value, max, className = '', barClassName = '' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2 rounded-full bg-secondary overflow-hidden ${className}`}>
      <div className={`h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ${barClassName}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function XpBar({ xp }) {
  const experience = careerExperienceSummary(xp || 0);
  return (
    <div className="w-full">
      <div className="flex justify-between items-baseline mb-1 gap-3">
        <span className="text-xs font-bold text-primary">Experiência de carreira · Nível {experience.level}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {experience.isMax ? 'Nível máximo' : `${experience.xp.toLocaleString('pt-BR')} / ${experience.nextXp.toLocaleString('pt-BR')} XP`}
        </span>
      </div>
      <ProgressBar value={experience.progress} max={100} />
      <p className="mt-1 text-[9px] text-muted-foreground">{experience.title} · A força em quadra é definida pelos atributos e pelo Overall.</p>
    </div>
  );
}

export function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="glass rounded-2xl p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted-foreground/40" />}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function QuickLink({ to, icon: Icon, title, subtitle, accent = 'primary' }) {
  const accents = {
    primary: 'bg-primary/15 text-primary',
    amber: 'bg-amber-500/15 text-amber-400',
    cyan: 'bg-cyan-500/15 text-cyan-400',
    purple: 'bg-purple-500/15 text-purple-400',
  };
  return (
    <Link to={to} className="glass glass-hover rounded-2xl p-4 flex items-center gap-3 group">
      <div className={`h-10 w-10 rounded-xl ${accents[accent]} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
    </Link>
  );
}