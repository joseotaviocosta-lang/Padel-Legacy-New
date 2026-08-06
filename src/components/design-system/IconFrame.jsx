import React from 'react';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-12 w-12 rounded-2xl [&_svg]:h-6 [&_svg]:w-6',
};

/** Moldura visual única para ícones de cards, cabeçalhos e estados vazios. */
export function IconFrame({ icon: Icon, tone = 'brand', size = 'md', className, children }) {
  return (
    <span className={cn('pl-icon-frame inline-flex shrink-0 items-center justify-center', `pl-tone-${tone}`, sizes[size] || sizes.md, className)}>
      {Icon ? <Icon /> : children}
    </span>
  );
}
