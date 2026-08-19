import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameHud } from './GameHud';

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
  dense = false,
  hudItems = undefined,
  hudLabel = undefined,
}) {
  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.2): heroes desktop com
  // eyebrow+título+descrição+breadcrumb+stats consomem 250-400px em mobile
  // antes de qualquer conteúdo real. `dense` não é um componente paralelo —
  // é o MESMO PageHeader, com classes CSS que só mudam sob max-width:767px
  // (mesmo idioma já usado por .pl-tab-trigger/.pl-icon-tap em index.css):
  // descrição só aparece a partir de md:, título fica menor, e a fileira de
  // stats vira uma única linha com scroll horizontal em vez de quebrar em
  // várias linhas. Nenhum branch de JS/isMobile — todo o resto do
  // componente é idêntico ao uso não-denso.
  return (
    <header data-game-context={dense ? 'true' : undefined} className={cn('pl-page-hero relative overflow-hidden rounded-2xl border p-4 sm:p-5 lg:p-6', dense && 'pl-page-hero--dense', `pl-tone-${tone}`, className)}>
      <div className="pl-page-hero-content relative z-10 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="pl-page-hero-main min-w-0 flex-1">
          {breadcrumb?.length > 0 && (
            <nav aria-label="Navegação estrutural" className={cn('mb-2 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-muted-foreground', dense && 'hidden md:flex')}>
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
              {eyebrow && <p data-page-eyebrow className={cn('mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary/80', dense && 'hidden md:block')}>{eyebrow}</p>}
              <h1 className={cn('pl-title-display truncate font-black tracking-[-0.035em]', dense ? 'text-lg sm:text-2xl md:text-3xl' : 'text-2xl sm:text-3xl')}>{title}</h1>
              {description && <p data-page-description className={cn('mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground', dense && 'hidden md:block')}>{description}</p>}
            </div>
          </div>
          {stats && (
            <div className={cn('mt-4 flex flex-wrap gap-2', dense && 'flex-nowrap overflow-x-auto scrollbar-none md:flex-wrap md:overflow-visible')}>
              {stats}
            </div>
          )}
          <GameHud items={hudItems} label={hudLabel} className="mt-2.5 md:mt-4" />
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{action}</div>}
      </div>
    </header>
  );
}
