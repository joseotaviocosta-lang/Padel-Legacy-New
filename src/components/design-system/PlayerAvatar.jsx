import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  default: 'h-11 w-11 text-lg',
  lg: 'h-14 w-14 text-xl',
};

/**
 * Avatar de atleta/perfil com fallback de iniciais. Consolida o padrão
 * repetido em Ranking, PlayerProfile, ProfileMini etc. (círculo/quadrado com
 * gradiente da marca + primeira letra do nome).
 */
export function PlayerAvatar({ src, name, size = 'default', shape = 'rounded', className }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <Avatar className={cn(SIZES[size] || SIZES.default, shape === 'circle' ? 'rounded-full' : 'rounded-xl', 'shrink-0 bg-gradient-to-br from-primary/30 to-secondary', className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className={cn('bg-transparent font-black text-primary', shape === 'circle' ? 'rounded-full' : 'rounded-xl')}>{initial}</AvatarFallback>
    </Avatar>
  );
}
