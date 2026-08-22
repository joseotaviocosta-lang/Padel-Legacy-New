import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Crown, HeartPulse, Volume2, VolumeX, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';
import { useRenderCounter } from '@/dev/performanceProbe.js';
import { APP_ROUTES } from '@/navigation/routes.js';

function CareerHud({ profile, ranking, compact = false, className }) {
  useRenderCounter('CareerHud');
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

  const energy = Math.round(Number(profile?.energy) || 0);
  const fatigue = Math.round(Number(profile?.fatigue) || 0);
  const coins = Math.round(Number(profile?.coins) || 0);
  const rank = ranking?.rank ? `#${ranking.displayRank || ranking.rank}` : '#1000+';

  const items = [
    { label: 'Ranking', value: rank, icon: Crown, tone: 'text-premium' },
    { label: 'Moedas', value: coins.toLocaleString('pt-BR'), icon: Coins, tone: 'text-premium', to: APP_ROUTES.ECONOMY },
    { label: 'Energia', value: `${energy}%`, icon: Zap, tone: energy < 30 ? 'text-destructive' : energy < 60 ? 'text-warning' : 'text-success' },
    { label: 'Fadiga', value: `${fatigue}%`, icon: HeartPulse, tone: fatigue > 70 ? 'text-destructive' : fatigue > 45 ? 'text-warning' : 'text-success' },
  ];

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) window.setTimeout(() => playUiSound('notification'), 20);
  };

  return (
    <div className={cn('pl-career-hud flex min-w-0 items-center gap-1.5', compact && 'gap-1', className)} aria-label="Status rápido da carreira">
      {items.map(({ label, value, icon: Icon, tone, to }, index) => {
        const className = cn(
          'flex min-h-[var(--pl-touch-min)] min-w-0 items-center gap-2 rounded-xl border border-border/55 bg-card/62 px-2.5 py-1.5',
          compact && index > 2 && 'hidden xl:flex',
          to && 'transition-colors hover:border-premium/40 hover:bg-premium/10',
        );
        const content = <>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} />
          <div className="min-w-0">
            {!compact && <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>}
            <p className={cn('whitespace-nowrap text-[11px] font-black tabular-nums', compact && 'text-[10px]')}>{value}</p>
          </div>
        </>;
        return to
          ? <Link key={label} to={to} className={className} aria-label={`Abrir Economia. Saldo: ${value} moedas`}>{content}</Link>
          : <div key={label} className={className}>{content}</div>;
      })}
      {!compact && <button type="button" onClick={toggleSound} title={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} aria-label={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-card/62 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>}
    </div>
  );
}

// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): `profile`/`ranking` chegam
// de AppLayout's useCareerHeaderData(), que emite um objeto novo a cada busca
// mesmo quando nada visível aqui mudou (ex.: um outro campo do perfil foi
// atualizado). Comparador dedicado só nos 4 campos que este componente
// realmente mostra, em vez de comparação rasa do objeto inteiro inteiro.
function areEqual(prev, next) {
  return prev.compact === next.compact
    && prev.className === next.className
    && Number(prev.profile?.energy) === Number(next.profile?.energy)
    && Number(prev.profile?.fatigue) === Number(next.profile?.fatigue)
    && Number(prev.profile?.coins) === Number(next.profile?.coins)
    && (prev.ranking?.rank || null) === (next.ranking?.rank || null)
    && (prev.ranking?.displayRank || null) === (next.ranking?.displayRank || null);
}

export default React.memo(CareerHud, areEqual);
