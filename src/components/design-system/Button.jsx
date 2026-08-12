import React from 'react';
import { Button as BaseButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Design System 2.0 — quatro níveis de ação (auditoria UI/UX, seção 11).
// primary = ação principal da tela · secondary = ação alternativa ·
// ghost = ação auxiliar/de apoio · danger = ação destrutiva/irreversível.
// Mapeia para as variants já existentes em src/components/ui/button.jsx —
// não substitui o primitive, só formaliza o vocabulário de níveis sobre ele.
const LEVEL_VARIANT = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  premium: 'premium',
  outline: 'outline',
  link: 'link',
};

/**
 * Botão oficial do Design System 2.0. Use `level` para comunicar hierarquia
 * (no máximo um `primary` por tela/seção). `size="touch"` garante alvo de
 * toque de 48px para a ação principal em mobile.
 */
export const Button = React.forwardRef(({ level = 'primary', variant, size = 'default', className, ...props }, ref) => (
  <BaseButton ref={ref} variant={variant || LEVEL_VARIANT[level] || 'default'} size={size} className={cn(className)} {...props} />
));
Button.displayName = 'Button';
