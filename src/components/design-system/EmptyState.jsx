import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className }) {
  return (
    <div className={cn('flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border/75 bg-card/35 px-5 text-center', compact ? 'min-h-32 py-5' : 'py-8', className)}>
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-muted-foreground"><Icon className="h-5 w-5" /></span>
      <h3 className="text-sm font-extrabold sm:text-base">{title}</h3>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
