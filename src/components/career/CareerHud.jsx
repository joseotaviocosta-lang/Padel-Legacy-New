import React, { useState } from 'react';
import { Coins, Crown, HeartPulse, Volume2, VolumeX, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

export default function CareerHud({ profile, ranking, compact = false, className }) {
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

  const energy = Math.round(Number(profile?.energy) || 0);
  const fatigue = Math.round(Number(profile?.fatigue) || 0);
  const coins = Math.round(Number(profile?.coins) || 0);
  const rank = ranking?.rank ? `#${ranking.displayRank || ranking.rank}` : '#1000+';

  const items = [
    { label: 'Energia', value: `${energy}%`, icon: Zap, tone: energy < 30 ? 'text-destructive' : energy < 60 ? 'text-warning' : 'text-success' },
    { label: 'Fadiga', value: `${fatigue}%`, icon: HeartPulse, tone: fatigue > 70 ? 'text-destructive' : fatigue > 45 ? 'text-warning' : 'text-success' },
    { label: 'Ranking', value: rank, icon: Crown, tone: 'text-premium' },
    { label: 'Moedas', value: coins.toLocaleString('pt-BR'), icon: Coins, tone: 'text-premium' },
  ];

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) window.setTimeout(() => playUiSound('notification'), 20);
  };

  return (
    <div className={cn('pl-career-hud flex min-w-0 items-center gap-1.5', compact && 'gap-1', className)} aria-label="Status rápido da carreira">
      {items.map(({ label, value, icon: Icon, tone }, index) => (
        <div key={label} className={cn(
          'flex min-w-0 items-center gap-2 rounded-xl border border-border/55 bg-card/62 px-2.5 py-1.5',
          compact && index > 2 && 'hidden sm:flex',
        )}>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} />
          <div className="min-w-0">
            {!compact && <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>}
            <p className={cn('truncate text-[11px] font-black tabular-nums', compact && 'text-[10px]')}>{value}</p>
          </div>
        </div>
      ))}
      <button type="button" onClick={toggleSound} title={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} aria-label={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-card/62 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
