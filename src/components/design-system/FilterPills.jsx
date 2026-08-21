import React from 'react';
import { cn } from '@/lib/utils';

// M4.2.2 (docs/MOBILE_M4_2_2_FILTERS_POSTMATCH.md, Parte A/B): faixa
// horizontal de pílulas de filtro/categoria, no design-system oficial (não
// na biblioteca-sombra padel/ui.jsx — Shop.jsx e outras páginas migradas
// não podem voltar a importar de lá, ver test:career-ui-v2/test:ui-redesign).
// Mesma correção de causa raiz aplicada em padel/ui.jsx's FilterPills
// (mantida lá para os consumidores legados que ainda a usam): `shrink-0`
// em cada item — sem isso, flexbox comprime os botões pra caber em vez de
// deixar o container rolar, o "filtros apertados" relatado no aparelho
// físico (Loja/Economia).
export function FilterPills({ filters, activeFilter, onFilterChange, className = '' }) {
  return (
    <div className={cn('flex flex-nowrap gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none', className)} style={{ WebkitOverflowScrolling: 'touch' }}>
      {filters.map((f) => {
        const Icon = f.icon;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold whitespace-nowrap transition-all',
              activeFilter === f.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
            )}
          >
            {f.emoji && <span>{f.emoji}</span>}
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
