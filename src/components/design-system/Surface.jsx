import React from 'react';
import { cn } from '@/lib/utils';

const variants = {
  default: 'pl-surface',
  elevated: 'pl-surface pl-surface-elevated',
  subtle: 'pl-surface-subtle',
  interactive: 'pl-surface pl-surface-interactive',
  premium: 'pl-surface pl-surface-premium',
};

/** @typedef {{ variant?: keyof typeof variants, padding?: 'none' | 'compact' | 'default' | 'spacious' } & React.HTMLAttributes<HTMLDivElement>} SurfaceProps */
/** @type {React.ForwardRefExoticComponent<SurfaceProps & React.RefAttributes<HTMLDivElement>>} */
export const Surface = React.forwardRef(({ className, variant = 'default', padding = 'default', children, ...props }, ref) => {
  const paddings = { none: '', compact: 'p-3', default: 'p-4 sm:p-5', spacious: 'p-5 sm:p-6' };
  return <div ref={ref} data-surface className={cn('pl-surface-motion min-w-0 rounded-2xl border', variants[variant] || variants.default, paddings[padding], className)} {...props}>{children}</div>;
});
Surface.displayName = 'Surface';

export function SurfaceHeader({ title, description, action, icon: Icon, className, compact = false }) {
  return (
    <div className={cn('mb-4 flex min-w-0 items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>}
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold tracking-tight sm:text-lg">{title}</h2>
          {description && <p className={cn('pl-surface-description mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm', compact && 'pl-surface-description--compact')}>{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
