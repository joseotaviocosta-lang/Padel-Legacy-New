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

// Fase 5.28 — NENHUM botão estoura a margem. O primitive é
// `whitespace-nowrap` com altura fixa: um rótulo longo (em caixa alta, com
// tracking, no primário) saía pelos dois lados do modal no celular —
// "CONTRATAR · 1800 / MÊS + 3000 DE ASSINATURA" media 354px numa caixa de
// 314px em 360px. Aqui a altura vira MÍNIMA (mesma do tamanho), o texto pode
// quebrar e o botão nunca passa da largura do contêiner. Em uma linha o botão
// continua exatamente do mesmo tamanho de antes.
const MIN_HEIGHT = {
  default: 'h-auto min-h-10',
  sm: 'h-auto min-h-8',
  lg: 'h-auto min-h-11',
  touch: 'h-auto min-h-12',
};

/**
 * Botão oficial do Design System 2.0. Use `level` para comunicar hierarquia
 * (no máximo um `primary` por tela/seção). `size="touch"` garante alvo de
 * toque de 48px para a ação principal em mobile.
 *
 * `sublabel` (5.28): informação secundária do CTA (preço, prazo) numa segunda
 * linha menor, em vez de um rótulo único comprido — ex.: "Contratar" +
 * "1.800/mês · luvas 3.000".
 */
export const Button = React.forwardRef(({ level = 'primary', variant, size = 'default', className, sublabel = null, children, ...props }, ref) => (
  <BaseButton
    ref={ref}
    variant={variant || LEVEL_VARIANT[level] || 'default'}
    size={size}
    className={cn(
      'min-w-0 max-w-full whitespace-normal text-center leading-tight [overflow-wrap:anywhere]',
      MIN_HEIGHT[size],
      MIN_HEIGHT[size] && 'py-2',
      level === 'primary' && 'pl-game-primary',
      className,
    )}
    {...props}
  >
    {sublabel ? (
      <span className="flex min-w-0 flex-col items-center gap-0.5">
        <span className="inline-flex min-w-0 items-center justify-center gap-2">{children}</span>
        <span className="pl-btn-sublabel text-[10px] font-semibold normal-case tracking-normal opacity-80">{sublabel}</span>
      </span>
    ) : children}
  </BaseButton>
));
Button.displayName = 'Button';

/**
 * Fase 5.28 — área de ações padrão de modal/painel.
 * Mobile: ações secundárias lado a lado (mesma largura) e o primário em
 * largura total embaixo, perto do polegar. Desktop: tudo numa linha à
 * direita, primário por último. `info` é texto de apoio (ex.: "Sorteio em
 * 3 dias"), nunca um botão. Fechar fica no X do cabeçalho — não repetir um
 * "Fechar" quando já existe outra ação.
 */
export function ModalActions({ primary = null, secondary = null, info = null, className = '' }) {
  const secondaryItems = React.Children.toArray(secondary).filter(Boolean);
  return (
    <div className={cn('flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end', className)}>
      {info && <div className="text-center text-[11px] font-bold text-muted-foreground sm:mr-auto sm:text-left">{info}</div>}
      {secondaryItems.length > 0 && (
        <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex">{secondaryItems}</div>
      )}
      {primary && <div className="flex [&>*]:w-full sm:[&>*]:w-auto">{primary}</div>}
    </div>
  );
}
