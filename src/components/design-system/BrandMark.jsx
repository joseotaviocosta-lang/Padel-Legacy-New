import React from 'react';
import logoMarkUrl from '@/assets/brand/logo-mark.svg';
import { cn } from '@/lib/utils';

/**
 * Símbolo oficial da marca (docs/BRANDING.md, docs/DESIGN_SYSTEM_V2.md).
 * Substitui o antigo "P" solto em <span> do AppLayout por um SVG real —
 * mesmo papel visual (selo quadrado arredondado no header), agora com a
 * identidade definitiva em vez de um placeholder de texto.
 */
export function BrandMark({ size = 40, className }) {
  return (
    <img
      src={logoMarkUrl}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 rounded-2xl', className)}
    />
  );
}
