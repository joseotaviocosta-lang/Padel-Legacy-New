import React, { useEffect, useState, useRef } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { X, Swords, Zap, Coins, Trophy, RefreshCw, Bot, Cpu, Play, Scale, Flame, Shield, Hammer, Brain } from 'lucide-react';

import { getRandomBots, getDifficultyForPlayer } from '@/lib/bots';
import { getPartnerBot } from '@/lib/career';
import { overallRating, canPlayMatchToday, getChemistryBonus, isInjured, injuryRecoveryDays, getEnergyPenalty } from '@/lib/padel';
import { finalizePracticeMatch } from '@/game-core';
import { MATCH_TACTICS, getSetScoreString } from '@/lib/matchEngine';
import { processMatchRelationships } from '@/lib/relationships';
import LiveMatch from '@/components/matches/LiveMatch';
import { useToast } from '@/components/ui/use-toast';

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };
export default function SimulationModal({ profile: initialProfile, careerId, onClose, onComplete, onProfileUpdate }) {
  const [profile, setProfile] = useState(initialProfile);
  const [initialTacticId, setInitialTacticId] = useState('equilibrado');
  const [displayMode, setDisplayMode] = useState('text');
  const [phase, setPhase] = useState('config');
  const [teams, setTeams] = useState(null);
  const [result, setResult] = useState(null);
  const [coach,setCoach]=useState(null);
  const [liveCoachSettings,setLiveCoachSettings]=useState(()=>({liveCoachEnabled:true,suggestionFrequency:'normal',allowMinorAutoAdjustments:false,showLiveMetrics:true,showConfidence:true,pauseOnImportantSuggestion:true,...(initialProfile?.live_coach_settings||{})}));
  const savedRef = useRef(false);
  const { toast } = useToast();
  useEffect(()=>{if(!profile?.coach_id){setCoach(null);return;}localGame.entities.Coach.get(profile.coach_id).then(setCoach).catch(()=>setCoach(null));},[profile?.coach_id]);
  const changeLiveCoachSettings=(patch)=>{const next={...liveCoachSettings,...patch};setLiveCoachSettings(next);if(profile?.id)localGame.entities.PlayerProfile.update(profile.id,{live_coach_settings:next}).catch(()=>{});};
  const changeDisplayMode=(mode)=>setDisplayMode(mode);

  function startMatch() {
    if (isInjured(profile)) {
      toast({ title: 'Lesionado', description: `Você está lesionado! Recupera em ${injuryRecoveryDays(profile)} dias.` });
      return;
    }
    const matchStatus = canPlayMatchToday(profile);
    if (!matchStatus.allowed) {
      toast({ title: 'Limite diário', description: 'Você já fez seu jogo treino de hoje. Avance o dia!' });
      return;
    }
    const partner = getPartnerBot(profile);
    if (!partner) {
      toast({ title: 'Sem parceiro', description: 'Selecione um parceiro na aba Carreira.' });
      return;
    }
    const opponents = getRandomBots(getDifficultyForPlayer(profile), 2, [partner.id]);
    const chemistryBonus = getChemistryBonus(profile.partner_chemistry || 50);
    const energyPenalty = getEnergyPenalty(profile.energy || 100);
    const playerForMatch = { ...profile, _chemistryBonus: chemistryBonus, _energyPenalty: energyPenalty };
    setTeams({ partner, opponents, teamA: [playerForMatch, partner], teamB: opponents });
    savedRef.current = false;
    setPhase('live');
  }

  async function handleFinished(matchState) {
    if (savedRef.current) return;
    savedRef.current = true;
    try {
      const won = matchState.winner === 'A';
      await localGame.entities.Match.create({
        profile_id: profile.id,
        career_date: profile.career_date,
        date: profile.career_date || new Date().toISOString().slice(0, 10),
        location: 'Arena Virtual',
        tournament_name: 'Partida Treino',
        team_a: [profile.sport_name, teams.partner.name],
        team_b: teams.opponents.map(b => b.name),
        score_a: matchState.setsA,
        score_b: matchState.setsB,
        winner: matchState.winner,
        engine_version: matchState.engineVersion,
        seed: String(matchState.seed),
        set_scores: matchState.setScores,
        point_events: matchState.pointEvents,
        live_coach_report: matchState.liveCoachReport || null,
        tactical_adjustment_history: matchState.liveCoach?.adjustments || [],
        result: won ? 'vitória' : 'derrota',
        match_type: 'simulada',
        notes: `Sets: ${getSetScoreString(matchState)} | Força: ${Math.round(matchState.strA)} vs ${Math.round(matchState.strB)}`,
      });
      const coreResult = await finalizePracticeMatch({
        profile,
        won,
        partnerName: teams.partner.name,
        opponents: teams.opponents.map(b => b.name),
        score: getSetScoreString(matchState),
      });
      let updated = coreResult.updatedProfile;
      if(matchState.liveCoachReport){updated=await localGame.entities.PlayerProfile.update(updated.id,{live_coach_settings:liveCoachSettings,live_coach_history:[...(updated.live_coach_history||[]),matchState.liveCoachReport].slice(-100),coach_match_observations:[...(updated.coach_match_observations||[]),...(matchState.liveCoach?.observations||[])].slice(-500),tactical_adjustment_history:[...(updated.tactical_adjustment_history||[]),...(matchState.liveCoach?.adjustments||[])].slice(-300)});}
      setProfile(updated);
      onProfileUpdate?.(updated);
      // Update relationships with partner and opponents (non-blocking)
      processMatchRelationships(
        profile.id,
        teams.opponents.map(b => b.name),
        teams.partner.name,
        won
      ).catch(() => {});
      setResult({ won, matchState });
      onComplete?.();
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro', description: 'Falha ao salvar a partida.', variant: 'destructive' });
      setResult({ won: matchState.winner === 'A', matchState, error: true });
    } finally {
      setPhase('result');
    }
  }

  function reset() {
    savedRef.current = false;
    setTeams(null);
    setResult(null);
    setPhase('config');
  }

  const playerOvr = overallRating(profile);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm md:items-center md:p-3" onClick={onClose}>
      <div className={`glass flex w-full max-w-xl flex-col overflow-hidden rounded-t-2xl md:rounded-2xl ${phase === 'live' ? 'h-[100dvh] max-h-[100dvh] md:h-[min(46rem,92dvh)] md:max-h-[92dvh]' : 'max-h-[94dvh]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Cpu className="h-5 w-5 text-primary" /> Partida Treino
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Fechar partida">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 ${phase === 'live' ? 'overflow-hidden p-1.5 sm:p-2 md:p-3' : 'scrollbar-premium overflow-y-auto overscroll-contain p-3 sm:p-4'}`}>
        {/* Config */}
        {phase === 'config' && (
          <div className="space-y-4">
            <div className="glass rounded-xl p-3 flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <span className="font-black text-primary text-lg">{(profile?.sport_name || '?')[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{profile?.sport_name || 'Você'}</p>
                <p className="text-[10px] text-muted-foreground">Seu overall</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-primary tabular-nums">{playerOvr}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Melhor de 3 sets. Sets até 6 jogos. Em 6-6, tiebreak até 7. 3º set: super tiebreak até 10!</p>

            <div className="glass rounded-xl p-3 flex items-center gap-3 border border-primary/20">
              <Scale className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                Bots equilibrados ao seu nível (<span className="text-primary font-semibold">{profile?.level || 'Iniciante'}</span>)
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                <Brain className="h-3 w-3" /> Tática Inicial
              </p>
              <div className="flex flex-wrap gap-2">
                {MATCH_TACTICS.map(t => {
                  const Icon = TACTIC_ICONS[t.icon] || Scale;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setInitialTacticId(t.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                        initialTacticId === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3 w-3" /> {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{MATCH_TACTICS.find(t => t.id === initialTacticId)?.desc}. Você pode mudar a tática durante o jogo!</p>
            </div>

            <div className="glass rounded-xl p-3 space-y-2"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Treinador ao vivo</p><p className="text-[10px] text-muted-foreground">{coach?`${coach.name} · ${coach.specialty}`:'Sem treinador: apenas métricas básicas'}</p></div><button aria-pressed={liveCoachSettings.liveCoachEnabled} onClick={()=>changeLiveCoachSettings({liveCoachEnabled:!liveCoachSettings.liveCoachEnabled})} className={`rounded-full px-3 py-1 text-[10px] font-bold ${liveCoachSettings.liveCoachEnabled?'bg-primary text-primary-foreground':'bg-secondary'}`}>{liveCoachSettings.liveCoachEnabled?'Ativo':'Desativado'}</button></div><select aria-label="Frequência das sugestões" value={liveCoachSettings.suggestionFrequency} onChange={event=>changeLiveCoachSettings({suggestionFrequency:event.target.value})} className="w-full rounded-lg bg-secondary/60 px-2 py-2 text-xs"><option value="minimal">Mínima</option><option value="normal">Normal</option><option value="frequent">Frequente</option><option value="sets_only">Apenas entre sets</option><option value="disabled">Desativada</option></select><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={liveCoachSettings.allowMinorAutoAdjustments} onChange={event=>changeLiveCoachSettings({allowMinorAutoAdjustments:event.target.checked})}/>Permitir somente ajustes automáticos leves</label></div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Modo da partida</p>
              <div className="grid grid-cols-2 gap-2">{[['text','Texto'],['quick','Rápido']].map(([id,label]) => <button key={id} onClick={() => changeDisplayMode(id)} className={`rounded-xl px-2 py-2 text-xs font-bold ${displayMode === id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50'}`}>{label}</button>)}</div>
            </div>

            <button
              onClick={startMatch}
              className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2"
            >
              <Play className="h-4 w-4" /> Iniciar Partida
            </button>
          </div>
        )}

        {/* Live match */}
        {phase === 'live' && teams && (
          <LiveMatch
            teamA={teams.teamA}
            teamB={teams.teamB}
            initialTacticId={initialTacticId}
            coach={coach}
            liveCoachSettings={liveCoachSettings}
            onFinished={handleFinished}
            displayMode={displayMode}
            onDisplayModeChange={changeDisplayMode}
          />
        )}

        {/* Result */}
        {phase === 'result' && result && teams && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <TeamMember name={profile?.sport_name || 'Você'} ovr={playerOvr} highlight />
                  <TeamMember name={teams.partner.name} ovr={overallRating(teams.partner)} />
                </div>
                <div className="text-center px-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-3xl font-black tabular-nums ${result.won ? 'text-primary' : 'text-muted-foreground'}`}>{result.matchState.setsA}</span>
                    <span className="text-muted-foreground/40 text-xs">×</span>
                    <span className={`text-3xl font-black tabular-nums ${!result.won ? 'text-primary' : 'text-muted-foreground'}`}>{result.matchState.setsB}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {teams.opponents.map((bot, i) => (
                    <TeamMember key={i} name={bot.name} ovr={overallRating(bot)} rightAlign />
                  ))}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/40 text-center">
                <p className="text-xs text-muted-foreground">Sets: <b className="text-foreground">{getSetScoreString(result.matchState)}</b></p>
              </div>
            </div>

            {result && (
              <div className={`glass rounded-2xl p-4 border flex items-center gap-3 ${result.won ? 'border-primary/40 bg-primary/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                {result.won ? <Trophy className="h-6 w-6 text-amber-400 shrink-0" /> : <Swords className="h-6 w-6 text-amber-400 shrink-0" />}
                <div className="flex-1">
                  <p className="font-bold text-sm">{result.won ? 'Vitória!' : 'Derrota'}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Zap className="h-3 w-3 text-primary" />+{result.won ? 10 : 5} XP</span>
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Coins className="h-3 w-3 text-yellow-400" />+{result.won ? 8 : 3}</span>
                    <span className="text-xs text-muted-foreground">Treino · sem ranking</span>
                  </div>
                </div>
              </div>
            )}
            {result.matchState.liveCoachReport && <div className="glass rounded-2xl p-4"><p className="text-xs font-black mb-2">Decisões durante a partida</p><p className="text-[11px] text-muted-foreground">{result.matchState.liveCoachReport.suggestionsReceived} sugestões · {result.matchState.liveCoachReport.suggestionsApplied} aplicadas · {result.matchState.liveCoachReport.suggestionsIgnored} ignoradas</p><p className="mt-2 text-[9px] text-muted-foreground">{result.matchState.liveCoachReport.disclaimer}</p></div>}

            <button
              onClick={reset}
              className="w-full py-3 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Jogar Novamente
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function TeamMember({ name, ovr, highlight, rightAlign }) {
  return (
    <div className={`flex items-center gap-2 ${rightAlign ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`h-8 w-8 rounded-lg ${highlight ? 'bg-primary/20' : 'bg-secondary/60'} flex items-center justify-center shrink-0`}>
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{name}</p>
        <p className="text-[9px] text-muted-foreground tabular-nums">OVR {ovr}</p>
      </div>
    </div>
  );
}
