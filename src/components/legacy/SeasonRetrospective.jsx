import React, { useMemo } from 'react';
import { CalendarRange, Crown, Swords, Trophy } from 'lucide-react';
import { Surface, SurfaceHeader, StatCard, EmptyState } from '@/components/design-system';
import { buildSeasonRetrospectives } from '@/lib/careerStory';

export default function SeasonRetrospective({ profile, matches = [] }) {
  const seasons = useMemo(() => buildSeasonRetrospectives(profile, matches), [profile, matches]);
  return <Surface>
    <SurfaceHeader title="Retrospectivas de temporada" description="Resumo anual do desempenho competitivo e dos momentos que marcaram sua evolução." icon={CalendarRange} />
    {seasons.length ? <div className="mt-4 space-y-4">{seasons.map((season) => <section key={season.year} className="rounded-2xl border border-border/60 bg-card/55 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Temporada</p><h3 className="text-xl font-black">{season.year}</h3></div><p className="max-w-md text-right text-xs text-muted-foreground">{season.summary}</p></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><StatCard icon={Swords} label="Partidas" value={season.matches} /><StatCard icon={Trophy} label="Vitórias" value={season.wins} tone="success" /><StatCard icon={Crown} label="Títulos" value={season.titles} tone="premium" /><StatCard icon={CalendarRange} label="Aproveitamento" value={`${season.winRate}%`} tone="info" /></div>
      {season.highlights.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{season.highlights.slice(0, 4).map((highlight) => <span key={highlight} className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-300">{highlight}</span>)}</div>}
    </section>)}</div> : <EmptyState icon={CalendarRange} title="Nenhuma temporada concluída" description="As retrospectivas serão criadas conforme partidas oficiais forem registradas." />}
  </Surface>;
}
