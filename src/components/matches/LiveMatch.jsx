import React, { useState, useEffect, useRef } from 'react';
import { Scale, Flame, Shield, Hammer, Brain, Play, Pause, FastForward } from 'lucide-react';
import { createMatch, playPoint, applyMatchTactic, decideLiveCoachSuggestion, askLiveMatchPartner, formatPoints, MATCH_TACTICS } from '@/lib/matchEngine';

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };

export default function LiveMatch({ teamA, teamB, initialTacticId, coach = null, liveCoachSettings, onFinished, displayMode = 'text', onDisplayModeChange }) {
  const [state, setState] = useState(() => createMatch(teamA, teamB, { initialTacticId, coach, liveCoachSettings }));
  const [tactic, setTactic] = useState(
    () => MATCH_TACTICS.find(t => t.id === initialTacticId) || MATCH_TACTICS[0]
  );
  const [autoPlay, setAutoPlay] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tacticFeedback, setTacticFeedback] = useState('');
  const finishedRef = useRef(false);
  const narrationRef = useRef(null);

  useEffect(() => {
    if (displayMode !== 'quick') return;
    setAutoPlay(false);
    setState((current) => {
      let next = current; let safety = 3000;
      while (!next.finished && safety-- > 0) next = playPoint(next);
      return next;
    });
  }, [displayMode]);

  useEffect(() => {
    if (state.finished || !autoPlay) return;
    const timer = setTimeout(() => {
      setState(prev => playPoint(prev));
    }, (displayMode === '2d' ? 3200 : 1000) / speed);
    return () => clearTimeout(timer);
  }, [state, autoPlay, speed, displayMode]);

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

  function advanceUntil(predicate) {
    setAutoPlay(false);
    setState(prev => { let next = prev; let safety = 3000; while (!next.finished && !predicate(next, prev) && safety-- > 0) next = playPoint(next); return next; });
  }
  function changeTactic(nextTactic) {
    setTactic(nextTactic);
    setState(prev => applyMatchTactic(prev, nextTactic, 'A'));
    setTacticFeedback(`Tática alterada para ${nextTactic.label}. ${nextTactic.desc}`);
  }

  const pts = formatPoints(state);
  const coachSuggestion = state.liveCoach?.pendingSuggestion;
  const partnerFeedback = state.liveCoach?.partnerFeedback?.at(-1);
  const recent = state.liveCoach?.analytics?.points?.slice(-5) || [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1">{[['text','Texto'],['quick','Rápido']].map(([id,label])=><button key={id} onClick={()=>onDisplayModeChange?.(id)} className={`rounded-lg px-1 py-1.5 text-[10px] font-bold ${displayMode===id?'bg-primary text-primary-foreground':'bg-secondary/60'}`}>{label}</button>)}</div>
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


      <div className="glass rounded-2xl p-3 border border-cyan-500/20 space-y-2" aria-label="Treinador ao vivo">
        <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Treinador ao vivo</p><p className="text-xs font-semibold">{coach?.name || 'Sem treinador contratado'}</p></div><span className="text-[10px] text-muted-foreground">Próxima janela: fim do game</span></div>
        {!coach && <p className="text-[10px] text-muted-foreground">Métricas básicas disponíveis; recomendações especializadas desativadas.</p>}
        {state.liveCoach?.settings?.showLiveMetrics && <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-secondary/40 p-2"><b className="text-sm">{recent.filter(p=>p.winnerTeamId==='A').length}/{recent.length}</b><p className="text-[9px] text-muted-foreground">pontos recentes</p></div><div className="rounded-lg bg-secondary/40 p-2"><b className="text-sm">{state.activeTactics.A?.label}</b><p className="text-[9px] text-muted-foreground">plano atual</p></div><div className="rounded-lg bg-secondary/40 p-2"><b className="text-sm">{Math.round(Math.min(...state.teams.A.map(p=>p.energy)))}</b><p className="text-[9px] text-muted-foreground">energia mínima</p></div></div>}
        {coachSuggestion && <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-3 space-y-2"><p className="text-xs font-bold">{coachSuggestion.observation}</p><p className="text-[10px] text-muted-foreground">{coachSuggestion.expectedImpact}</p><p className="text-[10px]">Confiança: <b>{coachSuggestion.confidence}</b> · custo físico: <b>{coachSuggestion.physicalCost}</b></p><div className="grid grid-cols-2 gap-1.5"><button onClick={()=>setState(prev=>decideLiveCoachSuggestion(prev,'apply'))} className="rounded-lg bg-primary px-2 py-1.5 text-[10px] font-bold text-primary-foreground">Aplicar</button><button onClick={()=>setState(prev=>decideLiveCoachSuggestion(prev,'partial',Object.keys(coachSuggestion.suggestedAdjustment?.components||{}).slice(0,1)))} className="rounded-lg bg-secondary px-2 py-1.5 text-[10px] font-bold">Aplicar parcialmente</button><button onClick={()=>setState(prev=>askLiveMatchPartner(prev))} className="rounded-lg bg-secondary px-2 py-1.5 text-[10px] font-bold">Ouvir parceiro</button><button onClick={()=>setState(prev=>decideLiveCoachSuggestion(prev,'ignore'))} className="rounded-lg bg-secondary px-2 py-1.5 text-[10px] font-bold">Manter plano</button></div></div>}
        {partnerFeedback && <p role="status" className="text-[10px] italic text-muted-foreground">Parceiro: “{partnerFeedback.response}”</p>}
        {coach && !coachSuggestion && state.pointNumber<4 && <p className="text-[10px] text-muted-foreground">Ainda não há dados suficientes para recomendar uma mudança.</p>}
      </div>

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
                onClick={() => changeTactic(t)}
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
        {tacticFeedback && <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-primary/10 px-2 py-1.5 text-center text-[10px] text-primary">{tacticFeedback}</p>}
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
            <div className="flex rounded-xl bg-secondary/50 p-1" aria-label="Velocidade">{[1,2,5,10].map(value=><button key={value} onClick={()=>setSpeed(value)} aria-pressed={speed===value} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${speed===value?'bg-primary text-primary-foreground':''}`}>{value}x</button>)}</div>
          </>
        ) : (
          <div className="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Salvando partida...
          </div>
        )}
      </div>
      {!state.finished && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button onClick={()=>advanceUntil(next=>next.pointNumber>state.pointNumber)} className="rounded-xl bg-secondary/50 px-2 py-2 text-xs font-bold">Próximo ponto</button>
        <button onClick={()=>advanceUntil((next,start)=>next.gamesA!==start.gamesA||next.gamesB!==start.gamesB||next.currentSet!==start.currentSet)} className="rounded-xl bg-secondary/50 px-2 py-2 text-xs font-bold">Fim do game</button>
        <button onClick={()=>advanceUntil((next,start)=>next.setsA!==start.setsA||next.setsB!==start.setsB)} className="rounded-xl bg-secondary/50 px-2 py-2 text-xs font-bold">Fim do set</button>
        <button onClick={()=>confirm('Simular até o fim da partida? As decisões táticas futuras não poderão ser alteradas.')&&advanceUntil(next=>next.finished)} className="rounded-xl bg-secondary/50 px-2 py-2 text-xs font-bold"><FastForward className="mr-1 inline h-3.5 w-3.5"/>Fim da partida</button>
      </div>}
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
