import React from 'react';
import { Sparkles, Zap, Coins, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/components/padel/ui';

export default function LegacyBonusesCard({ bonuses, coachName }) {
  if (!bonuses || bonuses.extraAttributePoints === 0) return null;

  return (
    <GlassCard className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" /> Bônus de Legado
        {coachName && <span className="text-[10px] text-muted-foreground font-normal">herdados de {coachName}</span>}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center rounded-xl bg-secondary/30 p-2.5">
          <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-sm font-black text-primary">+{bonuses.extraAttributePoints}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Atributos</p>
        </div>
        <div className="text-center rounded-xl bg-secondary/30 p-2.5">
          <Coins className="h-4 w-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-sm font-black text-yellow-400">+{bonuses.startingCoins}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Moedas</p>
        </div>
        <div className="text-center rounded-xl bg-secondary/30 p-2.5">
          <TrendingUp className="h-4 w-4 text-cyan-400 mx-auto mb-1" />
          <p className="text-sm font-black text-cyan-400">+{bonuses.startingXp}</p>
          <p className="text-[9px] text-muted-foreground uppercase">XP</p>
        </div>
      </div>
    </GlassCard>
  );
}