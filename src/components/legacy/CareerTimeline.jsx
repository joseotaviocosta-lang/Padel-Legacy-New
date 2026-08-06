import React, { useMemo } from 'react';
import { Calendar, Crown, Flag, GraduationCap, Medal, Swords, Target, Trophy, UserRoundCog } from 'lucide-react';
import { Surface, SurfaceHeader, StatusBadge, EmptyState } from '@/components/design-system';
import { buildCareerTimeline } from '@/lib/careerStory';

const ICONS = { start: Calendar, match: Swords, win: Trophy, title: Crown, ranking: Target, experience: GraduationCap, partnership: Medal, coach: UserRoundCog, retirement: Flag };
const TONES = { title: 'premium', ranking: 'info', win: 'success', retirement: 'warning', partnership: 'success', coach: 'info' };

export default function CareerTimeline({ profile, matches = [] }) {
  const events = useMemo(() => buildCareerTimeline(profile, matches), [profile, matches]);
  if (!profile) return null;
  return (
    <Surface>
      <SurfaceHeader title="Linha do tempo da carreira" description="Marcos construídos a partir dos acontecimentos reais da sua jornada." icon={Calendar} />
      {events.length ? <div className="relative mt-4 space-y-3 pl-5">
        <div className="absolute bottom-2 left-[0.45rem] top-2 w-px bg-border/70" />
        {events.map((event) => { const Icon = ICONS[event.type] || Calendar; return <article key={event.id} className="relative rounded-2xl border border-border/60 bg-card/55 p-3.5">
          <span className="absolute -left-[1.35rem] top-4 flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-background"><Icon className="h-3.5 w-3.5 text-primary" /></span>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black">{event.title}</h3><StatusBadge tone={TONES[event.type] || 'neutral'}>{event.year || 'Carreira'}</StatusBadge></div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
        </article>; })}
      </div> : <EmptyState icon={Calendar} title="Sua história está começando" description="Partidas, títulos, rankings e relações importantes aparecerão aqui." />}
    </Surface>
  );
}
