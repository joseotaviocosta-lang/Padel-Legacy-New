import React, { useEffect, useState } from 'react';
import { CalendarDays, Coins, Crown, HeartPulse, Volume2, VolumeX, Zap } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, getWorldRank } from '@/lib/padel';
import { cn } from '@/lib/utils';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

const EMPTY = { energy: 0, fatigue: 0, coins: 0, date: '—', rank: '—' };

function formatCareerDate(value) {
  if (!value || value === '—') return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

export default function CareerHud({ compact = false, className }) {
  const [data, setData] = useState(EMPTY);
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

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
    { label: 'Data', value: formatCareerDate(data.date), icon: CalendarDays, tone: 'text-info', wide: true },
  ];

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) window.setTimeout(() => playUiSound('notification'), 20);
  };

  return (
    <div className={cn('pl-career-hud flex min-w-0 items-center gap-1.5', compact && 'gap-1', className)} aria-label="Status rápido da carreira">
      {items.map(({ label, value, icon: Icon, tone, wide }, index) => (
        <div key={label} className={cn(
          'flex min-w-0 items-center gap-2 rounded-xl border border-border/55 bg-card/62 px-2.5 py-1.5',
          wide && 'shrink-0 min-w-[7.35rem]',
          compact && index > 2 && 'hidden sm:flex',
        )}>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} />
          <div className="min-w-0">
            {!compact && <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>}
            <p className={cn('text-[11px] font-black tabular-nums', !wide && 'truncate', compact && 'text-[10px]')}>{value}</p>
          </div>
        </div>
      ))}
      <button type="button" onClick={toggleSound} title={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} aria-label={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-card/62 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
