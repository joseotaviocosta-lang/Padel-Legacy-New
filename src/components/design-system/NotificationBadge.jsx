import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Contador flutuante para ícones (sino de comunicações, atalhos, abas).
 * Consolida o padrão hoje hardcoded em CommunicationBell.jsx
 * (`absolute -right-1 -top-1 ... rounded-full bg-primary`).
 */
export function NotificationBadge({ count, max = 99, tone = 'brand', className }) {
  const value = Number(count) || 0;
  if (value <= 0) return null;
  const tones = {
    brand: 'bg-primary text-primary-foreground',
    danger: 'bg-destructive text-destructive-foreground',
    premium: 'bg-premium text-premium-foreground',
  };
  return (
    <span
      className={cn(
        'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-black',
        tones[tone] || tones.brand,
        className,
      )}
    >
      {value > max ? `${max}+` : value}
    </span>
  );
}
