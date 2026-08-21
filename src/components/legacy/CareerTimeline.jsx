import React, { useMemo } from 'react';
import { Calendar, ChevronsUp, Crown, Flag, GraduationCap, Medal, Star, Swords, Target, Trophy, UserRoundCog, UserRoundX } from 'lucide-react';
import { Surface, SurfaceHeader, StatusBadge, EmptyState, CollapsibleSection } from '@/components/design-system';
import { buildCareerTimeline } from '@/lib/careerStory';

const ICONS = {
  start: Calendar, match: Swords, win: Trophy, title: Crown, ranking: Target, 'ranking-minor': Target,
  experience: GraduationCap, partnership: Medal, 'partnership-end': UserRoundX, coach: UserRoundCog,
  'coach-change': UserRoundCog, retirement: Flag, 'notable-match': Star, 'notable-match-minor': Star,
  rivalry: Swords,
};
const TONES = {
  title: 'premium', ranking: 'info', 'ranking-minor': 'info', win: 'success', retirement: 'warning',
  partnership: 'success', coach: 'info', 'notable-match': 'premium', 'notable-match-minor': 'info',
  'partnership-end': 'neutral', 'coach-change': 'neutral', rivalry: 'warning',
};

// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 8): timeline padrão só
// mostra major+important — normal (hoje só "experiência de carreira")
// fica atrás de "ver mais", evitando um feed infinito de eventos triviais.
function EventCard({ event }) {
  const Icon = ICONS[event.type] || Calendar;
  return (
    <article className="relative rounded-2xl border border-border/60 bg-card/55 p-3.5">
      <span className="absolute -left-[1.35rem] top-4 flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-background"><Icon className="h-3.5 w-3.5 text-primary" /></span>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black">{event.title}</h3><StatusBadge tone={TONES[event.type] || 'neutral'}>{event.year || 'Carreira'}</StatusBadge></div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
    </article>
  );
}

export default function CareerTimeline({ profile, matches = [], partnerships = [], coachTenures = [], relationships = [] }) {
  const events = useMemo(
    () => buildCareerTimeline(profile, matches, { partnerships, coachTenures, relationships }),
    [profile, matches, partnerships, coachTenures, relationships],
  );
  const primaryEvents = useMemo(() => events.filter((e) => e.importance !== 'normal'), [events]);
  const secondaryEvents = useMemo(() => events.filter((e) => e.importance === 'normal'), [events]);
  if (!profile) return null;
  return (
    <Surface>
      <SurfaceHeader title="Linha do tempo da carreira" description="Marcos construídos a partir dos acontecimentos reais da sua jornada." icon={Calendar} />
      {primaryEvents.length ? <div className="relative mt-4 space-y-3 pl-5">
        <div className="absolute bottom-2 left-[0.45rem] top-2 w-px bg-border/70" />
        {primaryEvents.map((event) => <EventCard key={event.id} event={event} />)}
      </div> : <EmptyState icon={Calendar} title="Sua história está começando" description="Partidas, títulos, rankings e relações importantes aparecerão aqui." />}
      {secondaryEvents.length > 0 && (
        <CollapsibleSection icon={ChevronsUp} title="Ver eventos adicionais" badge={String(secondaryEvents.length)} className="mt-3">
          <div className="relative space-y-3 pl-5">
            <div className="absolute bottom-2 left-[0.45rem] top-2 w-px bg-border/70" />
            {secondaryEvents.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        </CollapsibleSection>
      )}
    </Surface>
  );
}
