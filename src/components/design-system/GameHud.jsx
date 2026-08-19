import React from 'react';
import { cn } from '@/lib/utils';

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
 * M4.1 — HUD local sem card próprio. Agrupa estado curto no mesmo contexto
 * do título/ação, usando separadores em vez de uma grade de caixas.
 */
export function GameHud({ items = [], label = 'Status atual', className = '' }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;

  return (
    <div data-game-hud className={cn('pl-game-hud', className)} role="group" aria-label={label}>
      {list.map((item, index) => {
        const Icon = item.icon;
        return (
          <span key={item.id || item.label || index} className="pl-game-hud-item">
            {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', TONE_TEXT[item.tone] || 'text-primary')} aria-hidden="true" />}
            <strong className={cn('whitespace-nowrap tabular-nums', TONE_TEXT[item.tone] || 'text-foreground')}>{item.value}</strong>
            {item.label && <span className="whitespace-nowrap text-muted-foreground">{item.label}</span>}
          </span>
        );
      })}
    </div>
  );
}
