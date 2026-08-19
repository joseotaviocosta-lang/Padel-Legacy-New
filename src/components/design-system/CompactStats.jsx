import React from 'react';
import { cn } from '@/lib/utils';
import { GameHud } from './GameHud';

/**
 * Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md): substitui a grade de 4-6
 * StatCards grandes (que sozinha já ocupa 2-3 telas de altura em mobile)
 * por uma única linha compacta de indicadores — mesmo padrão já provado em
 * Coaches.jsx antes desta fase (Surface + flex-wrap de spans com ícone).
 * Extraído aqui para reuso em vez de deixar cada página reinventar a
 * própria versão.
 */
export function CompactStats({ items, className }) {
  return <GameHud items={items} className={cn('pl-game-hud--standalone', className)} />;
}
