import React from 'react';
import { Surface, SurfaceHeader } from './Surface';
import { cn } from '@/lib/utils';

/**
 * Bloco de seção com cabeçalho opcional (título/ícone/ação) sobre um card.
 * Formaliza o padrão hoje duplicado como `SectionCard` em
 * padel/GameShared.jsx — mesma composição, construída sobre Surface oficial.
 */
export function Section({ title, description, icon, action, children, className, padding = 'default' }) {
  return (
    <Surface padding={padding} className={cn('min-w-0', className)}>
      {(title || action) && <SurfaceHeader title={title} description={description} icon={icon} action={action} />}
      {children}
    </Surface>
  );
}
