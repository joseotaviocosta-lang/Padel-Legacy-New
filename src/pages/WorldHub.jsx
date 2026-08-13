import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  Clock3,
  Flame,
  Globe2,
  History,
  Newspaper,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { formatWorldDate } from '@/lib/worldTime.js';
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

const EVENT_PAGE_SIZE = 8;

function EventList({ events, emptyTitle, emptyMessage, profile }) {
  const [visibleCount, setVisibleCount] = useState(EVENT_PAGE_SIZE);

  if (!events?.length) {
    return <EmptyStateCard icon={Globe2} title={emptyTitle} message={emptyMessage} />;
  }

  const visible = events.slice(0, visibleCount);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map(event => <WorldEventCard key={event.id} event={event} profile={profile} />)}
      </div>
      {visibleCount < events.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((value) => value + EVENT_PAGE_SIZE)}
          className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary"
        >
          Carregar mais
        </button>
      )}
    </div>
  );
}

/**
 * Seção compacta usada na aba "Hoje" (Ranking/Torneios/Mercado/Tendências —
 * seção 21/22 do redesign): listas curtas, não outra grade de WorldEventCard,
 * para não duplicar visualmente as abas Circuito/Mercado.
 */
function CompactEventGroup({ title, description, icon: Icon, events, profile, moreTo, onMore, emptyMessage }) {
  const rows = (events || []).slice(0, 4);
  const hasMore = events?.length > rows.length;
  return (
    <Surface>
      <SurfaceHeader title={title} description={description} icon={Icon} />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-secondary/15 px-3 py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((event) => (
            <div key={event.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{event.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">{event.content}</p>
              </div>
              <span className="shrink-0 text-[9px] text-muted-foreground">{formatWorldDate(event.event_date, profile?.career_date)}</span>
            </div>
          ))}
        </div>
      )}
      {hasMore && onMore && (
        <button type="button" onClick={onMore} className="mt-3 text-xs font-bold text-primary">Ver tudo ({events.length})</button>
      )}
      {hasMore && !onMore && moreTo && (
        <Link to={moreTo} className="mt-3 inline-block text-xs font-bold text-primary">Ver tudo ({events.length})</Link>
      )}
    </Surface>
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
  // getLivingWorldSnapshot (src/lib/livingWorldEngine.js) devolve `categorias`
  // em português (circuito/mercado/saude) — as abas Circuito e Mercado liam
  // `categories.circuit`/`categories.market`, chaves que nunca existiram, e
  // ficavam sempre vazias. Correção de leitura apenas (nenhuma mudança na
  // geração do Universo Vivo).
  const circuitEvents = snapshot?.categories?.circuito || [];
  const marketEvents = snapshot?.categories?.mercado || [];
  const bulletinStatus = snapshot?.bulletin ? 'Atualizado' : 'Próxima segunda';

  // Agrupamentos temáticos da aba "Hoje" (seção 21): Ranking/Torneios/Mercado
  // já vêm classificados pelo snapshot; "Tendências" é o resíduo — histórias
  // editoriais (rumor, redes sociais, escândalo etc.) que não pertencem a
  // nenhum dos três baldes anteriores. Arrays já vêm limitados pelo snapshot
  // (até 80 itens), então um filtro simples por render dispensa useMemo aqui
  // — os hooks precisariam ficar antes do `if (loading) return`.
  const rankingMoves = circuitEvents.filter(event => event.event_type === 'ranking');
  const tournamentResults = circuitEvents.filter(event => event.event_type !== 'ranking');
  const categorizedIds = new Set([...circuitEvents, ...marketEvents, ...(snapshot?.categories?.saude || [])].map(event => event.id));
  const trendingStories = events.filter(event => (
    !categorizedIds.has(event.id) && event.id !== snapshot?.breaking?.id && event.id !== snapshot?.bulletin?.id
  ));

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
                <SurfaceHeader title="Agora no circuito" description="Acontecimento com maior impacto neste momento." icon={Newspaper} />
                <WorldEventCard event={snapshot.breaking} profile={profile} variant="hero" />
              </Surface>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <CompactEventGroup
                title="Ranking"
                description="Movimentos relevantes"
                icon={TrendingUp}
                events={rankingMoves}
                profile={profile}
                onMore={() => setActiveTab('circuit')}
                emptyMessage="Nenhum movimento de ranking recente."
              />
              <CompactEventGroup
                title="Torneios"
                description="Resultados importantes"
                icon={Trophy}
                events={tournamentResults}
                profile={profile}
                onMore={() => setActiveTab('circuit')}
                emptyMessage="Nenhum resultado importante recente."
              />
              <CompactEventGroup
                title="Mercado"
                description="Mudanças de dupla / staff"
                icon={Users}
                events={marketEvents}
                profile={profile}
                onMore={() => setActiveTab('market')}
                emptyMessage="Nenhuma movimentação recente."
              />
              <CompactEventGroup
                title="Tendências"
                description="Histórias emergentes"
                icon={Flame}
                events={trendingStories}
                profile={profile}
                moreTo="/world-events"
                emptyMessage="A comunidade está tranquila no momento."
              />
            </div>
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
            <EventList events={circuitEvents} profile={profile} emptyTitle="Nenhum resultado recente" emptyMessage="Os resultados aparecerão quando os torneios mundiais forem processados." />
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
            <EventList events={marketEvents} profile={profile} emptyTitle="Mercado estável" emptyMessage="Trocas de dupla, promessas e aposentadorias aparecerão aqui conforme o tempo avançar." />
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
