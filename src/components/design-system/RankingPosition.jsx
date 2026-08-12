import React from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Posição de ranking + variação (auditoria UI/UX, seção 13). Consolida o
 * cálculo/renderização de "sobe/desce/estável" que hoje se repete em
 * Ranking.jsx para cada lista (circuito, race, duplas, clubes, países).
 */
export function RankingPosition({ position, movement = 0, size = 'default', className }) {
  const direction = movement > 0 ? 'up' : movement < 0 ? 'down' : 'stable';
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const tone = direction === 'up' ? 'text-success' : direction === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('w-8 shrink-0 text-center font-black tabular-nums', size === 'lg' ? 'text-2xl' : 'text-lg', position === 1 ? 'text-premium' : 'text-muted-foreground/60')}>
        {position}
      </span>
      <span className={cn('inline-flex items-center gap-0.5 text-[9px] font-bold uppercase', tone)}>
        <Icon className="h-3 w-3" />
        {direction === 'stable' ? 'estável' : `${Math.abs(movement)} pos.`}
      </span>
    </div>
  );
}
