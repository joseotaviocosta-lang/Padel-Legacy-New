import React from 'react';
import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { careerExperienceSummary } from '@/lib/padel';
import { EmptyState as DSEmptyState, ProgressBar as DSProgressBar, Section } from '@/components/design-system';
import { cn } from '@/lib/utils';

/**
 * @deprecated parcial — ver docs/DESIGN_SYSTEM_V2.md. `ProgressBar`,
 * `SectionCard` e `EmptyState` abaixo agora são adapters sobre
 * `@/components/design-system`. `RarityBadge`/`CoinBadge` permanecem com
 * implementação própria (semântica específica do jogo — tiers de raridade e
 * moeda —, sem equivalente 1:1 no design-system), mas alinhados ao mesmo
 * formato visual de pílula do `StatusBadge` oficial. `XpBar` e `QuickLink`
 * não são duplicatas de nenhum componente oficial e ficam fora desta
 * consolidação.
 */

export const RARITY_STYLES = {
  comum: { badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', card: 'from-slate-500/10 to-transparent', label: 'Comum' },
  raro: { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30', card: 'from-blue-500/10 to-transparent', label: 'Raro' },
  epico: { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', card: 'from-purple-500/10 to-transparent', label: 'Épico' },
  lendario: { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', card: 'from-amber-500/10 to-transparent', label: 'Lendário' },
};

export function RarityBadge({ rarity }) {
  const r = RARITY_STYLES[rarity] || RARITY_STYLES.comum;
  return <span className={cn('inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em]', r.badge)}>{r.label}</span>;
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

/** @deprecated Prefira `ProgressBar` do design-system em código novo. */
export function ProgressBar({ value, max, className = '' }) {
  return <DSProgressBar value={value} max={max} tone="brand" className={className} />;
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
      <DSProgressBar value={experience.progress} max={100} tone="brand" />
      <p className="mt-1 text-[9px] text-muted-foreground">{experience.title} · A força em quadra é definida pelos atributos e pelo Overall.</p>
    </div>
  );
}

/** @deprecated Prefira `Section` do design-system em código novo. */
export function SectionCard({ title, icon, children, action }) {
  return <Section title={title} icon={icon} action={action}>{children}</Section>;
}

/** @deprecated Prefira `EmptyState` do design-system em código novo. */
export function EmptyState({ icon, message }) {
  return <DSEmptyState icon={icon} title={message} compact />;
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
