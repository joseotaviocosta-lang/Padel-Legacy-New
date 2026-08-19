import React from 'react';
import { cn } from '@/lib/utils';
import { Surface } from './Surface';

const TONE_TEXT = {
  brand: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-info',
  premium: 'text-premium',
  neutral: 'text-foreground',
};

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md): substitui a grade de 4-6
 * StatCards grandes (que sozinha já ocupa 2-3 telas de altura em mobile)
 * por uma única linha compacta de indicadores — mesmo padrão já provado em
 * Coaches.jsx antes desta fase (Surface + flex-wrap de spans com ícone).
 * Extraído aqui para reuso em vez de deixar cada página reinventar a
 * própria versão.
 */
export function CompactStats({ items, className }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <Surface padding="compact" className={cn('flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs', className)}>
      {list.map((item, index) => {
        const Icon = item.icon;
        return (
          <span key={item.id || item.label || index} className="flex items-center gap-1.5 font-bold">
            {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', TONE_TEXT[item.tone] || 'text-primary')} />}
            <span className={cn(TONE_TEXT[item.tone] || 'text-foreground')}>{item.value}</span>
            <span className="text-muted-foreground font-semibold">{item.label}</span>
          </span>
        );
      })}
    </Surface>
  );
}
