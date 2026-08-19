import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.1): linha única "label valor
 * · label valor" — para resumir dentro de uma seção já recolhida (ex.:
 * "Moral 94 · Confiança 46 · Forma 67 · Entrosamento 72" em vez do card
 * grande que existia antes). Não é clicável, não substitui CompactStats
 * (que tem fundo/padding próprios) — é só texto para reaproveitar dentro
 * de outro componente.
 */
export function SummaryRow({ items, className }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground', className)}>
      {list.map((item, index) => (
        <span key={item.id || item.label || index} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground/50">·</span>}
          {item.label} <strong className="font-bold text-foreground">{item.value}</strong>
        </span>
      ))}
    </p>
  );
}
