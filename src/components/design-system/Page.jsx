import React from 'react';
import { cn } from '@/lib/utils';

/** Container padrão de página. Mantém largura, respiro e área segura mobile. */
export function Page({ children, className, size = 'wide', ...props }) {
  const sizes = {
    compact: 'max-w-4xl',
    default: 'max-w-6xl',
    wide: 'max-w-[92rem]',
    full: 'max-w-none',
  };

  return (
    <div
      className={cn(
        'pl-page pl-page-enter pl-auto-contain mx-auto w-full min-w-0 px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5',
        sizes[size] || sizes.wide,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Playthrough 5.20-B, Parte AE — FOLGA PARA O BALAO: MEDIDA E DESCARTADA.
//
// Houve aqui um `pb-32` para o conteudo nao terminar sob o balao de ajuda.
// Ele nasceu de um falso positivo: o medidor rolava a pagina UMA vez, o
// conteudo crescia depois do scroll e a leitura acontecia no meio da pagina —
// onde um FAB sobre o conteudo e comportamento normal, nao defeito.
//
// Com o medidor corrigido (rola ate a posicao parar de mudar e so entao mede),
// a comparacao direta com e sem a folga deu ZERO controle coberto nas duas
// condicoes, em Home, Torneios, Minha Dupla, Financas e Notificacoes. A folga
// custava 128px de espaco morto no fim de toda tela mobile e nao resolvia
// nada, entao saiu. O gate vive em test-floating-guide-clearance-v520b.mjs.
export function PageContent({ children, className, ...props }) {
  return <div className={cn('pl-content-enter min-w-0 space-y-4 lg:space-y-5', className)} {...props}>{children}</div>;
}
export function PageSection({ children, className, ...props }) {
  return <section className={cn('pl-section-enter min-w-0 space-y-3', className)} {...props}>{children}</section>;
}

export function CardGrid({ children, className, columns = 3, ...props }) {
  const layouts = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  };
  return <div className={cn('pl-stagger-grid grid min-w-0 gap-3 lg:gap-4', layouts[columns] || layouts[3], className)} {...props}>{children}</div>;
}
