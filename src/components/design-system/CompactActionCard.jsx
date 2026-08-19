import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.1/M4.3): casca genérica para
 * cards de ação que hoje mostram tudo sempre (treino, torneio, técnico,
 * proposta de parceria) — fechado mostra só o que decide a escolha
 * (ícone/título, um resumo curto, o botão principal); o resto (detalhes,
 * seletor de intensidade, análise completa) fica atrás do "expandir".
 * Não conhece nada de treino/torneio/técnico — só a casca visual +
 * comportamento de expandir/recolher; cada chamador injeta seu próprio
 * conteúdo via `summary`/`details`.
 */
export function CompactActionCard({
  icon: Icon,
  iconClassName,
  title,
  badge,
  summary,
  primaryAction,
  details,
  expanded: controlledExpanded,
  onToggleExpanded,
  tone = 'default',
  className,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  function toggle() {
    if (onToggleExpanded) onToggleExpanded(!expanded);
    if (!isControlled) setInternalExpanded((value) => !value);
  }

  return (
    <div className={cn(
      'glass rounded-2xl border p-[var(--mobile-card-padding)] sm:p-4 transition-all',
      expanded ? 'border-primary/30' : tone === 'premium' ? 'border-premium/35' : 'border-border/40',
      className,
    )}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60', iconClassName)}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold leading-tight">{title}</p>
            {badge}
          </div>
          {summary && <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{summary}</div>}
        </div>
        {details && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Ver menos detalhes' : 'Ver mais detalhes'}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {expanded && details && <div className="mt-3 animate-fade-in space-y-2">{details}</div>}

      {primaryAction && <div className="mt-3">{primaryAction}</div>}
    </div>
  );
}
