import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  Clock3,
  Globe2,
  History,
  Newspaper,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { EmptyStateCard, LoadingScreen, TabBar } from '@/components/padel/ui';
import WorldEventCard from '@/components/world/WorldEventCard.jsx';
import {
  CardGrid,
  Page,
  PageContent,
  PageHeader,
  PageSection,
  StatCard,
  StatusBadge,
  Surface,
  SurfaceHeader,
} from '@/components/design-system';

const TABS = [
  { key: 'today', label: 'Hoje', icon: Newspaper },
  { key: 'circuit', label: 'Circuito', icon: Trophy },
  { key: 'market', label: 'Mercado', icon: Users },
  { key: 'history', label: 'História', icon: History },
];

function formatDate(date) {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date || '—';
  }
}

function EventList({ events, emptyTitle, emptyMessage }) {
  if (!events?.length) {
    return <EmptyStateCard icon={Globe2} title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {events.map(event => <WorldEventCard key={event.id} event={event} />)}
    </div>
  );
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

  if (!grouped.length) {
    return (
      <EmptyStateCard
        icon={History}
        title="A história ainda está começando"
        message="Avance o calendário para que o circuito acumule campeões, mudanças de ranking, novas duplas e outros marcos."
      />
    );
  }

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
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDate(event.event_date)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {event.content || event.description}
                </p>
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
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <LoadingScreen />;

  const events = snapshot?.events || [];
  const circuitEvents = snapshot?.categories?.circuit || [];
  const marketEvents = snapshot?.categories?.market || [];
  const bulletinStatus = snapshot?.bulletin ? 'Atualizado' : 'Próxima segunda';

  return (
    <Page>
      <PageContent>
        <PageHeader
          eyebrow="Living World Engine"
          title="O mundo não espera você"
          description="Resultados, ranking, mercado e histórias continuam evoluindo enquanto seu atleta treina, descansa e disputa torneios."
          icon={Globe2}
          tone="info"
          breadcrumb={['Mundo', 'Central do circuito']}
          stats={[
            <StatusBadge key="date" tone="info" icon={CalendarDays}>{formatDate(profile?.career_date)}</StatusBadge>,
            <StatusBadge key="bulletin" tone={snapshot?.bulletin ? 'success' : 'neutral'} icon={Clock3}>{bulletinStatus}</StatusBadge>,
          ]}
          action={(
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          )}
        />

        <CardGrid columns={4}>
          <StatCard label="Eventos recentes" value={events.length} detail="Acontecimentos do circuito" icon={Newspaper} tone="brand" />
          <StatCard label="Circuito" value={circuitEvents.length} detail="Resultados e ranking" icon={Trophy} tone="premium" />
          <StatCard label="Mercado" value={marketEvents.length} detail="Duplas, técnicos e rumores" icon={Users} tone="info" />
          <StatCard label="Boletim" value={bulletinStatus} detail="Resumo semanal do mundo" icon={Sparkles} tone={snapshot?.bulletin ? 'success' : 'neutral'} />
        </CardGrid>

        <Surface padding="compact">
          <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="buttons" />
        </Surface>

        {activeTab === 'today' && (
          <PageSection>
            {snapshot?.bulletin && (
              <Surface variant="premium">
                <SurfaceHeader
                  title={snapshot.bulletin.title}
                  description="Os fatos mais importantes dos últimos sete dias no circuito."
                  icon={Activity}
                />
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {snapshot.bulletin.content}
                </p>
              </Surface>
            )}

            {snapshot?.breaking && snapshot.breaking.id !== snapshot?.bulletin?.id && (
              <Surface variant="elevated" padding="compact">
                <SurfaceHeader title="Destaque do circuito" description="Acontecimento com maior impacto neste momento." icon={Newspaper} />
                <WorldEventCard event={snapshot.breaking} />
              </Surface>
            )}

            <Surface>
              <SurfaceHeader title="Feed do mundo" description="Últimas notícias, resultados e movimentações relevantes." icon={Globe2} />
              <EventList
                events={events.filter(event => event.id !== snapshot?.breaking?.id && event.id !== snapshot?.bulletin?.id).slice(0, 12)}
                emptyTitle="O circuito está silencioso"
                emptyMessage="Avance o calendário para gerar acontecimentos reais do universo."
              />
            </Surface>
          </PageSection>
        )}

        {activeTab === 'circuit' && (
          <Surface>
            <SurfaceHeader
              title="Circuito profissional"
              description="Resultados, rankings e torneios em andamento."
              icon={Trophy}
              action={(
                <div className="flex flex-wrap gap-2">
                  <Link to="/ranking" className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Ranking</Link>
                  <Link to="/tournaments" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Torneios</Link>
                </div>
              )}
            />
            <EventList events={circuitEvents} emptyTitle="Nenhum resultado recente" emptyMessage="Os resultados aparecerão quando os torneios mundiais forem processados." />
          </Surface>
        )}

        {activeTab === 'market' && (
          <Surface>
            <SurfaceHeader
              title="Mercado mundial"
              description="Movimentações de atletas, duplas, treinadores e clubes."
              icon={Users}
              action={(
                <div className="flex flex-wrap gap-2">
                  <Link to="/world-market" className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Mercado</Link>
                  <Link to="/partners" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Duplas</Link>
                  <Link to="/coaches" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Treinadores</Link>
                </div>
              )}
            />
            <EventList events={marketEvents} emptyTitle="Mercado estável" emptyMessage="Trocas de dupla, promessas e aposentadorias aparecerão aqui conforme o tempo avançar." />
          </Surface>
        )}

        {activeTab === 'history' && (
          <Surface>
            <SurfaceHeader title="Linha do tempo mundial" description="Memória histórica do circuito por temporada." icon={History} />
            <Timeline events={events} />
          </Surface>
        )}
      </PageContent>
    </Page>
  );
}
