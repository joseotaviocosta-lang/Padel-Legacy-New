import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.1): linha densa reutilizável
 * (~56-64px) para listas — extraída dos 4 blocos de linha quase idênticos
 * já escritos à mão em Ranking.jsx (circuito/duplas/clubes/países) e do
 * mesmo formato usado em Comunicações/Imprensa. `leading` aceita qualquer
 * nó (avatar, ícone, posição de ranking); `trailing` idem (pontos,
 * chevron, badge). Renderiza `<Link>` se `to` for passado, senão
 * `<button>` — nunca os dois.
 */
export function CompactListItem({ leading = undefined, title, meta = undefined, trailing = undefined, onClick = undefined, to = undefined, interactive = undefined, highlighted = false, unread = false, className = undefined }) {
  const isInteractive = interactive !== undefined ? interactive : Boolean(to || onClick);
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn('truncate text-sm', unread ? 'font-black' : 'font-semibold')}>{title}</p>
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
      </div>
      {trailing !== undefined ? trailing : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </>
  );

  const rowClassName = cn(
    'pl-compact-row flex w-full items-center gap-3 p-3 text-left',
    isInteractive && 'transition-colors hover:border-primary/35',
    highlighted ? 'border border-primary/40 bg-primary/5' : 'border border-transparent',
    className,
  );

  if (to) return <Link to={to} className={rowClassName}>{content}</Link>;
  if (isInteractive) return <button type="button" onClick={onClick} className={rowClassName}>{content}</button>;
  return <div className={rowClassName}>{content}</div>;
}
