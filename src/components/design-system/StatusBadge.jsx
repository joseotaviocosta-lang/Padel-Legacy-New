import React from 'react';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'border-border/70 bg-secondary/70 text-muted-foreground',
  brand: 'border-primary/20 bg-primary/10 text-primary',
  info: 'border-info/20 bg-info/10 text-info',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
  premium: 'border-premium/25 bg-premium/10 text-premium',
};

export function StatusBadge({ children, tone = 'neutral', icon: Icon, className, ...props }) {
  return <span className={cn('inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em]', tones[tone] || tones.neutral, className)} {...props}>{Icon && <Icon className="h-3 w-3 shrink-0" />}<span className="truncate">{children}</span></span>;
}
