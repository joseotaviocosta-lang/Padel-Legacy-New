import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface } from './Surface';

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.1): extrai o padrão de
 * seção recolhível já usado (só nesta página, escrito à mão) em
 * CareerHub.jsx's CareerToolsSection para reuso — Training/Missões/
 * Torneios/Parcerias precisam do mesmo comportamento (moral/recuperação,
 * missões concluídas, análise do técnico, detalhes da proposta). Sem
 * `open`/`onToggle` controlados, mantém estado próprio (defaultOpen).
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  description,
  badge,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  className,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const panelId = useId();

  function toggle() {
    if (onToggle) onToggle(!open);
    if (!isControlled) setInternalOpen((value) => !value);
  }

  return (
    <Surface padding="none" className={cn('overflow-hidden', className)}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 p-4 text-left">
        {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground"><Icon className="h-4 w-4" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black">{title}</span>
          {description && <span className="block text-xs text-muted-foreground">{description}</span>}
        </span>
        {badge}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-border/50 p-4">
          {children}
        </div>
      )}
    </Surface>
  );
}
