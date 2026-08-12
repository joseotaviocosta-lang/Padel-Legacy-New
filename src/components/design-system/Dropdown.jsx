import React from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Menu suspenso oficial do Design System 2.0. Composição simples sobre o
 * primitive @radix-ui/react-dropdown-menu: passe `trigger` e uma lista de
 * `items` — evita recriar `DropdownMenuContent`/`DropdownMenuItem` em cada
 * tela. Para menus mais elaborados, use os primitives de
 * `@/components/ui/dropdown-menu` diretamente.
 *
 * items: [{ key, label, icon, onSelect, danger, disabled }] — `null` insere um separador.
 */
export function Dropdown({ trigger, items = [], label, align = 'end', className }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('min-w-[12rem] rounded-xl border-border/70 bg-card/95 p-1.5 backdrop-blur-xl', className)}>
        {label && <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</DropdownMenuLabel>}
        {items.map((item, index) => {
          if (!item) return <DropdownMenuSeparator key={`sep-${index}`} className="my-1 bg-border/60" />;
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.key || item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn('gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold', item.danger && 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 truncate">{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
