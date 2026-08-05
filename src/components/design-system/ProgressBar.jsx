import React from 'react';
import { cn } from '@/lib/utils';

export function ProgressBar({ value = 0, max = 100, label, valueLabel, tone = 'brand', size = 'default', className }) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeMax = Math.max(1, Number(max) || 100);
  const percent = Math.min(100, Math.max(0, (safeValue / safeMax) * 100));
  return (
    <div className={cn('min-w-0', className)}>
      {(label || valueLabel) && <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-muted-foreground">{label}</span><strong className="shrink-0 text-foreground">{valueLabel ?? `${Math.round(percent)}%`}</strong></div>}
      <div className={cn('overflow-hidden rounded-full bg-secondary/85 ring-1 ring-inset ring-border/50', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2')}>
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', `pl-progress-${tone}`)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
