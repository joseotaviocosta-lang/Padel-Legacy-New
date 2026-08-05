import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CalendarDays, Clock3, Globe2, History, Newspaper, RefreshCw, Swords, TrendingUp, Trophy, Users } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { LoadingScreen, EmptyStateCard, GlassCard, TabBar } from '@/components/padel/ui';
import WorldEventCard from '@/components/world/WorldEventCard.jsx';

const TABS = [
  { key: 'today', label: 'Hoje', icon: Newspaper },
  { key: 'circuit', label: 'Circuito', icon: Trophy },
  { key: 'market', label: 'Mercado', icon: Users },
  { key: 'history', label: 'História', icon: History },
];

function formatDate(date) {
  try { return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return date || '—'; }
}

function EventList({ events, emptyTitle, emptyMessage }) {
  if (!events?.length) return <EmptyStateCard icon={Globe2} title={emptyTitle} message={emptyMessage} />;
  return <div className="grid gap-3 lg:grid-cols-2">{events.map(event => <WorldEventCard key={event.id} event={event} />)}</div>;
}

function Timeline({ events }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const event of events || []) {
      const year = String(event.event_date || event.created_date || '2026').slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year).push(event);
    }
    return [...map.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }, [events]);

  if (!grouped.length) return <EmptyStateCard icon={History} title="A história ainda está começando" message="Avance o calendário para que o circuito acumule campeões, mudanças de ranking, novas duplas e outros marcos." />;
  return (
    <div className="space-y-5">
      {grouped.map(([year, rows]) => (
        <section key={year} className="grid gap-3 md:grid-cols-[5rem_minmax(0,1fr)]">
          <div className="text-2xl font-black text-primary">{year}</div>
          <div className="relative space-y-3 border-l border-border/70 pl-5">
            {rows.slice(0, 24).map(event => (
              <article key={event.id} className="relative rounded-2xl border border-border/65 bg-card/55 p-4">
                <span className="absolute -left-[1.48rem] top-5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{event.title}</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{formatDate(event.event_date)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{event.content || event.description}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function WorldHub() {
  const [profile, setProfile] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const user = await localGame.auth.me();
    const currentProfile = await ensureMyProfile(user);
    const nextSnapshot = await getLivingWorldSnapshot(currentProfile, 80);
    setProfile(currentProfile);
    setSnapshot(nextSnapshot);
  }

  useEffect(() => {
    load().catch(error => console.error('[WorldHub]', error)).finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (loading) return <LoadingScreen />;
  const events = snapshot?.events || [];
  const circuitEvents = snapshot?.categories?.circuit || [];
  const marketEvents = snapshot?.categories?.market || [];

  return (
    <div className="mx-auto max-w-[1380px] space-y-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-card via-card to-primary/[0.08] p-5 md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Living World Engine</p>
            <h1 className="mt-1 text-2xl font-black md:text-3xl">O mundo não espera você</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Resultados, ranking, mercado e histórias continuam evoluindo enquanto seu atleta treina, descansa e disputa torneios.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs font-bold"><CalendarDays className="h-4 w-4 text-primary" />{formatDate(profile?.career_date)}</span>
            <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard><div className="flex items-center gap-3"><Newspaper className="h-5 w-5 text-primary" /><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Eventos recentes</p><strong className="text-xl">{events.length}</strong></div></div></GlassCard>
        <GlassCard><div className="flex items-center gap-3"><Trophy className="h-5 w-5 text-amber-400" /><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Circuito</p><strong className="text-xl">{circuitEvents.length}</strong></div></div></GlassCard>
        <GlassCard><div className="flex items-center gap-3"><Users className="h-5 w-5 text-cyan-400" /><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mercado</p><strong className="text-xl">{marketEvents.length}</strong></div></div></GlassCard>
        <GlassCard><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-purple-400" /><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Boletim</p><strong className="text-sm">{snapshot?.bulletin ? 'Atualizado' : 'Próxima segunda'}</strong></div></div></GlassCard>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="buttons" />

      {activeTab === 'today' && (
        <div className="space-y-4">
          {snapshot?.bulletin && (
            <section className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-5">
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Boletim semanal</p></div>
              <h2 className="mt-2 text-lg font-black">{snapshot.bulletin.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{snapshot.bulletin.content}</p>
            </section>
          )}
          {snapshot?.breaking && snapshot.breaking.id !== snapshot?.bulletin?.id && <WorldEventCard event={snapshot.breaking} />}
          <EventList events={events.filter(event => event.id !== snapshot?.breaking?.id && event.id !== snapshot?.bulletin?.id).slice(0, 12)} emptyTitle="O circuito está silencioso" emptyMessage="Avance o calendário para gerar acontecimentos reais do universo." />
        </div>
      )}

      {activeTab === 'circuit' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><Link to="/ranking" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Ver ranking</Link><Link to="/tournaments" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold">Torneios</Link><Link to="/world-tour/live" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold">Circuito ao vivo</Link></div>
          <EventList events={circuitEvents} emptyTitle="Nenhum resultado recente" emptyMessage="Os resultados aparecerão quando os torneios mundiais forem processados." />
        </div>
      )}

      {activeTab === 'market' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><Link to="/world-market" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Abrir mercado mundial</Link><Link to="/partners" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold">Mercado de duplas</Link><Link to="/coaches" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold">Treinadores</Link></div>
          <EventList events={marketEvents} emptyTitle="Mercado estável" emptyMessage="Trocas de dupla, promessas e aposentadorias aparecerão aqui conforme o tempo avançar." />
        </div>
      )}

      {activeTab === 'history' && <Timeline events={events} />}
    </div>
  );
}
