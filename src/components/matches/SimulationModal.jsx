import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Swords, Zap, Coins, Trophy, RefreshCw, Bot, Cpu, Play, Scale, Flame, Shield, Hammer, Brain, History, Trash2, Home } from 'lucide-react';
import { ModalShell } from '@/components/design-system';

import { overallRating, canPlayMatchToday, isInjured, injuryRecoveryDays } from '@/lib/padel';
import { finalizePracticeMatch } from '@/game-core';
import { MATCH_TACTICS, getSetScoreString, SHOTS } from '@/lib/matchEngine';
import { Slider } from '@/components/ui/slider';
import { processMatchRelationships } from '@/lib/relationships';
import { resolveActiveCoach } from '@/game-core/coachLifecycle';
import LiveMatch from '@/components/matches/LiveMatch';
import LiveMatchRecoveryBoundary from '@/components/matches/LiveMatchRecoveryBoundary.jsx';
import MatchRecapPremium from '@/components/matches/MatchRecapPremium';
import { useToast } from '@/components/ui/use-toast';
import { preparePracticeMatchSession } from '@/game-core/practiceMatchSession.js';
import { Surface, StatusBadge, ProgressBar } from '@/components/design-system';
import { getMatchCheckpointRepository, createCheckpointMatchId } from '@/careers/MatchCheckpointRepository.js';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';
import { probePracticeRecoverySession } from '@/game-core/practiceMatchRecoveryEngine.js';

const TACTIC_ICONS = { Scale, Flame, Shield, Hammer, Brain };
const SHOT_LABELS = {
  drive: { label: 'Drive' },
  backhand: { label: 'Backhand' },
  lob: { label: 'Lob' },
  volley: { label: 'Voleio' },
  bandeja: { label: 'Bandeja' },
  smash: { label: 'Smash' },
  chiquita: { label: 'Chiquita', desc: 'Golpe baixo e rápido perto da rede, para tirar tempo do adversário.' },
};
const NEUTRAL_SHOT_WEIGHTS = Object.fromEntries(SHOTS.map((shot) => [shot, 1]));

// M4.2.2 (docs/MOBILE_M4_2_2_FILTERS_POSTMATCH.md, Parte F/G/H): achado real
// — o resumo de partida treino sempre oferecia "Jogar Novamente", mesmo já
// tendo consumido o limite diário (DAILY_MATCH_LIMIT=1, src/lib/padel.js).
// `startMatch()` já bloqueia corretamente uma segunda tentativa (linha
// acima, `canPlayMatchToday`) — o bug era só o CTA prometer uma ação que a
// própria regra do jogo recusaria em seguida. Função pura e testável
// (Parte K pede teste comportamental, não regex): recebe o MESMO `profile`
// já atualizado pós-finalização (setProfile(updated) já corrige isso antes
// do resumo renderizar — não havia stale state nesta tela especificamente,
// confirmado por leitura). Este componente é usado SÓ para partida treino
// (torneio usa TournamentModal.jsx, um arquivo inteiramente separado) — não
// precisa distinguir contexto aqui, mas fica isolado como função pura para
// não espalhar a condição pelo JSX (Parte G).
export function getPostMatchPrimaryAction(profile) {
  if (canPlayMatchToday(profile).allowed) {
    return { key: 'play-again', label: 'Jogar Novamente' };
  }
  return { key: 'back-to-career', label: 'Voltar para a carreira' };
}
export default function SimulationModal({ profile: initialProfile, careerId, onClose, onComplete, onProfileUpdate, onReturnToTrainingCenter = null }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(initialProfile);
  const [initialTacticId, setInitialTacticId] = useState('equilibrado');
  const [displayMode, setDisplayMode] = useState('text');
  const [phase, setPhase] = useState('config');
  const [teams, setTeams] = useState(null);
  const [result, setResult] = useState(null);
  const [coach,setCoach]=useState(null);
  const [liveCoachSettings,setLiveCoachSettings]=useState(()=>({liveCoachEnabled:true,suggestionFrequency:'normal',allowMinorAutoAdjustments:false,showLiveMetrics:true,showConfidence:true,pauseOnImportantSuggestion:true,...(initialProfile?.live_coach_settings||{})}));
  const [useCustomPlan, setUseCustomPlan] = useState(() => Boolean(initialProfile?.custom_tactic_plan?.shotWeights));
  const [customShotWeights, setCustomShotWeights] = useState(() => ({ ...NEUTRAL_SHOT_WEIGHTS, ...(initialProfile?.custom_tactic_plan?.shotWeights || {}) }));
  const [resumedEngineState, setResumedEngineState] = useState(null);
  const [resumeDecided, setResumeDecided] = useState(false);
  const [liveMatchSessionKey, setLiveMatchSessionKey] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [launchMetrics, setLaunchMetrics] = useState(null);
  const savedRef = useRef(false);
  const launchFlightRef = useRef(false);
  const matchIdRef = useRef(null);
  const startedAtRef = useRef(null);
  const { toast } = useToast();
  // M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md): se o app foi fechado/morto
  // com uma partida treino em andamento, o checkpoint sobrevive aqui — a
  // config normal (Parte 8) só aparece depois que o jogador decidir o que
  // fazer com ela (continuar ou descartar), nunca abrindo direto no meio.
  const { checkpoint, loading: checkpointLoading, clear: clearCheckpoint } = useActiveMatchCheckpoint(careerId);
  const pendingResume = !checkpointLoading && checkpoint?.type === 'practice' && !resumeDecided;
  useEffect(()=>{let active=true;(async()=>{if(!profile?.id)return;const result=await resolveActiveCoach(profile);if(!active)return;setCoach(result.coach||null);})().catch(()=>{if(active)setCoach(null);});return()=>{active=false;};},[profile?.id,profile?.coach_id]);
  const changeLiveCoachSettings=(patch)=>{const next={...liveCoachSettings,...patch};setLiveCoachSettings(next);if(profile?.id)localGame.entities.PlayerProfile.update(profile.id,{live_coach_settings:next}).catch(()=>{});};
  const persistCustomTacticPlan=(shotWeights)=>{if(!profile?.id)return;localGame.entities.PlayerProfile.update(profile.id,{custom_tactic_plan:{baseTacticId:initialTacticId,shotWeights,updatedAt:new Date().toISOString()}}).catch(()=>{});};
  const changeShotWeight=(shot,value)=>{const next={...customShotWeights,[shot]:value};setCustomShotWeights(next);persistCustomTacticPlan(next);};
  const resetShotWeights=()=>{setCustomShotWeights({...NEUTRAL_SHOT_WEIGHTS});persistCustomTacticPlan({...NEUTRAL_SHOT_WEIGHTS});};
  const toggleCustomPlan=()=>{const next=!useCustomPlan;setUseCustomPlan(next);if(next)persistCustomTacticPlan(customShotWeights);};
  const changeDisplayMode=(mode)=>setDisplayMode(mode);

  function startMatch() {
    if (launchFlightRef.current) return;
    launchFlightRef.current = true;
    setLaunching(true);
    if (isInjured(profile)) {
      toast({ title: 'Lesionado', description: `Você está lesionado! Recupera em ${injuryRecoveryDays(profile)} dias.` });
      launchFlightRef.current = false;
      setLaunching(false);
      return;
    }
    const matchStatus = canPlayMatchToday(profile);
    if (!matchStatus.allowed) {
      toast({ title: 'Limite diário', description: 'Você já fez seu jogo treino de hoje. Avance o dia!' });
      launchFlightRef.current = false;
      setLaunching(false);
      return;
    }
    let session;
    try {
      session = preparePracticeMatchSession(profile, coach);
    } catch (error) {
      console.error('[SimulationModal] Falha ao preparar partida treino.', error);
      toast({ title: 'NÃ£o foi possÃ­vel iniciar', description: error?.message || 'Falha ao preparar a partida treino.', variant: 'destructive' });
      launchFlightRef.current = false;
      setLaunching(false);
      return;
    }
    setTeams({ partner: session.partner, opponents: session.opponents, teamA: session.teamA, teamB: session.teamB });
    setLaunchMetrics(session.timings);
    setResumedEngineState(null);
    matchIdRef.current = createCheckpointMatchId();
    startedAtRef.current = new Date().toISOString();
    savedRef.current = false;
    // M3.1: sem isto, o checkpoint que o próprio LiveMatch grava minutos depois
    // de "Iniciar Partida" (ver saveCheckpoint) fazia `checkpoint` (o hook de
    // useActiveMatchCheckpoint usado aqui mesmo, dentro deste componente)
    // passar a apontar para a partida QUE ACABOU DE COMEÇAR — e resumeDecided
    // só virava true dentro de resumeMatch()/discardResume(), nunca ao iniciar
    // uma partida nova. pendingResume ficava true "por baixo" durante toda a
    // partida em andamento, uma inconsistência de estado latente que não
    // aparecia na UI hoje (a tela de recovery só renderiza em phase==='config'),
    // mas que fica perigosa caso qualquer futuro remount volte para 'config'.
    setResumeDecided(true);
    setPhase('live');
  }

  function resumeMatch() {
    // M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md, Problema A): antes desta
    // sonda, um checkpoint com engine_state incompatível (schema antigo,
    // campo ausente) só quebrava DEPOIS de montar o LiveMatch — sem boundary
    // local aqui, a exceção subia até o BetaErrorBoundary global e derrubava
    // o app inteiro, parecendo "a partida abre e fecha sozinha". O torneio já
    // fazia essa validação (probeTournamentRecoverySession); aqui é o mesmo
    // princípio para treino.
    const session = probePracticeRecoverySession(checkpoint);
    if (session.status !== 'resumable') {
      console.warn('[SimulationModal] checkpoint de treino não pôde ser retomado, descartando.', session.issues);
      clearCheckpoint();
      setResumeDecided(true);
      toast({ title: 'Não foi possível continuar', description: 'A partida interrompida não pôde ser recuperada. Inicie uma nova partida treino.', variant: 'destructive' });
      return;
    }
    const engineState = session.engineState;
    setTeams({ partner: engineState.teams.A[1], opponents: engineState.teams.B, teamA: engineState.teams.A, teamB: engineState.teams.B });
    setResumedEngineState(engineState);
    matchIdRef.current = checkpoint.match_id;
    startedAtRef.current = checkpoint.started_at;
    savedRef.current = false;
    setResumeDecided(true);
    setPhase('live');
  }

  function discardResume() {
    clearCheckpoint();
    setResumeDecided(true);
  }

  // M3.2: rede de segurança para qualquer exceção de render/runtime que
  // escape da partida ao vivo (checkpoint corrompido que passou pela sonda,
  // ou uma falha genuína do engine em qualquer partida, retomada ou não) —
  // mantém o SimulationModal montado em vez de derrubar o app inteiro para o
  // BetaErrorBoundary global (mesmo padrão de LiveMatchRecoveryBoundary já
  // usado no torneio).
  function handleLiveMatchCrash(error) {
    console.error('[SimulationModal] LiveMatch falhou durante a partida treino.', error);
    if (careerId) getMatchCheckpointRepository().clear(careerId).catch(() => {});
    savedRef.current = false;
    matchIdRef.current = null;
    startedAtRef.current = null;
    setResumedEngineState(null);
    setTeams(null);
    setResult(null);
    setLiveMatchSessionKey((value) => value + 1);
    launchFlightRef.current = false;
    setLaunching(false);
    setPhase('config');
    toast({ title: 'A partida foi interrompida', description: 'Ocorreu um erro inesperado durante a simulação. Você pode iniciar uma nova partida treino.', variant: 'destructive' });
  }

  const saveCheckpoint = useCallback((engineState) => {
    if (!careerId || !matchIdRef.current) return;
    getMatchCheckpointRepository().save(careerId, {
      match_id: matchIdRef.current,
      type: 'practice',
      tournament_id: null,
      started_at: startedAtRef.current || new Date().toISOString(),
      engine_state: engineState,
    }).catch((error) => console.warn('[SimulationModal] falha ao salvar checkpoint da partida.', error));
  }, [careerId]);

  async function handleFinished(matchState) {
    if (savedRef.current) return;
    savedRef.current = true;
    // A partida chegou ao fim: o checkpoint deixou de representar "em
    // andamento" independente do resultado do finalizador abaixo (que já é
    // idempotente por conta própria — ver makeMatchFinalizationKey).
    if (careerId) getMatchCheckpointRepository().clear(careerId).catch(() => {});
    try {
      const won = matchState.winner === 'A';
      const coreResult = await finalizePracticeMatch({
        profile,
        matchState,
        partnerName: teams.partner.name,
        opponents: teams.opponents.map(b => b.name),
        liveCoachSettings,
      });
      const updated = coreResult.updatedProfile;
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
    launchFlightRef.current = false;
    setLaunching(false);
    savedRef.current = false;
    matchIdRef.current = null;
    startedAtRef.current = null;
    setResumedEngineState(null);
    setTeams(null);
    setResult(null);
    setPhase('config');
  }

  const playerOvr = overallRating(profile);
  const readiness = Math.max(0, Math.min(100, Math.round(((Number(profile?.energy) || 0) * 0.7) + ((100 - (Number(profile?.fatigue) || 0)) * 0.3))));
  const phaseLabel = phase === 'config' ? 'Preparação' : phase === 'live' ? 'Ao vivo' : 'Resumo';

  return (
    <ModalShell
      open
      onClose={onClose}
      closeOnBackdrop={phase !== 'live'}
      closeOnEscape={phase !== 'live'}
      title={(
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Cpu className="h-4.5 w-4.5" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">Partida treino</span>
            <span className="block truncate text-[10px] font-normal text-muted-foreground">Simulação narrada · melhor de 3 sets</span>
          </span>
          <StatusBadge tone={phase === 'live' ? 'danger' : phase === 'result' ? 'success' : 'info'}>{phaseLabel}</StatusBadge>
        </span>
      )}
      size="md"
      // Hotfix 14.1 (Parte 1/4/6): mesmo teto artificial de TournamentModal.jsx
      // corrigido aqui, mesma fórmula — breakpoint unificado em sm: (era md:
      // aqui e sm: lá, uma divergência sem motivo entre os dois hosts do
      // MESMO LiveMatch.jsx compartilhado).
      className={phase === 'live' ? 'h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)]' : ''}
      contentClassName={phase === 'live' ? 'flex flex-col overflow-hidden' : ''}
    >
        {/* Recovery — partida treino interrompida antes de terminar (M3, Parte 8) */}
        {phase === 'config' && pendingResume && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <History className="mx-auto mb-2 h-10 w-10 text-primary" />
              <p className="text-lg font-black">Partida em andamento</p>
              <p className="mt-2 text-sm text-muted-foreground">Uma partida treino foi interrompida antes de terminar. Você pode continuar de onde parou.</p>
            </div>
            <button onClick={resumeMatch} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg">
              <Play className="h-4 w-4" /> Continuar partida
            </button>
            <button onClick={discardResume} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary/50 px-4 text-xs font-bold text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Descartar e começar outra
            </button>
          </div>
        )}

        {/* Config */}
        {phase === 'config' && !pendingResume && (
          <div className="space-y-4">
            <Surface variant="premium" padding="compact">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg font-black text-primary">{(profile?.sport_name || '?')[0]?.toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{profile?.sport_name || 'Você'}</p>
                  <p className="text-[10px] text-muted-foreground">Prontidão para competir</p>
                  <ProgressBar value={readiness} tone={readiness < 45 ? 'danger' : readiness < 70 ? 'warning' : 'success'} className="mt-2" />
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Overall</p>
                  <p className="text-2xl font-black text-primary tabular-nums">{playerOvr}</p>
                </div>
              </div>
            </Surface>

            <Surface variant="subtle" padding="compact">
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-bold">Adversários equilibrados</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Bots ajustados ao estágio <span className="font-semibold text-foreground">{profile?.level || 'Iniciante'}</span>. Sets até 6 jogos, tie-break em 6–6 e super tie-break no set decisivo.</p>
                </div>
              </div>
            </Surface>

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

            <Surface variant="elevated" padding="compact" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold">Personalizar por fundamento</p>
                  <p className="text-[10px] text-muted-foreground">Ajuste fino golpe a golpe sobre a tática escolhida acima.</p>
                </div>
                <button aria-pressed={useCustomPlan} onClick={toggleCustomPlan} className={`rounded-full px-3 py-1 text-[10px] font-bold ${useCustomPlan ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                  {useCustomPlan ? 'Ativo' : 'Desativado'}
                </button>
              </div>
              {useCustomPlan && (
                <div className="space-y-3 pt-1">
                  {SHOTS.map((shot) => (
                    <div key={shot}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">{SHOT_LABELS[shot]?.label || shot}</span>
                        <span className="text-muted-foreground">{customShotWeights[shot].toFixed(2)}x</span>
                      </div>
                      {SHOT_LABELS[shot]?.desc && <p className="mb-1 text-[9px] leading-relaxed text-muted-foreground">{SHOT_LABELS[shot].desc}</p>}
                      <Slider
                        aria-label={`Peso de ${SHOT_LABELS[shot]?.label || shot}`}
                        value={[customShotWeights[shot]]}
                        min={0.6}
                        max={1.5}
                        step={0.05}
                        onValueChange={([value]) => changeShotWeight(shot, value)}
                      />
                    </div>
                  ))}
                  <button onClick={resetShotWeights} className="text-[10px] font-semibold text-primary hover:underline">Restaurar padrão</button>
                </div>
              )}
            </Surface>

            <Surface variant="elevated" padding="compact" className="space-y-2"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Treinador ao vivo</p><p className="text-[10px] text-muted-foreground">{coach?`${coach.name} · ${coach.specialty}`:'Sem treinador: apenas métricas básicas'}</p></div><button aria-pressed={liveCoachSettings.liveCoachEnabled} onClick={()=>changeLiveCoachSettings({liveCoachEnabled:!liveCoachSettings.liveCoachEnabled})} className={`rounded-full px-3 py-1 text-[10px] font-bold ${liveCoachSettings.liveCoachEnabled?'bg-primary text-primary-foreground':'bg-secondary'}`}>{liveCoachSettings.liveCoachEnabled?'Ativo':'Desativado'}</button></div><select aria-label="Frequência das sugestões" value={liveCoachSettings.suggestionFrequency} onChange={event=>changeLiveCoachSettings({suggestionFrequency:event.target.value})} className="w-full rounded-lg bg-secondary/60 px-2 py-2 text-xs"><option value="minimal">Mínima</option><option value="normal">Normal</option><option value="frequent">Frequente</option><option value="sets_only">Apenas entre sets</option><option value="disabled">Desativada</option></select><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={liveCoachSettings.allowMinorAutoAdjustments} onChange={event=>changeLiveCoachSettings({allowMinorAutoAdjustments:event.target.checked})}/>Permitir somente ajustes automáticos leves</label></Surface>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Modo da partida</p>
              <div className="grid grid-cols-3 gap-2">{[['text','Completa'],['summary','Resumida'],['important','Momentos']].map(([id,label]) => <button key={id} onClick={() => changeDisplayMode(id)} className={`rounded-xl px-2 py-2 text-xs font-bold ${displayMode === id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50'}`}>{label}</button>)}</div>
            </div>

            <button
              onClick={startMatch}
              disabled={launching}
              data-practice-launch-ms={Math.round(launchMetrics?.preparationMs || 0)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              <Play className="h-4 w-4" /> {launching ? 'Preparando...' : 'Iniciar Partida'}
            </button>
          </div>
        )}

        {/* Live match */}
        {phase === 'live' && teams && (
          <LiveMatchRecoveryBoundary key={liveMatchSessionKey} onRecoveryError={handleLiveMatchCrash}>
            <div className="h-full min-h-0 flex-1 overflow-hidden">
              <LiveMatch
                teamA={teams.teamA}
                teamB={teams.teamB}
                initialTacticId={useCustomPlan ? { id: 'personalizado', label: 'Personalizado', icon: 'Brain', baseTacticId: initialTacticId, shotWeights: customShotWeights } : initialTacticId}
                coach={coach}
                liveCoachSettings={liveCoachSettings}
                onFinished={handleFinished}
                displayMode={displayMode}
                onDisplayModeChange={changeDisplayMode}
                initialState={resumedEngineState}
                onCheckpoint={saveCheckpoint}
                matchType="practice"
                matchId={matchIdRef.current}
              />
            </div>
          </LiveMatchRecoveryBoundary>
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
            <MatchRecapPremium
              matchState={result.matchState}
              title={result.won ? 'Vitória no jogo treino' : 'Resumo do jogo treino'}
              rewards={{ XP: `+${result.won ? 10 : 5}`, Moedas: `+${result.won ? 8 : 3}`, Ranking: 'Sem impacto' }}
            />
            {result.matchState.liveCoachReport && <div className="glass rounded-2xl p-4"><p className="text-xs font-black mb-2">Decisões durante a partida</p><p className="text-[11px] text-muted-foreground">{result.matchState.liveCoachReport.suggestionsReceived} sugestões · {result.matchState.liveCoachReport.suggestionsApplied} aplicadas · {result.matchState.liveCoachReport.suggestionsIgnored} ignoradas</p><p className="mt-2 text-[9px] text-muted-foreground">{result.matchState.liveCoachReport.disclaimer}</p></div>}

            {(() => {
              if (onReturnToTrainingCenter) {
                return (
                  <button
                    onClick={() => { onClose?.(); onReturnToTrainingCenter(); }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary/50 px-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary"
                  >
                    <Home className="h-4 w-4" /> Voltar ao Centro de Treinamento
                  </button>
                );
              }
              const primaryAction = getPostMatchPrimaryAction(profile);
              if (primaryAction.key === 'back-to-career') {
                return (
                  <button
                    onClick={() => { onClose?.(); navigate('/'); }}
                    className="w-full py-3 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                  >
                    <Home className="h-4 w-4" /> {primaryAction.label}
                  </button>
                );
              }
              return (
                <button
                  onClick={reset}
                  className="w-full py-3 rounded-xl bg-secondary/50 text-foreground font-bold text-sm hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" /> {primaryAction.label}
                </button>
              );
            })()}
          </div>
        )}
    </ModalShell>
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
