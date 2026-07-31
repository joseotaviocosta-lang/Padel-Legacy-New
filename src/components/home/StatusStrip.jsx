import React from 'react';
import { Zap, Smile, Coins, Users } from 'lucide-react';
import { computeMoral, computeFollowers } from '@/lib/simulatedData';
import { MAX_ENERGY } from '@/lib/padel';

export default function StatusStrip({ profile }) {
  if (!profile) return null;
  const energy = profile.energy || 0;
  const moral = computeMoral(profile);
  const money = profile.coins || 0;
  const followers = computeFollowers(profile);

  const moralColor = moral >= 70 ? 'text-green-400' : moral >= 40 ? 'text-amber-400' : 'text-red-400';
  const moralBar = moral >= 70 ? 'from-green-500/70 to-green-500' : moral >= 40 ? 'from-amber-500/70 to-amber-500' : 'from-red-500/70 to-red-500';

  const items = [
    { icon: Zap, label: 'Energia', value: energy, max: MAX_ENERGY, display: `${energy}`, color: 'text-primary', bar: 'from-primary/70 to-primary' },
    { icon: Smile, label: 'Moral', value: moral, max: 100, display: `${moral}`, color: moralColor, bar: moralBar },
    { icon: Coins, label: 'Dinheiro', value: money, display: money.toLocaleString('pt-BR'), color: 'text-yellow-400' },
    { icon: Users, label: 'Seguidores', value: followers, display: followers.toLocaleString('pt-BR'), color: 'text-cyan-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-stagger">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i} className="glass rounded-2xl p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-lg font-black tabular-nums">{item.display}</span>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</span>
            {item.max && (
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${item.bar} transition-all duration-500`} style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}