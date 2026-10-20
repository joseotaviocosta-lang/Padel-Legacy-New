import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Trophy, Users, User, Crown, Link, CalendarDays, Target, ArrowUp, ArrowDown, Equal, Search, X, ChevronRight, Globe2 } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import { getTeamRank, getTeamRankings, ensurePlayerTeamRanking, teamKey } from '@/lib/teamRanking';
import { getTeamRaceRankings, getTeamRaceRank } from '@/lib/teamRaceRanking';
import {
  buildPlayerRankingContext, bestRaceResult, buildTeamFinalsCut, TEAM_FINALS_CUT, resolveRankingView, teamListPoints,
  describeRankingPeriod, resolveStandingRank, sliceLadderNeighbors, hasMeaningfulPodium,
  ladderMovement, teamLedgerRecord, filterLadderRows, buildClimbContext,
} from '@/lib/rankingDisplay';
import { buildCountryDirectory } from '@/lib/countryDirectory.js';
import {
  CompactListItem, CountryFlag, EmptyState, Page, PageContent, PageSkeleton, PlayerAvatar, RankingPosition,
} from '@/components/design-system';
import { loadModuleTasks } from '@/lib/moduleLoading';
import AthleteDetail from '@/components/athletes/AthleteDetail.jsx';

const LIST_PAGE_SIZE = 50;
// 5.32-A.1 — a escada de duplas lê a população INTEIRA, o mesmo corte com que
// getTeamRank/getTeamRaceRank calculam a posição (5000). Com 600, uma dupla
// em #895 ficava fora da lista: sem "Ao seu redor" e com o cartão dizendo
// que ela liderava o ranking.
export const TEAM_BOARD_CAP = 5000;

// Fase 5.32-A — POSITION FIRST. CONTEXT SECOND. DETAILS ON DEMAND.
// A tela virou uma ESCADA: (1) período/tipo numa linha só, (2) "minha
// posição" (posição, pontos, distância para cima, dupla), (3) quem está ao
// redor, (4) pódio e a escada completa com busca. Nenhuma autoridade mudou:
// snapshot mundial (buildWorldRankingSnapshot), TeamRanking (getTeamRankings
// /getTeamRank), projeção da Race de duplas (getTeamRaceRankings/
// getTeamRaceRank) e o campo do período por linha (teamListPoints, LOCAL-7D).

// Playthrough 5.23, Parte K — dois níveis: PERÍODO (scope) × TIPO (type).
// 5.32-A: os dois níveis dividem UMA linha (dois controles segmentados).
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
    // Posição exibida = a do snapshot; sem pontos não há posição (5.32-A).
    ladder_position: resolveStandingRank({ rank: entry.rank, points: entry.points }),
  };
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

const ptsText = (value) => `${formatPoints(value)} ${Number(value) === 1 ? 'pt' : 'pts'}`;

const individualPoints = (athlete, race) => Math.max(0, Number(race ? athlete?.race_points : (athlete?.world_ranking_points ?? athlete?.ranking_points)) || 0);
const teamNames = (team) => [team?.player1_name, team?.player2_name];

// Dois níveis de navegação, cada um com 2 opções. role=tablist com setas,
// área de toque de 44px e sem rolagem lateral a 360px.
function SegmentedToggle({ label, options, value, onChange }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 rounded-xl border border-border/60 bg-card/55 p-0.5">
      {options.map((option, index) => {
        const active = option.key === value;
        const Icon = option.icon;
        return (
          <button
            key={option.key}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => { if (!active) onChange(option.key); }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 text-xs font-bold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {Icon && <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HeroShell({ kind, bar = 'bg-primary', className = 'border-border/50 bg-card/70', children }) {
  return (
    <section data-ranking-hero={kind} className={`relative overflow-hidden rounded-2xl border p-4 pl-5 shadow-sm ${className}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      {children}
    </section>
  );
}

function YouTag({ label = 'Você' }) {
  return <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase tracking-wide text-primary">{label}</span>;
}

// Linhas de contexto do "minha posição" (5.32-A.1). Só com vizinhos reais
// da escada da autoridade (buildClimbContext):
//   ↑ quantos pontos faltam para a linha mais próxima com MAIS pontos;
//   = empate em pontos com a linha de cima — "Empate em #N" quando a posição
//     é dividida (duplas), "Mesmos pontos de #N" quando a ordenação já pôs
//     um à frente (individual). O critério do desempate não é afirmado;
//   ↓ quem vem logo atrás e a vantagem.
// Sem contexto (fora da escada carregada) nada é dito.
function ClimbLines({ climb, leaderText }) {
  if (!climb) return null;
  const { target, tieAbove, below, isLeader } = climb;
  return (
    <ul className="mt-2.5 space-y-1 text-xs" data-ranking-gaps>
      {isLeader && !tieAbove && (
        <li className="flex min-w-0 items-center gap-2" data-ranking-climb="leader">
          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="font-bold text-foreground">{leaderText}</span>
        </li>
      )}
      {target && (
        <li className="flex min-w-0 items-center gap-2" data-ranking-climb="target">
          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          <span className="min-w-0 truncate text-muted-foreground">{target.gap === 1 ? 'Falta' : 'Faltam'} <b className="font-black text-foreground">{ptsText(target.gap)}</b> para <b className="font-bold text-foreground">#{target.rank} {target.name}</b></span>
        </li>
      )}
      {tieAbove && (
        <li className="flex min-w-0 items-center gap-2" data-ranking-climb="tie">
          <Equal className="h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
          <span className="min-w-0 truncate text-muted-foreground">
            {tieAbove.sharesPosition
              ? <>Empate em <b className="font-bold text-foreground">#{tieAbove.rank}</b> com <b className="font-bold text-foreground">{tieAbove.name}</b></>
              : <>Mesmos pontos de <b className="font-bold text-foreground">#{tieAbove.rank} {tieAbove.name}</b></>}
          </span>
        </li>
      )}
      {below && (
        <li className="flex min-w-0 items-center gap-2" data-ranking-climb="below">
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span className="min-w-0 truncate text-muted-foreground"><b className="font-bold text-foreground">#{below.rank} {below.name}</b> {below.gap > 0 ? `a ${ptsText(below.gap)}` : 'com os mesmos pontos'}</span>
        </li>
      )}
    </ul>
  );
}

function PartnerLine({ partnerName, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-w-0 max-w-[55%] shrink items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] font-bold text-muted-foreground hover:text-foreground">
      <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{partnerName ? `Dupla: ${partnerName}` : 'Sem dupla'}</span>
    </button>
  );
}

function UnrankedHeadline({ points, description }) {
  return (
    <div className="mt-1">
      <p className="text-2xl font-black leading-tight text-foreground" data-ranking-unranked>Ainda sem ranking</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {Number(points) > 0 ? `${formatPoints(points)} pts · ` : ''}{description}
      </p>
    </div>
  );
}

function WorldIndividualCard({ context, rank, climb, partnerName, onPartner }) {
  return (
    <HeroShell kind="world-individual">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua posição mundial</p>
        <PartnerLine partnerName={partnerName} onClick={onPartner} />
      </div>
      {rank ? (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-black leading-none tabular-nums text-primary">#{rank}</span>
            <span className="text-lg font-black tabular-nums text-foreground">{formatPoints(context.points)} <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">pts</span></span>
          </div>
          <ClimbLines climb={climb} leaderText="Você lidera o ranking mundial" />
          {!context.nextMilestone.isLeader && context.nextMilestone.positionsRemaining > 0 && (
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Target className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">Próximo objetivo: <b className="font-bold text-foreground">{context.nextMilestone.label}</b> · faltam {context.nextMilestone.positionsRemaining} posições</span>
            </p>
          )}
        </>
      ) : (
        <UnrankedHeadline points={context.points} description="Dispute torneios oficiais para pontuar e entrar no ranking mundial." />
      )}
    </HeroShell>
  );
}

function PointsBreakdown({ rows, total, totalLabel }) {
  return (
    <details className="group mt-2.5 rounded-xl border border-border/50 bg-card/70 text-xs" data-ranking-breakdown>
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 font-bold text-muted-foreground">
        Composição dos pontos
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-1 border-t border-border/50 px-3 py-2">
        {rows}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-1"><span className="font-black uppercase tracking-[0.14em] text-muted-foreground">{totalLabel}</span><span className="font-black tabular-nums text-primary">{total}</span></div>
      </div>
    </details>
  );
}

function WorldDoublesCard({ playerName, partnerName, pairRank, playerPoints, partnerPoints, climb, footer = null }) {
  return (
    <HeroShell kind="world-doubles">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua dupla</p>
      <h3 className="mt-0.5 truncate text-lg font-black text-foreground">{playerName} &amp; {partnerName}</h3>
      {pairRank.unranked ? (
        <UnrankedHeadline points={pairRank.points} description="A dupla entra no ranking ao somar pontos em torneios." />
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-black leading-none tabular-nums text-primary">#{pairRank.displayRank || pairRank.rank}</span>
            <span className="text-lg font-black tabular-nums text-foreground">{formatPoints(pairRank.points)} <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">pts</span></span>
          </div>
          <ClimbLines climb={climb} leaderText="Sua dupla lidera o ranking" />
        </>
      )}
      {Number(pairRank.points) > 0 && <PointsBreakdown
        totalLabel="Total"
        total={formatPoints(pairRank.points)}
        rows={(
          <>
            <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{playerName}</span><span className="font-black tabular-nums text-foreground">{formatPoints(playerPoints)}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{partnerName}</span><span className="font-black tabular-nums text-foreground">{formatPoints(partnerPoints)}</span></div>
          </>
        )}
      />}
      {footer && <div className="mt-2.5">{footer}</div>}
    </HeroShell>
  );
}

function RaceIndividualCard({ seasonYear, raceRank, racePoints, raceSeason, climb }) {
  return (
    <HeroShell kind="race-individual" bar="bg-info">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua temporada {seasonYear || ''}</p>
      {raceRank > 0 ? (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-black leading-none tabular-nums text-primary">#{raceRank}</span>
            <span className="text-lg font-black tabular-nums text-foreground">{formatPoints(racePoints)} <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">pts na Race</span></span>
          </div>
          <ClimbLines climb={climb} leaderText="Você lidera a Race" />
        </>
      ) : (
        <UnrankedHeadline points={0} description={seasonYear ? `Você ainda não pontuou na temporada ${seasonYear}.` : 'Você ainda não pontuou nesta temporada.'} />
      )}
      <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
        <div className="min-w-0 rounded-lg bg-secondary/40 px-1.5 py-1.5">
          <dt className="text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-muted-foreground">Torneios</dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums text-foreground">{raceSeason.tournaments}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-secondary/40 px-1.5 py-1.5">
          <dt className="text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-muted-foreground">Melhor resultado</dt>
          <dd className="mt-0.5 truncate text-xs font-black text-foreground">{raceSeason.best?.finish || '—'}</dd>
        </div>
        <div className="min-w-0 rounded-lg bg-secondary/40 px-1.5 py-1.5">
          <dt className="text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-muted-foreground">Últimos pontos</dt>
          <dd className="mt-0.5 truncate text-xs font-black text-foreground" title={raceSeason.last?.tournament_name || undefined}>{raceSeason.last ? `+${formatPoints(raceSeason.last.points)}` : '—'}</dd>
        </div>
      </dl>
      {/* Playthrough 5.23, Parte I — a Race Individual NÃO mostra "Top 8":
          as Finals são de DUPLAS e a vaga sai do Mundial de duplas
          (selectFinalsEntrants ordena o TeamRanking mundial). */}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        As Circuit Finals classificam as {TEAM_FINALS_CUT} melhores duplas do Mundial de duplas.
      </p>
    </HeroShell>
  );
}

function RaceDoublesCard({ playerName, partnerName, racePairRank, playerRacePoints, partnerRacePoints, climb }) {
  return (
    // Playthrough 5.24/5.24-B — identidade sazonal com contraste real
    // (gradiente, anel, borda viva) e texto só em tokens de texto.
    <HeroShell kind="race-doubles" bar="bg-info" className="border-secondary/50 bg-gradient-to-br from-secondary/20 via-card/80 to-primary/10 ring-1 ring-secondary/25">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua dupla na Race</p>
      <h3 className="mt-0.5 truncate text-lg font-black text-foreground">{playerName} &amp; {partnerName}</h3>
      {racePairRank.unranked ? (
        <UnrankedHeadline points={0} description="A dupla ainda não pontuou na temporada." />
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-black leading-none tabular-nums text-primary">#{racePairRank.displayRank || racePairRank.rank}</span>
            <span className="text-lg font-black tabular-nums text-foreground">{formatPoints(racePairRank.points)} <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">pts</span></span>
          </div>
          <ClimbLines climb={climb} leaderText="Sua dupla lidera a Race" />
        </>
      )}
      {Number(racePairRank.points) > 0 && <PointsBreakdown
        totalLabel="Total"
        total={formatPoints(racePairRank.points)}
        rows={(
          <>
            <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{playerName} Race</span><span className="font-black tabular-nums text-foreground">{formatPoints(playerRacePoints)}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="truncate text-muted-foreground">{partnerName} Race</span><span className="font-black tabular-nums text-foreground">{formatPoints(partnerRacePoints)}</span></div>
          </>
        )}
      />}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">A vaga nas Circuit Finals vem do Mundial de duplas, não da Race.</p>
    </HeroShell>
  );
}

// Playthrough 5.23, Partes I/T — corte para Circuit Finals, exibido onde a
// autoridade REAL vive (TeamRanking MUNDIAL, Top 8 duplas). 5.32-A: uma
// linha só, logo abaixo da "Sua dupla".
function FinalsCutCard({ cut }) {
  if (!cut?.hasRank) return null;
  return (
    <div data-ranking-finals-cut className="flex min-w-0 items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
      <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 font-bold leading-tight text-foreground">Top {cut.cut} duplas → Circuit Finals</span>
      <span className={`ml-auto shrink-0 font-black ${cut.qualified ? 'text-success' : 'text-muted-foreground'}`}>
        {cut.qualified ? 'Classificada' : (cut.pointsToCut != null ? `${cut.pointsToCut === 1 ? 'falta' : 'faltam'} ${ptsText(cut.pointsToCut)}` : 'Fora do Top 8')}
      </span>
    </div>
  );
}

function NoPairCard({ title, description, onFind }) {
  return (
    <HeroShell kind="no-pair" bar="bg-amber-400">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sua dupla</p>
      <p className="mt-0.5 text-lg font-black leading-tight text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <button type="button" onClick={onFind} className="mt-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/15">
        <Link className="h-3.5 w-3.5" aria-hidden="true" /> Procurar parceiro
      </button>
    </HeroShell>
  );
}

function LadderPoints({ value, label }) {
  return (
    <div className="shrink-0 text-right leading-tight">
      <p className="text-sm font-black tabular-nums text-foreground">{formatPoints(value)}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

const HIGHLIGHT_ROW = '!bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]';

function AthleteRow({ athlete, race, onSelect, anchor = true }) {
  const isPlayer = Boolean(athlete.is_player_profile);
  const position = athlete.ladder_position;
  return (
    <li id={anchor ? `ranking-row-${athlete.id}` : undefined} data-ranking-row="athlete" data-self={isPlayer || undefined}>
      <CompactListItem
        onClick={() => onSelect(athlete)}
        highlighted={isPlayer}
        className={`gap-2.5 px-2.5 py-2 lg:py-1.5 ${isPlayer ? HIGHLIGHT_ROW : ''}`}
        // Variação = as DUAS posições que o circuito gravou na mesma passada
        // semanal (anterior → atual). A posição exibida é a do snapshot, que
        // ordena outra população (sem aposentados, nomes deduplicados): misturar
        // as duas inventava saltos ("↑65" para quem estava estável).
        leading={<RankingPosition position={position} movement={race ? null : ladderMovement(athlete.ranking_previous_position, athlete.ranking_position)} />}
        title={<>{athlete.name || 'Atleta'}{isPlayer && <YouTag />}</>}
        meta={<><CountryFlag country={athlete.country || athlete.nationality} showLabel className="max-w-[65%] align-bottom" /> · OVR {Number(athlete.overall_rating ?? athlete.overall) || 0}</>}
        trailing={<LadderPoints value={individualPoints(athlete, race)} label={race ? 'race' : 'pts'} />}
      />
    </li>
  );
}

function TeamRow({ team, race, playerPairKey, pointsLabel, anchor = true }) {
  const isPlayerPair = Boolean(playerPairKey && team.team_key === playerPairKey);
  const record = teamLedgerRecord(team);
  return (
    <li id={anchor ? `ranking-row-${team.team_key || team.id}` : undefined} data-ranking-row="team" data-team-key={team.team_key} data-self={isPlayerPair || undefined}>
      <CompactListItem
        interactive={false}
        highlighted={isPlayerPair}
        className={`gap-2.5 px-2.5 py-2 lg:py-1.5 ${isPlayerPair ? HIGHLIGHT_ROW : ''}`}
        leading={<RankingPosition position={team.ladder_position} />}
        title={(
          <span className="block min-w-0 lg:truncate">
            <span className="block truncate lg:inline">{team.player1_name}</span>
            <span className="block truncate lg:ml-1 lg:inline"><span className="text-muted-foreground">&amp;</span> {team.player2_name}{isPlayerPair && <YouTag label="Sua dupla" />}</span>
          </span>
        )}
        meta={record
          ? `${record.wins}V · ${record.losses}D${record.titles ? ` · ${record.titles} ${record.titles === 1 ? 'título' : 'títulos'}` : ''}`
          : 'Histórico indisponível'}
        trailing={<LadderPoints value={teamListPoints(team, { race })} label={pointsLabel} />}
      />
    </li>
  );
}

// Pódio só com pontos reais (hasMeaningfulPodium): Race recém-zerada não
// mostra "0 pts" em três degraus. DOM em ordem 1-2-3 (leitor de tela); a
// ordem visual 2-1-3 vem do CSS.
function Podium({ items, pointsOf, renderNames, renderAvatar }) {
  if (!hasMeaningfulPodium(items, pointsOf)) return null;
  const ORDER = ['order-2', 'order-1', 'order-3'];
  return (
    <ol data-ranking-podium aria-label="Pódio" className="grid grid-cols-3 items-end gap-2">
      {items.slice(0, 3).map((item, idx) => {
        const pos = idx + 1;
        return (
          <li key={item.id || item.team_key || pos} className={`${ORDER[idx]} flex min-w-0 flex-col items-center rounded-2xl border px-1.5 pb-2 text-center ${pos === 1 ? 'border-amber-400/40 bg-amber-500/10 pt-3' : 'border-border/50 bg-card/60 pt-2'}`}>
            <div className="relative">
              {renderAvatar(item)}
              <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card text-[10px] font-black ${pos === 1 ? 'bg-amber-400 text-black' : pos === 2 ? 'bg-slate-300 text-black' : 'bg-orange-400 text-black'}`}>{pos}</span>
            </div>
            {pos === 1 && <Crown className="mt-1 h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
            <div className="mt-0.5 w-full min-w-0 text-[11px] font-bold leading-tight">{renderNames(item)}</div>
            <span className="mt-1 text-[11px] font-black tabular-nums text-primary">{formatPoints(pointsOf(item))} pts</span>
          </li>
        );
      })}
    </ol>
  );
}

function LoadMore({ remaining, onLoadMore }) {
  if (remaining <= 0) return null;
  return (
    <button type="button" onClick={onLoadMore} className="min-h-11 w-full rounded-xl border border-border/60 px-4 text-sm font-bold text-primary">
      Carregar mais posições ({Math.min(LIST_PAGE_SIZE, remaining)})
    </button>
  );
}

const LADDER_CLASS = 'overflow-hidden rounded-2xl border border-border/50 bg-card/60';

function IndividualList({ items, race = false, filter, visibleCount, onLoadMore, onSelect, emptyTitle, emptyDescription }) {
  if (!items.length) {
    return <EmptyState compact icon={Trophy} title={emptyTitle || 'Circuito vazio'} description={emptyDescription || 'O circuito será preenchido após o próximo avanço semanal.'} />;
  }
  const pointsOf = (athlete) => individualPoints(athlete, race);
  const filtered = filterLadderRows(items, filter);
  const filtering = filtered.length !== items.length;
  if (!filtered.length) return <EmptyState compact icon={Search} title="Nenhum atleta encontrado" description="Ajuste a busca ou o filtro." />;
  // Com o pódio visível, a escada continua do 4º (sem repetir o pódio).
  const podium = !filtering && hasMeaningfulPodium(filtered, pointsOf);
  const rows = podium ? filtered.slice(3) : filtered;
  return (
    <>
      {podium && <Podium items={filtered} pointsOf={pointsOf} renderAvatar={(athlete) => <PlayerAvatar name={athlete.name} size="sm" shape="circle" />} renderNames={(athlete) => <p className="truncate">{athlete.name || 'Atleta'}</p>} />}
      <ol className={LADDER_CLASS} aria-label="Classificação">
        {rows.slice(0, visibleCount).map((athlete) => <AthleteRow key={athlete.id} athlete={athlete} race={race} onSelect={onSelect} />)}
      </ol>
      <LoadMore remaining={rows.length - visibleCount} onLoadMore={onLoadMore} />
    </>
  );
}

// LOCAL-7D — o campo exibido vem do período (`race`), como em IndividualList
// (ver teamListPoints em rankingDisplay.js).
function TeamList({ items, race = false, filter, visibleCount, onLoadMore, playerPairKey, pointsLabel = 'pts', emptyTitle = 'Sem duplas', emptyDescription = 'Nenhuma dupla ranqueada ainda.' }) {
  if (!items.length) {
    return <EmptyState compact icon={Link} title={emptyTitle} description={emptyDescription} />;
  }
  const pointsOf = (t) => teamListPoints(t, { race });
  const filtered = filterLadderRows(items, { ...filter, namesOf: teamNames, countryOf: () => null });
  const filtering = filtered.length !== items.length;
  if (!filtered.length) return <EmptyState compact icon={Search} title="Nenhuma dupla encontrada" description="Ajuste a busca ou o filtro." />;
  const podium = !filtering && hasMeaningfulPodium(filtered, pointsOf);
  const rows = podium ? filtered.slice(3) : filtered;
  return (
    <>
      {podium && <Podium items={filtered} pointsOf={pointsOf} renderAvatar={(t) => <div className="flex -space-x-2"><PlayerAvatar name={t.player1_name} size="sm" shape="circle" className="border-2 border-card" /><PlayerAvatar name={t.player2_name} size="sm" shape="circle" className="border-2 border-card" /></div>} renderNames={(t) => <><p className="truncate">{t.player1_name}</p><p className="truncate">{t.player2_name}</p></>} />}
      <ol className={LADDER_CLASS} aria-label="Classificação de duplas">
        {rows.slice(0, visibleCount).map((t) => <TeamRow key={t.id || t.team_key} team={t} race={race} playerPairKey={playerPairKey} pointsLabel={pointsLabel} />)}
      </ol>
      <LoadMore remaining={rows.length - visibleCount} onLoadMore={onLoadMore} />
    </>
  );
}

// Posição de cada dupla = a da autoridade (ranking_display_position); sem
// pontos no período não há posição.
const withTeamPosition = (rows, race) => (rows || []).map((t) => ({
  ...t,
  ladder_position: resolveStandingRank({ rank: t.ranking_display_position, points: teamListPoints(t, { race }) }),
}));

function Neighbors({ entries, renderRow, onJump }) {
  if (!entries.length) return null;
  return (
    <section data-ranking-neighbors aria-label="Ao seu redor" className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Ao seu redor</h2>
        {onJump && <button type="button" onClick={onJump} className="min-h-8 text-[11px] font-bold text-primary">Ver na lista</button>}
      </div>
      <ol className={LADDER_CLASS}>{entries.map(renderRow)}</ol>
    </section>
  );
}

function LadderFilters({ type, query, onQuery, chip, onChip, chips }) {
  return (
    <div data-ranking-filters className="flex min-w-0 items-center gap-2">
      <label className="relative min-w-0 flex-[1_1_8.5rem]">
        <span className="sr-only">Buscar no ranking</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={type === 'doubles' ? 'Buscar atleta da dupla' : 'Buscar atleta'}
          className="h-10 w-full rounded-xl border border-border/60 bg-card/60 pl-9 pr-9 text-sm placeholder:text-muted-foreground/80 focus:border-primary/60 focus:outline-none"
        />
        {query && (
          <button type="button" aria-label="Limpar busca" onClick={() => onQuery('')} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </label>
      <div role="group" aria-label="Filtros" className="flex min-w-0 shrink gap-1.5 overflow-x-auto scrollbar-none">
        {chips.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={chip === option.key}
            onClick={() => onChip(chip === option.key ? 'all' : option.key)}
            className={`h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-xs font-bold ${chip === option.key ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border/60 bg-card/60 text-muted-foreground'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 5.32-A — derivação das escadas a partir das AUTORIDADES (snapshot mundial,
// TeamRanking, projeção da Race). Funções puras, exportadas para os testes
// de comportamento; a página só as consome.
export function deriveIndividualLadders(snapshot) {
  const entries = snapshot?.entries || [];
  const circuitAthletes = entries.map(toCircuitDisplay);
  // Sem ranking (flag da autoridade), o jogador não ganha posição na escada.
  if (snapshot?.unranked) {
    for (const row of circuitAthletes) if (row.is_player_profile) row.ladder_position = null;
  }
  // Race: só quem pontuou na temporada entra na escada; a posição é a ordem
  // por race_points (a mesma de antes).
  const raceAthletes = [...entries]
    .filter((entry) => Number(entry.racePoints) > 0)
    .sort((a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id)))
    .map((entry, index) => ({ ...toCircuitDisplay(entry), ladder_position: index + 1 }));
  return { circuitAthletes, raceAthletes, raceHasPoints: raceAthletes.length > 0 };
}

export function derivePlayerStanding(snapshot, circuitAthletes = []) {
  const playerIndex = circuitAthletes.findIndex((entry) => entry.is_player_profile);
  if (!snapshot?.playerEntry) {
    return { playerIndex, context: buildPlayerRankingContext({ rank: 0, points: 0, above: null, below: null, total: 1500 }) };
  }
  // Sem ranking não existe posição: antes a tela mostrava a posição do fim
  // da fila (#1001) como se fosse real.
  const rank = snapshot.unranked ? 0 : Number(snapshot.playerRank) || 0;
  const above = rank > 0 && playerIndex > 0 ? circuitAthletes[playerIndex - 1] : null;
  const below = rank > 0 && playerIndex >= 0 && playerIndex < circuitAthletes.length - 1 ? circuitAthletes[playerIndex + 1] : null;
  const pointsOf = (row) => Number(row.world_ranking_points ?? row.ranking_points ?? 0);
  return {
    playerIndex,
    context: buildPlayerRankingContext({
      rank,
      points: Number(snapshot.playerPoints) || 0,
      above: above ? { name: above.name, rank: above.ladder_position || playerIndex, points: pointsOf(above) } : null,
      below: below && below.ladder_position ? { name: below.name, rank: below.ladder_position, points: pointsOf(below) } : null,
      total: Math.max(snapshot.total || 1500, rank || 1),
    }),
  };
}

export function deriveRaceStanding(raceAthletes = []) {
  const index = raceAthletes.findIndex((entry) => entry.is_player_profile);
  const prev = index > 0 ? raceAthletes[index - 1] : null;
  return {
    index,
    rank: index >= 0 ? index + 1 : 0,
    above: prev ? { rank: prev.ladder_position, name: prev.name, points: Number(prev.race_points) || 0 } : null,
    climb: buildClimbContext(raceAthletes, index, { pointsOf: (row) => row.race_points }),
  };
}

// Contexto para subir no Mundial individual (só com ranking real).
export function deriveWorldClimb(circuitAthletes = [], playerIndex = -1, ranked = false) {
  if (!ranked) return null;
  return buildClimbContext(circuitAthletes, playerIndex, { pointsOf: (row) => row.world_ranking_points ?? row.ranking_points });
}

// Dupla do jogador na escada (Mundial ou Race): índice e quem está acima,
// pela chave canônica (team_key) — nunca pelo nome.
export function deriveTeamStanding(rows = [], playerPairKey = null, { race = false } = {}) {
  const index = playerPairKey ? rows.findIndex((row) => row.team_key === playerPairKey) : -1;
  const prev = index > 0 ? rows[index - 1] : null;
  const nameOf = (row) => `${row.player1_name} & ${row.player2_name}`;
  return {
    index,
    above: prev ? { rank: prev.ladder_position, name: nameOf(prev), points: teamListPoints(prev, { race }) } : null,
    climb: buildClimbContext(rows, index, { pointsOf: (row) => teamListPoints(row, { race }), nameOf }),
  };
}

// Vizinhança: 2 acima e 2 abaixo, só fora do topo que o pódio já mostra.
export function ladderNeighborsFor(rows = [], index = -1) {
  return index >= 0 && Number(rows[index]?.ladder_position) > 5 ? sliceLadderNeighbors(rows, index, 2) : [];
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
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('all');
  const [jumpTarget, setJumpTarget] = useState(null);

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
        // Playthrough 5.24-B, Parte I — só o que TODAS as views usam. As
        // listas e posições de Duplas (Mundial e Race) carregam sob demanda,
        // no efeito abaixo, quando a view é aberta.
        const { c, a, snapshot, rr } = await loadModuleTasks({
          // Playthrough 5.24, Parte C — MESMAS listas da página de Países
          // (AthleteProfile 1500 + Club 200) para que a contagem de países
          // venha da MESMA autoridade (buildCountryDirectory).
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
            getTeamRankings(TEAM_BOARD_CAP).catch(() => []),
            partnerId ? getTeamRank(playerProfile, { id: partnerId }).catch(() => null) : null,
          ]);
          setTeams(withTeamPosition(t, false));
          setPlayerPairRank(pairRank);
        } else {
          const [rt, racePairRank] = await Promise.all([
            getTeamRaceRankings(TEAM_BOARD_CAP, { profile: playerProfile }).catch(() => []),
            partnerId ? getTeamRaceRank(playerProfile, { id: partnerId }).catch(() => null) : null,
          ]);
          // 5.32-A — a escada da Race só tem quem pontuou na temporada (a
          // mesma regra de getTeamRaceRank: 0 pontos = sem posição).
          setRaceTeams(withTeamPosition(rt, true).filter((row) => row.ladder_position));
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

  useEffect(() => { setVisibleCount(LIST_PAGE_SIZE); setQuery(''); setChip('all'); }, [scope, type]);

  // Playthrough 5.24, Parte C — a contagem de países vem da autoridade
  // única (countryDirectory.js), com as MESMAS listas da página de Países.
  const countries = useMemo(() => buildCountryDirectory(athletes, clubs), [athletes, clubs]);
  const { circuitAthletes, raceAthletes, raceHasPoints } = useMemo(() => deriveIndividualLadders(rankingSnapshot), [rankingSnapshot]);

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

  const { playerIndex, context: playerPositionContext } = useMemo(
    () => derivePlayerStanding(rankingSnapshot, circuitAthletes),
    [circuitAthletes, rankingSnapshot],
  );
  const { index: raceIndex, rank: raceRank, climb: raceClimb } = useMemo(() => deriveRaceStanding(raceAthletes), [raceAthletes]);
  const worldClimb = useMemo(
    () => deriveWorldClimb(circuitAthletes, playerIndex, playerPositionContext.rank > 0),
    [circuitAthletes, playerIndex, playerPositionContext.rank],
  );

  const raceSeason = useMemo(() => {
    const results = (raceResults || []).filter((row) => !seasonYear || String(row?.date || '').startsWith(String(seasonYear)));
    const sorted = [...results].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
    return { tournaments: results.length, best: bestRaceResult(results), last: sorted[0] || null };
  }, [raceResults, seasonYear]);

  // "Ver na lista": limpa filtros, abre páginas até a linha e rola até ela.
  const jumpTo = useCallback((index, rowId) => {
    setQuery('');
    setChip('all');
    setVisibleCount((current) => Math.max(current, Math.ceil((index + 1) / LIST_PAGE_SIZE) * LIST_PAGE_SIZE));
    setJumpTarget(`ranking-row-${rowId}`);
  }, []);
  useEffect(() => {
    if (!jumpTarget) return;
    const el = document.getElementById(jumpTarget);
    if (!el) return;
    // Rolagem pela janela, centralizando a linha (mesmo padrão sem rolagem
    // automática por elemento que o gate de deep links exige nesta página).
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2) });
    el.querySelector('button')?.focus({ preventScroll: true });
    setJumpTarget(null);
  }, [jumpTarget, visibleCount, query, chip]);

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

  const playerCountry = rankingSnapshot?.playerEntry?.country || playerProfile?.country || null;
  const chips = type === 'individual'
    ? [{ key: 'top100', label: 'Top 100' }, ...(playerCountry ? [{ key: 'country', label: playerCountry }] : [])]
    : [...(scope === 'world' ? [{ key: 'top8', label: 'Top 8' }] : []), { key: 'top100', label: 'Top 100' }];
  const filter = {
    query,
    country: chip === 'country' ? playerCountry : null,
    maxPosition: chip === 'top8' ? TEAM_FINALS_CUT : chip === 'top100' ? 100 : null,
  };
  const loadMore = () => setVisibleCount((v) => v + LIST_PAGE_SIZE);
  const goPartners = () => navigate('/partners');
  const findPartner = () => navigate('/partners?view=offers');

  const worldPair = deriveTeamStanding(teams, playerPairKey);
  const racePair = deriveTeamStanding(raceTeams, playerPairKey, { race: true });
  const athleteNeighbor = (race) => ({ item }) => <AthleteRow key={`n-${item.id}`} athlete={item} race={race} onSelect={setSelectedAthlete} anchor={false} />;
  const teamNeighbor = (race, label) => ({ item }) => <TeamRow key={`n-${item.team_key || item.id}`} team={item} race={race} playerPairKey={playerPairKey} pointsLabel={label} anchor={false} />;

  const worldLinks = [
    { label: 'países', value: countries.length, icon: Globe2, onClick: () => navigate('/world/directory?tab=countries') },
    { label: 'clubes', value: clubs.length, icon: Users, onClick: () => navigate('/world/directory?tab=clubs') },
  ];

  const filtersBar = <LadderFilters type={type} query={query} onQuery={setQuery} chip={chip} onChip={setChip} chips={chips} />;

  return (
    <Page size="wide">
      <PageContent>
      {/* No celular a aba "Ranking" do hub já nomeia a página; o título só volta no desktop. */}
      <header className="hidden items-center gap-2 px-1 md:flex" data-ranking-title>
        <Trophy className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
        <h1 className="pl-title-display truncate text-xl font-black tracking-[-0.03em] sm:text-2xl">Ranking</h1>
      </header>

      {/* Período × tipo: dois controles de 2 opções na MESMA linha. */}
      <div className="space-y-1.5" data-ranking-view-switch>
        <div className="flex min-w-0 gap-2">
          <SegmentedToggle label="Período do ranking" options={SCOPE_TABS} value={scope} onChange={(key) => setView(key, type)} />
          <SegmentedToggle label="Tipo de ranking" options={TYPE_TABS} value={type} onChange={(key) => setView(scope, key)} />
        </div>
        <p data-ranking-period className="px-1 text-[11px] leading-snug text-muted-foreground">{describeRankingPeriod(scope, seasonYear)}</p>
      </div>

      <div className="render-window space-y-3">
        {scope === 'world' && type === 'individual' && (
          <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">
            <div className="space-y-3 lg:sticky lg:top-4">
              <WorldIndividualCard
                context={playerPositionContext}
                rank={resolveStandingRank({ rank: playerPositionContext.rank, unranked: rankingSnapshot?.unranked })}
                climb={worldClimb}
                partnerName={hasPartner ? partnerName : null}
                onPartner={goPartners}
              />
              <Neighbors
                entries={playerPositionContext.rank > 0 ? ladderNeighborsFor(circuitAthletes, playerIndex) : []}
                renderRow={athleteNeighbor(false)}
                onJump={() => jumpTo(playerIndex, rankingSnapshot?.playerEntry?.id)}
              />
            </div>
            <div className="space-y-3">
              {filtersBar}
              <IndividualList
                items={circuitAthletes}
                filter={filter}
                visibleCount={visibleCount}
                onLoadMore={loadMore}
                onSelect={setSelectedAthlete}
              />
            </div>
          </div>
        )}

        {type === 'doubles' && !doublesReady[scope === 'race' ? 'race' : 'world'] && (
          <PageSkeleton variant="list" rows={6} className="p-0 sm:p-0" />
        )}

        {scope === 'world' && type === 'doubles' && doublesReady.world && (
          <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">
            <div className="space-y-3 lg:sticky lg:top-4">
              {hasPartner ? (
                <>
                  <WorldDoublesCard
                    playerName={playerName}
                    partnerName={partnerName}
                    pairRank={worldPairRank}
                    playerPoints={Number(rankingSnapshot?.playerPoints) || 0}
                    partnerPoints={Math.max(0, Number(playerPartner?.world_ranking_points ?? playerPartner?.ranking_points) || 0)}
                    climb={worldPairRank.unranked ? null : worldPair.climb}
                    footer={<FinalsCutCard cut={{ ...finalsCut, rankLabel: worldPairRank.unranked ? '—' : (worldPairRank.displayRank || worldPairRank.rank) }} />}
                  />
                  <Neighbors
                    entries={ladderNeighborsFor(teams, worldPair.index)}
                    renderRow={teamNeighbor(false, 'pts')}
                    onJump={() => jumpTo(worldPair.index, playerPairKey)}
                  />
                </>
              ) : (
                <NoPairCard title="Sem dupla ativa" description="Forme uma parceria para aparecer no ranking de duplas." onFind={findPartner} />
              )}
            </div>
            <div className="space-y-3">
              {teams.length > 0 && filtersBar}
              <TeamList
                items={teams}
                filter={filter}
                visibleCount={visibleCount}
                onLoadMore={loadMore}
                playerPairKey={playerPairKey}
                pointsLabel="pts"
              />
            </div>
          </div>
        )}

        {scope === 'race' && type === 'individual' && (
          <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">
            <div className="space-y-3 lg:sticky lg:top-4">
              <RaceIndividualCard
                seasonYear={seasonYear}
                raceRank={raceRank}
                racePoints={playerRacePoints}
                raceSeason={raceSeason}
                climb={raceClimb}
              />
              <Neighbors
                entries={ladderNeighborsFor(raceAthletes, raceIndex)}
                renderRow={athleteNeighbor(true)}
                onJump={() => jumpTo(raceIndex, rankingSnapshot?.playerEntry?.id)}
              />
            </div>
            <div className="space-y-3">
              {raceHasPoints ? (
                <>
                  {filtersBar}
                  <IndividualList
                    items={raceAthletes}
                    race
                    filter={filter}
                    visibleCount={visibleCount}
                    onLoadMore={loadMore}
                    onSelect={setSelectedAthlete}
                  />
                </>
              ) : (
                <EmptyState compact icon={CalendarDays} title={`A temporada ${seasonYear || 'atual'} ainda não começou`} description="Nenhum ponto foi distribuído na Race ainda — dispute torneios para começar a pontuar." />
              )}
            </div>
          </div>
        )}

        {scope === 'race' && type === 'doubles' && doublesReady.race && (
          <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">
            <div className="space-y-3 lg:sticky lg:top-4">
              {hasPartner ? (
                <>
                  <RaceDoublesCard
                    playerName={playerName}
                    partnerName={partnerName}
                    racePairRank={racePairRank}
                    playerRacePoints={playerRacePoints}
                    partnerRacePoints={partnerRacePoints}
                    climb={racePairRank.unranked ? null : racePair.climb}
                  />
                  <Neighbors
                    entries={ladderNeighborsFor(raceTeams, racePair.index)}
                    renderRow={teamNeighbor(true, 'race')}
                    onJump={() => jumpTo(racePair.index, playerPairKey)}
                  />
                </>
              ) : (
                <NoPairCard title="Sem dupla ativa" description="Forme uma parceria para aparecer no ranking de duplas." onFind={findPartner} />
              )}
            </div>
            <div className="space-y-3">
              {raceTeams.length > 0 && filtersBar}
              <TeamList
                items={raceTeams}
                race
                filter={filter}
                visibleCount={visibleCount}
                onLoadMore={loadMore}
                playerPairKey={playerPairKey}
                pointsLabel="race"
                emptyTitle="Ainda sem pontos na Race"
                emptyDescription={`Nenhuma dupla pontuou na temporada ${seasonYear || 'atual'} ainda.`}
              />
            </div>
          </div>
        )}

        <nav data-ranking-world-links aria-label="Explorar o circuito" className="flex flex-wrap items-center gap-2 px-1 pt-1">
          {worldLinks.map(({ label, value, icon: Icon, onClick }) => (
            <button key={label} type="button" onClick={onClick} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 text-xs font-bold text-muted-foreground hover:text-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> <span className="tabular-nums text-foreground">{value}</span> {label} <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </nav>
      </div>
      {selectedAthlete && <AthleteDetail athlete={selectedAthlete} onClose={() => setSelectedAthlete(null)} />}
      </PageContent>
    </Page>
  );
}

// Fase 5.32-A — componentes de apresentação exportados para os testes de
// comportamento (scripts/test-ranking-views-v532.mjs).
export {
  WorldIndividualCard, WorldDoublesCard, RaceIndividualCard, RaceDoublesCard, FinalsCutCard, NoPairCard,
  IndividualList, TeamList, SegmentedToggle, withTeamPosition,
};
