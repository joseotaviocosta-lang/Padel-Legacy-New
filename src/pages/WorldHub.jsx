import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Crown,
  Flame,
  Globe2,
  History,
  Medal,
  Newspaper,
  RefreshCw,
  Trophy,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel.js';
import { getTeamRankings } from '@/lib/teamRanking.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { formatWorldDate } from '@/lib/worldTime.js';
import { loadModuleTasks } from '@/lib/moduleLoading';
import { buildWorldCircuitModel, doublesMemberIds, formatPts, pairLabel, untilLabel } from '@/lib/worldCircuitDisplay.js';
import { EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import WorldEventCard from '@/components/world/WorldEventCard.jsx';
import {
  CountryFlag,
  Page,
  PageContent,
  Surface,
  SurfaceHeader,
  Tabs,
} from '@/components/design-system';

// Fase 5.32-B — Mundo / Circuito Mundial. "THE WORLD SHOULD FEEL ALIVE":
// a tela conta a história do circuito antes de abrir o banco de dados.
//   1. destaque do circuito (um fato real: título recente, evento em curso,
//      número 1 do mundo ou próximo grande evento);
//   2. líderes — Mundial, Duplas e Race, com o top 3 de cada;
//   3. grandes eventos — próximos e campeões recentes;
//   4. notícias do Universo Vivo (as mesmas quatro áreas de antes);
//   5. atalhos para explorar o circuito.
// Autoridades (nenhuma nova, nenhum cálculo de pontos na tela): snapshot
// mundial (buildWorldRankingSnapshot), TeamRanking (getTeamRankings),
// Partnership 'ativa', Tournament e o snapshot do Universo Vivo. Detalhes
// em src/lib/worldCircuitDisplay.js.

// Áreas de notícias do Universo Vivo (antes eram as abas da página inteira).
const TABS = [
  { key: 'today', label: 'Hoje', icon: Newspaper },
  { key: 'circuit', label: 'Circuito', icon: Trophy },
  { key: 'market', label: 'Mercado', icon: Users },
  { key: 'history', label: 'História', icon: History },
];

// A posição de uma dupla só depende de quem está acima dela: as primeiras
// linhas de getTeamRankings saem iguais com qualquer limite de leitura.
const TEAM_LEADERS_READ = 50;
// Torneios mais recentes por data de início: cobre todos os eventos futuros
// do calendário (~150 por temporada) e os resolvidos mais recentes.
const TOURNAMENT_READ = 400;

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
 * Grupo compacto da área "Hoje" (Ranking/Torneios/Mercado/Tendências/Atletas
 * reais): três linhas por grupo, o resto na área própria ou na Central.
 */
function CompactEventGroup({ title, icon: Icon, events, profile, moreTo, onMore, emptyMessage }) {
  const rows = (events || []).slice(0, 3);
  const hasMore = events?.length > rows.length;
  return (
    <div className="min-w-0 rounded-2xl border border-border/50 bg-card/55 p-3" data-world-news-group={title}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </p>
        {hasMore && onMore && (
          <button type="button" onClick={onMore} className="shrink-0 text-[11px] font-bold text-primary">Ver tudo ({events.length})</button>
        )}
        {hasMore && !onMore && moreTo && (
          <Link to={moreTo} className="shrink-0 text-[11px] font-bold text-primary">Ver tudo ({events.length})</Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((event) => (
            <li key={event.id} className="flex min-w-0 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{event.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{event.content}</p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatWorldDate(event.event_date, profile?.career_date)}</span>
            </li>
          ))}
        </ul>
      )}
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

function SectionLabel({ title, action = null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-1">
      <h2 className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      {action}
    </div>
  );
}

function SectionLink({ to, children }) {
  return <Link to={to} className="inline-flex min-h-8 shrink-0 items-center text-xs font-bold text-primary">{children}</Link>;
}

// ── 1. Destaque do circuito ──────────────────────────────────────────────
function HeroShell({ kind, tone = 'primary', children }) {
  const bar = tone === 'amber' ? 'bg-amber-400' : tone === 'live' ? 'bg-success' : 'bg-primary';
  return (
    <section data-world-block="hero" data-world-hero={kind} className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 pl-5 shadow-sm sm:p-5 sm:pl-6">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      {children}
    </section>
  );
}

function HeroEyebrow({ icon: Icon, className, children }) {
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </p>
  );
}

function HeroCta({ to, children }) {
  return (
    <Link to={to} className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground">
      {children}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

export function CircuitHero({ highlight, careerDate }) {
  if (!highlight) {
    return (
      <HeroShell kind="empty">
        <HeroEyebrow icon={Globe2} className="text-primary">Circuito mundial</HeroEyebrow>
        <p className="mt-1.5 text-xl font-black leading-tight">O circuito ainda não tem destaques</p>
        <p className="mt-1 text-xs text-muted-foreground">Ranking, torneios e campeões aparecem aqui conforme a temporada avança.</p>
        <HeroCta to="/ranking?scope=world&type=individual">Explorar o ranking</HeroCta>
      </HeroShell>
    );
  }

  if (highlight.kind === 'champion') {
    const { champion } = highlight;
    return (
      <HeroShell kind="champion" tone="amber">
        <HeroEyebrow icon={Trophy} className="text-amber-400">{champion.playerWon ? 'Seu título' : 'Campeões'} · {champion.tier}</HeroEyebrow>
        <p className="mt-1.5 text-xl font-black leading-tight sm:text-2xl" data-world-hero-title>
          {champion.champions.map((member, index) => (
            <span key={member.id} className="block sm:inline">{index > 0 && <span className="text-muted-foreground sm:mx-1.5"><span className="sm:hidden">&amp; </span><span className="hidden sm:inline">&amp;</span></span>}{member.name}</span>
          ))}
        </p>
        <p className="mt-1 text-sm font-bold text-foreground">{champion.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatWorldDate(champion.date, careerDate)}{champion.location ? ` · ${champion.location}` : ''}
          {champion.runnersUp.length === 2 ? ` · final contra ${pairLabel(champion.runnersUp)}` : ''}
        </p>
        <HeroCta to={`/tournaments?tournament=${encodeURIComponent(champion.id)}`}>Ver torneio</HeroCta>
      </HeroShell>
    );
  }

  if (highlight.kind === 'live' || highlight.kind === 'next') {
    const { event } = highlight;
    const live = highlight.kind === 'live';
    return (
      <HeroShell kind={highlight.kind} tone={live ? 'live' : 'primary'}>
        <HeroEyebrow icon={live ? Activity : CalendarDays} className={live ? 'text-success' : 'text-primary'}>
          {live ? 'Em andamento' : 'Próximo grande evento'} · {event.tier}
        </HeroEyebrow>
        <p className="mt-1.5 text-xl font-black leading-tight sm:text-2xl" data-world-hero-title>{event.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {live ? `Até ${formatWorldDate(event.endDate, careerDate)}` : `${untilLabel(event.daysUntil)} · ${formatWorldDate(event.startDate, careerDate)}`}
          {event.location ? ` · ${event.location}` : ''}
        </p>
        <HeroCta to={`/tournaments?tournament=${encodeURIComponent(event.id)}`}>Ver torneio</HeroCta>
      </HeroShell>
    );
  }

  const { leader } = highlight;
  return (
    <HeroShell kind="leader" tone="amber">
      <HeroEyebrow icon={Crown} className="text-amber-400">Número 1 do mundo</HeroEyebrow>
      <p className="mt-1.5 text-xl font-black leading-tight sm:text-2xl" data-world-hero-title>{leader.name}</p>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-black tabular-nums text-foreground">{formatPts(leader.points)}</span>
        <span>no ranking mundial</span>
        {leader.country && <><span aria-hidden="true">·</span><CountryFlag country={leader.country} showLabel className="min-w-0 truncate" /></>}
      </p>
      <HeroCta to={leader.isPlayer ? '/ranking?scope=world&type=individual' : `/ranking?athlete=${encodeURIComponent(leader.id)}`}>Ver no ranking</HeroCta>
    </HeroShell>
  );
}

// ── 2. Líderes ───────────────────────────────────────────────────────────
// Etiquetas (Você / Sua dupla / Parceria encerrada) ficam FORA do nome
// truncado: num nome longo a 360px o nome encurta, a etiqueta não some.
function LeaderCard({ kind, label, icon: Icon, to, rows, renderName, renderTags = () => null, renderMeta, emptyText }) {
  const [first, ...rest] = rows || [];
  return (
    <Link to={to} data-world-leader={kind} className="group flex min-w-0 flex-col rounded-2xl border border-border/50 bg-card/55 p-3 transition-colors hover:border-primary/35">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </p>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </div>
      {first ? (
        <>
          <div className="mt-2 flex min-w-0 items-start gap-2.5" data-world-leader-row="1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-sm font-black tabular-nums text-amber-400">{first.rank}</span>
            <div className="min-w-0 flex-1">
              <p className="min-w-0 text-sm font-black leading-tight">{renderName(first, true)}</p>
              {renderTags(first, true) && <p className="mt-1 flex flex-wrap gap-1">{renderTags(first, true)}</p>}
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{renderMeta(first)}</p>
            </div>
          </div>
          {rest.length > 0 && (
            <ol className="mt-2 space-y-1 border-t border-border/40 pt-2">
              {rest.map((row) => (
                <li key={row.key || row.id} className="flex min-w-0 items-center gap-2.5 text-xs" data-world-leader-row={row.rank}>
                  <span className="w-8 shrink-0 text-center font-black tabular-nums text-muted-foreground">{row.rank}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="min-w-0 truncate font-semibold">{renderName(row, false)}</span>
                    {renderTags(row, false)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatPts(row.points)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground" data-world-leader-empty>{emptyText}</p>
      )}
    </Link>
  );
}

function YouTag({ label = 'Você' }) {
  return <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase tracking-wide text-primary">{label}</span>;
}

// A escada de duplas é por par e guarda parcerias desfeitas com pontos na
// janela; a etiqueta diz isso sem tirar a dupla da posição que ela ocupa.
function EndedTag({ long = false }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-secondary/70 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase tracking-wide text-muted-foreground" data-pair-current="false" title="Esta parceria não está mais ativa">
      {long ? 'Parceria encerrada' : 'Encerrada'}
    </span>
  );
}

const athleteTags = (row) => (row.isPlayer ? <YouTag /> : null);
const pairTags = (row, lead) => (row.isPlayerPair || row.current === false
  ? <>{row.isPlayerPair && <YouTag label="Sua dupla" />}{row.current === false && <EndedTag long={lead} />}</>
  : null);

export function CircuitLeaders({ worldTop, doublesTop, raceTop, seasonYear, rankingAvailable, doublesAvailable }) {
  const athleteMeta = (row) => [formatPts(row.points), row.country].filter(Boolean).join(' · ');
  return (
    <section data-world-block="leaders" aria-label="Líderes do circuito" className="space-y-1.5">
      <SectionLabel title="Líderes do circuito" action={<SectionLink to="/ranking?scope=world&type=individual">Ranking</SectionLink>} />
      <div className="grid gap-2 sm:grid-cols-3">
        <LeaderCard
          kind="individual"
          label="Mundial"
          icon={Crown}
          to="/ranking?scope=world&type=individual"
          rows={worldTop}
          renderName={(row) => row.name}
          renderTags={athleteTags}
          renderMeta={athleteMeta}
          emptyText={rankingAvailable ? 'Ninguém pontuou no ranking mundial ainda.' : 'Ranking indisponível no momento.'}
        />
        <LeaderCard
          kind="doubles"
          label="Duplas"
          icon={Users}
          to="/ranking?scope=world&type=doubles"
          rows={doublesTop}
          renderName={(row, lead) => (lead
            ? row.members.map((member, index) => <span key={member.id} className="block truncate">{index > 0 && <span className="text-muted-foreground">&amp; </span>}{member.name}</span>)
            : pairLabel(row.members))}
          renderTags={pairTags}
          renderMeta={(row) => [formatPts(row.points), row.record ? `${row.record.titles} ${row.record.titles === 1 ? 'título' : 'títulos'}` : null].filter(Boolean).join(' · ')}
          emptyText={doublesAvailable ? 'Nenhuma dupla pontuou ainda.' : 'Ranking de duplas indisponível no momento.'}
        />
        <LeaderCard
          kind="race"
          label={seasonYear ? `Race ${seasonYear}` : 'Race'}
          icon={TrendingUp}
          to="/ranking?scope=race&type=individual"
          rows={raceTop}
          renderName={(row) => row.name}
          renderTags={athleteTags}
          renderMeta={athleteMeta}
          emptyText={rankingAvailable ? 'Ninguém pontuou na Race desta temporada ainda.' : 'Race indisponível no momento.'}
        />
      </div>
    </section>
  );
}

// ── 3. Grandes eventos ───────────────────────────────────────────────────
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function DateChip({ date }) {
  const day = String(date || '').slice(8, 10);
  const month = MONTHS[Number(String(date || '').slice(5, 7)) - 1] || '';
  return (
    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-border/50 bg-secondary/40 leading-none">
      <span className="text-sm font-black tabular-nums">{day}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase text-muted-foreground">{month}</span>
    </span>
  );
}

const STATUS_STYLE = {
  live: 'bg-success/15 text-success',
  open: 'bg-primary/15 text-primary',
  soon: 'bg-secondary/70 text-muted-foreground',
};

function eventStatusLabel(event) {
  if (event.status === 'live') return 'Ao vivo';
  if (event.status === 'open') return 'Inscrições';
  return untilLabel(event.daysUntil);
}

function EventRow({ event, careerDate }) {
  return (
    <li data-world-event-row={event.status}>
      <Link to={`/tournaments?tournament=${encodeURIComponent(event.id)}`} className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-secondary/30">
        <DateChip date={event.startDate} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{event.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{event.tier}{event.location ? ` · ${event.location}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLE[event.status]}`} title={formatWorldDate(event.startDate, careerDate)}>{eventStatusLabel(event)}</span>
      </Link>
    </li>
  );
}

function ChampionRow({ champion, careerDate }) {
  return (
    <li data-world-champion-row>
      <Link to={`/tournaments?tournament=${encodeURIComponent(champion.id)}`} className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-secondary/30">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15"><Medal className="h-4.5 w-4.5 text-amber-400" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{pairLabel(champion.champions)}{champion.playerWon && <YouTag label="Seu título" />}</p>
          <p className="truncate text-[11px] text-muted-foreground">{champion.name} · {champion.tier}</p>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatWorldDate(champion.date, careerDate)}</span>
      </Link>
    </li>
  );
}

export function MajorEvents({ upcoming, champions, careerDate, available }) {
  return (
    <section data-world-block="events" aria-label="Grandes eventos" className="space-y-1.5">
      <SectionLabel title="Grandes eventos" action={<SectionLink to="/tournaments?tab=calendar">Calendário</SectionLink>} />
      <div className="grid gap-3 rounded-2xl border border-border/50 bg-card/55 p-3 lg:grid-cols-2 lg:gap-5">
        <div className="min-w-0" data-world-events="upcoming">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Próximos</p>
          {upcoming.length ? (
            <ul className="mt-1">{upcoming.map((event) => <EventRow key={event.id} event={event} careerDate={careerDate} />)}</ul>
          ) : (
            <p className="px-1 py-2 text-xs text-muted-foreground">{available ? 'Nenhum grande evento no calendário por enquanto.' : 'Calendário indisponível no momento.'}</p>
          )}
        </div>
        <div className="min-w-0 border-t border-border/40 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" data-world-events="champions">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Campeões recentes</p>
          {champions.length ? (
            <ul className="mt-1">{champions.map((champion) => <ChampionRow key={champion.id} champion={champion} careerDate={careerDate} />)}</ul>
          ) : (
            <p className="px-1 py-2 text-xs text-muted-foreground">{available ? 'Os campeões dos grandes eventos aparecem aqui depois das primeiras finais.' : 'Resultados indisponíveis no momento.'}</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 5. Explorar ──────────────────────────────────────────────────────────
export const EXPLORE = [
  { to: '/ranking?scope=world&type=individual', icon: Crown, label: 'Ranking' },
  { to: '/ranking?scope=race&type=individual', icon: TrendingUp, label: 'Race' },
  { to: '/ranking?scope=world&type=doubles', icon: Users, label: 'Duplas' },
  { to: '/tournaments?tab=calendar', icon: CalendarDays, label: 'Calendário' },
  { to: '/world/directory?tab=athletes', icon: UserCog, label: 'Atletas' },
  { to: '/encyclopedia?tab=history', icon: BookOpen, label: 'História' },
];

export function ExploreCircuit() {
  return (
    <nav data-world-block="explore" aria-label="Explorar o circuito" className="space-y-1.5">
      <SectionLabel title="Explorar o circuito" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {EXPLORE.map(({ to, icon: Icon, label }) => (
          <Link key={label} to={to} className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-border/50 bg-card/55 px-1 py-2 text-center transition-colors hover:border-primary/30">
            <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
            <span className="max-w-full truncate text-[11px] font-bold">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * Leituras do circuito para a tela, uma por autoridade, em paralelo.
 * `null` = a autoridade não respondeu (a tela diz "indisponível", nunca
 * apresenta um vazio como fato). Exportada para o teste usar as MESMAS
 * leituras da página.
 */
export async function readWorldCircuit(profile) {
  const reads = await loadModuleTasks({
    ranking: { task: () => buildWorldRankingSnapshot(profile), fallback: null, label: 'ranking mundial (Mundo)' },
    teams: { task: () => getTeamRankings(TEAM_LEADERS_READ), fallback: null, label: 'ranking de duplas (Mundo)' },
    // Parceiro atual do jogador: a mesma regra do Ranking (Partnership
    // ativa do jogador → parceiro; perfil como reserva).
    playerPartnership: {
      task: () => localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1),
      fallback: null,
      label: 'parceria do jogador (Mundo)',
    },
    tournaments: { task: () => localGame.entities.Tournament.list('-start_date', TOURNAMENT_READ), fallback: null, label: 'torneios (Mundo)' },
  });
  // Só os atletas das duplas do topo (para saber se ainda jogam juntos).
  const memberIds = doublesMemberIds(reads.teams);
  const pairAthletes = Array.isArray(reads.teams)
    ? (await Promise.all(memberIds.map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)))).filter(Boolean)
    : null;
  const active = Array.isArray(reads.playerPartnership) ? reads.playerPartnership[0] || null : undefined;
  const playerPartnerId = active === undefined
    ? undefined
    : (active?.partner_bot_id || active?.athlete_b_id || profile?.partner_id || profile?.ai_partner_id || null);
  return {
    ranking: reads.ranking,
    teams: reads.teams,
    pairAthletes,
    playerPartnerId,
    tournaments: reads.tournaments,
    careerDate: profile?.career_date || null,
    playerId: profile?.id || null,
  };
}

export default function WorldHub() {
  const [profile, setProfile] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [circuit, setCircuit] = useState(null);
  const [activeTab, setActiveTab] = useState('today');
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const user = await localGame.auth.me();
    const currentProfile = await ensureMyProfile(user);
    const [nextSnapshot, nextCircuit] = await Promise.all([
      getLivingWorldSnapshot(currentProfile, 80),
      readWorldCircuit(currentProfile),
    ]);
    setProfile(currentProfile);
    setSnapshot(nextSnapshot);
    setCircuit(nextCircuit);
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

  const careerDate = profile?.career_date || null;
  // Uma derivação por carga (as listas já vêm limitadas pela leitura).
  const model = useMemo(() => buildWorldCircuitModel(circuit || {}), [circuit]);

  if (loading) return <LoadingScreen />;

  const events = snapshot?.events || [];
  // getLivingWorldSnapshot (src/lib/livingWorldEngine.js) devolve `categorias`
  // em português (circuito/mercado/saude) — as abas Circuito e Mercado liam
  // `categories.circuit`/`categories.market`, chaves que nunca existiram, e
  // ficavam sempre vazias. Correção de leitura apenas (nenhuma mudança na
  // geração do Universo Vivo).
  const circuitEvents = snapshot?.categories?.circuito || [];
  const marketEvents = snapshot?.categories?.mercado || [];
  // Fase 9.3, item 2 — grupo dedicado a eventos envolvendo atleta real
  // (`categories.reais`, calculado em getLivingWorldSnapshot cruzando
  // `related_players` contra o registro canônico), cruzando categoria —
  // o mesmo evento pode já aparecer em Ranking/Torneios/Mercado também;
  // o objetivo aqui é dar um lugar de destaque fixo, não desduplicar.
  const realAthleteEvents = snapshot?.categories?.reais || [];

  // Agrupamentos temáticos da área "Hoje" (seção 21): Ranking/Torneios/Mercado
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
  const seasonYear = careerDate ? Number(String(careerDate).slice(0, 4)) : null;

  return (
    <Page>
      <PageContent data-world-ready>
        {/* Atualizar fica na linha da data (não no canto superior direito, que
            a pilha de atalhos flutuantes do app cobre no celular e no desktop). */}
        <header className="min-w-0" data-world-block="header">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Mundo</p>
          <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">Circuito mundial</h1>
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {careerDate && <p className="min-w-0 truncate">{seasonYear ? `Temporada ${seasonYear} · ` : ''}{formatDate(careerDate)}</p>}
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 font-bold text-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Atualizar
            </button>
          </div>
        </header>

        <CircuitHero highlight={model.highlight} careerDate={careerDate} />

        <CircuitLeaders
          worldTop={model.worldTop}
          doublesTop={model.doublesTop}
          raceTop={model.raceTop}
          seasonYear={seasonYear}
          rankingAvailable={model.rankingAvailable}
          doublesAvailable={model.doublesAvailable}
        />

        <MajorEvents upcoming={model.upcoming} champions={model.champions} careerDate={careerDate} available={model.tournamentsAvailable} />

        <section data-world-block="news" aria-label="Notícias do circuito" className="space-y-2">
          <SectionLabel title="Notícias do circuito" action={<SectionLink to="/world/circuit?tab=news">Central do circuito</SectionLink>} />
          <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="buttons" />

          {activeTab === 'today' && (
            <div className="space-y-3">
              {snapshot?.bulletin && (
                <Surface variant="premium" padding="compact">
                  <SurfaceHeader title={snapshot.bulletin.title} description="Resumo semanal do mundo" icon={Activity} compact />
                  <p className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${bulletinOpen ? '' : 'line-clamp-4'}`}>
                    {snapshot.bulletin.content}
                  </p>
                  <button type="button" onClick={() => setBulletinOpen((value) => !value)} className="mt-1 min-h-8 text-xs font-bold text-primary" aria-expanded={bulletinOpen}>
                    {bulletinOpen ? 'Mostrar menos' : 'Ler boletim completo'}
                  </button>
                </Surface>
              )}

              {snapshot?.breaking && snapshot.breaking.id !== snapshot?.bulletin?.id && (
                <WorldEventCard event={snapshot.breaking} profile={profile} variant="hero" />
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                <CompactEventGroup title="Ranking" icon={TrendingUp} events={rankingMoves} profile={profile} onMore={() => setActiveTab('circuit')} emptyMessage="Nenhum movimento de ranking recente." />
                <CompactEventGroup title="Torneios" icon={Trophy} events={tournamentResults} profile={profile} onMore={() => setActiveTab('circuit')} emptyMessage="Nenhum resultado importante recente." />
                <CompactEventGroup title="Mercado" icon={Users} events={marketEvents} profile={profile} onMore={() => setActiveTab('market')} emptyMessage="Nenhuma movimentação recente." />
                <CompactEventGroup title="Tendências" icon={Flame} events={trendingStories} profile={profile} moreTo="/world-events" emptyMessage="A comunidade está tranquila no momento." />
                <CompactEventGroup title="Atletas reais" icon={Crown} events={realAthleteEvents} profile={profile} moreTo="/world-events" emptyMessage="Nenhum acontecimento recente envolvendo atletas reais." />
              </div>
            </div>
          )}

          {activeTab === 'circuit' && (
            <Surface padding="compact">
              <SurfaceHeader
                title="Circuito profissional"
                description="Resultados, rankings e torneios em andamento."
                icon={Trophy}
                stackActionOnMobile
                action={(
                  <div className="flex flex-wrap gap-2">
                    <Link to="/ranking" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Ranking</Link>
                    <Link to="/tournaments" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Torneios</Link>
                  </div>
                )}
              />
              <EventList events={circuitEvents} profile={profile} emptyTitle="Nenhum resultado recente" emptyMessage="Os resultados aparecerão quando os torneios mundiais forem processados." />
            </Surface>
          )}

          {activeTab === 'market' && (
            <Surface padding="compact">
              <SurfaceHeader
                title="Mercado mundial"
                description="Movimentações de atletas, duplas, treinadores e clubes."
                icon={Users}
                stackActionOnMobile
                action={(
                  <div className="flex flex-wrap gap-2">
                    <Link to="/world-market" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Mercado</Link>
                    <Link to="/partners" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Duplas</Link>
                    <Link to="/coaches" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Treinadores</Link>
                  </div>
                )}
              />
              <EventList events={marketEvents} profile={profile} emptyTitle="Mercado estável" emptyMessage="Trocas de dupla, promessas e aposentadorias aparecerão aqui conforme o tempo avançar." />
            </Surface>
          )}

          {activeTab === 'history' && (
            <Surface padding="compact">
              <SurfaceHeader title="Linha do tempo mundial" description="Memória histórica do circuito por temporada." icon={History} />
              <Timeline events={events} />
            </Surface>
          )}
        </section>

        <ExploreCircuit />
      </PageContent>
    </Page>
  );
}
