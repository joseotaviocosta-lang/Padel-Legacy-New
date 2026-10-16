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
    // Playthrough 5.20-B — a faixa rolavel resolveu o "filtros apertados" da
    // M4.2.2 (shrink-0 impedindo a compressao), mas trocou um problema por
    // outro: medido em 360px, ela ESCONDIA 496px de filtros em Notificacoes,
    // 424px em Financas e 266px em Relacoes. O jogador nao via a maior parte
    // das opcoes, e nada na tela anunciava que o trilho rolava.
    //
    // No mobile as pilhas passam a quebrar linha: ocupam mais altura, mas toda
    // opcao fica visivel de uma vez. Acima de md: nada muda — ali sobra largura
    // e a faixa unica continua sendo a forma certa.
    <div className={cn('flex flex-wrap gap-2 pb-1 md:flex-nowrap md:overflow-x-auto md:scrollbar-none', className)} style={{ WebkitOverflowScrolling: 'touch' }}>
      {filters.map((f) => {
        const Icon = f.icon;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              // 5.28: mais compacta no celular (padding menor, ícone decorativo oculto) — Economia caía de 3 para 2 linhas de pílulas.
              'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all sm:px-4 sm:py-2',
              activeFilter === f.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
            )}
          >
            {f.emoji && <span>{f.emoji}</span>}
            {Icon && <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:inline" />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
