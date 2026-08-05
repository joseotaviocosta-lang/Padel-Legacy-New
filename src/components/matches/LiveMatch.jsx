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
  Gauge,
  ChevronRight,
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

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };
const PANELS = [
  { id: 'match', label: 'Jogo', icon: MessageSquareText },
  { id: 'tactics', label: 'Tática', icon: ClipboardList },
  { id: 'coach', label: 'Técnico', icon: Brain },
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
}) {
  const [state, setState] = useState(() => createMatch(teamA, teamB, { initialTacticId, coach, liveCoachSettings }));
  const [tactic, setTactic] = useState(
    () => MATCH_TACTICS.find((item) => item.id === initialTacticId) || MATCH_TACTICS[0],
  );
  const [autoPlay, setAutoPlay] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [activePanel, setActivePanel] = useState('match');
  const [tacticFeedback, setTacticFeedback] = useState('');
  const finishedRef = useRef(false);
  const narrationRef = useRef(null);

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

  return (
    <div data-live-match className="flex h-full min-h-0 max-h-full flex-col gap-1.5 overflow-hidden">
      <div className="shrink-0"><CompactScoreboard state={state} points={points} status={matchStatus} /></div>

      <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-secondary/40 p-1" role="tablist" aria-label="Painéis da partida">
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
              className={`relative flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold transition-colors ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {hasAlert && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/50 bg-background/35">
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
        onEndMatch={() => {
          if (window.confirm('Simular até o fim da partida? Você não poderá alterar as próximas decisões táticas.')) {
            advanceUntil((next) => next.finished);
          }
        }}
      />
      </div>
    </div>
  );
}

function CompactScoreboard({ state, points, status }) {
  const teams = [
    { id: 'A', names: state.teamANames, sets: state.setsA, games: state.gamesA, points: points.a, accent: 'bg-primary', text: 'text-primary' },
    { id: 'B', names: state.teamBNames, sets: state.setsB, games: state.gamesB, points: points.b, accent: 'bg-amber-400', text: 'text-amber-400' },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-background/45" aria-label="Placar da partida">
      <div className="grid grid-cols-[minmax(0,1fr)_2rem_2rem_2.5rem] items-center gap-1 border-b border-border/40 px-3 py-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{status}</span>
        <span className="text-center">Set</span>
        <span className="text-center">Jg</span>
        <span className="text-center">Pts</span>
      </div>
      {teams.map((team) => (
        <div
          key={team.id}
          className="grid grid-cols-[minmax(0,1fr)_2rem_2rem_2.5rem] items-center gap-1 border-b border-border/30 px-3 py-1.5 last:border-b-0"
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
  const filteredNarration = displayMode === 'quick'
    ? state.narration.filter((event) => ['game', 'set', 'match', 'tiebreak_start', 'tiebreak_end'].includes(event.type))
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
          {[['text', 'Detalhado'], ['quick', 'Rápido']].map(([id, label]) => (
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
    <div className="space-y-1.5 rounded-xl border border-border/50 bg-background/65 p-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
        >
          {autoPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoPlay ? 'Pausar' : 'Continuar'}
        </button>
        <div className="flex rounded-lg bg-secondary/60 p-0.5" aria-label="Velocidade da partida">
          {[1, 2, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onSpeed(value)}
              aria-pressed={speed === value}
              className={`min-h-8 min-w-8 rounded-md px-1 text-[10px] font-bold ${speed === value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
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
      className="min-h-8 rounded-lg bg-secondary/45 px-1 text-[9px] font-bold text-muted-foreground hover:bg-secondary hover:text-foreground"
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

  const highlighted = event.type === 'game' || event.type === 'tiebreak_end' || event.type === 'tiebreak_start';
  const dotColor = event.scorer === 'A' ? 'bg-primary' : 'bg-amber-400';

  return (
    <div className={`flex items-start gap-2 rounded-md px-1.5 py-1 ${highlighted ? 'bg-secondary/25' : ''}`}>
      {event.scorer && <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />}
      <span className={`text-[10px] leading-relaxed ${highlighted ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{event.msg}</span>
    </div>
  );
}
