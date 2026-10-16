import React, { useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/navigation/routes.js';
import { isPlayerParticipating } from '@/lib/tournamentRegistrationState.js';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, CalendarDays, CheckCircle2,
  ChevronRight, Crown, Dumbbell, GraduationCap,
  FastForward, HeartPulse, Mail, Mic, MessageCircle, Newspaper, Sparkles, Swords, Target,
  Trophy, TrendingUp, Users, Globe2, Wrench,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  ensureMyProfile, incrementMissionProgress, careerExperienceSummary, calculateAge,
  getWorldRank, isRetired,
} from '@/lib/padel';
import {
  CollapsibleSection,
  Page, PageContent,
  ProgressBar, EmptyState, PageSkeleton, Button, ConfirmDialog,
} from '@/components/design-system';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import PartnerSelection from '@/components/career/PartnerSelection';
import MedicalStatusPanel from '@/components/career/MedicalStatusPanel';
import MedicalCenterPanel from '@/components/career/MedicalCenterPanel';
import StrategicCareerPanel from '@/components/career/StrategicCareerPanel';
import ActiveMatchRecoveryBanner from '@/components/career/ActiveMatchRecoveryBanner';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import { advanceCareerUntilRecovered } from '@/game-core';
import { completeTutorialState, getCurrentTutorialStep } from '@/onboarding/tutorialState.js';
import { getCareerRecommendations } from '@/onboarding/careerRecommendations.js';
import { getOnboardingNextAction } from '@/onboarding/onboardingNextAction.js';
import { isRegistrationOpen } from '@/lib/calendarSystem.js';
import { evaluateTournamentRegistration, listTournamentRegistrations } from '@/lib/tournamentRegistration.js';
import { getActivePartnership } from '@/lib/partnershipSystem.js';
import { resolveFirstMatchAction } from '@/onboarding/firstMatchDestination.js';
import { useToast } from '@/components/ui/use-toast';
import { getTeamRank } from '@/lib/teamRanking.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { ensureContextualCareerCommunications, isCareerCommunicationVisible, normalizeCareerMessage } from '@/lib/careerCommunications.js';
import { selectUnreadCareerMessages } from '@/lib/notificationSelectors.js';
import { resolveNotificationDestination } from '@/lib/notificationDestinations.js';
import { deriveCareerMoment } from '@/lib/careerMoments.js';
import { buildDailyCareerBriefing } from '@/lib/dailyCareerBriefing.js';
import { buildCareerDecisionCenter } from '@/lib/careerDecisionCenter.js';
import { buildWeeklyCareerReview } from '@/lib/weeklyCareerReview.js';
import { buildSeasonCareerPlan } from '@/lib/seasonCareerPlan.js';
import { buildStrategicCareerState } from '@/lib/strategicCareerAI.js';
import { useCareer } from '@/careers/useCareer.js';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';
import { getPartnerBot } from '@/lib/career.js';
import { buildTournamentRecoverySession } from '@/game-core/tournamentMatchLifecycle.js';
import { getCurrentTournamentMatch, selectActiveTournamentRun } from '@/gameplay/worldTour/TournamentRunManager.js';
import { buildTournamentPlayRoute } from '@/lib/tournamentNextAction.js';
import { getCareerNextAction } from '@/lib/careerNextAction.js';
import { buildHomeAgenda, buildHomeCommitment, buildHomePriorities, buildHomeProgress, selectWorldHeadline } from '@/lib/homeDashboard.js';

/**
 * Centro da Carreira (Fase 4 — docs/HOME_REDESIGN.md).
 *
 * Consolida ~20 painéis empilhados (versão anterior) em 7 regiões com
 * hierarquia clara. Nenhum dado novo é buscado aqui: a mesma carga de rede
 * de antes (um único `Promise.all`) alimenta identidade, objetivo, evento,
 * prioridades, jornada, evolução e atenção — só a composição visual mudou.
 * Painéis de gestão ativa (Centro Médico, Leitura Estratégica) continuam
 * 100% funcionais, só ficam recolhidos por padrão (progressive disclosure)
 * em vez de sempre expandidos competindo com o essencial.
 */

const safe = (promise, fallback = []) => promise.catch((error) => {
  console.warn('[CareerControlCenter] módulo secundário indisponível', error);
  return fallback;
});

const CAREER_ACTION_ICONS = {
  crown: Crown,
  'heart-pulse': HeartPulse,
  trophy: Trophy,
  'alert-circle': AlertCircle,
  mail: Mail,
  swords: Swords,
  dumbbell: Dumbbell,
  target: Target,
  calendar: CalendarDays,
  'fast-forward': FastForward,
};

function careerActionToHeroStep(action) {
  if (!action) return null;
  return {
    icon: CAREER_ACTION_ICONS[action.icon] || Target,
    title: action.label,
    description: action.description,
    to: action.route || APP_ROUTES.CALENDAR,
    cta: action.actionType === 'advance-day' ? 'Abrir calendário' : action.label,
    actionId: action.id,
  };
}

export default function CareerHub() {
  const location = useLocation();
  const { activeCareer } = useCareer();
  const { checkpoint: activeMatchCheckpoint } = useActiveMatchCheckpoint(activeCareer?.career_id);
  const [profile, setProfile] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [recentTrainings, setRecentTrainings] = useState([]);
  const [worldRank, setWorldRank] = useState({ rank: 0, total: 0 });
  const [teamRank, setTeamRank] = useState({ rank: 0, total: 0 });
  // Necessários para a sugestão consultar evaluateTournamentRegistration com
  // os mesmos dados que a tela de inscrição usa.
  const [partnerBot, setPartnerBot] = useState(null);
  // 5.27-J: a parceria ativa entra na mesma autoridade de saída que a inscrição aplica.
  const [activePartnership, setActivePartnership] = useState(null);
  const [tournamentRegistrations, setTournamentRegistrations] = useState([]);
  const [tournamentEvents, setTournamentEvents] = useState([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [posts, setPosts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [partnerOffers, setPartnerOffers] = useState([]);
  const [worldSnapshot, setWorldSnapshot] = useState(null);
  const [activeTournamentEvent, setActiveTournamentEvent] = useState(null);
  const [latestMonthlyReport, setLatestMonthlyReport] = useState(null);
  const [latestAnnualReport, setLatestAnnualReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartner, setShowPartner] = useState(false);
  const [skippingInjury, setSkippingInjury] = useState(false);
  const [confirmSkipInjury, setConfirmSkipInjury] = useState(false);
  const [injurySkipError, setInjurySkipError] = useState('');
  const [injurySkipSummary, setInjurySkipSummary] = useState(null);
  const [finishingTutorial, setFinishingTutorial] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const { toast } = useToast();

  async function finishTutorial() {
    if (!profile?.id || finishingTutorial || profile.tutorial_onboarding?.status === 'completed') return;
    setFinishingTutorial(true);
    try {
      await incrementMissionProgress(profile.id, 'finish_tutorial', 1, profile.career_date);
      const completedAt = new Date().toISOString();
      const tutorial = completeTutorialState(profile.tutorial_onboarding, profile, completedAt);
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        tutorial_onboarding: tutorial,
        onboarding_completed: true,
        onboarding_stage: 'completed',
      });
      setProfile(updated);
      window.dispatchEvent(new CustomEvent('padel:onboarding-refresh'));
    } catch (error) {
      console.error('[tutorial] Falha ao concluir o tutorial.', error);
      toast({ title: 'Não foi possível concluir', description: 'Seu progresso foi preservado. Tente novamente.', variant: 'destructive' });
    } finally {
      setFinishingTutorial(false);
    }
  }

  function handleSkipInjury() {
    if (!profile) return;
    setConfirmSkipInjury(true);
  }

  async function runSkipInjury() {
    setSkippingInjury(true);
    setInjurySkipError('');
    setInjurySkipSummary(null);
    try {
      const result = await advanceCareerUntilRecovered(profile);
      setProfile(result.profile);
      setInjurySkipSummary({ ...result.summary, daysAdvanced: result.daysAdvanced, energy: result.profile.energy, fatigue: result.profile.fatigue, recovered: result.recovered });
      if (result.blockedBy) setInjurySkipError(`Avanço interrompido antes de “${result.blockedBy.title}” em ${result.blockedBy.start_date}. Resolva esse compromisso no Calendário.`);
      else if (!result.recovered) setInjurySkipError('O limite seguro de 60 dias foi atingido. Confirme novamente para continuar.');
    } catch (error) {
      setInjurySkipError(error?.message || 'O avanço foi interrompido com segurança.');
      const fresh = await ensureMyProfile(await localGame.auth.me());
      if (fresh) setProfile(fresh);
    } finally {
      setSkippingInjury(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        if (!mounted) return;
        setProfile(p);

        const [matches, missionsData, rank, trainings, prog, teamRankings, upcoming, latestPosts, inboxRows, offerRows, livingSnapshot, tournamentEvents, monthlyReports, annualReports] = await Promise.all([
          safe(localGame.entities.Match.list('-created_date', 6)),
          safe(localGame.entities.Mission.filter({ is_active: true })),
          safe(getWorldRank(p), { rank: 0, total: 0 }),
          p ? safe(localGame.entities.TrainingSession.filter({ profile_id: p.id }, '-created_date', 8)) : [],
          p ? safe(localGame.entities.MissionProgress.filter({ profile_id: p.id })) : [],
          p?.partner_id ? safe(localGame.entities.AthleteProfile.filter({ id: p.partner_id }), []) : [],
          // O status do Tournament não é autoridade suficiente depois do D-3:
          // a mesma vitrine precisa poder mostrar chave, campanha e resultado.
          safe(localGame.entities.Tournament.list('-start_date', 2000)),
          safe(localGame.entities.Post.list('-created_date', 5)),
          p ? safe(localGame.entities.CareerMessage.filter({ profile_id: p.id }, '-created_date', 8)) : [],
          p ? safe(localGame.entities.PartnerOffer.filter({ profile_id: p.id }, '-created_date', 8)) : [],
          p ? safe(getLivingWorldSnapshot(p, 8), null) : null,
          p ? safe(localGame.entities.CalendarEvent.filter({ profile_id: p.id, event_type: 'tournament' }), []) : [],
          p ? safe(localGame.entities['MonthlyCareerReport'].filter({ profileId: p.id, status: 'finalized' }, '-periodKey', 1), []) : [],
          p ? safe(localGame.entities['AnnualCareerReport'].filter({ profileId: p.id, status: 'finalized' }, '-year', 1), []) : [],
        ]);
        if (!mounted) return;

        setRecentMatches(matches || []);
        setMissions(missionsData || []);
        setWorldRank(rank || { rank: 0, total: 0 });
        setRecentTrainings((trainings || []).slice(0, 6));
        setPosts(latestPosts || []);
        const normalizedMessages = (inboxRows || [])
          .map(normalizeCareerMessage)
          .filter((message) => isCareerCommunicationVisible(message, { matches, profile: p }));
        setMessages(normalizedMessages);
        setPartnerOffers(offerRows || []);
        setWorldSnapshot(livingSnapshot || null);
        setTournamentEvents(tournamentEvents || []);
        // Playthrough 5.9, BUG 1 — antes: `.find(e => e.metadata?.tournament_run)`
        // sobre TODOS os eventos de torneio da carreira (a consulta acima não
        // filtra status), o que elegia para sempre o torneio MAIS ANTIGO com
        // run — Roma Pré-Temporada seguia "ativa" depois de Londres e Dubai.
        // Autoridade única agora: `selectActiveTournamentRun`.
        setActiveTournamentEvent(selectActiveTournamentRun(tournamentEvents || [], p?.career_date)?.event || null);
        setLatestMonthlyReport((monthlyReports || [])[0] || null);
        setLatestAnnualReport((annualReports || [])[0] || null);

        const recentWins = (matches || []).filter((match) => {
          const completed = ['completed', 'finished', 'concluida', 'concluido'].includes(String(match.status || '').toLowerCase()) || Boolean(match.winner_id || match.winner_team_id);
          if (!completed) return false;
          return match.winner_id === p.id || match.winner_player_id === p.id || match.player_won === true || match.is_winner === true;
        }).length;
        const contextual = await ensureContextualCareerCommunications(p, {
          nextTournament: (upcoming || []).filter((item) => item.start_date >= (p.career_date || '2026-01-01')).sort((a, b) => a.start_date.localeCompare(b.start_date))[0],
          matches,
          recentWins,
          partnerName: p.partner_name,
          calendarEvents: tournamentEvents,
          activeMatchCheckpoint,
        });
        if (mounted && contextual.length) setMessages([...contextual, ...normalizedMessages]);

        const progressMap = {};
        (prog || []).forEach((row) => { progressMap[row.mission_id] = row; });
        setProgress(progressMap);

        if (p?.partner_id) {
          const partner = Array.isArray(teamRankings) ? teamRankings[0] : null;
          if (mounted) setPartnerBot(partner);
          const resolvedTeamRank = partner ? await safe(getTeamRank(p, partner), { rank: 0, total: 0, unranked: true }) : { rank: 0, total: 0, unranked: true };
          if (mounted) setTeamRank(resolvedTeamRank);
        }
        if (p?.id && mounted) {
          setTournamentRegistrations(await safe(listTournamentRegistrations(p.id), []));
          setActivePartnership(await safe(getActivePartnership(p.id), null));
        }

        const careerDate = p?.career_date || '2026-01-01';
        setUpcomingTournaments((upcoming || [])
          .filter((tournament) => tournament.start_date && (tournament.start_date >= careerDate || (tournament.end_date || tournament.start_date) >= careerDate))
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
          .slice(0, 2000));
      } catch (error) {
        console.error('CareerHub', error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleTournamentRegistered(updatedProfile) {
    const nextProfile = updatedProfile || profile;
    if (!nextProfile?.id) return;
    if (updatedProfile) setProfile(updatedProfile);
    const [registrations, events] = await Promise.all([
      listTournamentRegistrations(nextProfile.id),
      localGame.entities.CalendarEvent.filter({ profile_id: nextProfile.id, event_type: 'tournament' }).catch(() => []),
    ]);
    setTournamentRegistrations(registrations || []);
    setTournamentEvents(events || []);
  }

  // Hotfix crítico (docs/TOURNAMENT_ROUND_STATE_HOTFIX.md, item 19): o
  // avanço de dia pelo cabeçalho global (CareerDayControl, sempre montado em
  // AppLayout) não recarregava o `profile` local da Home — o banner "Em
  // torneio" continuava com o career_date antigo e nunca virava "Dia de
  // torneio" no dia certo, mesmo com o avanço já persistido no storage.
  // Mesmo padrão já usado por AppLayout.jsx (useCareerHeaderData): usa o
  // perfil já incluído no evento (sem round-trip extra); não recarrega a
  // carga pesada de `load()` — só a identidade/data do jogador.
  useEffect(() => {
    const refreshProfileOnly = (event) => {
      if (event?.detail?.profile) setProfile(event.detail.profile);
    };
    window.addEventListener('padel:profile-updated', refreshProfileOnly);
    window.addEventListener('padel:career-advanced', refreshProfileOnly);
    return () => {
      window.removeEventListener('padel:profile-updated', refreshProfileOnly);
      window.removeEventListener('padel:career-advanced', refreshProfileOnly);
    };
  }, []);

  // "Precisa de atenção" no hub combina não lidas (fonte única: isCareerMessageUnread
  // via selectUnreadCareerMessages) com decisões pendentes ainda não resolvidas,
  // mesmo que já vistas — mantém o comportamento do painel de inbox da Home.
  const unreadMessages = useMemo(() => {
    const unreadIds = new Set(selectUnreadCareerMessages(messages).map((message) => message.id));
    return messages.filter((message) => unreadIds.has(message.id) || message.status === 'decisao_pendente');
  }, [messages]);
  const pendingOffers = useMemo(() => partnerOffers.filter((offer) => offer.status === 'pending'), [partnerOffers]);
  const unreadCount = unreadMessages.length + pendingOffers.length;

  const nextTournament = upcomingTournaments[0];
  // A sugestão de "inscreva-se" precisa passar pela MESMA regra que a
  // inscrição vai aplicar — antes ela era só o próximo torneio por data, e
  // sugeria eventos que `evaluateTournamentRegistration` recusa (o relato:
  // sugerir um torneio em 5 dias que o piso de descanso de 7 bloqueia). Um
  // torneio já inscrito também sai daqui: ele não precisa de inscrição, e o
  // caminho de jogá-lo é outro (partida ativa / calendário).
  const suggestableTournament = useMemo(() => {
    if (!profile) return null;
    return upcomingTournaments.find((tournament) => evaluateTournamentRegistration({
      player: profile,
      partner: partnerBot,
      tournament,
      currentDate: profile.career_date,
      registrations: tournamentRegistrations,
      tournaments: upcomingTournaments,
      teamRank: teamRank?.rank || 0,
      partnership: activePartnership,
    }).allowed) || null;
  }, [profile, partnerBot, tournamentRegistrations, upcomingTournaments, teamRank, activePartnership]);
  const activeTournamentRecovery = useMemo(() => {
    if (activeMatchCheckpoint?.type !== 'tournament' || !profile) return null;
    // Playthrough 5.9, BUG 1 — a recuperação de partida interrompida tem
    // pergunta PRÓPRIA ("qual torneio o checkpoint estava jogando?") e não
    // pode depender de `activeTournamentEvent`, que agora responde só
    // "qual torneio é acionável hoje". Resolve pelo id do próprio
    // checkpoint, com o evento acionável como respaldo.
    const checkpointTournamentId = activeMatchCheckpoint.tournamentId || activeMatchCheckpoint.context?.tournamentId || null;
    const recoveryEvent = (checkpointTournamentId
      ? (tournamentEvents || []).find((event) => event.related_id === checkpointTournamentId && event.metadata?.tournament_run)
      : null) || activeTournamentEvent;
    if (!recoveryEvent) return null;
    const run = recoveryEvent.metadata?.tournament_run;
    const match = getCurrentTournamentMatch(run);
    return buildTournamentRecoverySession(activeMatchCheckpoint, {
      careerId: activeCareer?.career_id,
      careerDate: profile.career_date,
      tournament: { id: recoveryEvent.related_id, name: run?.tournamentName || recoveryEvent.related_name },
      run,
      match,
      teamA: [profile, getPartnerBot(profile)].filter(Boolean),
      teamB: match?.opponent || [],
    });
  }, [activeCareer?.career_id, activeMatchCheckpoint, activeTournamentEvent, tournamentEvents, profile]);

  // Todas as chamadas abaixo já existiam antes da Fase 4 (mesmas funções,
  // mesmos parâmetros) — só passaram a alimentar a nova composição visual
  // em vez de renderizar um componente de painel cada uma.
  const careerMoment = useMemo(
    () => deriveCareerMoment(profile, { matches: recentMatches, nextTournament, worldRank, teamRank }),
    [profile, recentMatches, nextTournament, worldRank, teamRank],
  );
  const dailyBriefing = useMemo(
    () => buildDailyCareerBriefing(profile, { recentMatches, nextTournament, unreadCount }),
    [profile, recentMatches, nextTournament, unreadCount],
  );
  const decisionCenter = useMemo(
    () => buildCareerDecisionCenter(profile, { messages, partnerOffers, nextTournament }),
    [profile, messages, partnerOffers, nextTournament],
  );
  const weeklyReview = useMemo(
    () => buildWeeklyCareerReview(profile, {
      matches: recentMatches, trainings: recentTrainings, messages,
      tournaments: upcomingTournaments, registrations: tournamentRegistrations, calendarEvents: tournamentEvents,
      teamRank: teamRank?.rank || 0, partner: partnerBot, partnership: activePartnership,
    }),
    [profile, recentMatches, recentTrainings, messages, upcomingTournaments, tournamentRegistrations, tournamentEvents, teamRank, partnerBot, activePartnership],
  );
  // Playthrough 5.9, BUG 2 / Parte 3 — o planejamento existia e era gerado
  // corretamente, mas ficava na 6ª posição da página (abaixo do bloco "O que
  // fazer agora", do calendário, do banner de tutorial e do painel médico):
  // no playtest o jogador não percebeu nenhuma "reunião da comissão" e acabou
  // dependendo só dos avisos D-7/D-5/D-4. Além disso a seção renderiza SEMPRE
  // (com EmptyState quando não há nada), o que dilui o caso em que existe
  // decisão real. Sem popup e sem notificação nova: quando há uma decisão
  // ACIONÁVEL de verdade (recomendação da comissão + inscrição ainda
  // possível), a mesma seção sobe para junto do objetivo principal.
  // Fase 5.30: a promoção condicional deixou de existir porque a decisão e o
  // compromisso têm lugar FIXO no topo — o bloco "O que vem agora"
  // (buildHomeCommitment: compromisso → próxima inscrição possível → agenda
  // livre), logo abaixo do status; a agenda imediata traz o restante.

  // Playthrough 5.13 (continuação), Partes C/J/K/L — depois de se inscrever,
  // `canRegisterNow` vira false e a seção perdia a promoção, caindo para
  // depois da jornada/tutorial/painel médico. Era esse o "planner sumiu"
  // relatado DEPOIS da inscrição: a decisão acabou, mas o COMPROMISSO
  // continua sendo a informação mais relevante da semana (data do sorteio,
  // estreia, próximo passo).
  //
  // O compromisso usa o mesmo detector canônico que o resto do planner já
  // aplica (`isPlayerParticipating`), sem estado novo.
  const weeklyCommitment = useMemo(() => {
    const items = weeklyReview?.upcomingTournaments || [];
    return items.find((item) => isPlayerParticipating(item.registrationState)) || null;
  }, [weeklyReview]);
  const seasonPlan = useMemo(
    () => buildSeasonCareerPlan(profile, { worldRank, matches: recentMatches, trainings: recentTrainings }),
    [profile, worldRank, recentMatches, recentTrainings],
  );
  const strategicState = useMemo(
    () => buildStrategicCareerState(profile, { matches: recentMatches, nextTournament, worldRank }),
    [profile, recentMatches, nextTournament, worldRank],
  );

  const injured = profile?.injury_status === 'injured' || profile?.is_injured || Number(profile?.injury_days_remaining) > 0;
  // Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 2): enquanto o
  // onboarding principal está em andamento, a etapa atual do tutorial é a
  // ÚNICA fonte do CTA principal — `getCareerNextAction` (o motor canônico
  // compartilhado) só volta a decidir depois
  // que o onboarding termina (ou nunca começou/foi pulado).
  // Correção UI/cronologia: "Competições" só deve virar CTA da Home quando
  // existir um torneio de verdade com inscrição aberta hoje — reaproveita
  // upcomingTournaments (já carregado acima) + isRegistrationOpen (mesma
  // função canônica usada pela tela de Torneios), nenhum cálculo novo.
  const hasOpenTournamentRegistration = useMemo(
    () => upcomingTournaments.some((tournament) => isRegistrationOpen(tournament, profile?.career_date)),
    [upcomingTournaments, profile?.career_date],
  );
  const onboardingNextAction = useMemo(
    () => getOnboardingNextAction(profile, { hasOpenTournamentRegistration }),
    [profile, hasOpenTournamentRegistration],
  );
  const fallbackHeroStep = useMemo(() => {
    // Playthrough 5.9, BUG 1 — autoridade única: `selectActiveTournamentRun`
    // (TournamentRunManager.js). Antes, o CTA vinha de
    // `getCurrentTournamentMatch(run)` CRU + `match.date <= career_date`,
    // o que mantinha "Jogar Semifinal — Roma Pré-Temporada" para sempre
    // depois de o jogador ser eliminado (numa derrota o `currentRound` não
    // avança, e a comparação de data é aberta). Ver o teste da fase.
    const activeRun = selectActiveTournamentRun(
      activeTournamentEvent ? [activeTournamentEvent] : [],
      profile?.career_date,
    );
    const run = activeRun?.run || null;
    const activeMatch = activeRun?.match || null;
    const mandatoryDecision = (decisionCenter.decisions || []).find((decision) => ['critical', 'high'].includes(decision.priority));
    const interviewMessage = messages.find((message) => message.related_entity_type === 'PressInterview' && !message.is_read);
    const interviewDestination = interviewMessage ? resolveNotificationDestination(interviewMessage) : null;
    const action = getCareerNextAction(profile, {
      tournamentMatchToday: activeMatch
        ? { route: buildTournamentPlayRoute(activeRun.event.related_id), label: activeMatch.preparationCompleted ? `Jogar ${activeMatch.round}` : `Preparar ${activeMatch.round}`, description: run?.tournamentName || activeRun.event.related_name }
        : null,
      mandatoryDecision: mandatoryDecision
        ? { route: mandatoryDecision.route, label: mandatoryDecision.title, description: mandatoryDecision.description }
        : null,
      tournamentRegistrationNeeded: !activeMatch && suggestableTournament
        ? { route: APP_ROUTES.TOURNAMENTS, name: suggestableTournament.name, daysUntil: daysUntil(profile?.career_date, suggestableTournament.start_date) }
        : null,
      urgentMessage: interviewMessage
        ? { route: interviewDestination?.route || APP_ROUTES.PRESS, label: 'Dar entrevista', description: interviewMessage.title }
        : null,
      hasPendingPartnerProposal: pendingOffers.length > 0,
    });
    return careerActionToHeroStep(action);
  }, [activeTournamentEvent, decisionCenter.decisions, messages, nextTournament, pendingOffers.length, profile]);
  // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 3): a
  // etapa "first-match" é a única cujo destino real depende de estado de
  // torneio (inscrito? hoje? interrompida?) — não dá para resolver isso de
  // forma síncrona a partir só do `profile`, então só essa etapa recebe uma
  // resolução assíncrona por cima do valor estático padrão de
  // getOnboardingNextAction(). Inicializa com o MESMO fallback que
  // resolveFirstMatchAction usaria para "ainda não inscrito" — nunca aponta
  // para /matches (partida de treino), nem enquanto resolve.
  const [firstMatchAction, setFirstMatchAction] = useState(null);
  useEffect(() => {
    if (onboardingNextAction?.stepId !== 'first-match' || !profile?.id) { setFirstMatchAction(null); return undefined; }
    let cancelled = false;
    resolveFirstMatchAction(profile, activeCareer?.career_id).then((result) => { if (!cancelled) setFirstMatchAction(result); });
    return () => { cancelled = true; };
  }, [onboardingNextAction?.stepId, profile, activeCareer?.career_id]);
  const heroStep = useMemo(() => {
    if (onboardingNextAction?.stepId === 'first-match') {
      const resolved = firstMatchAction || { to: '/tournaments', cta: 'Inscrever-se em um torneio', description: onboardingNextAction.description };
      return { ...onboardingNextAction, to: resolved.to, destination: resolved.to, cta: resolved.cta, actionLabel: resolved.cta, description: resolved.description };
    }
    return onboardingNextAction || fallbackHeroStep;
  }, [onboardingNextAction, firstMatchAction, fallbackHeroStep]);
  // Hotfix "Single Source of Truth" (docs/ONBOARDING_SINGLE_SOURCE_OF_TRUTH.md):
  // uma etapa VISIT como career-created aponta para /game — a própria Home.
  // Enquanto o auto-complete por visita (OnboardingGuide.jsx) ainda não
  // resolveu, um <Link to="/game"> renderizado dentro de /game é um no-op
  // (o React Router não navega para a rota atual) — o botão parecia "não
  // abrir". PriorityActionsPanel usa esta flag para mostrar um estado
  // neutro em vez de um link morto.
  const heroIsCurrentPage = Boolean(heroStep && basePath(heroStep.to) === location.pathname);
  // Hotfix "Single Source of Truth": enquanto o onboarding principal está
  // ativo, getOnboardingNextAction() já é a ÚNICA autoridade sobre "o que
  // fazer agora" (item central do hotfix) — decisionCenter/dailyBriefing
  // continuam existindo (e alimentam o resto da Home normalmente depois do
  // onboarding), mas nenhum item deles pode aparecer como recomendação
  // concorrente enquanto uma etapa do tutorial já está dizendo o que fazer.
  // Tentar "rankear" cada decisão contra a posição da etapa atual seria
  // frágil e desnecessariamente complexo — suprimir por completo é a regra
  // mais simples que já satisfaz "zero CTAs concorrentes" (Parte 2/6/9).
  // PriorityActionsPanel já mostra "Nenhuma outra pendência agora" quando a
  // lista vem vazia — nenhuma mudança de UI necessária para isto.
  //
  // Polish 2 (objetivo 1.5): quando lesionado, o item "injury" do briefing
  // diário repetiria o mesmo dado de dias restantes que o header e
  // MedicalStatusPanel já mostram nesta mesma viewport — só esse item some
  // da lista; decisões e demais prioridades continuam normalmente.
  const priorityActions = useMemo(
    () => (onboardingNextAction ? [] : buildPriorityActions({ dailyBriefing, decisionCenter, messages, heroRoute: heroStep?.to, injured })),
    [onboardingNextAction, dailyBriefing, decisionCenter, messages, heroStep?.to, injured],
  );
  const attentionItems = useMemo(
    () => (onboardingNextAction ? [] : (decisionCenter.decisions || []).filter((decision) => (
      !priorityActions.some((action) => basePath(action.route) === basePath(decision.route))
      && basePath(decision.route) !== basePath(heroStep?.to)
    )).slice(0, 4)),
    [onboardingNextAction, decisionCenter, priorityActions, heroStep?.to],
  );
  const journeyGroups = useMemo(
    () => buildJourneyTimeline({ recentMatches, recentTrainings, messages, posts, partnerOffers }),
    [recentMatches, recentTrainings, messages, posts, partnerOffers],
  );
  const rankingGoal = seasonPlan?.goals?.[0] || null;

  const finalTutorialStep = profile?.tutorial_onboarding?.status === 'in_progress' && getCurrentTutorialStep(profile.tutorial_onboarding)?.id === 'autonomy';
  const recommendations = useMemo(
    () => getCareerRecommendations(profile, { trainings: recentTrainings, registrations: upcomingTournaments, matches: recentMatches }).slice(0, 4),
    [profile, recentTrainings, upcomingTournaments, recentMatches],
  );

  // Fase 5.30 — a nova Home é só COMPOSIÇÃO sobre os mesmos cálculos acima
  // (heroStep, priorityActions, attentionItems, weeklyReview, seasonPlan):
  // funções puras em src/lib/homeDashboard.js decidem o que cada bloco mostra.
  const homeCommitment = useMemo(
    () => buildHomeCommitment({ weeklyCommitment, suggestableTournament, nextTournament, careerDate: profile?.career_date, heroStep }),
    [weeklyCommitment, suggestableTournament, nextTournament, profile?.career_date, heroStep],
  );
  const homePriorities = useMemo(
    () => buildHomePriorities({ priorityActions, attentionItems, pendingOffersCount: pendingOffers.length, hasPartner: Boolean(profile?.partner_id), heroRoute: heroStep?.to }),
    [priorityActions, attentionItems, pendingOffers.length, profile?.partner_id, heroStep?.to],
  );
  const homeAgenda = useMemo(
    () => buildHomeAgenda({ weeklyReview, careerDate: profile?.career_date, excludeId: homeCommitment.tournamentId }),
    [weeklyReview, profile?.career_date, homeCommitment.tournamentId],
  );
  const homeProgress = useMemo(
    () => buildHomeProgress({ weeklyReview, seasonPlan, worldRank }),
    [weeklyReview, seasonPlan, worldRank],
  );

  if (loading) return <PageSkeleton variant="dashboard" rows={4} />;
  if (!profile) {
    return <Page size="default"><EmptyState icon={AlertCircle} title="Não foi possível carregar sua carreira" description="Volte ao gerenciador de carreiras ou tente novamente." /></Page>;
  }

  const careerExperience = careerExperienceSummary(profile.xp || 0);
  const injurySkipDays = Math.max(Number(profile?.injury_days_remaining) || 0, profile?.injured_until ? daysUntil(profile.career_date, profile.injured_until) : 0);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
        <ActiveMatchRecoveryBanner profile={profile} tournamentEvent={activeTournamentEvent} recoverySession={activeTournamentRecovery} />
        {latestAnnualReport && profile.career_date?.endsWith('-01-01') && latestAnnualReport.generatedDate === profile.career_date && <AnnualReportHomeCard report={latestAnnualReport} />}
        {latestMonthlyReport && profile.career_date?.endsWith('-01') && latestMonthlyReport.generatedDate === profile.career_date && <MonthlyReportHomeCard report={latestMonthlyReport} />}
        {/* Polish 2 (docs/REDESIGN_POLISH_2.md, objetivo 1.5): 'tournament' e
            'injury' repetiam exatamente a mesma informação que já aparece,
            mais completa/acionável, no header/ação dominante e em
            MedicalStatusPanel (quando lesionado). Os outros
            tipos (título/ranking/sequência/dupla) não têm equivalente em
            nenhum outro painel desta viewport — continuam aparecendo. */}
        {careerMoment && !['tournament', 'injury'].includes(careerMoment.type) && <CareerMomentStrip moment={careerMoment} />}

        {/* Fase 5.30 — HOME EM CAMADAS: STATUS → O QUE VEM AGORA → PRIORIDADES
            → AGENDA + PROGRESSO → ATALHOS. Antes eram ~10 blocos do mesmo
            peso (identidade+HUD, compromisso da semana com 4 cartões e seus
            botões, "O que fazer agora", calendário, objetivo, jornada,
            evolução, atenção, mundo, atalhos, ferramentas, status da dupla
            no rodapé), e o primeiro CTA primário ficava abaixo da primeira
            dobra em 360px. Ranking/OVR não se repetem aqui: o header global
            já os mostra; o bloco de status traz o que o header não tem
            (idade, nível, rumo do ranking, dupla). */}

        {/* 1. Status da carreira */}
        <HomeStatusCard
          profile={profile}
          careerExperience={careerExperience}
          rankingGoal={homeProgress.rankingGoal}
          rankingRoute={rankingGoal?.route}
          partnerRow={<CareerStatusBar compact profile={profile} onPartnerClick={() => profile.court_side && setShowPartner(true)} />}
        />

        {/* 2. O que vem agora — o único CTA primário da Home */}
        <HomeNextCommitment commitment={homeCommitment} step={heroStep} isCurrentPage={heroIsCurrentPage} onChoosePartner={() => setShowPartner(true)} />

        {/* 3. Prioridades (máx. 3 visíveis) */}
        <HomePriorities priorities={homePriorities} onChoosePartner={() => setShowPartner(true)} />

        {finalTutorialStep && <TutorialFinishBanner recommendations={recommendations} finishing={finishingTutorial} onFinish={finishTutorial} />}
        {injured && <MedicalStatusPanel profile={profile} onSkipRecovery={handleSkipInjury} skipping={skippingInjury} skipError={injurySkipError} skipSummary={injurySkipSummary} />}

        {/* 4. Agenda imediata + progresso */}
        <div className="grid gap-3 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <HomeAgenda
              items={homeAgenda}
              onRegister={(tournamentId) => setRegistrationTournament(upcomingTournaments.find((tournament) => tournament.id === tournamentId) || null)}
            />
          </div>
          <div className="xl:col-span-5"><HomeProgress progress={homeProgress} recent={journeyGroups} worldHeadline={selectWorldHeadline(worldSnapshot, posts)} /></div>
        </div>

        {/* 5. Atalhos (4) */}
        <HomeQuickActions missionsCount={missions.length} />

        {/* 6. Ferramentas de gestão (recolhido por padrão — progressive disclosure) */}
        <CareerToolsSection
          open={toolsOpen}
          onToggle={() => setToolsOpen((value) => !value)}
          profile={profile}
          strategicState={strategicState}
          onProfileUpdate={setProfile}
        />

        {isRetired(profile) && <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">Você encerrou sua carreira como atleta. Continue acompanhando seu legado, conquistas e história.</div>}

        {showPartner && <PartnerSelection profile={profile} onClose={() => setShowPartner(false)} onPartnerSelected={setProfile} />}

        {registrationTournament && (
          <TournamentRegistrationModal
            tournament={registrationTournament}
            profile={profile}
            teamRank={teamRank?.rank || 0}
            onClose={() => setRegistrationTournament(null)}
            onRegistered={handleTournamentRegistered}
          />
        )}

        <ConfirmDialog
          open={confirmSkipInjury}
          onClose={() => setConfirmSkipInjury(false)}
          onConfirm={() => { setConfirmSkipInjury(false); runSkipInjury(); }}
          tone="default"
          title="Avançar até a recuperação"
          description={`Avançar ${injurySkipDays} dia${injurySkipDays === 1 ? '' : 's'} até a recuperação?`}
          confirmLabel="Avançar"
        >
          Torneios, rankings, despesas, agenda, notícias, contratos e missões continuarão sendo processados. Treinos serão cancelados e torneios serão marcados como perdidos automaticamente durante a lesão. Apenas outras decisões obrigatórias interrompem o avanço.
        </ConfirmDialog>
      </PageContent>
    </Page>
  );
}

// ────────────────────────────────────────────────────────────────
// Funções puras — deterministas, sem chamadas de rede, operam só sobre
// dados já carregados no efeito acima. Nada aqui recalcula histórico caro.
// ────────────────────────────────────────────────────────────────

function daysUntil(from, to) { if (!from || !to) return 0; return Math.max(0, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000)); }
// Onboarding Flow 3.1: rotas de decisão/prioridade podem carregar query
// string (ex.: a etapa de tutorial "escolher parceiro" usa
// /partners?view=offers&source=tutorial) enquanto o Centro de Decisões usa
// a rota base (/partners). Comparar string exata deixava o card duplicado
// escapar do dedup — comparar só o pathname resolve os dois casos.
function basePath(route) { return String(route || '').split('?')[0]; }

// Motor de "próximo passo" para quando o onboarding principal NÃO está
// ativo (pós-tutorial, tutorial pulado, ou nunca iniciado) — enquanto ativo,
// getOnboardingNextAction() (onboarding/onboardingNextAction.js) tem
// prioridade, ver `heroStep` acima. Onboarding Flow 3.1: o componente
// NextStepCard.jsx de onde esta função foi originalmente copiada nunca era
// mais importado em lugar nenhum e foi removido — mantinha esta mesma
// lógica desatualizada (sem saber do tutorial) como um segundo caminho
// morto que poderia voltar a ser usado por engano.
// Regra de prioridade simples e determinística (seção 8): entrevista > decisões
// críticas/altas já computadas pelo Centro de Decisões > prioridades do
// briefing diário. Sem pontuação nova nem IA — só ordena o que já existe.
function buildPriorityActions({ dailyBriefing, decisionCenter, messages, heroRoute, injured = false }) {
  const items = [];

  const interview = (messages || []).find((message) => message.related_entity_type === 'PressInterview' && !message.is_read);
  if (interview) {
    const destination = resolveNotificationDestination(interview);
    items.push({ id: 'interview', tone: 'premium', icon: Mic, title: 'Entrevista disponível', description: 'A imprensa está esperando você após o último resultado.', route: destination?.route || '/press' });
  }

  for (const decision of decisionCenter?.decisions || []) {
    if (items.length >= 5) break;
    if (!['critical', 'high'].includes(decision.priority)) continue;
    if (basePath(decision.route) === basePath(heroRoute) || items.some((item) => basePath(item.route) === basePath(decision.route))) continue;
    items.push({ id: decision.id, tone: decision.priority === 'critical' ? 'danger' : 'warning', title: decision.title, description: decision.description, route: decision.route });
  }

  for (const priority of dailyBriefing?.priorities || []) {
    if (items.length >= 5) break;
    if (priority.id === 'injury' && injured) continue;
    // Polish 2.1 (docs/REDESIGN_POLISH_2_1.md, objetivo 3): o item "tournament"
    // do briefing diário é puramente informativo ("Nome em X dias") — a mesma
    // informação que o header global já mostra com a fonte canônica. O dedup
    // por rota abaixo não alcança o header, então aqui a regra é explícita:
    // evento sem ação própria não duplica o contexto. Uma pendência real (decisão
    // crítica/alta sobre o torneio) continua chegando por decisionCenter, com
    // outro id, e não é afetada por este corte.
    if (priority.id === 'tournament') continue;
    if (basePath(priority.route) === basePath(heroRoute) || items.some((item) => basePath(item.route) === basePath(priority.route))) continue;
    items.push({ id: priority.id, tone: priority.tone, title: priority.title, description: priority.description, route: priority.route });
  }

  return items.slice(0, 5);
}

function dayBucketLabel(isoTime) {
  const diffDays = Math.floor((Date.now() - new Date(isoTime).getTime()) / 86400000);
  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  return 'Há mais de uma semana';
}

function buildJourneyTimeline({ recentMatches, recentTrainings, messages, posts, partnerOffers }) {
  const items = [
    ...partnerOffers.slice(0, 2).map((offer) => ({ id: `offer-${offer.id}`, icon: Users, text: `Proposta de dupla: ${offer.candidate_name || offer.player_name || 'atleta interessado'}`, time: offer.created_date, tone: 'text-primary' })),
    ...messages.slice(0, 4).map((message) => ({ id: `message-${message.id}`, icon: MessageCircle, text: message.title, time: message.created_date, tone: 'text-cyan-400' })),
    ...recentMatches.slice(0, 4).map((match) => ({ id: `match-${match.id}`, icon: Swords, text: (match.winner === 'A' || match.player_won) ? 'Vitória registrada na partida' : 'Partida concluída', time: match.created_date, tone: 'text-amber-400' })),
    ...recentTrainings.slice(0, 4).map((training) => ({ id: `training-${training.id}`, icon: Dumbbell, text: `${training.training_label || training.training_type || 'Treino'} concluído`, time: training.created_date, tone: 'text-emerald-400' })),
    ...posts.slice(0, 2).map((post) => ({ id: `post-${post.id}`, icon: Newspaper, text: post.title || 'Notícia do circuito', time: post.created_date, tone: 'text-violet-400' })),
  ]
    .filter((item) => item.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);

  const groups = [];
  for (const item of items) {
    const bucket = dayBucketLabel(item.time);
    let group = groups.find((entry) => entry.bucket === bucket);
    if (!group) { group = { bucket, items: [] }; groups.push(group); }
    group.items.push(item);
  }
  return groups;
}

// ────────────────────────────────────────────────────────────────
// Regiões visuais
// ────────────────────────────────────────────────────────────────

// Fase 5.30 — blocos da nova Home. Mesmo vocabulário visual de Torneios e
// do Centro de Treinamento (5.29): cartões com faixa de acento à esquerda,
// metadados em uma linha, no máximo UM primário por área, ações
// secundárias discretas.

const TONE_DOT = { danger: 'bg-red-400', warning: 'bg-amber-400', premium: 'bg-premium', info: 'bg-cyan-400', success: 'bg-emerald-400', neutral: 'bg-muted-foreground' };
const TONE_TEXT = { danger: 'text-red-300', warning: 'text-amber-300', premium: 'text-premium', info: 'text-cyan-300', success: 'text-emerald-300', neutral: 'text-muted-foreground' };

function HomeStatusCard({ profile, careerExperience, rankingGoal, rankingRoute, partnerRow }) {
  const age = calculateAge(profile);
  const country = profile.country || profile.nationality || profile.country_name || 'Brasil';
  const side = profile.court_side ? (profile.court_side === 'direita' ? 'Direita' : profile.court_side === 'esquerda' ? 'Esquerda' : profile.court_side) : null;
  const style = profile.archetype_label || null;
  const injured = profile.injury_status === 'injured' || profile.is_injured;
  const name = profile.sport_name || profile.full_name || 'Seu atleta';
  const levelPct = careerExperience.maxLevel ? Math.round((careerExperience.level / careerExperience.maxLevel) * 100) : 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm" data-home-status aria-label="Status da carreira">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${injured ? 'bg-red-400' : 'bg-primary'}`} />
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-lg font-black text-primary">{name[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-primary">{injured ? 'Recuperação prioritária' : 'Centro da carreira'}</p>
          <h1 className="pl-title-display truncate text-xl font-black leading-tight tracking-[-0.03em] sm:text-2xl">{name}</h1>
          <p className="truncate text-xs text-muted-foreground">{[age ? `${age} anos` : null, country, side, style].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span>Nível</span><span className="tabular-nums text-foreground">{careerExperience.level}/{careerExperience.maxLevel}</span></p>
          <ProgressBar value={levelPct} max={100} size="sm" className="mt-1.5" />
        </div>
        {rankingGoal ? (
          <Link to={rankingRoute || rankingGoal.route || '/ranking'} className="min-w-0" aria-label={`Objetivo de ranking: ${rankingGoal.title}`}>
            <p className="flex items-baseline justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span className="truncate">Rumo a {rankingGoal.to}</span><span className="tabular-nums text-primary">{rankingGoal.progress}%</span></p>
            <ProgressBar value={rankingGoal.progress} max={100} size="sm" tone="premium" className="mt-1.5" />
          </Link>
        ) : (
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Objetivo em definição</p>
        )}
      </div>
      <div className="mt-3 border-t border-border/40 pt-2">{partnerRow}</div>
    </section>
  );
}

function HomeNextCommitment({ commitment, step, isCurrentPage, onChoosePartner }) {
  const StepIcon = step?.icon || Target;
  // Hotfix "Single Source of Truth": nunca renderizar um CTA que aponta
  // para a própria página atual (React Router não navega — o botão parecia
  // "não abrir", ver heroIsCurrentPage em CareerHub.jsx). Mesmo padrão de
  // texto já usado por OnboardingGuide.jsx para "você está no lugar certo".
  const heroLink = isCurrentPage
    ? <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Você já está aqui — concluindo automaticamente</span>
    : step?.partnerAction
      ? <Button level="primary" size="touch" onClick={onChoosePartner}>{step.cta} <ArrowRight className="h-4 w-4" /></Button>
      : step
        ? <Button asChild level="primary" size="touch"><Link to={step.to}>{step.cta} <ArrowRight className="h-4 w-4" /></Link></Button>
        : null;
  const showSecondary = commitment.secondaryRoute && !(commitment.heroPointsToTournament && commitment.kind !== 'free');
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/70 p-4 shadow-sm" data-home-next-commitment aria-label="O que vem agora">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-premium" />
      <p className="text-[10px] font-black uppercase tracking-wider text-premium">{commitment.eyebrow}</p>
      <h2 className="mt-0.5 truncate text-lg font-black leading-tight">{commitment.title}</h2>
      {commitment.meta && <p className="mt-0.5 text-xs text-muted-foreground">{commitment.meta}</p>}
      {commitment.status && <p className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${TONE_TEXT[commitment.statusTone] || TONE_TEXT.neutral}`}><span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[commitment.statusTone] || TONE_DOT.neutral}`} />{commitment.status}</p>}
      {step && (
        <div className="mt-3 flex min-w-0 items-start gap-2 border-t border-border/40 pt-3">
          <StepIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-black">{step.title}</p>
            {step.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{step.description}</p>}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {heroLink}
        {showSecondary && <Button asChild level="ghost" size="sm"><Link to={commitment.secondaryRoute}>{commitment.secondaryLabel}</Link></Button>}
      </div>
    </section>
  );
}

// Playthrough 5.20-B, Parte D — NO MAXIMO 3 PENDENCIAS. A lista chegava a 5
// itens, e em 360px isso empurrava o resto da Home para fora da primeira tela.
// O excedente nao some: fica atras de "ver mais N", no proprio lugar.
// 5.30: uma lista só (antes "O que fazer agora" + "Atenção e oportunidades").
const VISIBLE_PRIORITY_ACTIONS = 3;

function HomePriorities({ priorities, onChoosePartner }) {
  const [showAll, setShowAll] = useState(false);
  const visibleActions = showAll ? priorities.items : priorities.items.slice(0, VISIBLE_PRIORITY_ACTIONS);
  const hiddenCount = priorities.items.length - visibleActions.length;
  return (
    <section className="space-y-1.5" data-home-priorities aria-label="Prioridades">
      <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Prioridades</p>
      {priorities.items.length ? (
        <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card/55">
          {visibleActions.map((item) => {
            const content = (
              <>
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone] || TONE_DOT.neutral}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{item.title}</span>
                  {item.description && <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            );
            return (
              <li key={item.id}>
                {item.partnerAction
                  ? <button type="button" onClick={onChoosePartner} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/40">{content}</button>
                  : <Link to={item.route} className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-secondary/40">{content}</Link>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card/55 px-3 py-3 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Tudo em dia — nenhuma pendência agora.</p>
      )}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold text-primary">
          ver mais {hiddenCount} pendência{hiddenCount > 1 ? 's' : ''} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}

// Playthrough 4.9, Parte G + 5.30 — agenda imediata: os mesmos itens do
// planejamento semanal (buildUpcomingTournamentPlanning), em linhas. A ação
// de cada linha é SECUNDÁRIA (o primário da Home é o do compromisso);
// inscrever abre o mesmo modal canônico de antes, nunca registra sozinho.
function HomeAgenda({ items, onRegister }) {
  return (
    <section className="h-full space-y-1.5" data-home-agenda aria-label="Agenda imediata">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Agenda</p>
        <Link to={APP_ROUTES.TOURNAMENTS} className="text-xs font-bold text-primary">Ver calendário</Link>
      </div>
      {items.length ? (
        <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card/55">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5" aria-label={`Agenda: ${item.name}`}>
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{item.name}{item.recommended && <span className="ml-1.5 text-[9px] font-black uppercase tracking-wide text-primary">Melhor opção</span>}</p>
                <p className="truncate text-[11px] text-muted-foreground">{[item.tier, item.when].filter(Boolean).join(' · ')}{item.status && <span className={TONE_TEXT[item.statusTone] || TONE_TEXT.neutral}> · {item.status}</span>}</p>
              </div>
              {item.action?.id === 'register'
                ? <Button type="button" level="secondary" size="sm" onClick={() => onRegister?.(item.id)} className="shrink-0 text-primary" aria-label={`Inscrever-se em ${item.name}`}>{item.action.label}</Button>
                : <Link to={`/tournaments?tournament=${encodeURIComponent(item.id)}&mode=details`} className="shrink-0 text-muted-foreground" aria-label={`Ver ${item.name}`}><ChevronRight className="h-4 w-4" /></Link>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-border/50 bg-card/55 px-3 py-3 text-xs text-muted-foreground">Nenhum outro torneio na janela de quatro semanas.</p>
      )}
    </section>
  );
}

function HomeProgress({ progress, recent, worldHeadline = null }) {
  const recentItems = (recent || []).flatMap((group) => group.items).slice(0, 3);
  return (
    <section className="h-full space-y-1.5" data-home-progress aria-label="Progresso da carreira">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Progresso{progress.periodLabel ? ` · ${progress.periodLabel}` : ''}</p>
        <Link to="/game/stats" className="text-xs font-bold text-primary">Estatísticas</Link>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card/55 p-3">
        <div className="grid grid-cols-3 gap-2">
          {progress.metrics.map((metric) => (
            <div key={metric.id} className="min-w-0">
              <p className="text-lg font-black tabular-nums leading-none">{metric.value}</p>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <p className="truncate text-[10px] text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
        {progress.seasonGoals.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-border/40 pt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Metas da temporada · {progress.seasonProgress}%</p>
            {progress.seasonGoals.map((goal) => (
              <Link key={goal.id} to={goal.route} className="flex min-w-0 items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                <ProgressBar value={goal.progress} max={100} size="sm" className="w-16 shrink-0" />
              </Link>
            ))}
          </div>
        )}
        {/* Universo vivo (antes o painel WorldHighlights): uma linha, mesma prioridade de seleção. */}
        {worldHeadline && (
          <Link to="/world" className="mt-3 flex min-w-0 items-center gap-2 border-t border-border/40 pt-2.5 text-[11px]"><Globe2 className="h-3.5 w-3.5 shrink-0 text-violet-400" /><span className="shrink-0 font-bold text-muted-foreground">Circuito:</span><span className="truncate">{worldHeadline.title}</span></Link>
        )}
        {recentItems.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border/40 pt-2.5">
            <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span>Recentes</span><Link to="/game/legacy" className="normal-case tracking-normal text-primary">Ver legado</Link></p>
            {recentItems.map((item) => {
              const ItemIcon = item.icon;
              return <p key={item.id} className="flex min-w-0 items-center gap-2 text-[11px]"><ItemIcon className={`h-3.5 w-3.5 shrink-0 ${item.tone}`} /><span className="truncate">{item.text}</span></p>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// 5.30: 4 atalhos frequentes (antes Legado/Equipe/Imprensa/Missões num cartão
// próprio). Navegação completa continua na barra inferior/menu.
function HomeQuickActions({ missionsCount }) {
  const actions = [
    { to: APP_ROUTES.TRAINING, icon: Dumbbell, label: 'Treinar' },
    { to: '/partners', icon: Users, label: 'Dupla' },
    { to: APP_ROUTES.MISSIONS, icon: Target, label: missionsCount > 0 ? `Objetivos (${missionsCount})` : 'Objetivos' },
    { to: '/world', icon: Globe2, label: 'Mundo' },
  ];
  return (
    <nav className="grid grid-cols-4 gap-2" data-home-quick-actions aria-label="Ações rápidas">
      {actions.map(({ to, icon: Icon, label }) => (
        <Link key={label} to={to} className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-border/50 bg-card/55 px-1 py-2 text-center transition-colors hover:border-primary/30">
          <Icon className="h-4.5 w-4.5 text-primary" />
          <span className="max-w-full truncate text-[10px] font-bold">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function TutorialFinishBanner({ recommendations, finishing, onFinish }) {
  return (
    <section className="rounded-3xl border border-primary/35 bg-gradient-to-r from-primary/10 via-card to-card p-5" aria-labelledby="tutorial-finish-title">
      <div className="flex gap-3"><GraduationCap className="h-7 w-7 shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Carreira liberada</p><h2 id="tutorial-finish-title" className="mt-1 text-xl font-black">Você já conhece os principais sistemas do Padel Legacy</h2><p className="mt-2 text-sm text-muted-foreground">A partir daqui, as decisões são suas: treine, monte sua equipe, encontre parceiros, conquiste patrocinadores e suba no circuito.</p></div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{recommendations.map((item) => <Link key={item.id} to={item.route} className="rounded-xl bg-secondary/40 p-3 hover:bg-secondary"><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p></Link>)}</div>
      <button type="button" disabled={finishing} onClick={onFinish} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{finishing ? 'Concluindo...' : 'Começar carreira livre'}</button>
    </section>
  );
}

function CareerToolsSection({ open, onToggle, profile, strategicState, onProfileUpdate }) {
  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.1): migrado para o
  // CollapsibleSection compartilhado — este bloco escrito à mão era o
  // padrão original que o novo primitive extraiu; agora reaproveita em vez
  // de manter duas implementações do mesmo comportamento.
  return (
    <CollapsibleSection
      icon={Wrench}
      title="Ferramentas de gestão"
      description="Centro médico e leitura estratégica da carreira"
      open={open}
      onToggle={onToggle}
    >
      <MedicalCenterPanel profile={profile} onProfileUpdate={onProfileUpdate} />
      <StrategicCareerPanel profile={profile} state={strategicState} onProfileUpdate={onProfileUpdate} />
    </CollapsibleSection>
  );
}

function MonthlyReportHomeCard({ report }) {
  const label = new Date(`${report.periodKey}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <section className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-cyan-500/5 p-5" aria-label="Resumo mensal da carreira">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><CalendarDays className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Seu mês em resumo</p><h2 className="mt-1 text-lg font-black capitalize">{label}</h2><p className="mt-1 text-xs text-muted-foreground">{report.competition.wins}V · {report.competition.losses}D · {report.training.sessions} treinos · {report.finances.net >= 0 ? '+' : ''}{Number(report.finances.net || 0).toLocaleString('pt-BR')} moedas</p></div>
        <Link to={`/game/monthly-reports?report=${encodeURIComponent(report.id)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-primary-foreground">Ver relatório <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </section>
  );
}

function AnnualReportHomeCard({ report }) {
  return (
    <section className="rounded-3xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-card to-primary/10 p-5" aria-label="Temporada encerrada">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400"><Crown className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Temporada {report.year} encerrada</p><h2 className="mt-1 text-lg font-black">{report.playerSummary?.badge || 'Seu ano em números'}</h2><p className="mt-1 text-xs text-muted-foreground">Ranking final #{report.ranking?.endPosition || '—'} · {report.sportingResults?.titles || 0} títulos · {report.bestTournament?.name || `${report.sportingResults?.wins || 0} vitórias`}</p></div>
        <Link to={`/game/annual-reports?report=${encodeURIComponent(report.id)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black">Ver relatório anual <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </section>
  );
}

function CareerMomentStrip({ moment }) {
  const Icon = moment.type === 'injury' ? HeartPulse : moment.type === 'title' ? Crown : moment.type === 'ranking' ? TrendingUp : Sparkles;
  return (
    <section className={`rounded-2xl border p-4 pl-tone-${moment.tone}`} aria-label={moment.eyebrow}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-current/10" style={{ color: 'hsl(var(--tone-color, var(--primary)))' }}><Icon className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: 'hsl(var(--tone-color, var(--primary)))' }}>{moment.eyebrow}</p>
          <p className="truncate text-sm font-black">{moment.title}</p>
        </div>
        <Link to={moment.primaryAction.route} className="shrink-0 text-xs font-bold text-primary">{moment.primaryAction.label}</Link>
      </div>
    </section>
  );
}
