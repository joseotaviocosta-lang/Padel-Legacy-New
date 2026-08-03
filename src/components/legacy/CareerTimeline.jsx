import React from 'react';
import { Scroll, Swords, Trophy, Crown, Star, TrendingUp, Flame, Calendar, Flag } from 'lucide-react';
import { GlassCard } from '@/components/padel/ui';
import { levelForXp, formatDate } from '@/lib/padel';

export default function CareerTimeline({ profile, legacies }) {
  if (!profile) return null;

  const events = [];

  // Career start
  events.push({
    icon: Calendar,
    title: 'Início da Carreira',
    description: `Geração ${profile.legacy_generation || 1} · ${formatDate(profile.career_date || '2026-01-01')}`,
    accent: 'text-primary',
    done: true,
  });

  // Inherited legacy
  if (profile.legacy_generation > 1) {
    events.push({
      icon: Crown,
      title: 'Herança Recebida',
      description: `Bônus de legado aplicados pelo treinador`,
      accent: 'text-amber-400',
      done: true,
    });
  }

  // First match
  events.push({
    icon: Swords,
    title: 'Primeira Partida',
    description: 'A estreia oficial no circuito',
    accent: 'text-cyan-400',
    done: (profile.matches_played || 0) >= 1,
  });

  // First win
  events.push({
    icon: Trophy,
    title: 'Primeira Vitória',
    description: 'A vitória que iniciou a lenda',
    accent: 'text-green-400',
    done: (profile.wins || 0) >= 1,
  });

  // Level milestones
  const level = levelForXp(profile.xp || 0);
  const levelEvents = [
    { threshold: 500, label: 'Alcançou Amador', icon: Star },
    { threshold: 3000, label: 'Alcançou Competitivo', icon: TrendingUp },
    { threshold: 10000, label: 'Alcançou Avançado', icon: Flame },
    { threshold: 25000, label: 'Alcançou Elite', icon: Flame },
    { threshold: 50000, label: 'Alcançou Lenda', icon: Crown },
  ];
  levelEvents.forEach(le => {
    events.push({
      icon: le.icon,
      title: le.label,
      description: `${(profile.xp || 0).toLocaleString('pt-BR')} XP`,
      accent: 'text-purple-400',
      done: (profile.xp || 0) >= le.threshold,
    });
  });

  // First title
  events.push({
    icon: Crown,
    title: 'Primeiro Título',
    description: 'O primeiro torneio conquistado',
    accent: 'text-amber-400',
    done: (profile.tournaments_won || 0) >= 1,
  });

  // Retirement
  if (profile.retired) {
    events.push({
      icon: Flag,
      title: 'Aposentadoria',
      description: 'Carreira encerrada · legado consolidado',
      accent: 'text-amber-400',
      done: true,
    });
  }

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Scroll className="h-4 w-4 text-primary" /> Cronologia da Carreira
      </h2>
      <div className="relative">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          const Icon = event.icon;
          return (
            <div key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {!isLast && <div className="absolute left-4 top-9 bottom-0 w-0.5 bg-border" />}
              <div className={`relative z-10 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${event.done ? 'bg-secondary/40' : 'bg-secondary/20'}`}>
                <Icon className={`h-4 w-4 ${event.done ? event.accent : 'text-muted-foreground/40'}`} />
              </div>
              <div className="flex-1 pt-1">
                <p className={`text-xs font-bold ${event.done ? 'text-foreground' : 'text-muted-foreground/60'}`}>{event.title}</p>
                <p className="text-[10px] text-muted-foreground">{event.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}