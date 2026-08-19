import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, CalendarDays, CheckCircle2,
  ChevronRight, Crown, Dumbbell, GraduationCap,
  HeartPulse, Mic, MessageCircle, Newspaper, Sparkles, Swords, Target, Zap,
  Trophy, TrendingUp, UserRound, Users, Globe2, Wrench,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  ensureMyProfile, incrementMissionProgress, careerExperienceSummary, overallRating, calculateAge,
  getWorldRank, isRetired,
} from '@/lib/padel';
import {
  CollapsibleSection,
  Page, PageContent, PageHeader, StatusBadge, Surface, SurfaceHeader,
  ProgressBar, EmptyState, PageSkeleton, Button, ConfirmDialog,
} from '@/components/design-system';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import CareerCalendar from '@/components/career/CareerCalendar';
import PartnerSelection from '@/components/career/PartnerSelection';
import MedicalStatusPanel from '@/components/career/MedicalStatusPanel';
import MedicalCenterPanel from '@/components/career/MedicalCenterPanel';
import StrategicCareerPanel from '@/components/career/StrategicCareerPanel';
import ActiveMatchRecoveryBanner from '@/components/career/ActiveMatchRecoveryBanner';
import { advanceCareerUntilRecovered } from '@/game-core';
import { completeTutorialState, getCurrentTutorialStep } from '@/onboarding/tutorialState.js';
import { getCareerRecommendations } from '@/onboarding/careerRecommendations.js';
import { getOnboardingNextAction } from '@/onboarding/onboardingNextAction.js';
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
import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';
import { buildTournamentPlayRoute } from '@/lib/tournamentNextAction.js';

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
          safe(localGame.entities.Tournament.filter({ status: 'inscricoes' })),
          safe(localGame.entities.Post.list('-created_date', 5)),
          p ? safe(localGame.entities.CareerMessage.filter({ profile_id: p.id }, '-created_date', 8)) : [],
          p ? safe(localGame.entities.PartnerOffer.filter({ profile_id: p.id }, '-created_date', 8)) : [],
          p ? safe(getLivingWorldSnapshot(p, 8), null) : null,
          p ? safe(localGame.entities.CalendarEvent.filter({ profile_id: p.id, status: 'scheduled', event_type: 'tournament' }), []) : [],
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
        setActiveTournamentEvent((tournamentEvents || []).find((event) => event.metadata?.tournament_run) || null);
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
          const resolvedTeamRank = partner ? await safe(getTeamRank(p, partner), { rank: 0, total: 0, unranked: true }) : { rank: 0, total: 0, unranked: true };
          if (mounted) setTeamRank(resolvedTeamRank);
        }

        const careerDate = p?.career_date || '2026-01-01';
        setUpcomingTournaments((upcoming || [])
          .filter((tournament) => tournament.start_date && tournament.start_date >= careerDate)
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
          .slice(0, 6));
      } catch (error) {
        console.error('CareerHub', error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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
  const activeTournamentRecovery = useMemo(() => {
    if (activeMatchCheckpoint?.type !== 'tournament' || !activeTournamentEvent || !profile) return null;
    const run = activeTournamentEvent.metadata?.tournament_run;
    const match = getCurrentTournamentMatch(run);
    return buildTournamentRecoverySession(activeMatchCheckpoint, {
      careerId: activeCareer?.career_id,
      careerDate: profile.career_date,
      tournament: { id: activeTournamentEvent.related_id, name: run?.tournamentName || activeTournamentEvent.related_name },
      run,
      match,
      teamA: [profile, getPartnerBot(profile)].filter(Boolean),
      teamB: match?.opponent || [],
    });
  }, [activeCareer?.career_id, activeMatchCheckpoint, activeTournamentEvent, profile]);
  const hasTournamentRecoveryAction = ['resumable', 'restart_required', 'resume_failed'].includes(activeTournamentRecovery?.status);

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
    () => buildWeeklyCareerReview(profile, { matches: recentMatches, trainings: recentTrainings, messages }),
    [profile, recentMatches, recentTrainings, messages],
  );
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
  // ÚNICA fonte do CTA principal — `getNextStep` (o motor de recomendação
  // "normal", preservado abaixo como fallback) só volta a decidir depois
  // que o onboarding termina (ou nunca começou/foi pulado).
  const onboardingNextAction = useMemo(() => getOnboardingNextAction(profile), [profile]);
  const fallbackHeroStep = useMemo(() => getNextStep(profile, upcomingTournaments), [profile, upcomingTournaments]);
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
  const nextEvent = useMemo(
    () => buildNextEvent({ profile, activeTournamentEvent, nextTournament, hasTournamentRecoveryAction }),
    [profile, activeTournamentEvent, nextTournament, hasTournamentRecoveryAction],
  );
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
  // diário repetiria o mesmo dado de dias restantes que NextEventCard e
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

  if (loading) return <PageSkeleton variant="dashboard" rows={4} />;
  if (!profile) {
    return <Page size="default"><EmptyState icon={AlertCircle} title="Não foi possível carregar sua carreira" description="Volte ao gerenciador de carreiras ou tente novamente." /></Page>;
  }

  const careerExperience = careerExperienceSummary(profile.xp || 0);
  const ovr = overallRating(profile);
  const injurySkipDays = Math.max(Number(profile?.injury_days_remaining) || 0, profile?.injured_until ? daysUntil(profile.career_date, profile.injured_until) : 0);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
        <ActiveMatchRecoveryBanner profile={profile} tournamentEvent={activeTournamentEvent} recoverySession={activeTournamentRecovery} />
        {latestAnnualReport && profile.career_date?.endsWith('-01-01') && latestAnnualReport.generatedDate === profile.career_date && <AnnualReportHomeCard report={latestAnnualReport} />}
        {latestMonthlyReport && profile.career_date?.endsWith('-01') && latestMonthlyReport.generatedDate === profile.career_date && <MonthlyReportHomeCard report={latestMonthlyReport} />}
        {activeTournamentEvent && !hasTournamentRecoveryAction && <ActiveTournamentBanner event={activeTournamentEvent} careerDate={profile.career_date} />}
        {/* Polish 2 (docs/REDESIGN_POLISH_2.md, objetivo 1.5): 'tournament' e
            'injury' repetiam exatamente a mesma informação que já aparece,
            mais completa/acionável, em NextEventCard (sempre visível logo
            abaixo) e em MedicalStatusPanel (quando lesionado). Os outros
            tipos (título/ranking/sequência/dupla) não têm equivalente em
            nenhum outro painel desta viewport — continuam aparecendo. */}
        {careerMoment && !['tournament', 'injury'].includes(careerMoment.type) && <CareerMomentStrip moment={careerMoment} />}

        {/* 1. Identidade + contexto */}
        <IdentityHeader profile={profile} ovr={ovr} careerExperience={careerExperience} worldRank={worldRank} unreadCount={unreadCount} />

        {/* 2. Próximo objetivo + próximo evento */}
        <Surface padding="none" className="grid overflow-hidden xl:grid-cols-12">
          <div className="border-b border-border/45 xl:col-span-7 xl:border-b-0 xl:border-r"><NextObjectiveCard goal={rankingGoal} worldRank={worldRank} embedded /></div>
          <div className="xl:col-span-5"><NextEventCard event={nextEvent} embedded /></div>
        </Surface>

        {/* 3. O que fazer agora */}
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <PriorityActionsPanel step={heroStep} actions={priorityActions} isCurrentPage={heroIsCurrentPage} onChoosePartner={() => setShowPartner(true)} />
          </div>
          <div className="xl:col-span-5">
            {!isRetired(profile) && <CareerCalendar profile={profile} onAdvanceDay={setProfile} />}
          </div>
        </div>

        {finalTutorialStep && <TutorialFinishBanner recommendations={recommendations} finishing={finishingTutorial} onFinish={finishTutorial} />}
        {injured && <MedicalStatusPanel profile={profile} onSkipRecovery={handleSkipInjury} skipping={skippingInjury} skipError={injurySkipError} skipSummary={injurySkipSummary} />}

        {/* 4. Sua jornada */}
        <JourneyTimeline groups={journeyGroups} />

        {/* 5. Evolução + Atenção */}
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7"><EvolutionSummary weeklyReview={weeklyReview} seasonPlan={seasonPlan} /></div>
          <div className="xl:col-span-5"><AttentionList items={attentionItems} pendingOffers={pendingOffers} profile={profile} onChoosePartner={() => setShowPartner(true)} /></div>
        </div>

        {/* 6. Mundo + Ações rápidas */}
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8"><WorldHighlights snapshot={worldSnapshot} posts={posts} /></div>
          <div className="xl:col-span-4"><QuickActionsBar missionsCount={missions.length} /></div>
        </div>

        {/* 7. Ferramentas de gestão (recolhido por padrão — progressive disclosure) */}
        <CareerToolsSection
          open={toolsOpen}
          onToggle={() => setToolsOpen((value) => !value)}
          profile={profile}
          strategicState={strategicState}
          onProfileUpdate={setProfile}
        />

        {isRetired(profile) && <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">Você encerrou sua carreira como atleta. Continue acompanhando seu legado, conquistas e história.</div>}
        <CareerStatusBar profile={profile} onPartnerClick={() => profile.court_side && setShowPartner(true)} />

        {showPartner && <PartnerSelection profile={profile} onClose={() => setShowPartner(false)} onPartnerSelected={setProfile} />}

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
function formatShortDate(value) { if (!value) return '—'; const date = new Date(`${value}T00:00:00`); return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }
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
function getNextStep(profile, upcomingTournaments) {
  if (!profile) return null;
  if (isRetired(profile)) return { icon: CheckCircle2, title: 'Carreira concluída', description: 'Você se aposentou. Revise seu legado e Hall da Fama.', to: '/game/legacy', cta: 'Ver legado' };
  if (!profile.court_side) return { icon: Users, title: 'Escolha seu lado', description: 'Complete a missão "Escolha seu lado" no tutorial.', to: '/game/missions', cta: 'Ir para a missão' };
  if ((profile.unspent_attribute_points || 0) > 0 && (profile.matches_played || 0) === 0) return { icon: Sparkles, title: 'Distribua seus atributos', description: `${profile.unspent_attribute_points} pontos disponíveis antes de começar.`, to: '/profile', cta: 'Distribuir pontos' };
  if (!profile.partner_id) return { icon: Users, title: 'Selecione um parceiro', description: 'Você precisa de uma dupla para jogar torneios e partidas.', to: '/partners?view=offers', cta: 'Escolher dupla', partnerAction: true };
  if (profile.injury_status === 'injured' || profile.is_injured) return { icon: HeartPulse, title: 'Recuperando lesão', description: 'Avance o dia para se recuperar.', to: '/game/calendar', cta: 'Ver recuperação' };
  const playableTournament = (upcomingTournaments || []).find((t) => {
    const tMonth = t.month || (t.start_date ? new Date(`${t.start_date}T00:00:00`).getMonth() + 1 : 0);
    const careerMonth = profile.career_date ? new Date(`${profile.career_date}T00:00:00`).getMonth() + 1 : 1;
    return tMonth === careerMonth && t.status === 'inscricoes';
  });
  if (playableTournament) return { icon: Trophy, title: `Torneio disponível: ${playableTournament.name}`, description: `Tier ${playableTournament.tier}. Inscreva-se e dispute o título.`, to: '/tournaments', cta: 'Ver torneios' };
  const energy = profile.energy || 0;
  if (energy < 30) return { icon: HeartPulse, title: 'Energia baixa', description: 'Avance um dia sem atividade para recuperar energia.', to: '/game/calendar', cta: 'Ver calendário' };
  return { icon: Dumbbell, title: 'Hora de treinar', description: 'Evolua seus atributos com um treino hoje.', to: '/game/training', cta: 'Treinar agora' };
}

function buildNextEvent({ profile, activeTournamentEvent, nextTournament, hasTournamentRecoveryAction = false }) {
  const injured = profile?.injury_status === 'injured' || profile?.is_injured || Number(profile?.injury_days_remaining) > 0;
  if (injured) {
    const days = Math.max(1, Number(profile.injury_days_remaining) || 1);
    return { icon: HeartPulse, tone: 'danger', eyebrow: 'Recuperação', title: 'Retorno à quadra', detail: `${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}`, route: '/game/calendar', cta: 'Ver recuperação' };
  }
  const run = activeTournamentEvent?.metadata?.tournament_run;
  const activeMatch = run?.matches?.[run?.currentRound || 0];
  if (activeMatch) {
    return { icon: Trophy, tone: 'premium', eyebrow: hasTournamentRecoveryAction ? 'Em andamento' : 'Em torneio', title: run.tournamentName || activeTournamentEvent.related_name || 'Torneio', detail: `${activeMatch.round} · ${hasTournamentRecoveryAction ? 'use a ação de recuperação acima' : activeMatch.preparationCompleted ? 'plano definido' : 'preparação pendente'}`, route: buildTournamentPlayRoute(activeTournamentEvent.related_id), cta: hasTournamentRecoveryAction ? null : 'Ver partida' };
  }
  if (nextTournament) {
    const days = daysUntil(profile?.career_date, nextTournament.start_date);
    return { icon: Trophy, tone: 'info', eyebrow: days === 0 ? 'Hoje' : `Em ${days} dia${days === 1 ? '' : 's'}`, title: nextTournament.name, detail: 'Inscrição aberta', route: '/tournaments', cta: 'Ver torneio' };
  }
  return { icon: CalendarDays, tone: 'neutral', eyebrow: 'Agenda livre', title: 'Nenhum evento nos próximos dias', detail: 'Boa janela para treinar e evoluir.', route: '/game/training', cta: 'Treinar' };
}

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
    // informação que NextEventCard já mostra, sempre, com mais contexto e um
    // CTA. NextEventCard não está nesta lista (é renderizado à parte), então
    // o dedup por rota abaixo não o alcança sozinho; aqui a regra é explícita:
    // evento sem ação própria não duplica o card. Uma pendência real (decisão
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

function IdentityHeader({ profile, ovr, careerExperience, worldRank, unreadCount }) {
  const age = calculateAge(profile);
  const country = profile.country || profile.nationality || profile.country_name || 'Brasil';
  const side = profile.court_side ? (profile.court_side === 'direita' ? 'Direita' : profile.court_side === 'esquerda' ? 'Esquerda' : profile.court_side) : null;
  const style = profile.archetype_label || profile.play_style || null;
  const metaParts = [country, age ? `${age} anos` : null, side, style].filter(Boolean);
  const primaryContext = (profile.injury_status === 'injured' || profile.is_injured)
    ? { eyebrow: 'Recuperação prioritária', tone: 'danger' }
    : { eyebrow: 'Centro da carreira', tone: 'brand' };

  return (
    <PageHeader
      dense
      eyebrow={primaryContext.eyebrow}
      title={profile.sport_name || profile.full_name || 'Seu atleta'}
      description={metaParts.join(' · ')}
      icon={UserRound}
      tone={primaryContext.tone}
      hudLabel="Resumo do atleta"
      hudItems={[
        { label: 'ranking', value: worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+', icon: Crown, tone: 'premium' },
        { label: 'OVR', value: ovr, icon: TrendingUp, tone: 'info' },
        { label: 'nível', value: `${careerExperience.level}/${careerExperience.maxLevel}`, icon: Zap, tone: 'success' },
        unreadCount > 0 ? { label: 'pendências', value: unreadCount, icon: AlertCircle, tone: 'danger' } : null,
      ]}
      action={<div className="flex flex-wrap gap-2"><CommandLink primary to="/game/training" icon={Dumbbell}>Treinar</CommandLink><CommandLink to="/tournaments" icon={Trophy}>Competir</CommandLink><CommandLink to="/game/calendar" icon={CalendarDays}>Agenda</CommandLink></div>}
    />
  );
}

function CommandLink({ to, icon: Icon, children, primary = false }) {
  return <Link to={to} className={primary ? 'pl-game-primary inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground' : 'inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-muted-foreground transition hover:bg-primary/10 hover:text-primary'}><Icon className="h-3.5 w-3.5" />{children}</Link>;
}

function NextObjectiveCard({ goal, worldRank, embedded = false }) {
  if (!goal) return embedded ? <div className="p-3"><EmptyState compact icon={Target} title="Objetivo em definição" description="Continue jogando para desbloquear sua próxima meta." /></div> : <Surface className="h-full"><EmptyState compact icon={Target} title="Objetivo em definição" description="Continue jogando para desbloquear sua próxima meta." /></Surface>;
  const currentLabel = worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+';
  const content = (
    <div className="p-3 sm:p-4">
      <SurfaceHeader compact icon={Target} title="Próximo objetivo" description={goal.description} />
      <p className="text-lg font-black leading-tight">{goal.title}</p>
      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <span className="text-foreground">{currentLabel}</span><ArrowRight className="h-3.5 w-3.5" /><span className="text-primary">#{goal.target}</span>
        <span className="ml-auto tabular-nums text-primary">{Math.round(goal.progress)}%</span>
      </div>
      <ProgressBar value={goal.progress} max={100} tone="premium" className="mt-2" />
      <Link to={goal.route} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">Ver ranking <ChevronRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
  return embedded ? content : <Surface variant="premium" padding="none" className="h-full">{content}</Surface>;
}

function NextEventCard({ event, embedded = false }) {
  const Icon = event.icon;
  const content = (
    <div className={`h-full p-3 pl-tone-${event.tone} sm:p-4`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-current/10" style={{ color: 'hsl(var(--tone-color, var(--primary)))' }}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'hsl(var(--tone-color, var(--primary)))' }}>{event.eyebrow}</p>
          <p className="mt-0.5 truncate text-base font-black">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
        </div>
      </div>
      {event.cta && <Link to={event.route} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">{event.cta} <ChevronRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
  return embedded ? content : <Surface padding="none" className="h-full">{content}</Surface>;
}

function PriorityActionsPanel({ step, actions, isCurrentPage, onChoosePartner }) {
  if (!step) return null;
  const HeroIcon = step.icon;
  // Hotfix "Single Source of Truth": nunca renderizar um CTA que aponta
  // para a própria página atual (React Router não navega — o botão parecia
  // "não abrir", ver heroIsCurrentPage em CareerHub.jsx). Mesmo padrão de
  // texto já usado por OnboardingGuide.jsx para "você está no lugar certo".
  const heroLink = isCurrentPage
    ? <span className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary">Você já está aqui — concluindo automaticamente</span>
    : step.partnerAction
    ? <button type="button" onClick={onChoosePartner} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">{step.cta} <ArrowRight className="h-4 w-4" /></button>
    : <Link to={step.to} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">{step.cta} <ArrowRight className="h-4 w-4" /></Link>;

  return (
    <Surface variant="elevated">
      <SurfaceHeader icon={HeroIcon} title="O que fazer agora" description={step.description} action={heroLink} />
      {actions.length ? (
        <ul className="space-y-1.5">
          {actions.map((action) => (
            <li key={action.id}>
              <Link to={action.route} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-secondary/45">
                <StatusBadge tone={action.tone} className="shrink-0">{action.title}</StatusBadge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{action.description}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma outra pendência agora — siga o plano acima.</p>
      )}
    </Surface>
  );
}

function TutorialFinishBanner({ recommendations, finishing, onFinish }) {
  return (
    <section className="rounded-3xl border border-primary/35 bg-gradient-to-r from-primary/10 via-card to-card p-5" aria-labelledby="tutorial-finish-title">
      <div className="flex gap-3"><GraduationCap className="h-7 w-7 shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Etapa final do tutorial</p><h2 id="tutorial-finish-title" className="mt-1 text-xl font-black">Sua carreira está pronta para seguir</h2><p className="mt-2 text-sm text-muted-foreground">Escolha um objetivo sugerido ou confirme para administrar tudo livremente.</p></div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{recommendations.map((item) => <Link key={item.id} to={item.route} className="rounded-xl bg-secondary/40 p-3 hover:bg-secondary"><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p></Link>)}</div>
      <button type="button" disabled={finishing} onClick={onFinish} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{finishing ? 'Concluindo...' : 'Começar carreira livre'}</button>
    </section>
  );
}

function JourneyTimeline({ groups }) {
  return (
    <Surface>
      <SurfaceHeader icon={CalendarDays} title="Sua jornada" description="Linha do tempo compacta do que aconteceu recentemente." action={<Link to="/game/legacy" className="text-xs font-bold text-primary">Ver legado completo</Link>} />
      {groups.length ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.bucket}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{group.bucket}</p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm">
                      <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${item.tone}`} />
                      <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState compact icon={CalendarDays} title="Sua história está começando" description="O primeiro marco aparecerá aqui assim que você jogar, treinar ou receber uma mensagem." />
      )}
    </Surface>
  );
}

function EvolutionSummary({ weeklyReview, seasonPlan }) {
  if (!weeklyReview) return null;
  return (
    <Surface className="h-full">
      <SurfaceHeader icon={TrendingUp} title="Evolução" description={`Últimos 7 dias · ${weeklyReview.periodLabel}`} action={<Link to="/game/stats" className="text-xs font-bold text-primary">Estatísticas completas</Link>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weeklyReview.metrics.map((metric) => (
          <div key={metric.id} className="rounded-xl bg-secondary/30 p-3">
            <p className="text-lg font-black tabular-nums">{metric.value}</p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>
      {seasonPlan?.goals?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Metas da temporada · {seasonPlan.overallProgress}%</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seasonPlan.goals.map((goal) => (
              <Link key={goal.category} to={goal.route} className="rounded-xl border border-border/55 bg-card/50 p-2.5 transition hover:border-primary/30">
                <p className="truncate text-[10px] font-bold">{goal.title}</p>
                <ProgressBar value={goal.progress} max={100} size="sm" className="mt-1.5" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}

function AttentionList({ items, pendingOffers, profile, onChoosePartner }) {
  const showPartnerRow = pendingOffers.length > 0;
  const hasContent = items.length > 0 || showPartnerRow;
  return (
    <Surface className="h-full">
      <SurfaceHeader icon={AlertCircle} title="Atenção e oportunidades" description="O que pode ficar para trás se você não olhar agora." />
      {hasContent ? (
        <ul className="space-y-1.5">
          {showPartnerRow && (
            <li>
              <button type="button" onClick={onChoosePartner} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary/45">
                <StatusBadge tone={profile.partner_id ? 'info' : 'danger'} className="shrink-0">Dupla</StatusBadge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{pendingOffers.length} proposta{pendingOffers.length === 1 ? '' : 's'} de parceria aguardando</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          )}
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.route} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-secondary/45">
                <StatusBadge tone={item.priority === 'critical' ? 'danger' : item.priority === 'high' ? 'warning' : 'neutral'} className="shrink-0">{item.category}</StatusBadge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.title}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={CheckCircle2} title="Tudo em dia" description="Nenhuma pendência aguardando resposta." />
      )}
    </Surface>
  );
}

function WorldHighlights({ snapshot, posts }) {
  const featured = snapshot?.bulletin || snapshot?.breaking;
  const highlights = featured ? [featured, ...posts.filter((post) => post.id !== featured.id)] : posts;
  const items = highlights.slice(0, 3);
  return (
    <Surface className="h-full">
      <SurfaceHeader icon={Globe2} title="Mundo" description="Só o essencial — o resto está no hub do Mundo." action={<Link to="/world" className="text-xs font-bold text-primary">Ver mundo</Link>} />
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link to="/journal" className="block rounded-xl bg-secondary/30 p-3 hover:bg-secondary/55">
                <p className="truncate text-xs font-bold">{item.title || 'Notícia do circuito'}</p>
                <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{item.content || item.description || 'Acompanhe os acontecimentos mais recentes.'}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={Newspaper} title="Circuito tranquilo" description="Nenhuma notícia relevante no momento." />
      )}
    </Surface>
  );
}

function QuickActionsBar({ missionsCount }) {
  return (
    <Surface className="flex h-full flex-col justify-center gap-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Ações rápidas</p>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild level="secondary" size="sm" className="justify-start"><Link to="/game/calendar"><CalendarDays className="h-4 w-4" />Calendário</Link></Button>
        <Button asChild level="secondary" size="sm" className="justify-start"><Link to="/tournaments"><Trophy className="h-4 w-4" />Torneios</Link></Button>
        <Button asChild level="secondary" size="sm" className="justify-start"><Link to="/ranking"><Crown className="h-4 w-4" />Ranking</Link></Button>
        <Button asChild level="secondary" size="sm" className="justify-start"><Link to="/game/missions"><Target className="h-4 w-4" />Missões{missionsCount > 0 ? ` (${missionsCount})` : ''}</Link></Button>
      </div>
    </Surface>
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

function ActiveTournamentBanner({ event, careerDate }) {
  const run = event?.metadata?.tournament_run;
  const match = run?.matches?.[run.currentRound || 0];
  if (!match) return null;
  const opponent = (match.opponent || []).map((item) => item.name).filter(Boolean).join(' / ') || 'Adversário a definir';
  const offset = daysUntil(careerDate, match.date);
  const isToday = offset === 0;
  const when = isToday ? 'Hoje' : offset === 1 ? 'Amanhã' : formatShortDate(match.date);
  // Hotfix UX (docs/TOURNAMENT_GUIDED_FLOW_HOTFIX.md, item 9): o CTA precisa
  // abrir o torneio+rodada corretos direto — nunca "/tournaments" genérico
  // deixando o jogador procurar. Mesmo deep link canônico usado pelo
  // bloqueio de avanço de dia e pelo retorno pós-entrevista.
  return (
    <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-card to-primary/5 p-5" aria-label="Torneio em andamento">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300"><Trophy className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">{isToday ? 'Dia de torneio' : 'Em torneio'}</p><h2 className="mt-1 text-lg font-black">{run.tournamentName || event.related_name || event.title}</h2><p className="mt-1 text-xs text-muted-foreground">Próxima partida: <strong className="text-foreground">{match.round}</strong> · {when} · vs {opponent}</p></div>
        <Link to={buildTournamentPlayRoute(event.related_id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-primary-foreground">{match.preparationCompleted ? 'Ver partida' : 'Preparar partida'} <ArrowRight className="h-3.5 w-3.5" /></Link>
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
