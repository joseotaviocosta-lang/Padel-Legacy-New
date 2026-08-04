import React, { useState, useEffect, useRef } from 'react';
import { Scale, Flame, Shield, Hammer, Brain, Play, Pause, FastForward } from 'lucide-react';
import { createMatch, playPoint, formatPoints, MATCH_TACTICS } from '@/lib/matchEngine';
import ReplayPanel from './ReplayPanel';

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };

export default function LiveMatch({ teamA, teamB, initialTacticId, onFinished, replayEnabled = false, displayMode = 'text', onDisplayModeChange }) {
  const [state, setState] = useState(() => createMatch(teamA, teamB, { replayEnabled }));
  const [tactic, setTactic] = useState(
    () => MATCH_TACTICS.find(t => t.id === initialTacticId) || MATCH_TACTICS[0]
  );
  const [autoPlay, setAutoPlay] = useState(true);
  const [speed, setSpeed] = useState(1);
  const finishedRef = useRef(false);
  const narrationRef = useRef(null);

  useEffect(() => {
    if (displayMode !== 'quick') return;
    setAutoPlay(false);
    setState((current) => {
      let next = current; let safety = 3000;
      while (!next.finished && safety-- > 0) next = playPoint(next, tactic);
      return next;
    });
  }, [displayMode, tactic]);

  useEffect(() => {
    if (state.finished || !autoPlay) return;
    const timer = setTimeout(() => {
      setState(prev => playPoint(prev, tactic));
    }, (displayMode === '2d' ? 3200 : 1000) / speed);
    return () => clearTimeout(timer);
  }, [state, autoPlay, tactic, speed]);

  useEffect(() => {
    if (narrationRef.current) {
      narrationRef.current.scrollTop = narrationRef.current.scrollHeight;
    }
  }, [state.narration.length]);

  useEffect(() => {
    if (state.finished && !finishedRef.current) {
      finishedRef.current = true;
      setAutoPlay(false);
      onFinished(state);
    }
  }, [state.finished]);

  function skip() {
    setState(prev => {
      let s = prev;
      let safety = 3000;
      while (!s.finished && safety-- > 0) s = playPoint(s, tactic);
      return s;
    });
  }

  function toggleSpeed() {
    setSpeed(s => (s === 1 ? 2 : s === 2 ? 3 : 1));
  }

  const pts = formatPoints(state);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1">{[['text','Texto'],['2d','2D'],['important_points','Pontos-chave'],['quick','Rápido']].map(([id,label])=><button key={id} onClick={()=>onDisplayModeChange?.(id)} className={`rounded-lg px-1 py-1.5 text-[10px] font-bold ${displayMode===id?'bg-primary text-primary-foreground':'bg-secondary/60'}`}>{label}</button>)}</div>
      {/* Scoreboard */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_2rem_2rem_2.5rem] gap-2 items-center text-[9px] uppercase text-muted-foreground mb-2 px-0.5">
          <span>Jogadores</span>
          <span className="text-center">SET</span>
          <span className="text-center">JG</span>
          <span className="text-center">PTS</span>
        </div>
        {/* Team A */}
        <div className="grid grid-cols-[1fr_2rem_2rem_2.5rem] gap-2 items-center py-2 border-t border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
            <span className="text-xs font-bold truncate">{state.teamANames.join(' & ')}</span>
          </div>
          <span className="text-center text-xl font-black tabular-nums text-primary">{state.setsA}</span>
          <span className="text-center text-xl font-black tabular-nums">{state.gamesA}</span>
          <span className="text-center text-xl font-black tabular-nums">{pts.a}</span>
        </div>
        {/* Team B */}
        <div className="grid grid-cols-[1fr_2rem_2rem_2.5rem] gap-2 items-center py-2 border-t border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs font-bold truncate">{state.teamBNames.join(' & ')}</span>
          </div>
          <span className="text-center text-xl font-black tabular-nums text-amber-400">{state.setsB}</span>
          <span className="text-center text-xl font-black tabular-nums">{state.gamesB}</span>
          <span className="text-center text-xl font-black tabular-nums">{pts.b}</span>
        </div>
        {/* Status */}
        <div className="mt-2 pt-2 border-t border-border/40 text-center text-[10px] text-muted-foreground">
          {state.finished ? 'Partida finalizada' : state.superTiebreak ? 'Super Tiebreak · 3º Set' : state.inTiebreak ? `Tiebreak · Set ${state.currentSet}` : `Set ${state.currentSet}`}
        </div>
      </div>

      {displayMode === '2d' && state.replay && state.pointNumber > 0 && <ReplayPanel key={state.pointNumber} replay={state.replay} live />}

      {/* Narration */}
      <div className={`glass rounded-2xl p-3 ${displayMode === '2d' ? 'hidden' : ''}`}>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Narração</p>
        <div ref={narrationRef} className="h-48 overflow-y-auto space-y-1.5 pr-1">
          {state.narration.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-8">Iniciando partida...</p>
          )}
          {state.narration.map((ev, i) => (
            <NarrationEntry key={i} event={ev} />
          ))}
        </div>
      </div>

      {/* Tactics */}
      <div className="glass rounded-2xl p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Táticas</p>
        <div className="flex gap-1.5">
          {MATCH_TACTICS.map(t => {
            const Icon = TACTIC_ICONS[t.icon] || Scale;
            const active = tactic.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTactic(t)}
                disabled={state.finished}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                } disabled:opacity-40`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[9px] font-bold leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">{tactic.desc}</p>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!state.finished ? (
          <>
            <button
              onClick={() => setAutoPlay(p => !p)}
              className="flex-1 py-2.5 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors flex items-center justify-center gap-2"
            >
              {autoPlay ? <><Pause className="h-4 w-4" /> Pausar</> : <><Play className="h-4 w-4" /> Continuar</>}
            </button>
            <button
              onClick={toggleSpeed}
              className="px-4 py-2.5 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors"
            >
              {speed}x
            </button>
            <button
              onClick={skip}
              className="px-4 py-2.5 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors flex items-center gap-1"
            >
              <FastForward className="h-4 w-4" /> Pular
            </button>
          </>
        ) : (
          <div className="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Salvando partida...
          </div>
        )}
      </div>
    </div>
  );
}

function NarrationEntry({ event }) {
  if (event.type === 'set' || event.type === 'match') {
    return (
      <div className={`py-1.5 px-2.5 rounded-lg ${event.type === 'match' ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-primary/10 border border-primary/20'}`}>
        <p className={`text-sm font-black ${event.type === 'match' ? 'text-amber-400' : 'text-primary'}`}>{event.msg}</p>
      </div>
    );
  }

  const isGame = event.type === 'game' || event.type === 'tiebreak_end' || event.type === 'tiebreak_start';
  const dotColor = event.scorer === 'A' ? 'bg-primary' : 'bg-amber-400';

  return (
    <div className="flex items-start gap-2">
      {event.scorer && <div className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0 mt-1.5`} />}
      <span className={`text-xs ${isGame ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{event.msg}</span>
    </div>
  );
}
