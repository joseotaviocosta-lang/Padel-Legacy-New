import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
  stats,
  breadcrumb,
  tone = 'brand',
  className,
}) {
  return (
    <header className={cn('pl-page-hero relative overflow-hidden rounded-2xl border p-4 sm:p-5 lg:p-6', `pl-tone-${tone}`, className)}>
      <div className="relative z-10 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {breadcrumb?.length > 0 && (
            <nav aria-label="Navegação estrutural" className="mb-2 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              {breadcrumb.map((item, index) => (
                <React.Fragment key={`${item}-${index}`}>
                  {index > 0 && <ChevronRight className="h-3 w-3 opacity-45" />}
                  <span className={index === breadcrumb.length - 1 ? 'text-foreground/85' : ''}>{item}</span>
                </React.Fragment>
              ))}
            </nav>
          )}
          <div className="flex min-w-0 items-start gap-3">
            {Icon && <span className="pl-page-hero-icon mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon className="h-5 w-5" /></span>}
            <div className="min-w-0">
              {eyebrow && <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary/80">{eyebrow}</p>}
              <h1 className="pl-title-display truncate text-2xl font-black tracking-[-0.035em] sm:text-3xl">{title}</h1>
              {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
            </div>
          </div>
          {stats && <div className="mt-4 flex flex-wrap gap-2">{stats}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{action}</div>}
      </div>
    </header>
  );
}
