import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Trophy, Users, User, Crown, Link, CalendarDays, Medal, Activity, Target, ArrowUp, ArrowDown } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import { getTeamRank, getTeamRankings, ensurePlayerTeamRanking, teamKey } from '@/lib/teamRanking';
import { getTeamRaceRankings, getTeamRaceRank } from '@/lib/teamRaceRanking';
import { buildPlayerRankingContext, bestRaceResult, buildTeamFinalsCut, TEAM_FINALS_CUT, resolveRankingView } from '@/lib/rankingDisplay';
import { buildCountryDirectory } from '@/lib/countryDirectory.js';
import {
  CompactListItem, CountryFlag, EmptyState, Page, PageContent, PageHeader, PageSkeleton, PlayerAvatar,
  RankingPosition, Tabs,
} from '@/components/design-system';
import { loadModuleTasks } from '@/lib/moduleLoading';
import AthleteDetail from '@/components/athletes/AthleteDetail.jsx';

const LIST_PAGE_SIZE = 50;

// Playthrough 5.23, Parte K — dois níveis: PERÍODO (scope) × TIPO (type).
// Cada linha tem só duas opções, cabendo em 360px sem scroll horizontal.
const SCOPE_TABS = [
  { key: 'world', label: 'Mundial', icon: Trophy },
  { key: 'race', label: 'Race', icon: CalendarDays },
];
const TYPE_TABS = [
  { key: 'individual', label: 'Individual', icon: User },
  { key: 'doubles', label: 'Duplas', icon: Users },
];

function toCircuitDisplay(entry) {
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

function formatPoints(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

const PODIUM_COLORS = ['text-amber-400 bg-amber-500/10', 'text-slate-300 bg-slate-500/10', 'text-orange-400 bg-orange-500/10'];

function Podium({ items, renderName, renderSub }) {
  if (!items || items.length < 3) return null;
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
            <div className={`w-20 ${heights[idx]} rounded-t-xl flex flex-col items-center justify-center ${PODIUM_COLORS[idx]}`}>
              <span className="text-2xl font-black">{pos}</span>
              <span className="text-[9px] opacity-70 text-center px-1">{renderSub(item)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IndividualList({ items, race = false, visibleCount, onLoadMore, onSelect, emptyTitle, emptyDescription }) {
  if (!items.length) {
    return <EmptyState compact icon={Trophy} title={emptyTitle || 'Circuito vazio'} description={emptyDescription || 'O circuito será preenchido após o próximo avanço semanal.'} />;
  }
  return (
    <>
      <Podium
        items={items}
        renderName={(a) => a.name || 'Atleta'}
        renderSub={(a) => `${formatPoints(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points))} pts`}
      />
      {items.slice(0, visibleCount).map((a, i) => {
        const points = Number(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points)) || 0;
        const previous = Number(a.ranking_previous_position) || i + 1;
        const movement = previous - (i + 1);
        const isPlayer = Boolean(a.is_player_profile);
        return (
          <CompactListItem
            key={a.id || `${a.name}-${i}`}
            onClick={() => onSelect(a)}
            highlighted={isPlayer}
            leading={<><RankingPosition position={i + 1} movement={movement} /><PlayerAvatar name={a.name} shape="rounded" /></>}
            title={<>{a.name || 'Atleta'}{isPlayer && <span className="ml-1.5 text-[9px] font-black uppercase text-primary">Você</span>}</>}
            meta={<><CountryFlag country={a.country || a.nationality} /> {a.circuit_category || 'Future'} · {Number(a.overall_rating ?? a.overall) || 0} OVR</>}
            trailing={<p className="font-black text-primary tabular-nums">{formatPoints(points)}</p>}
          />
        );
      })}
      {visibleCount < items.length && (
        <button type="button" onClick={onLoadMore} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais posições ({Math.min(LIST_PAGE_SIZE, items.length - visibleCount)})
        </button>
      )}
    </>
  );
}

function TeamList({ items, visibleCount, onLoadMore, playerPairKey, pointsLabel = 'pontos', emptyTitle = 'Sem duplas', emptyDescription = 'Nenhuma dupla ranqueada ainda.' }) {
  if (!items.length) {
    return <EmptyState compact icon={Link} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <>
      <Podium items={items} renderName={(t) => `${t.player1_name} & ${t.player2_name}`} renderSub={(t) => `${formatPoints(t.race_points ?? t.ranking_points)} pts`} />
      {items.slice(0, visibleCount).map((t, i) => {
        const isPlayerPair = playerPairKey && t.team_key === playerPairKey;
        const points = Number(t.race_points ?? t.ranking_points) || 0;
        return (
          <CompactListItem
            key={t.id || t.team_key}
            highlighted={isPlayerPair}
            leading={<><RankingPosition position={t.ranking_display_position || i + 1} movement={0} /><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0"><Users className="h-4.5 w-4.5 text-primary" /></div></>}
            title={<>{t.player1_name} & {t.player2_name}{isPlayerPair && <span className="ml-1.5 text-[9px] font-black uppercase text-primary">Você</span>}</>}
            meta={t.stats_source === 'ledger'
              ? `${t.wins || 0}V · ${t.losses || 0}D · ${(t.titles || []).length} título(s)`
              : 'Histórico indisponível'}
            trailing={<div className="text-right"><p className="font-black text-primary tabular-nums">{formatPoints(points)}</p><p className="text-[9px] text-muted-foreground uppercase">{pointsLabel}</p></div>}
          />
        );
      })}
      {visibleCount < items.length && (
        <button type="button" onClick={onLoadMore} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais
        </button>
      )}
    </>
  );
}

function WorldIndividualCard({ context, rankLabel }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua posição mundial</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-black tabular-nums text-primary">{rankLabel}</span>
        <span className="text-lg font-black tabular-nums text-foreground">
          {formatPoints(context.points)} <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">pontos</span>
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          {context.above
            ? <span className="truncate text-muted-foreground"><span className="font-bold text-foreground">#{context.above.rank} {context.above.name}</span> · {formatPoints(context.above.points)} pts</span>
            : <span className="text-muted-foreground">Você é o líder do ranking</span>}
        </div>
        <div className="flex items-center gap-2">
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          {context.below
            ? <span className="truncate text-muted-foreground"><span className="font-bold text-foreground">#{context.below.rank} {context.below.name}</span> · {formatPoints(context.below.points)} pts</span>
            : <span className="text-muted-foreground">Você fecha o topo da lista</span>}
        </div>
      </div>
      {context.rank > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
          <Target className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-bold text-foreground">Próximo objetivo</span>
          <span className="text-muted-foreground">{context.nextMilestone.label} · faltam {context.nextMilestone.positionsRemaining} posições</span>
        </div>
      )}
    </div>
  );
}

function WorldDoublesCard({ playerName, partnerName, pairRank, playerPoints, partnerPoints }) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua dupla</p>
          <h3 className="mt-1.5 truncate text-lg font-black text-primary">{playerName} &amp; {partnerName}</h3>
        </div>
        <div className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
          {pairRank.unranked ? 'Sem ranking' : `#${pairRank.displayRank || pairRank.rank || '—'}`}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-black tabular-nums text-primary">{formatPoints(pairRank.points)}</span>
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">pontos</span>
      </div>
      <div className="mt-3 space-y-1 rounded-xl bg-card/70 p-3 text-xs">
        <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{playerName}</span><span className="font-black tabular-nums text-foreground">{formatPoints(playerPoints)}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{partnerName}</span><span className="font-black tabular-nums text-foreground">{formatPoints(partnerPoints)}</span></div>
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-1"><span className="font-black uppercase tracking-[0.14em] text-muted-foreground">Total</span><span className="font-black tabular-nums text-primary">{formatPoints(pairRank.points)}</span></div>
      </div>
    </div>
  );
}

function RaceIndividualCard({ seasonYear, raceRank, racePoints, raceSeason }) {
  return (
    <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua temporada {seasonYear || ''}</p>
        <div className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
          {raceRank > 0 ? `#${raceRank} na Race` : 'Sem ranking'}
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-4xl font-black tabular-nums text-primary">{formatPoints(racePoints)}</span>
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">pontos</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-card/70 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Torneios</p>
          <p className="mt-1 text-sm font-black text-foreground">{raceSeason.tournaments}</p>
        </div>
        {raceSeason.best && (
          <div className="rounded-xl bg-card/70 p-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Melhor resultado</p>
            <p className="mt-1 text-sm font-black text-foreground">{raceSeason.best.finish}</p>
          </div>
        )}
        {raceSeason.last && (
          <div className="rounded-xl bg-card/70 p-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Últimos pontos</p>
            <p className="mt-1 truncate text-sm font-black text-foreground">+{formatPoints(raceSeason.last.points)} — {raceSeason.last.tournament_name || 'Torneio'}</p>
          </div>
        )}
      </div>
      {/* Playthrough 5.23, Parte I — a Race Individual NÃO mostra "Top 8":
          as Finals são de DUPLAS. No máximo uma explicação secundária. */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        As Circuit Finals classificam as {TEAM_FINALS_CUT} melhores duplas — veja em Race → Duplas.
      </p>
    </div>
  );
}

function RaceDoublesCard({ playerName, partnerName, racePairRank, playerRacePoints, partnerRacePoints }) {
  return (
    // Playthrough 5.24, Parte A — o card estava apagado (bg-secondary/5).
    // Passa a ter o mesmo destaque do Mundial → Duplas, com a identidade
    // sazonal (secondary) em contraste real: gradiente, anel e borda viva.
    // Playthrough 5.24-B, Parte B — `secondary` é token de SUPERFÍCIE
    // (228 25% 14%, quase preto): usado como cor de TEXTO, o eyebrow e o
    // badge ficavam ~1.1:1 sobre o card escuro. Texto volta aos tokens de
    // texto reais: eyebrow = muted-foreground (como "Sua dupla"/"Sua posição
    // mundial"), badge = primary (como Mundial → Duplas).
    <div className="relative overflow-hidden rounded-2xl border border-secondary/50 bg-gradient-to-br from-secondary/20 via-card/80 to-primary/10 p-4 shadow-md ring-1 ring-secondary/25">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-secondary via-primary to-transparent" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua dupla na Race</p>
          <h3 className="mt-1.5 truncate text-lg font-black text-foreground">{playerName} &amp; {partnerName}</h3>
        </div>
        <div className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
          {racePairRank.unranked ? 'Ainda sem pontos na Race' : `#${racePairRank.displayRank || racePairRank.rank || '—'}`}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-black tabular-nums text-primary">{formatPoints(racePairRank.points)}</span>
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">pontos na Race</span>
      </div>
      <div className="mt-3 space-y-1 rounded-xl border border-border/50 bg-card/85 p-3 text-xs">
        <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{playerName} Race</span><span className="font-black tabular-nums text-foreground">{formatPoints(playerRacePoints)}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{partnerName} Race</span><span className="font-black tabular-nums text-foreground">{formatPoints(partnerRacePoints)}</span></div>
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-1"><span className="font-black uppercase tracking-[0.14em] text-muted-foreground">Total</span><span className="font-black tabular-nums text-primary">{formatPoints(racePairRank.points)}</span></div>
      </div>
    </div>
  );
}

// Playthrough 5.23, Partes I/T — corte para Circuit Finals, exibido onde a
// autoridade REAL vive (TeamRanking MUNDIAL, Top 8 duplas), com distância
// canônica para o #8 quando houver.
function FinalsCutCard({ cut }) {
  if (!cut?.hasRank) return null;
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Top {cut.cut} duplas → Circuit Finals</p>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-primary">#{cut.rankLabel}</span>
        <span className={`text-xs font-black uppercase tracking-[0.12em] ${cut.qualified ? 'text-success' : 'text-muted-foreground'}`}>
          {cut.qualified ? 'Classificada no momento' : (cut.pointsToCut != null ? `faltam ${formatPoints(cut.pointsToCut)} pontos para o Top ${cut.cut}` : 'Fora do Top 8')}
        </span>
      </div>
    </div>
  );
}

export default function Ranking() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedAthleteRef = useRef(null);
  const [scope, setScope] = useState('world');
  const [type, setType] = useState('individual');
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [raceTeams, setRaceTeams] = useState([]);
  const [rankingSnapshot, setRankingSnapshot] = useState(null);
  const [raceResults, setRaceResults] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [playerProfile, setPlayerProfile] = useState(null);
  const [playerPartner, setPlayerPartner] = useState(null);
  const [playerPairRank, setPlayerPairRank] = useState(null);
  const [playerRacePairRank, setPlayerRacePairRank] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const profile = await ensureMyProfile(user);
        setPlayerProfile(profile);
        const activePartnership = (await localGame.entities.Partnership
          .filter({ profile_id: profile.id, status: 'ativa' }, null, 1).catch(() => []))?.[0] || null;
        const activePartnerId = activePartnership?.partner_bot_id
          || activePartnership?.athlete_b_id
          || profile?.partner_id
          || profile?.ai_partner_id
          || null;
        if (activePartnerId) await ensurePlayerTeamRanking(profile).catch(() => null);
        // Playthrough 5.24-B, Parte I — só o que TODAS as views usam (HUD do
        // PageHeader + Individual). As listas e posições de Duplas (Mundial
        // e Race) carregam sob demanda, no efeito abaixo, quando a view é
        // aberta — antes as 4 views eram calculadas a cada montagem, mesmo
        // com só uma visível.
        const { c, a, snapshot, rr } = await loadModuleTasks({
          // Playthrough 5.24, Parte C — MESMAS listas da página de Países
          // (AthleteProfile 1500 + Club 200) para que a contagem de países
          // do header venha da MESMA autoridade (buildCountryDirectory).
          c: { task: () => localGame.entities.Club.list('-club_points', 200), fallback: [], label: 'clubes do ranking' },
          a: { task: () => localGame.entities.AthleteProfile.list('-world_ranking_points', 1500), fallback: [], label: 'atletas do diretório de países' },
          snapshot: {
            task: () => buildWorldRankingSnapshot(profile),
            fallback: { entries: [], playerEntry: null, playerRank: 0, playerPoints: 0, total: 0, unranked: true },
            label: 'ranking mundial individual',
          },
          rr: {
            task: () => localGame.entities.AthleteRankingResult.filter({ athlete_id: profile.id }, '-date', 200),
            fallback: [],
            label: 'resultados da temporada',
          },
        });
        setClubs(c || []);
        setAthletes(a || []);
        setRankingSnapshot(snapshot);
        setRaceResults(rr || []);
        if (activePartnerId) {
          const partnerProfile = await localGame.entities.AthleteProfile.get(activePartnerId).catch(() => null);
          const partner = partnerProfile || { id: activePartnerId, name: 'Parceiro', sport_name: 'Parceiro' };
          setPlayerPartner(partner);
        } else {
          setPlayerPartner(null);
        }
        const year = profile?.career_date ? Number(String(profile.career_date).slice(0, 4)) : null;
        setSeasonYear(Number.isFinite(year) ? year : null);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // Playthrough 5.24-B, Parte I — dados de Duplas sob demanda, uma vez por
  // período. Mesma autoridade de antes: lista mundial (getTeamRankings) e
  // posição canônica da dupla (getTeamRank) para o Mundial; lista e posição
  // da Race (getTeamRaceRankings/getTeamRaceRank) para a Race.
  const doublesRequestedRef = useRef({ world: false, race: false });
  const [doublesReady, setDoublesReady] = useState({ world: false, race: false });
  useEffect(() => {
    if (loading || type !== 'doubles' || !playerProfile?.id) return;
    const period = scope === 'race' ? 'race' : 'world';
    if (doublesRequestedRef.current[period]) return;
    doublesRequestedRef.current[period] = true;
    const partnerId = playerPartner?.id || null;
    (async () => {
      try {
        if (period === 'world') {
          const [t, pairRank] = await Promise.all([
            getTeamRankings(600).catch(() => []),
            partnerId ? getTeamRank(playerProfile, { id: partnerId }).catch(() => null) : null,
          ]);
          setTeams(t || []);
          setPlayerPairRank(pairRank);
        } else {
          const [rt, racePairRank] = await Promise.all([
            getTeamRaceRankings(600, { profile: playerProfile }).catch(() => []),
            partnerId ? getTeamRaceRank(playerProfile, { id: partnerId }).catch(() => null) : null,
          ]);
          setRaceTeams(rt || []);
          setPlayerRacePairRank(racePairRank);
        }
      } finally {
        setDoublesReady((current) => ({ ...current, [period]: true }));
      }
    })();
  }, [loading, type, scope, playerProfile, playerPartner]);

  // URL → estado (com normalização de links legados, sem poluir o histórico).
  useEffect(() => {
    const view = resolveRankingView(searchParams);
    setScope((current) => (current === view.scope ? current : view.scope));
    setType((current) => (current === view.type ? current : view.type));
    if (view.legacy) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.set('scope', view.scope);
      next.set('type', view.type);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const setView = useCallback((nextScope, nextType) => {
    setScope(nextScope);
    setType(nextType);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('scope', nextScope);
    next.set('type', nextType);
    setSearchParams(next); // push: back/forward do navegador funciona (Parte N)
  }, [searchParams, setSearchParams]);

  useEffect(() => { setVisibleCount(LIST_PAGE_SIZE); }, [scope, type]);

  const { countries, circuitAthletes, raceAthletes, raceHasPoints } = useMemo(() => {
    const entries = rankingSnapshot?.entries || [];
    const circuitAthletes = entries.map(toCircuitDisplay);
    const raceAthletes = [...entries]
      .sort((a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id)))
      .map(toCircuitDisplay);
    const raceHasPoints = entries.some((entry) => Number(entry.racePoints) > 0);

    // Playthrough 5.24, Parte C — a contagem de países vem da autoridade
    // única (countryDirectory.js), com as MESMAS listas da página de Países.
    return { countries: buildCountryDirectory(athletes, clubs), circuitAthletes, raceAthletes, raceHasPoints };
  }, [rankingSnapshot, athletes, clubs]);

  useEffect(() => {
    const requestedId = searchParams.get('athlete');
    if (!requestedId || loading || openedAthleteRef.current === requestedId) return;
    openedAthleteRef.current = requestedId;
    const requested = circuitAthletes.find((athlete) => String(athlete.id) === requestedId);
    if (requested) {
      setScope('world');
      setType('individual');
      setSelectedAthlete(requested);
    }
  }, [circuitAthletes, loading, searchParams]);

  const playerPositionContext = useMemo(() => {
    if (!rankingSnapshot?.playerEntry) {
      return buildPlayerRankingContext({ rank: 0, points: 0, above: null, below: null, total: 1500 });
    }
    const entries = circuitAthletes || [];
    const playerIndex = entries.findIndex((entry) => entry.is_player_profile || String(entry.id) === String(rankingSnapshot.playerEntry.id));
    const rank = Number(rankingSnapshot.playerRank) || 0;
    const above = playerIndex > 0 ? entries[playerIndex - 1] : null;
    const below = playerIndex >= 0 && playerIndex < entries.length - 1 ? entries[playerIndex + 1] : null;
    const aboveRank = above ? playerIndex : null;
    const belowRank = below ? playerIndex + 2 : null;
    return buildPlayerRankingContext({
      rank,
      points: Number(rankingSnapshot.playerPoints) || 0,
      above: above ? { name: above.name, rank: aboveRank, points: Number(above.world_ranking_points ?? above.ranking_points ?? 0) } : null,
      below: below ? { name: below.name, rank: belowRank, points: Number(below.world_ranking_points ?? below.ranking_points ?? 0) } : null,
      total: Math.max(rankingSnapshot.total || 1500, rank || 1),
    });
  }, [circuitAthletes, rankingSnapshot]);

  const raceRank = useMemo(() => {
    const idx = raceAthletes.findIndex((entry) => entry.is_player_profile || String(entry.id) === String(rankingSnapshot?.playerEntry?.id));
    return idx >= 0 ? idx + 1 : 0;
  }, [raceAthletes, rankingSnapshot]);

  const raceSeason = useMemo(() => {
    const results = (raceResults || []).filter((row) => !seasonYear || String(row?.date || '').startsWith(String(seasonYear)));
    const sorted = [...results].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
    return { tournaments: results.length, best: bestRaceResult(results), last: sorted[0] || null };
  }, [raceResults, seasonYear]);

  if (loading) return <PageSkeleton variant="list" rows={8} />;

  const playerName = rankingSnapshot?.playerEntry?.name || playerProfile?.sport_name || playerProfile?.name || 'Você';
  const partnerName = playerPartner?.sport_name || playerPartner?.name || 'Parceiro';
  const hasPartner = Boolean(playerPartner?.id);
  const playerPairKey = hasPartner && playerProfile?.id ? teamKey(playerProfile.id, playerPartner.id) : null;
  const playerRacePoints = Number(rankingSnapshot?.playerEntry?.racePoints) || 0;
  const partnerRacePoints = Math.max(0, Number(playerPartner?.race_points) || 0);

  const worldPairRank = playerPairRank || { rank: 0, points: 0, unranked: true, displayRank: '—' };
  const racePairRank = playerRacePairRank || { rank: 0, points: 0, unranked: true, displayRank: '—' };
  const finalsCut = buildTeamFinalsCut({
    rank: worldPairRank.unranked ? 0 : worldPairRank.rank,
    points: worldPairRank.points,
    board: teams,
  });

  const worldLeader = circuitAthletes[0];
  const raceLeader = raceAthletes[0];

  return (
    <Page size="wide">
      <PageContent>
      <PageHeader
        dense
        eyebrow="Circuito mundial"
        icon={Trophy}
        title="Ranking"
        description="Escolha o período (Mundial ou Race) e o tipo (Individual ou Duplas)."
        tone="premium"
        hudLabel="Líderes do ranking"
        hudItems={[
          { label: 'líder', value: `${worldLeader?.name || '—'} · ${formatPoints(worldLeader?.world_ranking_points ?? worldLeader?.ranking_points)}pts`, icon: Crown, tone: 'premium' },
          { label: 'race', value: raceHasPoints ? `${raceLeader?.name || '—'} · ${formatPoints(raceLeader?.race_points)}pts` : 'Temporada não iniciada', icon: Activity, tone: 'info' },
          { label: 'países', value: countries.length, icon: Medal, tone: 'success', onClick: () => navigate('/world/directory?tab=countries') },
          { label: 'clubes', value: clubs.length, icon: Users, onClick: () => navigate('/world/directory?tab=clubs') },
        ]}
      />

      {/* Dois níveis empilhados: período e tipo (Parte K/O). */}
      <div className="space-y-2">
        <Tabs tabs={SCOPE_TABS} activeTab={scope} onTabChange={(key) => setView(key, type)} variant="segmented" />
        <Tabs tabs={TYPE_TABS} activeTab={type} onTabChange={(key) => setView(scope, key)} variant="buttons" />
      </div>

      <div className="render-window space-y-2">
        {scope === 'world' && type === 'individual' && (
          <>
            <WorldIndividualCard
              context={playerPositionContext}
              rankLabel={playerPositionContext.rank > 0 ? `#${playerPositionContext.rank}` : 'Sem ranking'}
            />
            <IndividualList
              items={circuitAthletes}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((v) => v + LIST_PAGE_SIZE)}
              onSelect={setSelectedAthlete}
            />
          </>
        )}

        {type === 'doubles' && !doublesReady[scope === 'race' ? 'race' : 'world'] && (
          <PageSkeleton variant="list" rows={6} className="p-0 sm:p-0" />
        )}

        {scope === 'world' && type === 'doubles' && doublesReady.world && (
          <>
            {hasPartner ? (
              <>
                <WorldDoublesCard
                  playerName={playerName}
                  partnerName={partnerName}
                  pairRank={worldPairRank}
                  playerPoints={Number(rankingSnapshot?.playerPoints) || 0}
                  partnerPoints={Math.max(0, Number(playerPartner?.world_ranking_points ?? playerPartner?.ranking_points) || 0)}
                />
                <FinalsCutCard cut={{ ...finalsCut, rankLabel: worldPairRank.unranked ? '—' : (worldPairRank.displayRank || worldPairRank.rank) }} />
              </>
            ) : (
              <EmptyState icon={Link} title="Sem dupla ativa" description="Forme uma parceria para aparecer no ranking de duplas." />
            )}
            <TeamList
              items={teams}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((v) => v + LIST_PAGE_SIZE)}
              playerPairKey={playerPairKey}
              pointsLabel="pontos"
            />
          </>
        )}

        {scope === 'race' && type === 'individual' && (
          <>
            <RaceIndividualCard seasonYear={seasonYear} raceRank={raceRank} racePoints={playerRacePoints} raceSeason={raceSeason} />
            {raceHasPoints ? (
              <IndividualList
                items={raceAthletes}
                race
                visibleCount={visibleCount}
                onLoadMore={() => setVisibleCount((v) => v + LIST_PAGE_SIZE)}
                onSelect={setSelectedAthlete}
              />
            ) : (
              <EmptyState compact icon={CalendarDays} title={`A temporada ${seasonYear || 'atual'} ainda não começou`} description="Nenhum ponto foi distribuído na Race ainda — dispute torneios para começar a pontuar." />
            )}
          </>
        )}

        {scope === 'race' && type === 'doubles' && doublesReady.race && (
          <>
            {hasPartner ? (
              <RaceDoublesCard
                playerName={playerName}
                partnerName={partnerName}
                racePairRank={racePairRank}
                playerRacePoints={playerRacePoints}
                partnerRacePoints={partnerRacePoints}
              />
            ) : (
              <EmptyState icon={Link} title="Sem dupla ativa" description="Forme uma parceria para aparecer no ranking de duplas." />
            )}
            <TeamList
              items={raceTeams}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((v) => v + LIST_PAGE_SIZE)}
              playerPairKey={playerPairKey}
              pointsLabel="pts race"
              emptyTitle="Ainda sem pontos na Race"
              emptyDescription="Nenhuma dupla pontuou na temporada ainda."
            />
          </>
        )}
      </div>
      {selectedAthlete && <AthleteDetail athlete={selectedAthlete} onClose={() => setSelectedAthlete(null)} />}
      </PageContent>
    </Page>
  );
}
