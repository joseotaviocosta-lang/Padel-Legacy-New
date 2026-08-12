import React from 'react';
import { Globe2 } from 'lucide-react';
import { FLAGS } from '@/lib/characterCatalog.js';
import { cn } from '@/lib/utils';

/**
 * Bandeira do país como emoji, reaproveitando o mapa canônico já usado na
 * criação de personagem (`FLAGS` em src/lib/characterCatalog.js) em vez de
 * duplicar a lista. Cai para um ícone de globo quando o país não está
 * mapeado (ex.: "Internacional").
 */
export function CountryFlag({ country, showLabel = false, className }) {
  const flag = FLAGS[country];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {flag ? <span aria-hidden="true" className="text-base leading-none">{flag}</span> : <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
      {showLabel && <span className="truncate">{country || 'Internacional'}</span>}
      {!showLabel && <span className="sr-only">{country || 'Internacional'}</span>}
    </span>
  );
}
