import React, { useState, useEffect, useRef } from 'react';
import {
  Scale,
  Flame,
  Shield,
  Hammer,
  Brain,
  Play,
  Pause,
  FastForward,
  MessageSquareText,
  ClipboardList,
  ChevronRight,
  BarChart3,
  Activity,
} from 'lucide-react';
import {
  createMatch,
  playPoint,
  applyMatchTactic,
  decideLiveCoachSuggestion,
  askLiveMatchPartner,
  formatPoints,
  MATCH_TACTICS,
} from '@/lib/matchEngine';
import { Button, ConfirmDialog } from '@/components/design-system';

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };
const PANELS = [
  { id: 'match', label: 'Jogo', icon: MessageSquareText },
  { id: 'tactics', label: 'Tática', icon: ClipboardList },
  { id: 'coach', label: 'Técnico', icon: Brain },
  { id: 'stats', label: 'Ao vivo', icon: BarChart3 },
];

export default function LiveMatch({
  teamA,
  teamB,
  initialTacticId,
  coach = null,
  liveCoachSettings,
  onFinished,
  displayMode = 'text',
  onDisplayModeChange,
  initialState = null,
  onCheckpoint = null,
}) {
  const [state, setState] = useState(() => initialState || createMatch(teamA, teamB, { initialTacticId, coach, liveCoachSettings }));
  const [tactic, setTactic] = useState(() => {
    const resumedTacticId = initialState?.activeTactics?.A?.id;
    return MATCH_TACTICS.find((item) => item.id === (resumedTacticId || initialTacticId)) || MATCH_TACTICS[0];
  });
  // M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md, Parte 21): retomar uma partida
  // interrompida sempre volta pausada — o jogador decide quando continuar,
  // nunca avança pontos sozinho "recuperando o tempo perdido" em background.
  const [autoPlay, setAutoPlay] = useState(!initialState);
  const [speed, setSpeed] = useState(1);
  const [activePanel, setActivePanel] = useState('match');
  const [tacticFeedback, setTacticFeedback] = useState('');
  const [confirmEndMatch, setConfirmEndMatch] = useState(false);
  const finishedRef = useRef(false);
  const narrationRef = useRef(null);
  const checkpointSignatureRef = useRef(null);

  // M3 — checkpoint em pontos seguros/semanticamente relevantes (início da
  // partida, fim de game/set, mudança de tática/decisão do técnico), nunca a
  // cada ponto/frame (Parte 5 e Parte 26 pedem explicitamente para evitar
  // I/O excessivo). A assinatura cobre só os campos que definem um "momento
  // seguro" — comparar o state inteiro dispararia a cada narração.
  useEffect(() => {
    if (!onCheckpoint || state.finished) return;
    const signature = [
      state.setsA, state.setsB, state.gamesA, state.gamesB,
      state.tacticsTimeline?.length || 0,
      state.liveCoach?.decisions?.length || 0,
    ].join(':');
    if (checkpointSignatureRef.current === signature) return;
    checkpointSignatureRef.current = signature;
    onCheckpoint(state);
  }, [state, onCheckpoint]);

  // M3 — pausa automática ao ir para background (Parte 6/7/21). O timer de
  // autoplay já cancela sozinho quando autoPlay vira false (efeito abaixo,
  // dependente de `autoPlay`), então isso também resolve "sem timer duplicado
  // ao voltar" — o efeito do timer só reagenda quando o usuário aperta Play.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function handleVisibilityChange() {
      if (document.hidden) {
        setAutoPlay(false);
        setState((current) => {
          if (!current.finished) onCheckpoint?.(current);
          return current;
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [onCheckpoint]);

  useEffect(() => {
    if (displayMode !== 'quick') return;
    setAutoPlay(false);
    setState((current) => {
      let next = current;
      let safety = 3000;
      while (!next.finished && safety-- > 0) next = playPoint(next);
      return next;
    });
  }, [displayMode]);

  useEffect(() => {
    if (state.finished || !autoPlay) return undefined;
    const timer = window.setTimeout(() => {
      setState((previous) => playPoint(previous));
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [state, autoPlay, speed]);

  useEffect(() => {
    if (activePanel === 'match' && narrationRef.current) {
      narrationRef.current.scrollTop = narrationRef.current.scrollHeight;
    }
  }, [state.narration.length, activePanel]);

  useEffect(() => {
    if (state.finished && !finishedRef.current) {
      finishedRef.current = true;
      setAutoPlay(false);
      onFinished(state);
    }
  }, [state.finished, state, onFinished]);

  function advanceUntil(predicate) {
    setAutoPlay(false);
    setState((previous) => {
      let next = previous;
      let safety = 3000;
      while (!next.finished && !predicate(next, previous) && safety-- > 0) next = playPoint(next);
      return next;
    });
  }

  function changeTactic(nextTactic) {
    setTactic(nextTactic);
    setState((previous) => applyMatchTactic(previous, nextTactic, 'A'));
    setTacticFeedback(`${nextTactic.label}: ${nextTactic.desc}`);
    setActivePanel('match');
  }

  const points = formatPoints(state);
  const coachSuggestion = state.liveCoach?.pendingSuggestion;
  const partnerFeedback = state.liveCoach?.partnerFeedback?.at(-1);
  const recent = state.liveCoach?.analytics?.points?.slice(-5) || [];
  const matchStatus = state.finished
    ? 'Finalizada'
    : state.superTiebreak
      ? 'Super tie-break'
      : state.inTiebreak
        ? `Tie-break · set ${state.currentSet}`
        : `Set ${state.currentSet}`;

  const importantMoment = getImportantMoment(state);

  return (
    <div data-live-match className="flex h-full min-h-0 max-h-full flex-col gap-2 overflow-hidden">
      <div className="shrink-0"><CompactScoreboard state={state} points={points} status={matchStatus} importantMoment={importantMoment} /></div>

      <div className="grid shrink-0 grid-cols-4 gap-1 rounded-xl border border-border/40 bg-secondary/30 p-1" role="tablist" aria-label="Painéis da partida">
        {PANELS.map(({ id, label, icon: Icon }) => {
          const active = activePanel === id;
          const hasAlert = id === 'coach' && Boolean(coachSuggestion);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActivePanel(id)}
              className={`pl-tab-trigger relative flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold transition-colors ${
                active ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {hasAlert && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/50 bg-background/45 shadow-inner">
        {activePanel === 'match' && (
          <MatchFeed
            state={state}
            narrationRef={narrationRef}
            displayMode={displayMode}
            onDisplayModeChange={onDisplayModeChange}
            tactic={tactic}
            tacticFeedback={tacticFeedback}
            coachSuggestion={coachSuggestion}
            onOpenCoach={() => setActivePanel('coach')}
          />
        )}

        {activePanel === 'tactics' && (
          <TacticsPanel tactic={tactic} state={state} onChange={changeTactic} />
        )}

        {activePanel === 'coach' && (
          <CoachPanel
            state={state}
            coach={coach}
            coachSuggestion={coachSuggestion}
            partnerFeedback={partnerFeedback}
            recent={recent}
            onApply={() => setState((previous) => decideLiveCoachSuggestion(previous, 'apply'))}
            onPartial={() =>
              setState((previous) =>
                decideLiveCoachSuggestion(
                  previous,
                  'partial',
                  Object.keys(coachSuggestion?.suggestedAdjustment?.components || {}).slice(0, 1),
                ),
              )
            }
            onPartner={() => setState((previous) => askLiveMatchPartner(previous))}
            onIgnore={() => setState((previous) => decideLiveCoachSuggestion(previous, 'ignore'))}
          />
        )}

        {activePanel === 'stats' && <LiveStatsPanel state={state} />}
      </div>

      <div className="shrink-0">
      <PlaybackControls
        state={state}
        autoPlay={autoPlay}
        speed={speed}
        onTogglePlay={() => setAutoPlay((current) => !current)}
        onSpeed={setSpeed}
        onNextPoint={() => advanceUntil((next) => next.pointNumber > state.pointNumber)}
        onEndGame={() =>
          advanceUntil(
            (next, start) =>
              next.gamesA !== start.gamesA || next.gamesB !== start.gamesB || next.currentSet !== start.currentSet,
          )
        }
        onEndSet={() => advanceUntil((next, start) => next.setsA !== start.setsA || next.setsB !== start.setsB)}
        onEndMatch={() => setConfirmEndMatch(true)}
      />
      </div>
      <ConfirmDialog
        open={confirmEndMatch}
        onClose={() => setConfirmEndMatch(false)}
        onConfirm={() => { setConfirmEndMatch(false); advanceUntil((next) => next.finished); }}
        tone="default"
        title="Simular até o fim da partida?"
        description="Você não poderá alterar as próximas decisões táticas."
        confirmLabel="Simular"
      />
    </div>
  );
}

function CompactScoreboard({ state, points, status, importantMoment }) {
  const teams = [
    { id: 'A', names: state.teamANames, sets: state.setsA, games: state.gamesA, points: points.a, accent: 'bg-primary', text: 'text-primary' },
    { id: 'B', names: state.teamBNames, sets: state.setsB, games: state.gamesB, points: points.b, accent: 'bg-amber-400', text: 'text-amber-400' },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/95 to-secondary/20 shadow-sm" aria-label="Placar da partida">
      <div className="grid grid-cols-[minmax(0,1fr)_2rem_2rem_2.7rem] items-center gap-1 border-b border-border/40 bg-secondary/20 px-3 py-1.5 text-[8px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        <span>{status}</span>
        <span className="text-center">Set</span>
        <span className="text-center">Jg</span>
        <span className="text-center">Pts</span>
      </div>
      {teams.map((team) => (
        <div
          key={team.id}
          className="grid grid-cols-[minmax(0,1fr)_2rem_2rem_2.7rem] items-center gap-1 border-b border-border/30 px-3 py-2 last:border-b-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${team.accent}`} />
            <span className="truncate text-[11px] font-bold">{team.names.join(' / ')}</span>
          </div>
          <strong className={`text-center text-base tabular-nums ${team.text}`}>{team.sets}</strong>
          <strong className="text-center text-base tabular-nums">{team.games}</strong>
          <strong className="text-center text-lg tabular-nums">{team.points}</strong>
        </div>
      ))}
      {importantMoment && (
        <div className={`flex items-center justify-center gap-2 border-t px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${importantMoment.tone}`}>
          <Activity className="h-3.5 w-3.5" />
          {importantMoment.label}
        </div>
      )}
    </section>
  );
}

function MatchFeed({
  state,
  narrationRef,
  displayMode,
  onDisplayModeChange,
  tactic,
  tacticFeedback,
  coachSuggestion,
  onOpenCoach,
}) {
  const keyTypes = ['game', 'set', 'match', 'tiebreak_start', 'tiebreak_end', 'moment'];
  const filteredNarration = displayMode === 'important'
    ? state.narration.filter((event) => keyTypes.includes(event.type))
    : displayMode === 'summary'
      ? state.narration.filter((event, index) => keyTypes.includes(event.type) || index >= state.narration.length - 8)
      : state.narration;
  const visibleNarration = filteredNarration.slice(-120);
  const hiddenNarrationCount = Math.max(0, filteredNarration.length - visibleNarration.length);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Narração</p>
          <p className="truncate text-[10px] text-muted-foreground">Tática: <span className="text-foreground">{tactic.label}</span></p>
        </div>
        <div className="flex shrink-0 rounded-lg bg-secondary/50 p-0.5">
          {[['text', 'Completa'], ['summary', 'Resumida'], ['important', 'Momentos']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onDisplayModeChange?.(id)}
              className={`rounded-md px-2 py-1 text-[9px] font-bold ${displayMode === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {coachSuggestion && (
        <button
          type="button"
          onClick={onOpenCoach}
          className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-2 text-left"
        >
          <Brain className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">Nova sugestão do técnico</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        </button>
      )}

      <div ref={narrationRef} className="scrollbar-premium min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-2">
        {filteredNarration.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground/60">Iniciando partida...</p>
        )}
        {hiddenNarrationCount > 0 && (
          <p className="sticky top-0 z-10 rounded-md bg-background/90 px-2 py-1 text-center text-[9px] text-muted-foreground backdrop-blur">
            {hiddenNarrationCount} eventos anteriores foram recolhidos para manter a partida leve.
          </p>
        )}
        {visibleNarration.map((event, index) => (
          <NarrationEntry key={`${event.type || 'event'}-${hiddenNarrationCount + index}`} event={event} />
        ))}
      </div>

      {tacticFeedback && (
        <p role="status" aria-live="polite" className="border-t border-border/40 px-3 py-1.5 text-[9px] text-primary">
          {tacticFeedback}
        </p>
      )}
    </div>
  );
}

function TacticsPanel({ tactic, state, onChange }) {
  return (
    <div className="scrollbar-premium h-full min-h-0 overflow-y-auto overscroll-contain p-3">
      <p className="mb-2 text-[10px] text-muted-foreground">A mudança passa a valer no próximo ponto.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MATCH_TACTICS.map((item) => {
          const Icon = TACTIC_ICONS[item.icon] || Scale;
          const active = tactic.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item)}
              disabled={state.finished}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border/50 bg-secondary/25 text-muted-foreground hover:text-foreground'
              } disabled:opacity-40`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <strong className="block text-xs">{item.label}</strong>
                <span className="mt-0.5 block text-[9px] leading-relaxed">{item.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CoachPanel({
  state,
  coach,
  coachSuggestion,
  partnerFeedback,
  recent,
  onApply,
  onPartial,
  onPartner,
  onIgnore,
}) {
  const minimumEnergy = Math.round(Math.min(...state.teams.A.map((player) => player.energy)));

  return (
    <div className="scrollbar-premium h-full min-h-0 overflow-y-auto overscroll-contain p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{coach?.name || 'Sem técnico contratado'}</p>
          <p className="truncate text-[9px] text-muted-foreground">{coach?.specialty || 'Somente métricas básicas'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary/60 px-2 py-1 text-[9px] text-muted-foreground">Fim do game</span>
      </div>

      {state.liveCoach?.settings?.showLiveMetrics && (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <Metric value={`${recent.filter((point) => point.winnerTeamId === 'A').length}/${recent.length}`} label="Pontos recentes" />
          <Metric value={state.activeTactics.A?.label || '—'} label="Plano" />
          <Metric value={minimumEnergy} label="Energia mínima" />
        </div>
      )}

      {coachSuggestion ? (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-xs font-bold">{coachSuggestion.observation}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{coachSuggestion.expectedImpact}</p>
          <p className="mt-2 text-[9px] text-muted-foreground">
            Confiança: <b className="text-foreground">{coachSuggestion.confidence}</b> · custo físico:{' '}
            <b className="text-foreground">{coachSuggestion.physicalCost}</b>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <SmallAction primary onClick={onApply}>Aplicar</SmallAction>
            <SmallAction onClick={onPartial}>Parcial</SmallAction>
            <SmallAction onClick={onPartner}>Ouvir dupla</SmallAction>
            <SmallAction onClick={onIgnore}>Manter plano</SmallAction>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-secondary/30 px-3 py-5 text-center text-[10px] text-muted-foreground">
          {coach ? 'O técnico ainda está analisando a partida.' : 'Contrate um técnico para receber recomendações especializadas.'}
        </div>
      )}

      {partnerFeedback && (
        <p role="status" className="mt-2 rounded-lg bg-secondary/30 px-3 py-2 text-[10px] italic text-muted-foreground">
          Parceiro: “{partnerFeedback.response}”
        </p>
      )}
    </div>
  );
}


function LiveStatsPanel({ state }) {
  const teamA = state.stats?.teams?.A || {};
  const teamB = state.stats?.teams?.B || {};
  const recent = (state.pointEvents || []).slice(-10);
  const rawMomentum = Number(state.momentum?.value || 0);
  const momentumA = Math.round(Math.max(0, Math.min(100, 50 + rawMomentum / 2)));
  const momentumLabel = rawMomentum >= 55 ? 'Sua dupla domina' : rawMomentum >= 20 ? 'Sua dupla cresce' : rawMomentum <= -55 ? 'Rivais dominam' : rawMomentum <= -20 ? 'Rivais crescem' : 'Equilibrado';
  const avgEnergy = (teamId) => {
    const players = state.teams?.[teamId] || [];
    if (!players.length) return 0;
    return Math.round(players.reduce((sum, player) => sum + Number(player.energy || 0), 0) / players.length);
  };
  const rows = [
    { label: 'Winners', a: teamA.winners || 0, b: teamB.winners || 0 },
    { label: 'Erros', a: teamA.errors || 0, b: teamB.errors || 0 },
    { label: 'Break points', a: `${teamA.breakPointsConverted || 0}/${teamA.breakPointsCreated || 0}`, b: `${teamB.breakPointsConverted || 0}/${teamB.breakPointsCreated || 0}` },
    { label: 'Pontos na rede', a: formatRate(teamA.netPointsWon, teamA.netPointsPlayed), b: formatRate(teamB.netPointsWon, teamB.netPointsPlayed) },
    { label: 'Pontos decisivos', a: formatRate(teamA.decisivePointsWon, teamA.decisivePointsPlayed), b: formatRate(teamB.decisivePointsWon, teamB.decisivePointsPlayed) },
    { label: 'Energia média', a: `${avgEnergy('A')}%`, b: `${avgEnergy('B')}%` },
  ];

  return (
    <div className="scrollbar-premium h-full min-h-0 overflow-y-auto overscroll-contain p-3">
      <div className="mb-3 rounded-xl border border-border/50 bg-secondary/20 p-3">
        <div className="mb-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Sua dupla</span><span>Momento dos últimos {recent.length || 0} pontos · {momentumLabel}</span><span>Rivais</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-amber-400/70">
          <div className="bg-primary transition-all duration-300" style={{ width: `${momentumA}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold"><span>{momentumA}%</span><span>{100 - momentumA}%</span></div>
        <p className="mt-1 text-center text-[8px] text-muted-foreground">Momentum emocional · não substitui os atributos técnicos</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50">
        <div className="grid grid-cols-[4.5rem_1fr_4.5rem] bg-secondary/35 px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider text-muted-foreground">
          <span>Você</span><span>Estatística</span><span>Rivais</span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center border-t border-border/35 px-3 py-2 text-center">
            <strong className="text-xs tabular-nums text-primary">{row.a}</strong>
            <span className="text-[9px] font-semibold text-muted-foreground">{row.label}</span>
            <strong className="text-xs tabular-nums text-amber-400">{row.b}</strong>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[9px] leading-relaxed text-muted-foreground">As métricas são atualizadas a cada ponto e ajudam a interpretar as orientações do treinador.</p>
    </div>
  );
}

function formatRate(won = 0, played = 0) {
  return played > 0 ? `${Math.round((won / played) * 100)}%` : '—';
}

function getImportantMoment(state) {
  if (state.finished) return { label: 'Fim de partida', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300' };
  if (state.superTiebreak) return { label: 'Super tie-break decisivo', tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  if (state.inTiebreak) return { label: 'Tie-break', tone: 'border-violet-500/30 bg-violet-500/10 text-violet-300' };
  const aAdvantage = state.pointsA >= 3 && state.pointsA > state.pointsB;
  const bAdvantage = state.pointsB >= 3 && state.pointsB > state.pointsA;
  const leader = aAdvantage ? 'A' : bAdvantage ? 'B' : null;
  if (!leader) return null;
  const leaderSets = leader === 'A' ? state.setsA : state.setsB;
  const leaderGames = leader === 'A' ? state.gamesA : state.gamesB;
  const opponentGames = leader === 'A' ? state.gamesB : state.gamesA;
  const canCloseSet = leaderGames >= 5 && leaderGames - opponentGames >= 1;
  if (leaderSets === 1 && canCloseSet) return { label: leader === 'A' ? 'Match point para sua dupla' : 'Match point para os rivais', tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  if (canCloseSet) return { label: leader === 'A' ? 'Set point para sua dupla' : 'Set point para os rivais', tone: 'border-violet-500/30 bg-violet-500/10 text-violet-300' };
  const receivingTeam = state.servingTeam === 'A' ? 'B' : 'A';
  if (leader === receivingTeam) return { label: leader === 'A' ? 'Break point para sua dupla' : 'Break point para os rivais', tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' };
  return null;
}

function Metric({ value, label }) {
  return (
    <div className="rounded-lg bg-secondary/35 p-2 text-center">
      <b className="block truncate text-xs">{value}</b>
      <span className="block truncate text-[8px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SmallAction({ children, primary = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-2 text-[10px] font-bold ${primary ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}
    >
      {children}
    </button>
  );
}

function PlaybackControls({
  state,
  autoPlay,
  speed,
  onTogglePlay,
  onSpeed,
  onNextPoint,
  onEndGame,
  onEndSet,
  onEndMatch,
}) {
  if (state.finished) {
    return (
      <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary/10 text-xs font-bold text-primary">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Salvando partida...
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-background/90 p-2 shadow-xl backdrop-blur">
      <div className="flex items-center gap-1.5">
        <Button
          level="primary"
          onClick={onTogglePlay}
          className="pl-btn-tap min-h-10 flex-1 rounded-xl px-3 text-xs font-extrabold shadow-sm"
        >
          {autoPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoPlay ? 'Pausar' : 'Continuar'}
        </Button>
        <div className="flex rounded-lg bg-secondary/60 p-0.5" aria-label="Velocidade da partida">
          {[1, 2, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onSpeed(value)}
              aria-pressed={speed === value}
              className={`pl-icon-tap min-h-8 min-w-8 rounded-md px-1 text-[10px] font-bold ${speed === value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
            >
              {value}x
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <SkipButton onClick={onNextPoint} label="Ponto" />
        <SkipButton onClick={onEndGame} label="Game" />
        <SkipButton onClick={onEndSet} label="Set" />
        <SkipButton onClick={onEndMatch} label="Fim" icon />
      </div>
    </div>
  );
}

function SkipButton({ onClick, label, icon = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pl-btn-tap min-h-9 rounded-xl border border-border/40 bg-secondary/35 px-1 text-[9px] font-extrabold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      {icon && <FastForward className="mr-0.5 inline h-3 w-3" />}
      {label}
    </button>
  );
}

function NarrationEntry({ event }) {
  if (event.type === 'set' || event.type === 'match') {
    return (
      <div className={`rounded-lg px-2.5 py-1.5 ${event.type === 'match' ? 'border border-amber-500/30 bg-amber-500/10' : 'border border-primary/20 bg-primary/10'}`}>
        <p className={`text-[11px] font-black ${event.type === 'match' ? 'text-amber-400' : 'text-primary'}`}>{event.msg}</p>
      </div>
    );
  }

  const isMoment = event.type === 'moment';
  const highlighted = isMoment || event.type === 'game' || event.type === 'tiebreak_end' || event.type === 'tiebreak_start';
  const dotColor = event.scorer === 'A' ? 'bg-primary' : 'bg-amber-400';

  return (
    <div className={`flex items-start gap-2 rounded-md px-1.5 py-1 ${isMoment ? 'border border-primary/15 bg-primary/5' : highlighted ? 'bg-secondary/25' : ''}`}>
      {event.scorer && <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />}
      <span className={`text-[10px] leading-relaxed ${isMoment ? 'font-black text-foreground' : highlighted ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{event.msg}</span>
    </div>
  );
}
