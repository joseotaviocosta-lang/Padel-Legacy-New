import React from 'react';
import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Select oficial do Design System 2.0 (Fase 8, seção 33) — sobre o primitive
 * acessível @radix-ui/react-select já presente no projeto (shadcn
 * `components/ui/select.jsx`, antes sem nenhum consumidor), com o mesmo
 * tratamento visual dos demais campos. Não substitui automaticamente os
 * `<select>` nativos existentes — migração é opcional, caso a caso.
 *
 * options: [{ value, label, disabled }]
 */
export function Select({ value, onValueChange, options = [], placeholder, className, disabled, 'aria-label': ariaLabel }) {
  return (
    <SelectRoot value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-11 rounded-xl border border-border/70 bg-secondary/35 px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border/70 bg-card/95 backdrop-blur-xl">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled} className="rounded-lg text-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
