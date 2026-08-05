import React, { useEffect, useState } from 'react';
import { CalendarDays, Coins, Crown, HeartPulse, Zap } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, getWorldRank } from '@/lib/padel';
import { cn } from '@/lib/utils';

const EMPTY = { energy: 0, fatigue: 0, coins: 0, date: '—', rank: '—' };

export default function CareerHud({ compact = false, className }) {
  const [data, setData] = useState(EMPTY);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const user = await localGame.auth.me();
        const profile = await ensureMyProfile(user);
        if (!profile || !mounted) return;
        const ranking = await getWorldRank(profile).catch(() => null);
        if (!mounted) return;
        setData({
          energy: Math.round(Number(profile.energy) || 0),
          fatigue: Math.round(Number(profile.fatigue) || 0),
          coins: Math.round(Number(profile.coins) || 0),
          date: profile.career_date || '—',
          rank: ranking?.rank ? `#${ranking.displayRank || ranking.rank}` : '#1000+',
        });
      } catch {
        // O HUD é complementar e nunca deve impedir o carregamento da rota.
      }
    };
    load();
    const refresh = () => load();
    window.addEventListener('padel:profile-updated', refresh);
    window.addEventListener('padel:career-advanced', refresh);
    window.addEventListener('padel:onboarding-refresh', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('padel:profile-updated', refresh);
      window.removeEventListener('padel:career-advanced', refresh);
      window.removeEventListener('padel:onboarding-refresh', refresh);
    };
  }, []);

  const items = [
    { label: 'Energia', value: `${data.energy}%`, icon: Zap, tone: data.energy < 30 ? 'text-destructive' : data.energy < 60 ? 'text-warning' : 'text-success' },
    { label: 'Fadiga', value: `${data.fatigue}%`, icon: HeartPulse, tone: data.fatigue > 70 ? 'text-destructive' : data.fatigue > 45 ? 'text-warning' : 'text-success' },
    { label: 'Ranking', value: data.rank, icon: Crown, tone: 'text-premium' },
    { label: 'Moedas', value: data.coins.toLocaleString('pt-BR'), icon: Coins, tone: 'text-premium' },
    { label: 'Data', value: data.date, icon: CalendarDays, tone: 'text-info' },
  ];

  return (
    <div className={cn('pl-career-hud flex min-w-0 items-center gap-1.5', compact && 'gap-1', className)} aria-label="Status rápido da carreira">
      {items.map(({ label, value, icon: Icon, tone }, index) => (
        <div key={label} className={cn('flex min-w-0 items-center gap-2 rounded-xl border border-border/55 bg-card/62 px-2.5 py-1.5', compact && index > 2 && 'hidden sm:flex')}>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} />
          <div className="min-w-0">
            {!compact && <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>}
            <p className={cn('truncate text-[11px] font-black tabular-nums', compact && 'text-[10px]')}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
