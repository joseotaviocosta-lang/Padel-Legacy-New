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
        'pl-page mx-auto w-full min-w-0 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5',
        sizes[size] || sizes.wide,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageContent({ children, className, ...props }) {
  return <div className={cn('min-w-0 space-y-4 lg:space-y-5', className)} {...props}>{children}</div>;
}

export function PageSection({ children, className, ...props }) {
  return <section className={cn('min-w-0 space-y-3', className)} {...props}>{children}</section>;
}

export function CardGrid({ children, className, columns = 3, ...props }) {
  const layouts = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  };
  return <div className={cn('grid min-w-0 gap-3 lg:gap-4', layouts[columns] || layouts[3], className)} {...props}>{children}</div>;
}
