import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Posição de ranking + variação (auditoria UI/UX, seção 13).
 *
 * Fase 5.32-A — coluna compacta (posição em cima, variação embaixo) para
 * caber nas linhas de 360px. A variação só aparece quando existe dado real
 * (`movement` numérico e ≠ 0): sem posição anterior gravada, nada é
 * exibido — antes o padrão `movement = 0` escrevia "estável" em toda linha,
 * inclusive nas duplas, que não têm posição anterior. `position` vazio
 * (sem ranking) vira "—", nunca um número.
 */
export function RankingPosition({ position, movement = null, size = 'default', className }) {
  const value = Number(position) > 0 ? Number(position) : null;
  const delta = Number.isFinite(movement) ? movement : 0;
  return (
    <div className={cn('flex w-10 shrink-0 flex-col items-center leading-none', className)}>
      <span
        className={cn(
          'font-black tabular-nums',
          size === 'lg' ? 'text-2xl' : 'text-[15px]',
          value === 1 ? 'text-amber-400' : value && value <= 3 ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {value || '—'}
      </span>
      {delta !== 0 && (
        <span
          className={cn('mt-0.5 inline-flex items-center text-[9px] font-black tabular-nums', delta > 0 ? 'text-success' : 'text-destructive')}
          aria-label={delta > 0 ? `subiu ${delta}` : `caiu ${Math.abs(delta)}`}
        >
          {delta > 0 ? <ArrowUp className="h-2.5 w-2.5" aria-hidden="true" /> : <ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />}
          {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}
