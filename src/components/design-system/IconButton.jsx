import React from 'react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 [&_svg]:h-3.5 [&_svg]:w-3.5',
  // pl-icon-tap (Fase M1): sob @media(max-width:767px) eleva para 44x44 sem
  // afetar desktop — ver src/index.css. "sm" fica de fora de propósito
  // (usado em contextos deliberadamente compactos, ex.: linhas densas).
  default: 'h-10 w-10 pl-icon-tap [&_svg]:h-4 [&_svg]:w-4',
  // 44px — alvo de toque mínimo (auditoria UI/UX, seção 6). Use em ações
  // primárias de ícone no mobile (header, barras flutuantes).
  touch: 'h-11 w-11 [&_svg]:h-4.5 [&_svg]:w-4.5',
};

/**
 * Botão apenas-ícone com área de toque garantida. `label` é obrigatório —
 * vira `aria-label` e `title`, já que não há texto visível.
 */
export const IconButton = React.forwardRef(({ icon: Icon, label, level = 'ghost', size = 'default', className, children, ...props }, ref) => (
  <Button
    ref={ref}
    level={level}
    aria-label={label}
    title={label}
    className={cn('shrink-0 rounded-xl p-0', SIZES[size] || SIZES.default, className)}
    {...props}
  >
    {Icon ? <Icon /> : children}
  </Button>
));
IconButton.displayName = 'IconButton';
