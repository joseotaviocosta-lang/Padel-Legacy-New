import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { AnimatedNumber, ChangePulse } from './Motion';

export function StatCard({ label, value, detail, icon: Icon, trend, tone = 'brand', className, animateValue = false, valueFormatter }) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  return (
    <div className={cn('pl-stat-card min-w-0 rounded-2xl border p-3.5 sm:p-4', `pl-tone-${tone}`, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-black tracking-[-0.035em] sm:text-2xl"><ChangePulse value={value} tone={tone}>{animateValue && Number.isFinite(Number(value)) ? <AnimatedNumber value={Number(value)} formatter={valueFormatter} /> : value}</ChangePulse></p>
        </div>
        {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-current/10 text-primary"><Icon className="h-4.5 w-4.5" /></span>}
      </div>
      <div className="mt-2 flex min-h-4 items-center gap-2 text-[11px]">
        {trend && <span className={cn('inline-flex items-center gap-1 font-bold', trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-destructive' : 'text-muted-foreground')}><TrendIcon className="h-3 w-3" />{trend.label}</span>}
        {detail && <span className="truncate text-muted-foreground">{detail}</span>}
      </div>
    </div>
  );
}
