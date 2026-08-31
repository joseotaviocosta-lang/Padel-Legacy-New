import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Trophy, Users, Globe, Crown, Link, Plus, CalendarDays, Medal, Activity } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import {
  CompactListItem, CountryFlag, EmptyState, Page, PageContent, PageHeader, PageSkeleton, PlayerAvatar,
  RankingPosition, Tabs,
} from '@/components/design-system';
import { loadModuleTasks } from '@/lib/moduleLoading';
import AthleteDetail from '@/components/athletes/AthleteDetail.jsx';

const LIST_PAGE_SIZE = 50;

const TABS = [
  { key: 'circuit', label: 'Circuito', icon: Trophy },
  { key: 'race', label: 'Race', icon: CalendarDays },
  { key: 'teams', label: 'Duplas', icon: Link },
  { key: 'players', label: 'Jogadores', icon: Trophy },
  { key: 'clubs', label: 'Clubes', icon: Users },
  { key: 'countries', label: 'Países', icon: Globe },
];

// Fase 11: as abas Circuito/Jogadores/Race mostram o ranking INDIVIDUAL — a
// mesma fonte canônica usada por Header/Home/Season (buildWorldRankingSnapshot,
// src/lib/padel.js). Nenhum pseudo-atleta derivado de TeamRanking entra aqui;
// a aba Duplas continua 100% separada, lendo TeamRanking diretamente.
function toCircuitDisplay(entry) {
  // O objeto bruto (AthleteProfile/PlayerProfile) vai por baixo para que
  // AthleteDetail continue mostrando personalidade, fase de carreira, lesão,
  // etc. — só os campos de ranking em si vêm da fonte canônica por cima.
  return {
    ...entry.raw,
    id: entry.id,
    name: entry.name,
    sport_name: entry.name,
    country: entry.country || 'Internacional',
    circuit_category: entry.circuitCategory || 'Profissional',
    overall_rating: entry.overallRating,
    world_ranking_points: entry.points,
    ranking_points: entry.points,
    race_points: entry.racePoints,
    ranking_previous_position: entry.previousPosition,
    is_player_profile: entry.isPlayer,
  };
}

export default function Ranking() {
  const [searchParams] = useSearchParams();
  const openedAthleteRef = useRef(null);
  const [tab, setTab] = useState('circuit');
  const [clubs, setClubs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [rankingSnapshot, setRankingSnapshot] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [selectedAthlete, setSelectedAthlete] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const profile = await ensureMyProfile(user);
        const { c, t, snapshot } = await loadModuleTasks({
          c: { task: () => localGame.entities.Club.list('-club_points', 100), fallback: [], label: 'clubes do ranking' },
          t: { task: () => localGame.entities.TeamRanking.list('-ranking_points', 600), fallback: [], label: 'ranking de duplas' },
          snapshot: {
            task: () => buildWorldRankingSnapshot(profile),
            fallback: { entries: [], playerEntry: null, playerRank: 0, playerPoints: 0, total: 0, unranked: true },
            label: 'ranking mundial individual',
          },
        });
        setClubs(c || []);
        setTeams(t || []);
        setRankingSnapshot(snapshot);
        const year = profile?.career_date ? Number(String(profile.career_date).slice(0, 4)) : null;
        setSeasonYear(Number.isFinite(year) ? year : null);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { setVisibleCount(LIST_PAGE_SIZE); }, [tab]);

  const { countries, circuitAthletes, raceAthletes, raceHasPoints } = useMemo(() => {
    const entries = rankingSnapshot?.entries || [];
    const circuitAthletes = entries.map(toCircuitDisplay);

    // Race é uma re-ordenação de apresentação da MESMA população canônica —
    // não uma segunda fonte de verdade. Empate segue o mesmo desempate do
    // ranking geral (pontos, depois id) para ficar determinístico.
    const raceAthletes = [...entries]
      .sort((a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id)))
      .map(toCircuitDisplay);
    // Correção UI/cronologia — Fase 3: no início da carreira/temporada
    // ninguém pontuou no Race ainda (só o Circuito guarda histórico). Sem
    // isso, o pódio mostrava 1º/2º/3º fantasmas com pontos do Circuito
    // anterior copiados por engano.
    const raceHasPoints = entries.some((entry) => Number(entry.racePoints) > 0);

    const countryMap = {};
    for (const entry of entries) {
      const country = entry.country || 'Internacional';
      if (!countryMap[country]) countryMap[country] = { name: country, players: 0, totalXp: 0, totalOvr: 0 };
      countryMap[country].players += 1;
      countryMap[country].totalXp += entry.points;
      countryMap[country].totalOvr += entry.overallRating;
    }
    const countryRanking = Object.values(countryMap)
      .map(country => ({ ...country, avgOvr: Math.round(country.totalOvr / Math.max(1, country.players)) }))
      .sort((a, b) => b.totalXp - a.totalXp || b.players - a.players || a.name.localeCompare(b.name, 'pt-BR'));

    return { countries: countryRanking, circuitAthletes, raceAthletes, raceHasPoints };
  }, [rankingSnapshot]);

  useEffect(() => {
    const requestedId = searchParams.get('athlete');
    if (!requestedId || loading || openedAthleteRef.current === requestedId) return;
    openedAthleteRef.current = requestedId;
    const requested = circuitAthletes.find((athlete) => String(athlete.id) === requestedId);
    if (requested) {
      setTab('circuit');
      setSelectedAthlete(requested);
    }
  }, [circuitAthletes, loading, searchParams]);

  if (loading) return <PageSkeleton variant="list" rows={8} />;

  function CircuitList({ items, race = false }) {
    if (!items.length) return <EmptyState compact icon={Trophy} title="Circuito vazio" description="O circuito será preenchido após o próximo avanço semanal." />;
    // Correção UI/cronologia — Fase 3: enquanto ninguém pontuou na Race
    // (início de carreira/temporada), mostra um estado vazio explícito em
    // vez de um pódio com posições e pontos fantasmas.
    if (race && !raceHasPoints) {
      return (
        <EmptyState
          compact
          icon={CalendarDays}
          title={`A temporada ${seasonYear || 'atual'} ainda não começou`}
          description="Nenhum ponto foi distribuído na Race ainda — dispute torneios para começar a pontuar."
        />
      );
    }
    return (
      <>
        <Podium
          items={items}
          renderName={a => a.name || 'Atleta'}
          renderSub={a => `${Number(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points)) || 0} pts`}
        />
        {items.slice(0, visibleCount).map((a, i) => {
          const points = Number(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points)) || 0;
          const previous = Number(a.ranking_previous_position) || i + 1;
          const movement = previous - (i + 1);
          const isPlayer = Boolean(a.is_player_profile);
          return (
            <CompactListItem
              key={a.id || `${a.name}-${i}`}
              onClick={() => setSelectedAthlete(a)}
              highlighted={isPlayer}
              leading={<><RankingPosition position={i + 1} movement={movement} /><PlayerAvatar name={a.name} shape="rounded" /></>}
              title={<>{a.name || 'Atleta'}{isPlayer && <span className="ml-1.5 text-[9px] font-black uppercase text-primary">Você</span>}</>}
              meta={<><CountryFlag country={a.country || a.nationality} /> {a.circuit_category || 'Future'} · {Number(a.overall_rating ?? a.overall) || 0} OVR</>}
              trailing={<p className="font-black text-primary tabular-nums">{points.toLocaleString('pt-BR')}</p>}
            />
          );
        })}
        {visibleCount < items.length && (
          <button type="button" onClick={() => setVisibleCount(value => value + LIST_PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
            Carregar mais posições ({Math.min(LIST_PAGE_SIZE, items.length - visibleCount)})
          </button>
        )}
      </>
    );
  }

  const podiumColors = ['text-amber-400 bg-amber-500/10', 'text-slate-300 bg-slate-500/10', 'text-orange-400 bg-orange-500/10'];

  function Podium({ items, renderName, renderSub }) {
    if (items.length < 3) return null;
    return (
      <div className="flex items-end justify-center gap-2 py-4">
        {[1, 0, 2].map((idx) => {
          const item = items[idx];
          if (!item) return null;
          const heights = ['h-24', 'h-28', 'h-20'];
          const pos = idx + 1;
          return (
            <div key={idx} className="flex flex-col items-center" style={{ order: idx }}>
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/40 to-secondary flex items-center justify-center ring-2 mb-1" style={{ borderColor: pos === 1 ? 'hsl(45 93% 47%)' : 'transparent' }}>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[10px] font-bold truncate max-w-[80px] text-center">{renderName(item)}</span>
              {pos === 1 && <Crown className="h-4 w-4 text-amber-400 -mb-1" />}
              <div className={`w-20 ${heights[idx]} rounded-t-xl flex flex-col items-center justify-center ${podiumColors[idx]}`}>
                <span className="text-2xl font-black">{pos}</span>
                <span className="text-[9px] opacity-70 text-center px-1">{renderSub(item)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Page size="wide">
      <PageContent>
      <PageHeader
        dense
        eyebrow="Circuito mundial"
        icon={Trophy}
        title="Ranking"
        description="Acompanhe posições, pontos, tendências e a corrida da temporada em um painel único."
        tone="premium"
        hudLabel="Líderes do ranking"
        hudItems={[
          { label: 'líder', value: `${circuitAthletes[0]?.name || '—'} · ${Number(circuitAthletes[0]?.world_ranking_points ?? circuitAthletes[0]?.ranking_points) || 0}pts`, icon: Crown, tone: 'premium' },
          {
            // Correção UI/cronologia — Fase 3: sem pontos de Race distribuídos
            // ainda, o chip não pode citar um "líder" fantasma com 0pts.
            label: 'race',
            value: raceHasPoints
              ? `${raceAthletes[0]?.name || '—'} · ${Number(raceAthletes[0]?.race_points) || 0}pts`
              : 'Temporada não iniciada',
            icon: Activity,
            tone: 'info',
          },
          { label: 'países', value: countries.length, icon: Medal, tone: 'success' },
          { label: 'clubes', value: clubs.length, icon: Users },
        ]}
      />

      <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} variant="segmented" />

      {/* Lists */}
      <div className="render-window space-y-2">
        {tab === 'circuit' && <CircuitList items={circuitAthletes} />}
        {tab === 'race' && <CircuitList items={raceAthletes} race />}

        {/* Teams (primary) */}
        {tab === 'teams' && (
          teams.length === 0 ? (
            <EmptyState compact icon={Link} title="Sem duplas" description="Nenhuma dupla ranqueada ainda." />
          ) : (
            <>
              <Podium
                items={teams}
                renderName={t => `${t.player1_name} & ${t.player2_name}`}
                renderSub={t => `${t.ranking_points} pts`}
              />
              {teams.slice(0, visibleCount).map((t, i) => (
                <CompactListItem
                  key={t.id}
                  leading={<><RankingPosition position={i + 1} movement={0} /><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0"><Users className="h-4.5 w-4.5 text-primary" /></div></>}
                  title={`${t.player1_name} & ${t.player2_name}`}
                  meta={`${t.wins || 0}V · ${t.losses || 0}D · ${(t.titles || []).length} título(s)`}
                  trailing={<div className="text-right"><p className="font-black text-primary tabular-nums">{t.ranking_points || 0}</p><p className="text-[9px] text-muted-foreground uppercase">pontos</p></div>}
                />
              ))}
            </>
          )
        )}

        {/* Jogadores — mesma classificação mundial mostrada na Carreira */}
        {tab === 'players' && <CircuitList items={circuitAthletes} />}

        {/* Clubs */}
        {tab === 'clubs' && (
          <>
          <div className="flex justify-end mb-2">
            <RouterLink to="/clubs" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-3.5 w-3.5" /> Gerenciar clubes
            </RouterLink>
          </div>
          {clubs.length === 0 ? (
            <EmptyState compact icon={Users} title="Sem clubes" description="Nenhum clube cadastrado." />
          ) : clubs.slice(0, visibleCount).map((c, i) => (
            <CompactListItem
              key={c.id}
              leading={<><RankingPosition position={i + 1} movement={0} /><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center overflow-hidden shrink-0">{c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary text-sm">{(c.name || '?')[0]?.toUpperCase()}</span>}</div></>}
              title={c.name}
              meta={<>{c.country && <CountryFlag country={c.country} />} {c.city || ''}{c.city && c.country ? ', ' : ''}{c.country || ''} · {c.member_count || 0} membros</>}
              trailing={<div className="text-right"><p className="font-black text-primary tabular-nums">{c.club_points || 0}</p><p className="text-[9px] text-muted-foreground uppercase">pontos</p></div>}
            />
          ))}
          </>
        )}

        {/* Countries */}
        {tab === 'countries' && countries.slice(0, visibleCount).map((c, i) => (
          <CompactListItem
            key={c.name}
            leading={<><RankingPosition position={i + 1} movement={0} /><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent/30 to-secondary flex items-center justify-center text-lg shrink-0"><CountryFlag country={c.name} /></div></>}
            title={c.name}
            meta={`${c.players} jogadores · ${c.avgOvr} OVR médio`}
            trailing={<div className="text-right"><p className="font-black text-primary tabular-nums">{c.totalXp.toLocaleString()}</p><p className="text-[9px] text-muted-foreground uppercase">XP total</p></div>}
          />
        ))}

        {((tab === 'teams' && visibleCount < teams.length) ||
          (tab === 'clubs' && visibleCount < clubs.length) ||
          (tab === 'countries' && visibleCount < countries.length)) && (
          <button type="button" onClick={() => setVisibleCount(value => value + LIST_PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
            Carregar mais
          </button>
        )}
      </div>
      {selectedAthlete && <AthleteDetail athlete={selectedAthlete} onClose={() => setSelectedAthlete(null)} />}
      </PageContent>
    </Page>
  );
}
