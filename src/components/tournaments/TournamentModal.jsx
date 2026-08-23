import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Brain, CalendarDays, CheckCircle, ChevronRight, Coins, Crown,
  Dumbbell, HeartPulse, History, Mic, Play, Shield, Star, Trash2, Trophy, Users,
  XCircle, Zap,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  TOURNAMENT_ENERGY_COST, buildMatchRewardsPatch, getChemistryBonus, getEnergyPenalty,
  incrementMissionProgress, isInjured, injuryRecoveryDays, overallRating, getWorldRank,
} from '@/lib/padel';
import { calculatePartnershipPerformanceBonus } from '@/lib/partnerBondSystem.js';
import { getPartnerBot, getTournamentRounds } from '@/lib/career';
import { buildPartnershipMatchPatch, getActivePartnership } from '@/lib/partnershipSystem';
import { processMatchRelationships } from '@/lib/relationships';
import { getTeamRank, teamKey } from '@/lib/teamRanking';
import { getSetScoreString } from '@/lib/matchEngine';
import { getCoachEffects } from '@/lib/coaches';
import { resolveActiveCoach } from '@/game-core/coachLifecycle';
import { finalizeTournamentRun, prepareTournamentFinalization } from '@/game-core/tournamentLifecycle.js';
import { syncPlayerAchievements } from '@/lib/achievementEngine.js';
import { buildAchievementContext } from '@/lib/achievementContext.js';
import { evaluateCareerMatchMilestones } from '@/lib/careerStoryEvents.js';
import { createMatchEndProfiler, scheduleSecondaryMatchWork } from '@/game-core/matchFinalization.js';
import { getStaffSnapshot } from '@/game-core/staffLifecycle.js';
import { formatPercent, normalizeFatigue } from '@/game-core/physicalStats.js';
import LiveMatch from '@/components/matches/LiveMatch';
import LiveMatchRecoveryBoundary from '@/components/matches/LiveMatchRecoveryBoundary.jsx';
import MatchRecapPremium from '@/components/matches/MatchRecapPremium';
import { ModalShell, ContextActionBar } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import { buildPhysicalPatch, getCoachPhysicalRecommendation } from '@/gameplay/worldTour/PhysicalConditionManager.js';
import { isPlayerRegisteredForTournament, isTournamentParticipationConfirmed, resolveTournamentCampaignEvent } from '@/lib/tournamentRegistration.js';
import { getTournamentDrawAnchorDate } from '@/lib/tournamentDraw.js';
import {
  postMatchInterviewIdentity,
  postMatchInterviewMessageId,
} from '@/lib/postMatchInterview.js';
import { isInterviewActionable } from '@/lib/interviewLifecycle.js';
import {
  TOURNAMENT_STRATEGY_OPTIONS, buildOpponentAnalysis, buildTournamentBracketHistory,
  buildTournamentCoachSuggestion, completePreTournamentMeeting, completeRoundPreparation,
  countMainDrawWins, getCurrentTournamentMatch, getTournamentRunPhase,
  recordTournamentMatchResult, startTournamentMatch, summarizeTournamentMatch,
  withdrawTournamentRun,
} from '@/gameplay/worldTour/TournamentRunManager.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';
import { registerBetaDiagnostic } from '@/lib/betaDiagnostics.js';
import {
  buildTournamentMatchCheckpoint,
  buildTournamentRecoverySession,
  buildTournamentReturnRoute,
  buildTournamentRoundCoreOperations,
} from '@/game-core/tournamentMatchLifecycle.js';
import { buildFreshTournamentRoundRecovery, probeTournamentRecoverySession } from '@/game-core/tournamentMatchRecoveryEngine.js';
import { buildInterviewRoute } from '@/lib/tournamentNextAction.js';
import { APP_ROUTES } from '@/navigation/routes.js';

const TIER_STYLES = {
  Crown:{icon:Crown,color:'text-amber-400'}, Elite:{icon:Crown,color:'text-fuchsia-400'},
  Masters:{icon:Trophy,color:'text-purple-400'}, Platinum:{icon:Trophy,color:'text-cyan-400'},
  Gold:{icon:Trophy,color:'text-yellow-400'}, Silver:{icon:Trophy,color:'text-slate-300'},
};

const ATTRIBUTE_LABELS = {
  smash: 'Smash', volley: 'Rede', serve: 'Saque', lob: 'Lob', defense: 'Defesa',
  speed: 'Velocidade', control: 'Controle', tactics: 'Tática',
};

function formatDay(value) {
  if (!value) return 'Data a definir';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function teamName(profile, partner) {
  return `${profile?.sport_name || profile?.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`;
}

export default function TournamentModal({ tournament, profile: initialProfile, careerId, onClose, onProfileUpdate, onComplete }) {
  const navigate = useNavigate();
  // M4.3 (docs/MOBILE_M4_3_GAME_FLOW.md, Parte I/N): bug real encontrado na
  // auditoria — todo botão "Voltar à carreira" só chamava onClose (fecha o
  // modal), sem navegar. Como o modal é montado tanto em Tournaments.jsx
  // quanto em CalendarPage.jsx (onClose só limpa o estado local do modal
  // ali), o jogador ficava na página que já estava, nunca de fato "de
  // volta à carreira" (Home) como o rótulo prometia — mesma classe de bug
  // já corrigida em SimulationModal.jsx (M4.2.2). Fechar + navegar, mesmo
  // padrão.
  const goBackToCareer = useCallback(() => { onClose?.(); navigate('/'); }, [onClose, navigate]);
  const [profile, setProfile] = useState(initialProfile);
  const [event, setEvent] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [run, setRun] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [lastResult, setLastResult] = useState(null);
  const [tournamentRewards, setTournamentRewards] = useState(null);
  const [physicalReport, setPhysicalReport] = useState(null);
  const [teamRank, setTeamRank] = useState({ rank: 0, total: 0 });
  const [coach, setCoach] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('balanced');
  const [liveCoachSettings, setLiveCoachSettings] = useState(() => ({
    liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false,
    showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true,
    ...(initialProfile?.live_coach_settings || {}),
  }));
  // M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md): antes desta fase, uma rodada
  // interrompida no meio da partida ao vivo era descartada e reiniciada do
  // zero (ver o bloco "playing→scheduled" abaixo) — a campanha/chave nunca
  // se perdia, mas o jogo em si sempre voltava a 0-0. Agora, se existir um
  // checkpoint do engine para essa rodada específica, ele é oferecido antes
  // de qualquer descarte.
  const [resumeCheckpoint, setResumeCheckpoint] = useState(null);
  const [resumedEngineState, setResumedEngineState] = useState(null);
  const [recoverySession, setRecoverySession] = useState(null);
  const [resumeError, setResumeError] = useState('');
  const [resuming, setResuming] = useState(false);
  const [liveMatchSessionKey, setLiveMatchSessionKey] = useState(0);
  // Hotfix 15.5.4 (complemento — sorteio em D-3): usado só pela fase
  // 'not_drawn', para informar quando a chave sai (ver render abaixo).
  const [drawDate, setDrawDate] = useState(null);
  const savedRef = useRef(false);
  const { toast } = useToast();

  const partner = getPartnerBot(profile);
  const mainRounds = useMemo(() => getTournamentRounds(tournament), [tournament]);
  const currentMatch = getCurrentTournamentMatch(run);
  const opponent = currentMatch?.opponent || [];
  const tierStyle = TIER_STYLES[tournament?.tier] || TIER_STYLES.Silver;
  const TierIcon = tierStyle.icon;
  const analysis = buildOpponentAnalysis(opponent, {
    teamRank: currentMatch?.opponentRank,
    analysisLevel: Number(profile?.staff_analysis_level || 0),
  });
  const coachSuggestion = buildTournamentCoachSuggestion(run, profile, analysis);

  // Hotfix 15.6.1 (D-3/D-0 — modal preso em "chave ainda não sorteada"):
  // este efeito só reagia a `initialProfile.id`/`tournament.id`, que nunca
  // mudam para o MESMO torneio — então, se o modal for aberto (ou
  // permanecer montado, ex.: reaproveitado por uma navegação que não
  // desmonta a página-mãe) ANTES de D-3/no meio da janela D-3..D-0 e o
  // sorteio só se concretizar depois (ensureTournamentDraw roda dentro do
  // PRÓXIMO avanço de dia, um processo assíncrono independente deste
  // componente), nada nunca mandava este efeito reler o CalendarEvent —
  // `run` ficava `null` para sempre, mesmo depois do sorteio existir de
  // verdade no storage. A extração abaixo permite chamar exatamente a
  // mesma leitura (nunca uma criação) tanto no mount quanto — só enquanto
  // a fase for 'not_drawn' — a cada `padel:career-advanced`/
  // `padel:profile-updated` (os mesmos eventos que TODO avanço de dia já
  // dispara; nenhum evento novo, nenhum polling, nenhum timer).
  const loadCampaignRef = useRef(null);
  useEffect(() => {
    let active = true;
    const loadCampaign = async () => {
      // Hotfix 15.6.2 (causa raiz real — QA desktop): antes, um `.find()`
      // ingênuo sobre TODAS as linhas de CalendarEvent com este `related_id`
      // podia pegar um evento de demonstração do seed local (mesma
      // `related_id` do torneio real, nunca com `tournament_run`) em vez da
      // inscrição real do jogador — o modal "esquecia" um sorteio que já
      // existia de verdade (confirmado por Torneios → Ver chaves, que nunca
      // sofria disso por já preferir, por construção, a linha com run).
      // `resolveTournamentCampaignEvent` é agora a ÚNICA fonte usada por
      // qualquer consumidor que precise resolver uma campanha a partir de
      // (profileId, tournamentId) — nunca uma segunda interpretação aqui.
      const calendarEvent = await resolveTournamentCampaignEvent(initialProfile.id, tournament.id);
      if (!calendarEvent) throw new Error('O compromisso do torneio não foi encontrado no calendário.');
      const registration = await isPlayerRegisteredForTournament(initialProfile.id, tournament.id);
      // Hotfix 15.5.2: um save legado (anterior à inscrição v2) ou uma linha
      // de TournamentRegistration órfã não pode travar uma campanha já em
      // andamento — se o próprio CalendarEvent já guarda um tournament_run
      // ativo para este torneio, a presença é derivada dele em memória.
      const confirmed = registration || (isTournamentParticipationConfirmed({ event: calendarEvent }) ? { derived: true } : null);
      if (!confirmed) throw new Error('Sua dupla não possui inscrição confirmada neste torneio.');

      // Hotfix crítico (docs/TOURNAMENT_ROUND_STATE_HOTFIX.md): `initialProfile`
      // é só a prop recebida da página-pai (Tournaments.jsx/CareerHub.jsx),
      // que busca o perfil uma vez no mount e não escuta o avanço de dia feito
      // pelo cabeçalho global — pode estar com um career_date antigo mesmo
      // que o storage já tenha avançado até a data desta rodada. A releitura
      // explícita acima é o que corrige isso; `resolveActiveCoach` só
      // resolve o treinador ativo (se houver) para o bônus de partida e a
      // fala do treinador — nunca cria um contrato (Starter Coach Flow,
      // docs/STARTER_COACH_FLOW.md).
      const freshProfile = await localGame.entities.PlayerProfile.get(initialProfile.id).catch(() => initialProfile);
      if (!active) return;
      const starter = await resolveActiveCoach(freshProfile);
      const loadedProfile = starter.profile || freshProfile;
      const loadedPartner = getPartnerBot(loadedProfile);
      const [rank, staffSnapshot] = await Promise.all([
        loadedPartner ? getTeamRank(loadedProfile, loadedPartner) : Promise.resolve({ rank: 0, total: 0 }),
        getStaffSnapshot(loadedProfile).catch(() => ({ staff: [] })),
      ]);
      if (!active) return;

      const tournamentRun = calendarEvent.metadata?.tournament_run || null;
      if (!tournamentRun) {
        // Hotfix 15.5.4 (complemento — sorteio na data canônica, D-3): este
        // modal NUNCA cria o tournament_run. Quem sorteia é exclusivamente
        // a pipeline de avanço de dia (ensureTournamentDraw, chamada por
        // processCalendarEvents dentro de advanceDay — ver
        // src/lib/tournamentDraw.js e src/lib/calendarSystem.js). Antes de
        // D-3, abrir/fechar este modal repetidamente só mostra o estado
        // "chave ainda não sorteada" (fase 'not_drawn'), sem qualquer
        // efeito colateral — mesmo run inexistente na 1ª, 2ª ou 10ª vez.
        setRegistration(confirmed);
        setEvent(calendarEvent);
        setProfile(loadedProfile);
        setCoach(starter.coach || null);
        setStaff(staffSnapshot.staff || []);
        setTeamRank(rank || { rank: 0, total: 0 });
        setDrawDate(getTournamentDrawAnchorDate(calendarEvent, tournament));
        setPhase('not_drawn');
        return;
      }

      // Uma partida interrompida pode ser reiniciada; uma concluída nunca volta a jogar.
      // M3: "reiniciada" agora significa, preferencialmente, retomada do
      // engine_state exato salvo em checkpoint — só cai para 0-0 quando não
      // existe checkpoint válido para esta rodada (fallback pré-existente).
      const restoredMatch = getCurrentTournamentMatch(tournamentRun);
      const checkpoint = careerId ? await getMatchCheckpointRepository().read(careerId).catch(() => null) : null;
      let matchedSession = null;
      if (tournamentRun.status === 'playing' && restoredMatch?.status === 'playing') {
        const identityMatches = Boolean(checkpoint && (
          (checkpoint.match_id === restoredMatch.id && checkpoint.tournament_id === tournament.id)
          || (String(checkpoint.match_id) === String(restoredMatch.id) && String(checkpoint.tournament_id) === String(tournament.id))
        ));
        const session = probeTournamentRecoverySession(buildTournamentRecoverySession(checkpoint, {
          careerId,
          careerDate: loadedProfile?.career_date,
          tournament,
          run: tournamentRun,
          match: restoredMatch,
          teamA: [loadedProfile, loadedPartner].filter(Boolean),
          teamB: restoredMatch.opponent || [],
        }));
        matchedSession = session;
        if (!identityMatches || session.status !== 'resumable') {
          console.error('[TournamentLifecycle]', session.diagnostic);
          registerBetaDiagnostic({
            type: 'tournament-checkpoint-invalid',
            ...session.diagnostic,
          });
        }
      } else if (checkpoint?.type === 'tournament' && checkpoint.tournament_id === tournament.id) {
        // O bracket já não reconhece esta partida como atual: checkpoint órfão
        // ou finalizado. Limpeza idempotente, sem tocar em resultados/rodadas.
        await getMatchCheckpointRepository().clearIfMatch(careerId, checkpoint.match_id).catch(() => {});
      }

      const playerTeam = teamName(loadedProfile, loadedPartner);
      const savedEvent = await localGame.entities.CalendarEvent.update(calendarEvent.id, {
        title: `${tournament.name} — ${getCurrentTournamentMatch(tournamentRun)?.round || 'Torneio'}`,
        start_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.start_date,
        end_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.end_date,
        requires_decision: !['eliminated', 'champion', 'finished'].includes(tournamentRun.status),
        metadata: { ...(calendarEvent.metadata || {}), tournament_run: tournamentRun, tournament_run_schema_version: 2 },
      });
      await localGame.entities.Tournament.update(tournament.id, {
        bracket_history: buildTournamentBracketHistory(tournamentRun, playerTeam),
        current_phase: tournamentRun.status,
      }).catch(() => {});
      if (!active) return;
      setRegistration(confirmed);
      setEvent(savedEvent);
      setProfile(loadedProfile);
      setCoach(starter.coach || null);
      setStaff(staffSnapshot.staff || []);
      setTeamRank(rank || { rank: 0, total: 0 });
      setRun(tournamentRun);
      setSelectedStrategy(tournamentRun.strategy?.id || 'balanced');
      setLiveCoachSettings((current) => ({ ...current, ...(loadedProfile.live_coach_settings || {}) }));
      if (matchedSession) {
        setRecoverySession(matchedSession);
        setResumeCheckpoint(matchedSession.checkpoint);
        setPhase(matchedSession.status === 'resumable' ? 'match_resume_prompt' : 'match_restart_prompt');
      } else {
        setPhase(getTournamentRunPhase(tournamentRun, loadedProfile.career_date));
      }
      if (loadedProfile.id && loadedProfile.coach_id !== initialProfile.coach_id) onProfileUpdate?.(loadedProfile);
    };
    loadCampaignRef.current = loadCampaign;
    loadCampaign().catch((error) => {
      console.error('[TournamentModal] Falha ao restaurar campanha', error);
      if (active) {
        toast({ title: 'Torneio indisponível', description: error.message, variant: 'destructive' });
        setPhase('error');
      }
    });
    return () => { active = false; };
  }, [initialProfile.id, tournament.id]);

  // Só ouve enquanto a fase for 'not_drawn' — uma vez que o run é
  // encontrado, o efeito acima já assume o controle normal da campanha;
  // isto nunca dispara `ensureTournamentDraw` nem qualquer criação, apenas
  // reexecuta a MESMA leitura read-only do efeito de mount.
  useEffect(() => {
    if (phase !== 'not_drawn') return undefined;
    const recheck = () => { loadCampaignRef.current?.(); };
    window.addEventListener('padel:career-advanced', recheck);
    window.addEventListener('padel:profile-updated', recheck);
    return () => {
      window.removeEventListener('padel:career-advanced', recheck);
      window.removeEventListener('padel:profile-updated', recheck);
    };
  }, [phase]);

  async function persistRun(nextRun, eventPatch = {}) {
    const freshEvent = await localGame.entities.CalendarEvent.get(event.id).catch(() => event);
    const nextMatch = getCurrentTournamentMatch(nextRun);
    const terminal = ['eliminated', 'champion', 'finished'].includes(nextRun.status);
    const eventData = {
      title: terminal ? tournament.name : `${tournament.name} — ${nextMatch?.round || 'Torneio'}`,
      start_date: nextMatch?.date || freshEvent.start_date,
      end_date: nextMatch?.date || freshEvent.end_date,
      status: terminal ? 'completed' : 'scheduled',
      requires_decision: !terminal,
      ...eventPatch,
      metadata: { ...(freshEvent.metadata || {}), ...(eventPatch.metadata || {}), tournament_run: nextRun, tournament_run_schema_version: 2 },
    };
    const bracket = buildTournamentBracketHistory(nextRun, teamName(profile, partner));
    const persisted = await localGame.batch([
      { type: 'update', entityName: 'CalendarEvent', id: freshEvent.id, data: eventData },
      { type: 'update', entityName: 'Tournament', id: tournament.id, data: { bracket_history: bracket, current_phase: nextRun.status === 'champion' ? 'concluido' : nextRun.status } },
    ]);
    const savedEvent = persisted.records?.[0] || { ...freshEvent, ...eventData };
    setEvent(savedEvent);
    setRun(nextRun);
    return { savedEvent, bracket };
  }

  async function savePreTournamentMeeting() {
    const result = completePreTournamentMeeting(run, selectedStrategy);
    await persistRun(result.run);
    setPhase(getTournamentRunPhase(result.run, profile.career_date));
  }

  async function saveRoundPreparation({ keepPlan = false } = {}) {
    const result = completeRoundPreparation(run, { keepPlan, optionId: selectedStrategy });
    await persistRun(result.run);
    setPhase(getTournamentRunPhase(result.run, profile.career_date));
  }

  async function startMatch() {
    if (!registration) return;
    if (isInjured(profile)) {
      toast({ title: 'Lesionado', description: `Recupera em ${injuryRecoveryDays(profile)} dias.` });
      return;
    }
    if ((profile.energy || 0) < TOURNAMENT_ENERGY_COST) {
      toast({ title: 'Energia insuficiente', description: `Você precisa de ${TOURNAMENT_ENERGY_COST} energia para competir.`, variant: 'destructive' });
      return;
    }
    try {
      const next = startTournamentMatch(run, profile.career_date);
      await persistRun(next);
      savedRef.current = false;
      setResumedEngineState(null);
      setPhase('match');
    } catch (error) {
      toast({ title: 'Partida bloqueada', description: error.message, variant: 'destructive' });
    }
  }

  async function resumeMatchCheckpoint() {
    if (resuming) return;
    setResuming(true);
    setResumeError('');
    try {
      const session = probeTournamentRecoverySession(buildTournamentRecoverySession(resumeCheckpoint, {
        careerId,
        careerDate: profile?.career_date,
        tournament,
        run,
        match: currentMatch,
        teamA: [profile, partner].filter(Boolean),
        teamB: opponent,
      }));
      if (session.status !== 'resumable') throw new Error('O checkpoint não é compatível com esta rodada.');
      savedRef.current = false;
      setRecoverySession(session);
      setResumedEngineState(session.engineState);
      setLiveMatchSessionKey((value) => value + 1);
      setPhase('match');
    } catch (error) {
      handleResumeFailure(error, recoverySession);
    } finally {
      setResuming(false);
    }
  }

  function handleResumeFailure(error, session = recoverySession) {
    const diagnostic = {
      code: 'tournament_resume_failed',
      careerId: careerId || null,
      tournamentId: tournament?.id || null,
      round: currentMatch?.round || null,
      checkpointMatchId: session?.checkpoint?.match_id || resumeCheckpoint?.match_id || null,
      tournamentCurrentMatchId: currentMatch?.id || null,
      checkpointParticipants: session?.checkpoint?.participant_ids || null,
      expectedParticipants: session?.participants?.ids || null,
      hasEngineState: Boolean(session?.checkpoint?.engine_state || resumeCheckpoint?.engine_state),
      checkpointStatus: session?.checkpoint?.checkpoint_status || resumeCheckpoint?.checkpoint_status || null,
      careerDate: profile?.career_date || null,
      message: error?.message || 'Falha ao montar a partida recuperada.',
    };
    console.error('[TournamentLifecycle]', diagnostic);
    registerBetaDiagnostic({ type: 'tournament-resume', ...diagnostic });
    setRecoverySession((current) => ({ ...(current || session || {}), status: 'resume_failed', diagnostic }));
    setResumeError('Não foi possível continuar esta partida. Seu torneio e as rodadas anteriores permanecem preservados.');
    setPhase('match_restart_prompt');
  }

  async function restartRoundFromZero() {
    if (resuming) return;
    setResuming(true);
    setResumeError('');
    try {
      const fresh = buildFreshTournamentRoundRecovery({
        careerId,
        tournament,
        run,
        teamA: [profile, partner].filter(Boolean),
        teamB: opponent,
        initialTacticId: run.strategy?.matchTacticId || 'equilibrado',
        coach,
        liveCoachSettings,
      });
      const repository = getMatchCheckpointRepository();
      // Há exatamente um arquivo transitório por carreira e esta ação só é
      // oferecida para a rodada atual já validada como restart_required.
      await getMatchCheckpointRepository().clear(careerId);
      await persistRun(fresh.run);
      await repository.save(careerId, fresh.checkpoint);
      savedRef.current = false;
      setResumeCheckpoint(fresh.checkpoint);
      setRecoverySession(fresh.session);
      setResumedEngineState(fresh.session.engineState);
      setLiveMatchSessionKey((value) => value + 1);
      setPhase('match');
    } catch (error) {
      handleResumeFailure(error, recoverySession);
    } finally {
      setResuming(false);
    }
  }

  const saveMatchCheckpoint = useCallback((engineState) => {
    if (!careerId || !currentMatch?.id) return;
    const checkpoint = buildTournamentMatchCheckpoint({
      tournament,
      match: currentMatch,
      teamA: [profile, partner].filter(Boolean),
      teamB: opponent,
      engineState,
    });
    getMatchCheckpointRepository().save(careerId, checkpoint)
      .catch((error) => console.warn('[TournamentModal] falha ao salvar checkpoint da partida.', {
        code: error?.code || 'tournament_match_checkpoint_save_failed',
        tournamentId: tournament.id,
        round: currentMatch.round,
        matchId: currentMatch.id,
      }));
  }, [careerId, currentMatch, opponent, partner, profile, tournament]);

  function buildRoundMediaOperations(match, won, nextRun) {
    const importance = nextRun.matches.find((item) => item.id === match.id)?.pressImportance || 'simple';
    const safeMatchId = match.id.replace(/[^a-zA-Z0-9_-]/g, '-');
    const interview = postMatchInterviewIdentity(match.id);
    const interviewMessageId = postMatchInterviewMessageId(profile.id, match.id);
    const returnTo = buildTournamentReturnRoute(tournament.id);
    const next = getCurrentTournamentMatch(nextRun);
    const headline = won
      ? `${teamName(profile, partner)} avança no ${tournament.name}`
      : `${teamName(profile, partner)} se despede do ${tournament.name}`;
    return [
      { type: 'upsert', entityName: 'PressArticle', id: `round-news-${safeMatchId}`, data: {
        profile_id: profile.id,
        title: headline,
        content: won
          ? `A dupla venceu em ${match.round} e agora se prepara para ${next?.round || 'a sequência da campanha'}.`
          : `A campanha terminou em ${match.round}, após uma partida que terá repercussão no circuito.`,
        article_type: 'noticia', sentiment: won ? 'positivo' : 'neutro', outlet: 'Padel Legacy News',
        journalist_name: 'Redação PL', published_date: profile.career_date,
        related_tournament_id: tournament.id, round_importance: importance,
      } },
      { type: 'upsert', entityName: 'CareerMessage', id: interviewMessageId, data: {
        profile_id: profile.id, sender_type: 'imprensa', sender_name: 'Assessoria de Imprensa',
        title: nextRun.status === 'champion' ? 'Entrevista especial de campeão' : won ? 'Entrevista pós-vitória disponível' : 'Entrevista pós-eliminação disponível',
        content: `A imprensa quer repercutir ${match.round}. A importância desta rodada foi classificada como ${importance}.`,
        status: 'nao_lida', priority: ['global', 'high'].includes(importance) ? 'alta' : 'normal',
        related_entity_type: 'PressInterview', related_entity_id: interview.id,
        is_read: false, is_new: true,
        destination: { type: 'PRESS_INTERVIEW', route: '/press', params: { tab: 'interviews', interview: interview.id, source: interview.sourceId, returnTo } },
        metadata: { route: buildInterviewRoute({ interviewId: interview.id, sourceId: interview.sourceId, returnTo }), context_key: interview.contextKey, interview_id: interview.id, interview_source_id: interview.sourceId, match_id: match.id, tournament_id: tournament.id, round: match.round },
      } },
      { type: 'upsert', entityName: 'Post', id: `round-post-${safeMatchId}`, data: {
        author_name: 'Padel Legacy News', author_type: 'media', content: headline,
        likes: importance === 'global' ? 180 : importance === 'high' ? 90 : importance === 'medium' ? 42 : 18,
        comments_count: importance === 'global' ? 35 : importance === 'high' ? 18 : 6,
        created_date: new Date().toISOString(),
      } },
    ];
  }

  async function handleMatchFinished(matchState) {
    if (savedRef.current || !event?.id || !currentMatch) return;
    savedRef.current = true;
    const won = matchState.winner === 'A';
    const profiler = createMatchEndProfiler();
    try {
      const [freshEvent, freshProfile] = await Promise.all([
        localGame.entities.CalendarEvent.get(event.id),
        localGame.entities.PlayerProfile.get(profile.id),
      ]);
      const freshRun = freshEvent.metadata?.tournament_run || run;
      const freshMatch = getCurrentTournamentMatch(freshRun);
      if (freshMatch?.status === 'completed') {
        if (careerId) await getMatchCheckpointRepository().clearIfMatch(careerId, currentMatch.id).catch(() => {});
        setRun(freshRun);
        setPhase(freshRun.status === 'champion' ? 'champion' : freshRun.status === 'eliminated' ? 'eliminated' : 'round_result');
        return;
      }

      const score = await profiler.measure('finalizeScore', async () => getSetScoreString(matchState));
      const stats = await profiler.measure('aggregateStats', async () => summarizeTournamentMatch(matchState));
      const transition = recordTournamentMatchResult(freshRun, {
        matchId: freshMatch.id,
        won,
        score,
        stats,
        tournament,
        upset: won && Number(freshMatch.opponentRank || 9999) < Number(teamRank.rank || 9999),
      });
      const nextRun = transition.run;
      const completedMatch = nextRun.matches.find((item) => item.id === freshMatch.id);

      const matchRecord = {
        id: freshMatch.id,
        profile_id: profile.id,
        career_date: profile.career_date,
        played_date: profile.career_date,
        date: profile.career_date,
        location: tournament.name,
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tournament_round: freshMatch.round,
        team_a: [profile.sport_name, partner?.name || 'Parceiro'],
        team_b: opponent.map((item) => item.name),
        score_a: matchState.setsA,
        score_b: matchState.setsB,
        score,
        winner: matchState.winner,
        result: won ? 'vitória' : 'derrota',
        // Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte C): campo novo ao lado da
        // própria escrita da partida — nenhuma consulta/coluna nova além
        // desta. opponentRank já existia em memória (usado só para o
        // cálculo local de `upset` acima); agora também persiste na
        // partida, permitindo achievementContext.js calcular "venceu um
        // Top 10"/"venceu o #1" sob demanda, sem reprocessar histórico.
        opponent_rank: Number(freshMatch.opponentRank) > 0 ? Number(freshMatch.opponentRank) : null,
        status: 'completed',
        match_type: freshMatch.stage === 'qualifying' ? 'qualifying' : 'tournament',
        competition_type: 'tournament',
        is_official: true,
        is_tournament: true,
        match_occurred: true,
        tournament_outcome: nextRun.status === 'champion' ? 'champion' : nextRun.status === 'eliminated' ? 'eliminated' : 'advanced',
        press_importance: completedMatch.pressImportance,
        stats_summary: stats,
        recap_snapshot: matchState.matchRecapSnapshot || null,
        point_event_count: Number(matchState.pointEvents?.length || matchState.stats?.rallies || 0),
        notes: `${freshMatch.round} | ${score}`,
      };

      const rewardAlreadyApplied = (freshProfile.processed_match_keys || []).includes(freshMatch.id);
      const reward = buildMatchRewardsPatch(freshProfile, won, {
        skipPhysical: true,
        idempotencyKey: freshMatch.id,
        officialTournament: true,
      });
      let updatedDraft = { ...freshProfile, ...reward.updates };
      // Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte C): sequência de vitórias
      // OFICIAIS — nenhum contador existia antes. Mesma guarda de
      // idempotência (rewardAlreadyApplied) que o resto desta função já usa
      // para o mesmo matchId, para nunca incrementar duas vezes o mesmo
      // resultado reprocessado.
      if (!rewardAlreadyApplied) {
        updatedDraft = { ...updatedDraft, current_win_streak: won ? (Number(updatedDraft.current_win_streak) || 0) + 1 : 0 };
      }
      const physicalKeys = Array.isArray(updatedDraft.processed_tournament_physical_keys) ? updatedDraft.processed_tournament_physical_keys : [];
      let physical = null;
      if (!physicalKeys.includes(freshMatch.id)) {
        physical = buildPhysicalPatch({
          profile: updatedDraft, tournament, roundLabel: freshMatch.round, won,
          matchesThisWeek: Number(updatedDraft.matches_this_week) || 0, date: profile.career_date,
        });
        updatedDraft = { ...updatedDraft,
          ...physical.patch,
          processed_tournament_physical_keys: [...physicalKeys, freshMatch.id].slice(-100),
        };
      }

      const rankingKey = partner?.id ? teamKey(freshProfile.id, partner.id) : null;
      const [rankingRows, activePartnership] = rewardAlreadyApplied ? [[], null] : await Promise.all([
        rankingKey ? localGame.entities.TeamRanking.filter({ team_key: rankingKey }) : Promise.resolve([]),
        getActivePartnership(profile.id),
      ]);
      /** @type {any[]} */
      const operations = [];
      if (!rewardAlreadyApplied) {
        const ranking = rankingRows?.[0];
        if (rankingKey && partner) {
          const sortedPlayers = [freshProfile, partner].sort((a, b) => a.id.localeCompare(b.id));
          operations.push({ type: 'upsert', entityName: 'TeamRanking', id: ranking?.id || `team-ranking-${rankingKey}`, data: {
            team_key: rankingKey,
            player1_id: sortedPlayers[0].id,
            player1_name: sortedPlayers[0].sport_name || sortedPlayers[0].name,
            player2_id: sortedPlayers[1].id,
            player2_name: sortedPlayers[1].sport_name || sortedPlayers[1].name,
            ranking_points: (Number(ranking?.ranking_points) || 0) + (won ? 50 : 20),
            matches_played: (Number(ranking?.matches_played) || 0) + 1,
            wins: (Number(ranking?.wins) || 0) + (won ? 1 : 0),
            losses: (Number(ranking?.losses) || 0) + (won ? 0 : 1),
            titles: ranking?.titles || [],
          } });
        }
        if (activePartnership) {
          const partnershipPatch = buildPartnershipMatchPatch(activePartnership, won, tournament.name, profile.career_date);
          operations.push({ type: 'update', entityName: 'Partnership', id: activePartnership.id, data: partnershipPatch });
          updatedDraft = { ...updatedDraft, partner_chemistry: partnershipPatch.chemistry, partner_trust: partnershipPatch.partner_trust, partner_morale: partnershipPatch.partner_morale };
        }
      }

      const bracket = buildTournamentBracketHistory(nextRun, teamName(updatedDraft, partner));
      const nextScheduledMatch = getCurrentTournamentMatch(nextRun);
      const terminalStatus = ['eliminated', 'champion', 'finished'].includes(nextRun.status);
      // O lote principal é atômico. Em retry de uma rodada já finalizada não
      // reexecutamos o upsert da ação de imprensa, pois isso ressuscitaria uma
      // mensagem que o jogador pode ter concluído depois do primeiro save.
      const mediaOperations = rewardAlreadyApplied ? [] : buildRoundMediaOperations(freshMatch, won, nextRun);
      operations.push(...buildTournamentRoundCoreOperations({
        matchRecord,
        profileId: freshProfile.id,
        playerPatch: { ...reward.updates, ...(physical?.patch || {}), partner_chemistry: updatedDraft.partner_chemistry, partner_trust: updatedDraft.partner_trust, partner_morale: updatedDraft.partner_morale, processed_tournament_physical_keys: updatedDraft.processed_tournament_physical_keys },
        event: freshEvent,
        eventPatch: {
          title: terminalStatus ? tournament.name : `${tournament.name} — ${nextScheduledMatch?.round || 'Torneio'}`,
          start_date: nextScheduledMatch?.date || freshEvent.start_date,
          end_date: nextScheduledMatch?.date || freshEvent.end_date,
          status: terminalStatus ? 'completed' : 'scheduled',
          requires_decision: !terminalStatus,
          metadata: { ...(freshEvent.metadata || {}), tournament_run: nextRun, tournament_run_schema_version: 2, last_completed_match_id: freshMatch.id, next_round_date: transition.nextMatch?.date || null },
        },
        tournament,
        tournamentPatch: { bracket_history: bracket, current_phase: nextRun.status === 'champion' ? 'concluido' : nextRun.status },
        mediaOperations,
      }));
      const coreResult = await profiler.measure('persistSave', async () => localGame.batch(operations, { idempotencyKey: `tournament:${freshMatch.id}` }));
      if (careerId) {
        await profiler.measure('clearCheckpoint', () => getMatchCheckpointRepository().clearIfMatch(careerId, freshMatch.id))
          .catch((error) => {
            const diagnostic = {
              code: 'tournament_match_checkpoint_clear_failed',
              careerId,
              tournamentId: tournament.id,
              round: freshMatch.round,
              matchId: freshMatch.id,
              message: error?.message,
            };
            console.error('[TournamentLifecycle]', diagnostic);
            registerBetaDiagnostic({ type: 'tournament-checkpoint-clear-failed', ...diagnostic });
          });
      }
      let updated = coreResult.player || updatedDraft;
      setEvent(coreResult.records?.find((record) => record?.id === freshEvent.id) || freshEvent);
      // Hotfix 15.5.4 (P0 — 2ª rodada "iniciando" por alguns segundos):
      // `run` (e portanto `currentMatch`/`opponent`, derivados dele a cada
      // render) já aponta para a PRÓXIMA rodada assim que `setRun(nextRun)`
      // roda. O restante da função ainda tem vários `await` pela frente
      // (finalização do torneio, conquistas, marcos de carreira,
      // relacionamentos, missões) antes de `setPhase` sair de 'match' — nessa
      // janela, um render com `phase === 'match'` e `currentMatch` já sendo
      // a QF trocava a `key` do LiveMatch e montava uma sessão nova da QF
      // (autoPlay verdadeiro), que só era desmontada quando o `setPhase`
      // tardio finalmente chegava — exatamente o "início e aborto" visto no
      // QA físico. `run` e a transição de fase precisam mudar no MESMO
      // commit: chamados em sequência síncrona (sem `await` entre eles),
      // o batching do React 18 garante que nenhum render intermediário veja
      // a rodada nova com a fase ainda em 'match'. O restante do trabalho
      // assíncrono (conquistas/missões/perfil final) continua depois,
      // exatamente como antes — só a transição de fase deixou de esperar por ele.
      setPhysicalReport(physical);
      setLastResult({ won, matchState, match: freshMatch, nextMatch: transition.nextMatch });
      setSelectedStrategy(nextRun.strategy?.id || 'balanced');
      setPhase(nextRun.status === 'champion' ? 'champion' : nextRun.status === 'eliminated' ? 'eliminated' : 'round_result');
      setRun(nextRun);

      let completion = null;
      if (transition.terminal) {
        completion = await profiler.measure('tournament', async () => prepareTournamentFinalization({
          profile: updated,
          tournament,
          partner,
          roundsWon: countMainDrawWins(nextRun),
          totalRounds: mainRounds.length,
          runId: `${tournament.id}:${nextRun.createdAt}`,
          bracketHistory: bracket,
          runnerUp: won ? opponent.map((item) => item.name).join(' & ') : teamName(updated, partner),
        }));
        updated = completion.updatedProfile;
        setTournamentRewards(completion.rewards);
      }

      // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 9)
      // + Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte C): antes só rodava no
      // fim do torneio (join_tournament/win_tournament) — movido para depois
      // de CADA partida oficial porque agora também avalia conquistas de
      // partida (play_official_match/win_official_match/beat_top10/
      // beat_rank1/win_streak), cujo contador real muda a cada partida, não
      // só no fim da campanha. Mesmo nível de abstração de
      // incrementMissionProgress logo abaixo, nunca dentro do motor de
      // torneio/finalização em si. Idempotente: nunca re-concede uma
      // conquista já registrada.
      let achievementContext = null;
      try {
        const worldRank = await getWorldRank(updated).catch(() => null);
        achievementContext = await buildAchievementContext(updated, { worldRank });
        const achievementSync = await syncPlayerAchievements(updated, achievementContext, { localGame });
        if (achievementSync.profile) updated = achievementSync.profile;
      } catch (achievementError) {
        console.error('[achievements] Falha ao avaliar conquistas de torneio.', achievementError);
      }

      // Fase 14 (Parte 2/10): mesmo achievementContext já construído acima
      // (Parte 15: nenhuma consulta extra) — dispara notificações
      // deduplicadas de marco de carreira (1ª partida/vitória/título,
      // vitória sobre Top 10/#1 do mundo). Best-effort, mesmo nível de
      // abstração das conquistas.
      if (achievementContext) {
        evaluateCareerMatchMilestones(updated, matchRecord, achievementContext).catch((careerStoryError) => {
          console.error('[career-story] Falha ao avaliar marcos de carreira.', careerStoryError);
        });
      }

      // Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 5): auditoria achou
      // que processMatchRelationships só era chamada em partida de treino
      // (SimulationModal.jsx) — um rival de torneio de verdade nunca
      // acumulava confronto/H2H nenhum. Mesmo nível de abstração das
      // conquistas acima (não-bloqueante, nunca dentro do motor de
      // torneio em si).
      const finalLabel = String(freshMatch.round || '').toLowerCase();
      processMatchRelationships(
        profile.id,
        opponent.map((item) => item.name),
        partner?.name,
        won,
        { isFinal: finalLabel.includes('final') && !finalLabel.includes('semi') },
      ).catch(() => {});

      const missionObjectives = [
        ...(won ? ['win_matches'] : []),
        'play_matches',
        ...(nextRun.status === 'champion' ? ['win_tournament'] : []),
      ];
      const secondaryOperations = transition.terminal ? completion.operations : [];
      const secondaryTask = () => rewardAlreadyApplied && !transition.terminal
        ? Promise.resolve(null)
        : incrementMissionProgress(
          profile.id,
          missionObjectives,
          1,
          profile.career_date,
          {
            triggerEventId: freshMatch.id,
            batchWrites: true,
            additionalOperations: secondaryOperations,
            playerPatch: transition.terminal && !completion.idempotent ? completion.playerPatch : null,
          },
        );
      if (transition.terminal) await profiler.measure('missions', secondaryTask);
      else scheduleSecondaryMatchWork(secondaryTask);
      profiler.finish();
      // physicalReport/lastResult/selectedStrategy/phase já foram aplicados
      // logo após persistir o resultado (ver comentário acima) — aqui só o
      // perfil final (já incorporando conquistas/finalização de torneio,
      // que só terminam depois deste ponto) precisa de uma atualização extra.
      setProfile(updated);
      onProfileUpdate?.(updated);
      onComplete?.();
    } catch (error) {
      console.error('[TournamentModal] Falha ao concluir rodada', error);
      savedRef.current = false;
      toast({ title: 'Falha ao salvar a rodada', description: 'O resultado não foi aplicado novamente. Tente concluir o salvamento.', variant: 'destructive' });
    }
  }

  // Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 7/8): causa
  // raiz real do "backdrop sombreado" — este handler nunca chamava onClose(),
  // só navigate(). Como /press é uma rota lazy (React Router
  // future.v7_startTransition:true, routeModules.js) dentro de um
  // <Suspense>, navegar pra um chunk ainda não carregado mantém a árvore
  // ANTERIOR montada (TournamentModal, com seu próprio backdrop) até o
  // chunk resolver — nesse intervalo, o backdrop do TournamentModal e o
  // backdrop do InterviewModal (que monta depois, quando Press termina seu
  // próprio load()) podem coexistir, somando opacidade/blur. "Selecionar
  // uma resposta corrige visualmente" era coincidência de tempo (a árvore
  // antiga já tinha desmontado sozinha até então), não uma consequência da
  // resposta em si. Corrigido na raiz — não com z-index maior (proibido
  // pelo próprio briefing): fechar o overlay do torneio ANTES de navegar
  // desacopla o desmonte do modal da espera pelo chunk/lazy-load da rota
  // de entrevista, exatamente o fluxo pedido ("resultado → fecha overlay
  // anterior → abre entrevista").
  function openPostMatchInterview() {
    if (!lastResult?.match?.id || !postMatchInterviewActionable) return;
    const interview = postMatchInterviewIdentity(lastResult.match.id);
    const continuesTournament = lastResult.won && !['champion', 'eliminated', 'finished'].includes(run?.status);
    const returnTo = continuesTournament ? buildTournamentReturnRoute(tournament.id) : APP_ROUTES.HOME;
    onClose?.();
    navigate(buildInterviewRoute({ interviewId: interview.id, sourceId: interview.sourceId, returnTo }));
  }

  async function abandonTournament() {
    const reason = profile?.injury_status === 'lesionado' ? `Abandono por ${profile.injury_type || 'lesão'}` : 'Abandono por desgaste físico';
    try {
      const withdrawn = withdrawTournamentRun(run, reason).run;
      const bracket = buildTournamentBracketHistory(withdrawn, teamName(profile, partner));
      const completion = await finalizeTournamentRun({
        profile, tournament, partner, roundsWon: countMainDrawWins(withdrawn), totalRounds: mainRounds.length,
        runId: `${tournament.id}:${withdrawn.createdAt}`, bracketHistory: bracket,
      });
      await persistRun(withdrawn, { status: 'completed', requires_decision: false, metadata: { withdrawal_reason: reason } });
      setProfile(completion.updatedProfile);
      setTournamentRewards(completion.rewards);
      onProfileUpdate?.(completion.updatedProfile);
      setPhase('withdrawn');
      onComplete?.();
    } catch (error) {
      toast({ title: 'Erro', description: 'Não foi possível registrar o abandono.', variant: 'destructive' });
    }
  }

  const playerOvr = overallRating(profile);
  const partnerOvr = partner ? overallRating(partner) : 0;
  const medical = currentMatch ? getCoachPhysicalRecommendation(profile, tournament, currentMatch.round) : null;
  const coachEffects = getCoachEffects(coach, profile);
  const coachMatchBonus = coach ? Math.min(3, ((coachEffects?.strategyBonus || 0) + (coachEffects?.partnershipBonus || 0)) * 0.35) : 0;
  const resultInterviewIdentity = lastResult?.match?.id ? postMatchInterviewIdentity(lastResult.match.id) : null;
  const postMatchInterviewActionable = isInterviewActionable(resultInterviewIdentity ? {
    ...resultInterviewIdentity,
    type: 'interview',
    questionCategory: lastResult?.won ? 'post_win' : 'post_loss',
    status: (profile.processed_press_interview_sources || []).includes(resultInterviewIdentity.sourceId) ? 'completed' : 'available',
  } : null, profile.career_date);
  const playerForMatch = {
    ...profile,
    _chemistryBonus: getChemistryBonus(profile.partner_chemistry || 50),
    _energyPenalty: getEnergyPenalty(profile.energy || 100),
    _coachMatchBonus: coachMatchBonus,
    _partnerBondBonus: calculatePartnershipPerformanceBonus({
      chemistry: profile.partner_chemistry, partner_trust: profile.partner_trust,
      partner_morale: profile.partner_morale, natural_chemistry: profile.partner_chemistry,
      shared_matches: profile.matches_played || 0,
    }) * 40,
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeOnBackdrop={phase !== 'match'}
      closeOnEscape={phase !== 'match'}
      title={tournament.name}
      description="Campanha de torneio"
      size="md"
      // Hotfix 14.1 (Parte 1/4): a auditoria achou a causa raiz real da
      // narração/Técnico espremidos no desktop — não faltava min-h-0/flex-1
      // dentro de LiveMatch.jsx (já corretos), o teto era este `min(48rem, …)`
      // artificial, que capava o modal em ~768px de altura mesmo em telas de
      // 900-1080px. Removido o teto em rem; desktop agora usa a MESMA fórmula
      // de viewport que o mobile já usava (só a margem de respiro muda, 2rem
      // vs 1rem, herdada do próprio max-h do ModalShell) — cresce com a tela
      // real (1366×768/1440×900/1920×1080) em vez de um valor fixo.
      className={phase === 'match' ? 'h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)]' : ''}
      contentClassName={phase === 'match' ? 'flex flex-col overflow-hidden' : ''}
    >
      <div className={`flex min-h-0 flex-col ${phase === 'match' ? 'h-full' : ''}`}>
        <div className="mb-3 flex shrink-0 items-center gap-2 text-xs font-black text-primary"><TierIcon className={`h-5 w-5 ${tierStyle.color}`} />{TIER_STYLES[tournament.tier] ? tournament.tier : 'Torneio oficial'}</div>

        {run && <RoundTimeline run={run} />}

        {phase === 'loading' && <div className="py-12 text-center text-sm text-muted-foreground">Restaurando campanha e calendário…</div>}
        {phase === 'error' && <StateMessage icon={XCircle} title="Não foi possível abrir o torneio" body="A inscrição e o calendário foram preservados. Feche e tente novamente." tone="red" />}

        {phase === 'not_drawn' && (
          // Hotfix 15.5.4 (complemento): estado antes de D-3 — inscrição e
          // participantes já existem, mas o sorteio oficial (adversários,
          // chave) ainda não. Nunca mostra adversário/bracket/vencedor
          // sintético; só dados já conhecidos do torneio em si.
          <div className="space-y-4">
            <StateMessage
              icon={CalendarDays}
              title="Chave ainda não sorteada"
              body={`Participantes e confrontos aparecerão quando o sorteio oficial for realizado${drawDate ? `, a partir de ${formatDay(drawDate)}` : ''}.`}
              tone="cyan"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Info label="Categoria" value={tournament.tier || tournament.category || 'Oficial'} />
              <Info label="Premiação" value={`${Number(tournament.prize_coins || 0).toLocaleString('pt-BR')} moedas`} />
              <Info label="Ranking" value={`${Number(tournament.rank_points || 0).toLocaleString('pt-BR')} pontos`} />
            </div>
            <button onClick={goBackToCareer} className="w-full rounded-xl bg-secondary py-3 text-sm font-bold">Voltar à carreira</button>
          </div>
        )}

        {phase === 'pre_tournament' && currentMatch && (
          <div className="space-y-4">
            <MeetingHeader title="Reunião pré-torneio" subtitle="Esta conversa ocorre uma única vez antes da estreia." />
            <TeamVoices coach={coach} partner={partner} analysis={analysis} staff={staff} profile={profile} />
            <OpponentAnalysis analysis={analysis} />
            <StrategyPicker value={selectedStrategy} onChange={setSelectedStrategy} />
            <button onClick={savePreTournamentMeeting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Salvar plano do torneio <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}

        {phase === 'round_preparation' && currentMatch && (
          <div className="space-y-4">
            <MeetingHeader title={`Preparação — ${currentMatch.round}`} subtitle={`${formatDay(currentMatch.date)} · reunião breve entre rodadas`} />
            {/* Hotfix "Starter Coach Flow": sem treinador principal contratado,
                a sugestão tática (buildTournamentCoachSuggestion, independente
                de coach) fica atribuída à comissão técnica, não a um
                "Treinador principal" fictício. */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-black">{coach?.name || 'Comissão técnica'}</p><p className="mt-1 text-xs text-muted-foreground">“{coachSuggestion.text}”</p></div>
            {run.lastMatchStats && <LastMatchStats stats={run.lastMatchStats} />}
            <OpponentAnalysis analysis={analysis} compact />
            <div className="rounded-xl bg-secondary/30 p-3 text-xs"><span className="text-muted-foreground">Plano atual: </span><strong>{TOURNAMENT_STRATEGY_OPTIONS.find((item) => item.id === run.strategy?.id)?.label || 'Jogo equilibrado'}</strong></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => saveRoundPreparation({ keepPlan: true })} className="rounded-xl bg-secondary py-3 text-xs font-bold">Manter plano</button><button onClick={() => setSelectedStrategy(coachSuggestion.optionId)} className="rounded-xl border border-primary/30 py-3 text-xs font-bold text-primary">Usar sugestão</button></div>
            <StrategyPicker value={selectedStrategy} onChange={setSelectedStrategy} compact />
            <button onClick={() => saveRoundPreparation({ keepPlan: false })} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Salvar ajuste tático</button>
          </div>
        )}

        {phase === 'match_resume_prompt' && currentMatch && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <History className="mx-auto mb-2 h-10 w-10 text-primary" />
              <p className="text-lg font-black">Partida em andamento</p>
              <p className="mt-2 text-sm text-muted-foreground">{currentMatch.round} foi interrompida antes de terminar. Você pode continuar de onde parou, sem perder o placar.</p>
            </div>
            <button disabled={resuming} onClick={resumeMatchCheckpoint} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg disabled:opacity-60">
              <Play className="h-4 w-4" /> {resuming ? 'Validando partida…' : 'Continuar partida'}
            </button>
            <button disabled={resuming} onClick={restartRoundFromZero} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary/50 px-4 text-xs font-bold text-muted-foreground disabled:opacity-60">
              <Trash2 className="h-3.5 w-3.5" /> Reiniciar esta rodada do zero
            </button>
          </div>
        )}

        {phase === 'match_restart_prompt' && currentMatch && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6">
              <History className="mx-auto mb-2 h-10 w-10 text-amber-300" />
              <p className="text-lg font-black">Recuperação necessária</p>
              <p className="mt-2 text-sm text-muted-foreground">{resumeError || 'Não foi possível recuperar o estado interrompido desta partida.'}</p>
            </div>
            {recoverySession?.status === 'resume_failed' && resumeCheckpoint && (
              <button disabled={resuming} onClick={resumeMatchCheckpoint} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 text-xs font-bold text-primary disabled:opacity-60">
                <Play className="h-3.5 w-3.5" /> Tentar novamente
              </button>
            )}
            <button disabled={resuming} onClick={restartRoundFromZero} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg disabled:opacity-60">
              <Trash2 className="h-4 w-4" /> {resuming ? 'Criando nova sessão…' : 'Reiniciar esta rodada'}
            </button>
          </div>
        )}

        {phase === 'waiting' && currentMatch && <StateMessage icon={CalendarDays} title={`${currentMatch.round} agendada`} body={`${formatDay(currentMatch.date)} contra ${analysis.name}. Avance o calendário pela carreira; energia e fadiga serão recuperadas pelos sistemas diários normais.`} tone="cyan" action={<button onClick={goBackToCareer} className="w-full rounded-xl bg-secondary py-3 text-sm font-bold">Voltar à carreira</button>} />}
        {phase === 'missed' && <StateMessage icon={CalendarDays} title="Data da rodada ultrapassada" body="Abra o calendário para resolver este compromisso sem recriar a partida." tone="red" />}

        {phase === 'playable' && currentMatch && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-secondary/20 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase text-muted-foreground">{currentMatch.round}</p><p className="text-xs font-black">{formatDay(currentMatch.date)}</p></div><span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">Hoje</span></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><TeamMember name={profile.sport_name || 'Você'} ovr={playerOvr} highlight /><TeamMember name={partner?.name || 'Parceiro'} ovr={partnerOvr} /></div><strong className="text-xs text-muted-foreground">VS</strong><div>{opponent.map((member) => <TeamMember key={member.id} name={member.name} ovr={overallRating(member)} rightAlign />)}</div></div></div>
            <OpponentAnalysis analysis={analysis} compact />
            {medical && <PhysicalPanel medical={medical} profile={profile} staff={staff} />}
            <div className="rounded-xl bg-secondary/30 p-3 text-xs"><span className="text-muted-foreground">Tática salva: </span><strong>{TOURNAMENT_STRATEGY_OPTIONS.find((item) => item.id === run.strategy?.id)?.label}</strong></div>
            <button onClick={startMatch} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white"><Play className="h-4 w-4" />Jogar {currentMatch.round}</button>
            {((profile.energy || 0) < 35 || isInjured(profile)) && <button onClick={abandonTournament} className="w-full rounded-xl border border-red-500/30 py-2 text-xs font-bold text-red-300">Abandonar torneio e priorizar recuperação</button>}
          </div>
        )}

        {phase === 'match' && opponent.length > 0 && (
          <LiveMatchRecoveryBoundary key={`${currentMatch.id}:${liveMatchSessionKey}`} onRecoveryError={(error) => handleResumeFailure(error, recoverySession)}>
            <div className="min-h-0 flex-1 overflow-hidden"><LiveMatch teamA={[playerForMatch, partner].filter(Boolean)} teamB={opponent} initialTacticId={run.strategy?.matchTacticId || 'equilibrado'} coach={coach} liveCoachSettings={liveCoachSettings} onFinished={handleMatchFinished} onDisplayModeChange={() => {}} initialState={resumedEngineState} onCheckpoint={saveMatchCheckpoint} matchType="tournament" matchId={currentMatch?.id || null} /></div>
          </LiveMatchRecoveryBoundary>
        )}

        {phase === 'round_result' && lastResult && (() => {
          // Hotfix UX — itens 17/18/20: `run` já foi atualizado para a
          // próxima rodada nesta transição (setRun(nextRun) acima), então
          // `currentMatch`/`getTournamentRunPhase` já refletem o que vem a
          // seguir. Se a próxima rodada é HOJE, oferece jogá-la direto (sem
          // fechar e reabrir o torneio); se é no futuro, o retorno natural é
          // fechar e deixar o Home/bloqueio de avanço guiar o jogador de
          // volta quando a data chegar (itens 8-11).
          const nextPhase = getTournamentRunPhase(run, profile.career_date);
          const playableToday = nextPhase === 'playable' || nextPhase === 'round_preparation';
          return (
          <div className="space-y-4 text-center">
            <StateMessage icon={CheckCircle} title="Vitória e fim do dia competitivo" body={`${lastResult.match.round}: ${lastResult.matchState.setsA}-${lastResult.matchState.setsB}. ${lastResult.nextMatch?.round} foi agendada para ${formatDay(lastResult.nextMatch?.date)}.`} tone="green" />
            <MatchRecapPremium matchState={lastResult.matchState} title={`Vitória · ${lastResult.match.round}`} />
            {physicalReport && <p className="text-xs text-muted-foreground">Energia: {formatPercent(profile.energy)}% · Fadiga: {normalizeFatigue(profile.fatigue)}%</p>}
            {postMatchInterviewActionable && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-left text-xs">
              <p className="font-black text-cyan-300"><Mic className="mr-1 inline h-3.5 w-3.5" />Entrevista pós-jogo disponível</p>
              <p className="mt-1 text-muted-foreground">Ela é opcional. Ao concluir, você retorna diretamente à campanha deste torneio.</p>
            </div>}
            {postMatchInterviewActionable && <button onClick={openPostMatchInterview} className="min-h-11 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Dar entrevista</button>}
            {playableToday ? (
              <button onClick={() => setPhase(nextPhase)} className="w-full rounded-xl bg-secondary py-3 text-sm font-bold">
                Jogar {currentMatch?.round || 'próxima rodada'} agora
              </button>
            ) : (
              // M4.3 (Parte I): "Continuar no torneio" era genérico e só
              // fechava o modal (sem navegar) — Parte I pede exatamente
              // "Próxima rodada · DATA" + [Voltar para carreira] ou [Ver
              // calendário], nunca um botão que tenta jogar uma rodada
              // futura (playableToday já garante isso acima).
              <ContextActionBar
                description={lastResult.nextMatch ? `Próxima rodada · ${formatDay(lastResult.nextMatch.date)}` : undefined}
                primary={{ label: 'Voltar para a carreira', icon: 'crown', onClick: goBackToCareer }}
                secondary={{ label: 'Ver calendário', icon: 'calendar', onClick: () => { onClose?.(); navigate('/game/calendar'); } }}
              />
            )}
          </div>
          );
        })()}

        {phase === 'champion' && lastResult && <FinalState champion tournament={tournament} result={lastResult} rewards={tournamentRewards} onClose={goBackToCareer} onInterview={openPostMatchInterview} interviewActionable={postMatchInterviewActionable} profile={profile} />}
        {phase === 'eliminated' && lastResult && <FinalState tournament={tournament} result={lastResult} rewards={tournamentRewards} onClose={goBackToCareer} onInterview={openPostMatchInterview} interviewActionable={postMatchInterviewActionable} profile={profile} />}
        {phase === 'withdrawn' && <StateMessage icon={Shield} title="Torneio encerrado por abandono" body="A comissão priorizou sua recuperação. A participação, premiação aplicável e calendário foram encerrados sem criar outra rodada." tone="orange" action={<button onClick={goBackToCareer} className="w-full rounded-xl bg-secondary py-3 text-sm font-bold">Voltar à carreira</button>} />}
      </div>
    </ModalShell>
  );
}

function RoundTimeline({ run }) {
  return <div className="mb-4 flex shrink-0 gap-1 overflow-x-auto pb-1">{run.matches.map((match, index) => <div key={match.id} className={`min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center ${match.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10' : index === run.currentRound ? 'border-primary/40 bg-primary/10' : 'border-border/40 bg-secondary/20'}`}><p className="text-[9px] font-black">{match.short}</p><p className="text-[8px] text-muted-foreground">{formatDay(match.date).split(' de ')[0]}</p></div>)}</div>;
}

function MeetingHeader({ title, subtitle }) { return <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Equipe reunida</p><h3 className="mt-1 text-xl font-black">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>; }

function TeamVoices({ coach, partner, analysis, staff, profile }) {
  const physical = staff.find((member) => member.staff_type === 'physical_trainer');
  const physio = staff.find((member) => member.staff_type === 'physio');
  // Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md, Parte A): sem
  // treinador principal contratado, não fabricar uma fala atribuída a um
  // "Treinador principal" que não existe — a voz do técnico só aparece
  // quando há um `coach` real.
  return <div className="space-y-2">{coach && <Voice icon={Brain} name={coach.name} text={analysis.style.toLowerCase().includes('agress') ? 'Eles vão tentar encurtar os pontos. Precisamos controlar a primeira bola.' : 'Vamos construir o jogo com disciplina e observar os padrões iniciais.'} />}<Voice icon={Users} name={partner?.name || 'Parceiro'} text={analysis.strengths.some((item) => item.key === 'smash') ? 'Podemos usar bastante lob e fazê-los trabalhar longe da rede.' : 'Quero começar com um plano claro e ajustar juntos.'} />{physical && <Voice icon={Dumbbell} name={physical.staff_name} text={`Energia em ${formatPercent(profile.energy)}%. A carga do torneio será acompanhada dia a dia.`} />}{physio && <Voice icon={HeartPulse} name={physio.staff_name} text={`Fadiga em ${normalizeFatigue(profile.fatigue)}%. Não haverá recuperação automática total entre rodadas.`} />}</div>;
}

function Voice({ icon: Icon, name, text }) { return <div className="flex gap-3 rounded-xl bg-secondary/25 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-xs font-black">{name}</p><p className="mt-1 text-xs text-muted-foreground">“{text}”</p></div></div>; }

function StrategyPicker({ value, onChange, compact = false }) { return <div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Plano tático</p><div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>{TOURNAMENT_STRATEGY_OPTIONS.map((option) => <button key={option.id} onClick={() => onChange(option.id)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${value === option.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-secondary/20 text-muted-foreground'}`}>{option.label}</button>)}</div></div>; }

function OpponentAnalysis({ analysis, compact = false }) { return <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Próximo adversário</p><p className="mt-1 text-sm font-black">{analysis.name}</p></div>{analysis.ranking && <span className="text-lg font-black text-cyan-300">#{analysis.ranking}</span>}</div><div className={`mt-3 grid gap-2 text-[10px] ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}><Info label="Estilo" value={analysis.style} /><Info label="Lado" value={analysis.dominantSide} /><Info label="Forças" value={analysis.strengths.map((item) => ATTRIBUTE_LABELS[item.key] || item.key).join(' / ') || 'Sem dados'} /><Info label="Fraqueza conhecida" value={analysis.weakness ? ATTRIBUTE_LABELS[analysis.weakness.key] || analysis.weakness.key : 'Não identificada'} /></div>{analysis.recentForm !== null && <p className="mt-2 text-[10px] text-muted-foreground">Forma recente conhecida: {analysis.recentForm}/100</p>}</div>; }

function Info({ label, value }) { return <div className="rounded-lg bg-background/35 p-2"><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-bold">{value}</p></div>; }

function LastMatchStats({ stats }) { return <div className="grid grid-cols-4 gap-2"><Metric label="Winners" value={stats.winners} /><Metric label="Erros" value={stats.errors} /><Metric label="Rede" value={`${stats.net}%`} /><Metric label="Lobs" value={stats.lobs} /></div>; }
function Metric({ label, value }) { return <div className="rounded-xl bg-secondary/30 p-2 text-center"><p className="text-[9px] text-muted-foreground">{label}</p><p className="truncate text-sm font-black tabular-nums">{value}</p></div>; }

function PhysicalPanel({ medical, profile, staff }) { const physical = staff.find((member) => member.staff_type === 'physical_trainer'); const physio = staff.find((member) => member.staff_type === 'physio'); return <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase text-muted-foreground">Comissão física</p><strong className="text-xs text-orange-300">{medical.level}</strong></div><div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Energia agora" value={`${formatPercent(profile.energy)}%`} /><Metric label="Após jogo" value={`${formatPercent(medical.projectedEnergy)}%`} /><Metric label="Fadiga após" value={`${formatPercent(medical.projectedFatigue)}%`} /></div><p className="mt-2 text-[10px] text-muted-foreground">{medical.advice}{physical ? ` ${physical.staff_name} acompanha a carga.` : ''}{physio ? ` ${physio.staff_name} atua na recuperação diária.` : ''}</p></div>; }

function TeamMember({ name, ovr, highlight = false, rightAlign = false }) { return <div className={`mb-2 flex items-center gap-2 ${rightAlign ? 'flex-row-reverse text-right' : ''}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${highlight ? 'bg-primary/20' : 'bg-secondary/60'}`}><Bot className="h-4 w-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{name}</p><p className="text-[9px] text-muted-foreground">OVR {ovr}</p></div></div>; }

function StateMessage({ icon: Icon, title, body, tone, action = null }) { const colors = { green:'border-emerald-500/35 bg-emerald-500/5 text-emerald-300', cyan:'border-cyan-500/35 bg-cyan-500/5 text-cyan-300', red:'border-red-500/35 bg-red-500/5 text-red-300', orange:'border-orange-500/35 bg-orange-500/5 text-orange-300' }; return <div className="space-y-4 text-center"><div className={`rounded-2xl border p-6 ${colors[tone] || colors.cyan}`}><Icon className="mx-auto mb-2 h-12 w-12" /><p className="text-xl font-black">{title}</p><p className="mt-2 text-sm text-muted-foreground">{body}</p></div>{action}</div>; }

function FinalState({ champion = false, tournament, result, rewards, onInterview, onClose, interviewActionable, profile }) { return <div className="space-y-4 text-center"><StateMessage icon={champion ? Crown : XCircle} title={champion ? 'CAMPEÃO!' : 'Eliminado do torneio'} body={champion ? `Título conquistado no ${tournament.name}. Cerimônia, ranking e imprensa foram processados.` : `${result.match.round}: ${result.matchState.setsA}-${result.matchState.setsB}. Não existe próxima rodada agendada.`} tone={champion ? 'green' : 'red'} />{rewards && <div className="grid grid-cols-3 gap-2"><Reward icon={Coins} label="Moedas" value={`+${rewards.coins}`} /><Reward icon={Zap} label="XP" value={`+${rewards.xp}`} /><Reward icon={Star} label="Ranking" value={`+${rewards.rankPoints}`} /></div>}<MatchRecapPremium matchState={result.matchState} title={`${champion ? 'Título' : 'Eliminação'} · ${result.match.round}`} /><p className="text-xs text-muted-foreground">Energia {formatPercent(profile.energy)}% · Fadiga {normalizeFatigue(profile.fatigue)}%</p>{interviewActionable && <><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-left text-xs"><p className="font-black text-cyan-300"><Mic className="mr-1 inline h-3.5 w-3.5" />Entrevista pós-jogo disponível</p><p className="mt-1 text-muted-foreground">A mesma entrevista criada para este resultado pode ser respondida agora.</p></div><button onClick={onInterview} className="min-h-11 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Dar entrevista</button></>}<button onClick={onClose} className="min-h-11 w-full rounded-xl bg-secondary py-3 text-sm font-bold">Voltar à carreira</button></div>; }
function Reward({ icon: Icon, label, value }) { return <div className="rounded-xl bg-secondary/30 p-3"><Icon className="mx-auto h-4 w-4 text-primary" /><p className="mt-1 text-sm font-black">{value}</p><p className="text-[9px] text-muted-foreground">{label}</p></div>; }
