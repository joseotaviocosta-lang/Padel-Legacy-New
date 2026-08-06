import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, ArrowRight, Bell, CalendarDays, CheckCircle2,
  ChevronRight, Crown, Dumbbell, Gamepad2, GraduationCap,
  Inbox, MessageCircle, Newspaper, Target, Trophy, TrendingUp, Users, Zap, Globe2,
  Clock3, HeartPulse, Sparkles, Flag, UserRound, ClipboardList, Radio,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  ensureMyProfile, incrementMissionProgress, careerExperienceSummary, overallRating, winRate, calculateAge,
  getWorldRank, topAttributes, isRetired,
} from '@/lib/padel';
import { StatCard, getAttributeIcon } from '@/components/padel/Shared';
import { Page, PageContent, PageHeader, StatCard as PremiumStatCard, StatusBadge } from '@/components/design-system';
import { SectionCard, EmptyState, ProgressBar } from '@/components/padel/GameShared';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import CareerCalendar from '@/components/career/CareerCalendar';
import PartnerSelection from '@/components/career/PartnerSelection';
import NextStepCard from '@/components/career/NextStepCard';
import { LoadingScreen, EmptyStateCard, GlassCard } from '@/components/padel/ui';
import StatusStrip from '@/components/home/StatusStrip';
import MedicalStatusPanel from '@/components/career/MedicalStatusPanel';
import MedicalCenterPanel from '@/components/career/MedicalCenterPanel';
import { advanceCareerUntilRecovered } from '@/game-core';
import { completeTutorialState, getCurrentTutorialStep } from '@/onboarding/tutorialState.js';
import { getCareerRecommendations } from '@/onboarding/careerRecommendations.js';
import { useToast } from '@/components/ui/use-toast';
import { getTeamRank } from '@/lib/teamRanking.js';
import { getLivingWorldSnapshot } from '@/lib/livingWorldEngine.js';
import { ensureContextualCareerCommunications, normalizeCareerMessage } from '@/lib/careerCommunications.js';
import SmartAgenda from '@/components/career/SmartAgenda';
import CareerMomentBanner from '@/components/career/CareerMomentBanner';
import { deriveCareerMoment } from '@/lib/careerMoments.js';
import { buildDailyCareerBriefing } from '@/lib/dailyCareerBriefing.js';
import DailyCareerBriefing from '@/components/career/DailyCareerBriefing';
import CareerDecisionCenter from '@/components/career/CareerDecisionCenter';
import { buildCareerDecisionCenter } from '@/lib/careerDecisionCenter.js';
import WeeklyCareerReview from '@/components/career/WeeklyCareerReview';
import { buildWeeklyCareerReview } from '@/lib/weeklyCareerReview.js';
import SeasonCareerPlan from '@/components/career/SeasonCareerPlan';
import { buildSeasonCareerPlan } from '@/lib/seasonCareerPlan.js';
import StrategicCareerPanel from '@/components/career/StrategicCareerPanel';
import { buildStrategicCareerState } from '@/lib/strategicCareerAI.js';

const safe = (promise, fallback = []) => promise.catch((error) => {
  console.warn('[CareerControlCenter] módulo secundário indisponível', error);
  return fallback;
});

export default function CareerHub() {
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
  const [loading, setLoading] = useState(true);
  const [showPartner, setShowPartner] = useState(false);
  const [skippingInjury, setSkippingInjury] = useState(false);
  const [injurySkipError, setInjurySkipError] = useState('');
  const [injurySkipSummary, setInjurySkipSummary] = useState(null);
  const [finishingTutorial, setFinishingTutorial] = useState(false);
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

  async function handleSkipInjury() {
    const days = Math.max(
      Number(profile?.injury_days_remaining) || 0,
      profile?.injured_until
        ? Math.ceil((new Date(`${profile.injured_until}T00:00:00`).getTime() - new Date(`${profile.career_date}T00:00:00`).getTime()) / 86400000)
        : 0,
    );
    const warning = `Avançar ${days} dia${days === 1 ? '' : 's'} até a recuperação?\n\nTorneios, rankings, despesas, agenda, notícias, contratos e missões continuarão sendo processados. Treinos serão cancelados e torneios serão marcados como perdidos automaticamente durante a lesão. Apenas outras decisões obrigatórias interrompem o avanço.`;
    if (!profile || !window.confirm(warning)) return;
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

        const [matches, missionsData, rank, trainings, prog, teamRankings, upcoming, latestPosts, inboxRows, offerRows, livingSnapshot] = await Promise.all([
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
        ]);
        if (!mounted) return;

        setRecentMatches(matches || []);
        setMissions(missionsData || []);
        setWorldRank(rank || { rank: 0, total: 0 });
        setRecentTrainings((trainings || []).slice(0, 6));
        setPosts(latestPosts || []);
        const normalizedMessages = (inboxRows || []).map(normalizeCareerMessage);
        setMessages(normalizedMessages);
        setPartnerOffers(offerRows || []);
        setWorldSnapshot(livingSnapshot || null);

        const recentWins = (matches || []).filter((match) => {
          const completed = ['completed', 'finished', 'concluida', 'concluido'].includes(String(match.status || '').toLowerCase()) || Boolean(match.winner_id || match.winner_team_id);
          if (!completed) return false;
          return match.winner_id === p.id || match.winner_player_id === p.id || match.player_won === true || match.is_winner === true;
        }).length;
        const contextual = await ensureContextualCareerCommunications(p, {
          nextTournament: (upcoming || []).filter((item) => item.start_date >= (p.career_date || '2026-01-01')).sort((a, b) => a.start_date.localeCompare(b.start_date))[0],
          recentWins,
          partnerName: p.partner_name,
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

  const unreadMessages = useMemo(() => messages.filter((message) => ['nao_lida', 'decisao_pendente'].includes(message.status)), [messages]);
  const pendingOffers = useMemo(() => partnerOffers.filter((offer) => offer.status === 'pending'), [partnerOffers]);

  if (loading) return <LoadingScreen />;
  if (!profile) {
    return <div className="mx-auto max-w-5xl px-4 py-8"><EmptyStateCard icon={AlertCircle} title="Não foi possível carregar sua carreira" message="Volte ao gerenciador de carreiras ou tente novamente." /></div>;
  }

  const careerExperience = careerExperienceSummary(profile.xp || 0);
  const ovr = overallRating(profile);
  const top5 = topAttributes(profile).slice(0, 5);
  const finalTutorialStep = profile.tutorial_onboarding?.status === 'in_progress' && getCurrentTutorialStep(profile.tutorial_onboarding)?.id === 'autonomy';
  const recommendations = getCareerRecommendations(profile, { trainings: recentTrainings, registrations: upcomingTournaments, matches: recentMatches }).slice(0, 4);
  const nextTournament = upcomingTournaments[0];
  const careerMoment = deriveCareerMoment(profile, { matches: recentMatches, nextTournament, worldRank, teamRank });
  const dailyBriefing = buildDailyCareerBriefing(profile, {
    recentMatches,
    nextTournament,
    unreadCount: unreadMessages.length + pendingOffers.length,
  });
  const decisionCenter = buildCareerDecisionCenter(profile, {
    messages,
    partnerOffers,
    nextTournament,
  });
  const weeklyReview = buildWeeklyCareerReview(profile, {
    matches: recentMatches,
    trainings: recentTrainings,
    messages,
  });
  const seasonPlan = buildSeasonCareerPlan(profile, {
    worldRank,
    matches: recentMatches,
    trainings: recentTrainings,
  });
  const strategicState = buildStrategicCareerState(profile, {
    matches: recentMatches,
    nextTournament,
    worldRank,
  });

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
        <CareerCommandHeader profile={profile} careerExperience={careerExperience} overall={ovr} worldRank={worldRank} nextTournament={nextTournament} unreadCount={unreadMessages.length + pendingOffers.length} />
        <MyJourneyPanel
          profile={profile}
          worldRank={worldRank}
          teamRank={teamRank}
          nextTournament={nextTournament}
          recentMatches={recentMatches}
          recentTrainings={recentTrainings}
          messages={messages}
          posts={posts}
        />
        <CareerFeed
          recentMatches={recentMatches}
          recentTrainings={recentTrainings}
          messages={messages}
          posts={posts}
          partnerOffers={partnerOffers}
        />
        <CareerMomentBanner moment={careerMoment} />
        <DailyCareerBriefing briefing={dailyBriefing} />
        <CareerDecisionCenter center={decisionCenter} />
        <WeeklyCareerReview review={weeklyReview} />
        <SeasonCareerPlan plan={seasonPlan} />
        <StrategicCareerPanel profile={profile} state={strategicState} onProfileUpdate={setProfile} />
        <PremiumQuickStats profile={profile} worldRank={worldRank} teamRank={teamRank} nextTournament={nextTournament} />
        <StatusStrip profile={profile} />

      {finalTutorialStep && (
        <section className="rounded-3xl border border-primary/35 bg-gradient-to-r from-primary/10 via-card to-card p-5" aria-labelledby="tutorial-finish-title">
          <div className="flex gap-3"><GraduationCap className="h-7 w-7 shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Etapa final do tutorial</p><h2 id="tutorial-finish-title" className="mt-1 text-xl font-black">Sua carreira está pronta para seguir</h2><p className="mt-2 text-sm text-muted-foreground">Escolha um objetivo sugerido ou confirme para administrar tudo livremente.</p></div></div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">{recommendations.map((item) => <Link key={item.id} to={item.route} className="rounded-xl bg-secondary/40 p-3 hover:bg-secondary"><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p></Link>)}</div>
          <button type="button" disabled={finishingTutorial} onClick={finishTutorial} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{finishingTutorial ? 'Concluindo...' : 'Começar carreira livre'}</button>
        </section>
      )}

      <MedicalStatusPanel profile={profile} onSkipRecovery={handleSkipInjury} skipping={skippingInjury} skipError={injurySkipError} skipSummary={injurySkipSummary} />
      <MedicalCenterPanel profile={profile} onProfileUpdate={setProfile} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.85fr)]">
        <div className="space-y-5">
          <NextStepCard profile={profile} upcomingTournaments={upcomingTournaments} />
          <SmartAgenda profile={profile} tournaments={upcomingTournaments} />
          {!isRetired(profile) && <CareerCalendar profile={profile} onAdvanceDay={setProfile} />}
          <WorldPulse snapshot={worldSnapshot} />
          <TournamentAndNews tournaments={upcomingTournaments} posts={posts} careerDate={profile.career_date} />
          <RecentActivity matches={recentMatches} trainings={recentTrainings} />
        </div>

        <aside className="space-y-5">
          <InboxControl messages={unreadMessages} pendingOffers={pendingOffers} profile={profile} onChoosePartner={() => setShowPartner(true)} />
          <EvolutionPanel profile={profile} attributes={top5} trainings={recentTrainings} />
          <ActiveMissionPanel missions={missions} progress={progress} />
          <CareerSnapshot profile={profile} worldRank={worldRank} teamRank={teamRank} />
        </aside>
      </div>

      {isRetired(profile) && <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">Você encerrou sua carreira como atleta. Continue acompanhando seu legado, conquistas e história.</div>}
      <CareerStatusBar profile={profile} onPartnerClick={() => profile.court_side && setShowPartner(true)} />

        {showPartner && <PartnerSelection profile={profile} onClose={() => setShowPartner(false)} onPartnerSelected={setProfile} />}
      </PageContent>
    </Page>
  );
}


function MyJourneyPanel({ profile, worldRank, teamRank, nextTournament, recentMatches, recentTrainings, messages, posts }) {
  const age = calculateAge(profile);
  const country = profile.country || profile.nationality || profile.country_name || 'Brasil';
  const objective = worldRank.rank && worldRank.rank <= 1
    ? 'Defender a liderança mundial'
    : worldRank.rank && worldRank.rank <= 10
      ? 'Chegar ao número 1'
      : worldRank.rank && worldRank.rank <= 20
        ? 'Entrar no Top 10'
        : worldRank.rank && worldRank.rank <= 100
          ? 'Entrar no Top 20'
          : worldRank.rank && worldRank.rank <= 500
            ? 'Entrar no Top 100'
            : 'Entrar no Top 500';
  const recentEvents = [
    ...recentMatches.slice(0, 2).map((match) => ({ id: `journey-match-${match.id}`, icon: Trophy, text: match.winner === 'A' || match.player_won ? 'Vitória registrada na última partida' : 'Última partida concluída', tone: 'text-amber-400' })),
    ...recentTrainings.slice(0, 2).map((training) => ({ id: `journey-training-${training.id}`, icon: Dumbbell, text: `${training.training_label || training.training_type || 'Treino'} concluído`, tone: 'text-cyan-400' })),
    ...messages.slice(0, 1).map((message) => ({ id: `journey-message-${message.id}`, icon: MessageCircle, text: message.title || message.subject || 'Nova comunicação da equipe', tone: 'text-primary' })),
    ...posts.slice(0, 1).map((post) => ({ id: `journey-post-${post.id}`, icon: Newspaper, text: post.title || 'Nova notícia no circuito', tone: 'text-violet-400' })),
  ].slice(0, 4);

  return (
    <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06] shadow-lg" aria-labelledby="my-journey-title">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary"><Flag className="h-4 w-4" />Minha jornada</div>
              <h2 id="my-journey-title" className="mt-2 text-2xl font-black sm:text-3xl">{profile.sport_name || profile.full_name || 'Seu atleta'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{country}{age ? ` · ${age} anos` : ''} · OVR {overallRating(profile)}</p>
            </div>
            <Link to="/profile" className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/55 px-3 py-2 text-xs font-bold hover:border-primary/30 hover:text-primary"><UserRound className="h-4 w-4" />Ver perfil</Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <JourneyMetric label="Ranking" value={worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+'} detail="individual" />
            <JourneyMetric label="Dupla" value={profile.partner_name || 'A definir'} detail={teamRank.rank ? `ranking #${teamRank.rank}` : 'sem ranking'} />
            <JourneyMetric label="Treinador" value={profile.coach_name || 'Formação'} detail="comando técnico" />
            <JourneyMetric label="Objetivo" value={objective} detail="próximo marco" />
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-background/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Próximo evento</p>
                <p className="mt-1 text-sm font-black">{nextTournament?.name || 'Semana de desenvolvimento'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{nextTournament ? `${daysUntil(profile.career_date, nextTournament.start_date)} dias · ${formatShortDate(nextTournament.start_date)}` : 'Treine, recupere e organize sua agenda.'}</p>
              </div>
              <Link to={nextTournament ? '/tournaments' : '/game/training'} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground">{nextTournament ? 'Preparar' : 'Treinar'}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </div>

        <div className="border-t border-border/55 bg-background/25 p-5 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Aconteceu recentemente</p><p className="mt-1 text-sm font-black">Resumo da jornada</p></div>
            <Link to="/game/legacy" className="text-xs font-bold text-primary">Linha do tempo</Link>
          </div>
          <div className="mt-4 space-y-2.5">
            {recentEvents.length ? recentEvents.map((event) => { const Icon = event.icon; return <div key={event.id} className="flex gap-3 rounded-xl bg-card/60 p-3"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${event.tone}`} /><p className="text-xs font-semibold leading-relaxed">{event.text}</p></div>; }) : <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Sua história está começando. O primeiro marco aparecerá aqui.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function JourneyMetric({ label, value, detail }) {
  return <div className="min-w-0 rounded-2xl border border-border/55 bg-background/35 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-black">{value}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p></div>;
}

function CareerFeed({ recentMatches, recentTrainings, messages, posts, partnerOffers }) {
  const items = [
    ...partnerOffers.slice(0, 2).map((offer) => ({ id: `feed-offer-${offer.id}`, icon: Users, title: offer.candidate_name || offer.player_name || 'Proposta de dupla', description: 'Um atleta quer conversar sobre uma parceria.', to: '/partners?view=offers', priority: 4, time: offer.created_date })),
    ...messages.slice(0, 4).map((message) => ({ id: `feed-message-${message.id}`, icon: MessageCircle, title: message.title || message.subject || message.sender_name || 'Comunicação', description: message.content || message.body || message.message || 'Sua equipe enviou uma atualização.', to: message.action_route || '/communications', priority: message.requires_action ? 5 : 3, time: message.created_date })),
    ...recentMatches.slice(0, 3).map((match) => ({ id: `feed-match-${match.id}`, icon: Gamepad2, title: match.winner === 'A' || match.player_won ? 'Vitória da dupla' : 'Partida concluída', description: `${(match.team_a || []).join(' & ') || 'Sua dupla'} ${match.score_a ?? ''}-${match.score_b ?? ''} ${(match.team_b || []).join(' & ') || 'Adversários'}`.trim(), to: '/game/stats', priority: 2, time: match.created_date })),
    ...recentTrainings.slice(0, 3).map((training) => ({ id: `feed-training-${training.id}`, icon: Dumbbell, title: training.training_label || training.training_type || 'Treino concluído', description: `+${training.attribute_gain || 0} ${training.attribute_target || 'progresso'} · +${training.xp_reward || 0} XP`, to: '/game/training', priority: 1, time: training.created_date })),
    ...posts.slice(0, 2).map((post) => ({ id: `feed-post-${post.id}`, icon: Newspaper, title: post.title || 'Notícia do circuito', description: post.content || post.body || 'Confira a atualização do mundo do padel.', to: '/journal', priority: 1, time: post.created_date })),
  ].sort((a, b) => (new Date(b.time || 0) - new Date(a.time || 0)) || b.priority - a.priority).slice(0, 8);

  return (
    <section className="rounded-3xl border border-border/60 bg-card/55 p-4 sm:p-5" aria-labelledby="career-feed-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary"><Radio className="h-4 w-4" />Feed da carreira</div><h2 id="career-feed-title" className="mt-1 text-lg font-black">Tudo que importa, em ordem</h2></div>
        <div className="flex gap-2"><Link to="/communications" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Comunicações</Link><Link to="/world" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">Mundo</Link></div>
      </div>
      {items.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{items.map((item) => { const Icon = item.icon; return <Link key={item.id} to={item.to} className="group flex min-w-0 gap-3 rounded-2xl border border-transparent bg-secondary/25 p-3 transition hover:border-primary/20 hover:bg-secondary/50"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.description}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" /></Link>; })}</div> : <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-center"><ClipboardList className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 text-xs font-bold">Nenhum acontecimento recente</p><p className="mt-1 text-[10px] text-muted-foreground">Avance a carreira, treine ou jogue para alimentar seu feed.</p></div>}
    </section>
  );
}

function CareerCommandHeader({ profile, careerExperience, overall, worldRank, nextTournament, unreadCount }) {
  const daysToTournament = nextTournament ? daysUntil(profile.career_date, nextTournament.start_date) : null;
  const primaryContext = profile.injury_status === 'injured' || profile.is_injured
    ? { eyebrow: 'Recuperação prioritária', title: 'Cuide do corpo antes de voltar à quadra', description: 'Seu calendário e plano automático respeitarão o período de recuperação.', tone: 'danger', icon: HeartPulse }
    : nextTournament
      ? { eyebrow: 'Próximo grande objetivo', title: nextTournament.name, description: `${daysToTournament} dia${daysToTournament === 1 ? '' : 's'} para preparar a dupla`, tone: 'premium', icon: Trophy }
      : { eyebrow: 'Semana de desenvolvimento', title: 'Construa a próxima evolução', description: 'Aproveite a agenda livre para treinar, recuperar e planejar.', tone: 'brand', icon: Sparkles };

  return (
    <PageHeader
      eyebrow={primaryContext.eyebrow}
      title={primaryContext.title}
      description={`${profile.sport_name || 'Atleta'} · OVR ${overall} · Experiência ${careerExperience.level}/${careerExperience.maxLevel}. ${primaryContext.description}`}
      icon={primaryContext.icon}
      tone={primaryContext.tone}
      breadcrumb={['Carreira', 'Centro de controle']}
      stats={[
        <StatusBadge key="ranking" tone="premium" icon={Crown}>Ranking {worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+'}</StatusBadge>,
        <StatusBadge key="date" tone="info" icon={CalendarDays}>{profile.career_date || '—'}</StatusBadge>,
        unreadCount > 0 ? <StatusBadge key="pending" tone="danger" icon={Bell}>{unreadCount} pendência{unreadCount === 1 ? '' : 's'}</StatusBadge> : null,
      ].filter(Boolean)}
      action={<div className="flex flex-wrap gap-2"><CommandLink to="/game/training" icon={Dumbbell}>Treinar</CommandLink><CommandLink to="/game/calendar" icon={CalendarDays}>Agenda</CommandLink><CommandLink to="/tournaments" icon={Trophy}>Competir</CommandLink></div>}
    />
  );
}

function PremiumQuickStats({ profile, worldRank, teamRank, nextTournament }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <PremiumStatCard label="Energia" value={`${Math.round(Number(profile.energy) || 0)}%`} detail="disponível hoje" icon={Zap} tone={(Number(profile.energy) || 0) < 35 ? 'danger' : 'success'} />
      <PremiumStatCard label="Fadiga" value={`${Math.round(Number(profile.fatigue) || 0)}%`} detail="carga acumulada" icon={HeartPulse} tone={(Number(profile.fatigue) || 0) > 65 ? 'danger' : 'warning'} />
      <PremiumStatCard label="Ranking individual" value={worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+'} detail={`${worldRank.total || 1000} atletas`} icon={Crown} tone="premium" />
      <PremiumStatCard label="Ranking da dupla" value={teamRank.rank ? `#${teamRank.rank}` : 'Sem ranking'} detail="circuito de duplas" icon={Users} tone="info" />
      <PremiumStatCard label="Próximo marco" value={nextTournament ? formatShortDate(nextTournament.start_date) : 'Semana livre'} detail={nextTournament?.name || 'foco em evolução'} icon={nextTournament ? Trophy : Clock3} tone="brand" className="col-span-2 lg:col-span-1" />
    </div>
  );
}

function CommandLink({ to, icon: Icon, children }) {
  return <Link to={to} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"><Icon className="h-3.5 w-3.5" />{children}</Link>;
}

function InboxControl({ messages, pendingOffers, profile, onChoosePartner }) {
  const rows = [...pendingOffers.map((offer) => ({ id: `offer-${offer.id}`, title: offer.candidate_name || offer.player_name || 'Nova proposta de dupla', body: 'Um atleta demonstrou interesse em jogar com você.', type: 'offer' })), ...messages.map((message) => ({ id: `message-${message.id}`, title: message.title || message.subject || message.sender_name || 'Nova mensagem', body: message.content || message.body || message.message || '', type: 'message' }))].slice(0, 5);
  return <GlassCard className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 p-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Comunicação</p><h2 className="font-black">Mensagens e dupla</h2></div><span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{rows.length}</span></div><div className="p-3">{rows.length ? <div className="space-y-2">{rows.map((row) => <Link key={row.id} to={row.type === 'offer' ? '/partners?view=offers' : '/communications'} className="group flex gap-3 rounded-xl bg-secondary/30 p-3 hover:bg-secondary/60"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">{row.type === 'offer' ? <Users className="h-4 w-4 text-primary" /> : <Inbox className="h-4 w-4 text-cyan-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{row.title}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{row.body}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></Link>)}</div> : <div className="py-5 text-center"><MessageCircle className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 text-xs font-semibold">Nenhuma pendência nova</p><p className="mt-1 text-[10px] text-muted-foreground">Sua caixa de entrada está organizada.</p></div>}<div className="mt-3 grid grid-cols-2 gap-2"><Link to="/communications" className="rounded-xl bg-secondary px-3 py-2 text-center text-xs font-bold">Comunicações</Link><button type="button" onClick={onChoosePartner} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{profile.partner_id ? 'Gerenciar dupla' : 'Escolher dupla'}</button></div></div></GlassCard>;
}

function EvolutionPanel({ profile, attributes, trainings }) {
  const max = Math.max(1, ...attributes.map((item) => Number(item.value) || 0));
  const totalGain = trainings.reduce((sum, row) => sum + (Number(row.attribute_gain) || 0), 0);
  return <GlassCard><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Desenvolvimento</p><h2 className="font-black">Evolução do atleta</h2></div><Link to="/profile" className="text-xs font-bold text-primary">Detalhes</Link></div><div className="mt-4 space-y-3">{attributes.map((attr) => { const Icon = getAttributeIcon(attr.icon); return <div key={attr.key}><div className="mb-1 flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-primary" /><span className="flex-1 text-xs font-medium">{attr.label}</span><strong className="text-xs tabular-nums">{attr.value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-gradient-to-r from-primary/55 to-primary transition-all duration-700" style={{ width: `${Math.max(5, ((Number(attr.value) || 0) / max) * 100)}%` }} /></div></div>; })}</div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-secondary/30 p-3"><TrendingUp className="h-4 w-4 text-emerald-400" /><p className="mt-1 text-lg font-black">+{totalGain.toFixed(totalGain % 1 ? 1 : 0)}</p><p className="text-[9px] uppercase text-muted-foreground">ganho recente</p></div><div className="rounded-xl bg-secondary/30 p-3"><Dumbbell className="h-4 w-4 text-cyan-400" /><p className="mt-1 text-lg font-black">{trainings.length}</p><p className="text-[9px] uppercase text-muted-foreground">treinos recentes</p></div></div><Link to="/game/training" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Planejar próximo treino <ArrowRight className="h-3.5 w-3.5" /></Link></GlassCard>;
}

function ActiveMissionPanel({ missions, progress }) {
  const active = missions.slice(0, 4);
  return <SectionCard title="Objetivos em andamento" icon={Target} action={<Link to="/game/missions" className="text-xs font-bold text-primary">Ver missões</Link>}>{active.length ? <div className="space-y-3">{active.map((mission) => { const row = progress[mission.id]; const current = Number(row?.progress) || 0; const target = Math.max(1, Number(mission.target_count) || 1); return <div key={mission.id}><div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">{mission.title}</span><span className="text-[10px] tabular-nums text-muted-foreground">{current}/{target}</span></div><ProgressBar value={current} max={target} /></div>; })}</div> : <EmptyState icon={Target} message="Nenhuma missão ativa." />}</SectionCard>;
}

function CareerSnapshot({ profile, worldRank, teamRank }) {
  return <div className="grid grid-cols-2 gap-3"><StatCard icon={Gamepad2} label="Partidas" value={profile.matches_played || 0} /><StatCard icon={Trophy} label="Vitórias" value={profile.wins || 0} accent="text-amber-400" /><StatCard icon={Target} label="Aproveit." value={`${winRate(profile)}%`} accent="text-cyan-400" /><StatCard icon={Crown} label="Ranking dupla" value={teamRank.rank ? `#${teamRank.rank}` : '—'} accent="text-purple-400" /><Link to="/ranking" className="col-span-2 flex items-center justify-between rounded-2xl border border-border/60 bg-card/50 p-3 text-xs font-bold hover:border-primary/30"><span>Ranking mundial: {worldRank.rank ? `#${worldRank.displayRank || worldRank.rank} de ${worldRank.total}` : 'ainda sem posição'}</span><ChevronRight className="h-4 w-4 text-primary" /></Link></div>;
}


function WorldPulse({ snapshot }) {
  const featured = snapshot?.bulletin || snapshot?.breaking;
  if (!featured) return null;
  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary"><Globe2 className="h-4 w-4" />Mundo em movimento</div>
          <h2 className="mt-2 text-base font-black">{featured.title}</h2>
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{featured.content || featured.description}</p>
        </div>
        <Link to="/world" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-bold hover:bg-secondary/80">Abrir <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </section>
  );
}

function TournamentAndNews({ tournaments, posts, careerDate }) {
  return <div className="grid gap-5 lg:grid-cols-2"><GlassCard><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Agenda competitiva</p><h2 className="font-black">Próximos torneios</h2></div><Link to="/tournaments" className="text-xs font-bold text-primary">Ver todos</Link></div><div className="mt-3 space-y-2">{tournaments.length ? tournaments.slice(0, 4).map((tournament) => <Link key={tournament.id} to="/tournaments" className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3 hover:bg-secondary/55"><div className="w-12 text-center"><p className="text-[9px] uppercase text-muted-foreground">{formatMonth(tournament.start_date)}</p><p className="text-xl font-black">{formatDay(tournament.start_date)}</p></div><div className="h-9 w-px bg-border" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{tournament.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{daysUntil(careerDate, tournament.start_date)} dias · {tournament.tier || tournament.category || 'Circuito'}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>) : <EmptyState icon={Trophy} message="Nenhum torneio disponível no momento." />}</div></GlassCard><GlassCard><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Mundo vivo</p><h2 className="font-black">Notícias do circuito</h2></div><Link to="/journal" className="text-xs font-bold text-primary">Abrir jornal</Link></div><div className="mt-3 space-y-2">{posts.length ? posts.slice(0, 4).map((post) => <Link key={post.id} to="/journal" className="block rounded-xl bg-secondary/30 p-3 hover:bg-secondary/55"><div className="flex items-center gap-2"><Newspaper className="h-3.5 w-3.5 text-cyan-400" /><p className="truncate text-xs font-bold">{post.title || post.author_name || 'Notícia do circuito'}</p></div><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{post.content || post.body || 'Acompanhe os acontecimentos mais recentes.'}</p></Link>) : <EmptyState icon={Newspaper} message="O circuito está tranquilo por enquanto." />}</div></GlassCard></div>;
}

function RecentActivity({ matches, trainings }) {
  return <GlassCard><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Linha do tempo</p><h2 className="font-black">Atividade recente</h2></div><div className="flex gap-2"><Link to="/matches" className="text-xs font-bold text-primary">Partidas</Link><Link to="/game/training" className="text-xs font-bold text-primary">Treinos</Link></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Últimas partidas</p>{matches.length ? <div className="space-y-2">{matches.slice(0, 4).map((match) => <div key={match.id} className="flex items-center gap-3 rounded-xl bg-secondary/25 p-2.5"><div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black ${match.winner === 'A' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>{match.winner === 'A' ? 'V' : 'D'}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{(match.team_a || []).join(' & ') || 'Sua dupla'}</p><p className="truncate text-[10px] text-muted-foreground">vs {(match.team_b || []).join(' & ') || 'Adversários'}</p></div><span className="text-xs font-black tabular-nums">{match.score_a}-{match.score_b}</span></div>)}</div> : <EmptyState icon={Activity} message="Nenhuma partida disputada." />}</div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Últimos treinos</p>{trainings.length ? <div className="space-y-2">{trainings.slice(0, 4).map((training) => <div key={training.id} className="flex items-center gap-3 rounded-xl bg-secondary/25 p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10"><Dumbbell className="h-3.5 w-3.5 text-cyan-400" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{training.training_label || training.training_type || 'Treino concluído'}</p><p className="text-[10px] text-muted-foreground">+{training.attribute_gain || 0} {training.attribute_target || 'progresso'} · +{training.xp_reward || 0} XP de carreira</p></div></div>)}</div> : <EmptyState icon={Dumbbell} message="Nenhum treino registrado." />}</div></div></GlassCard>;
}

function formatShortDate(value) { if (!value) return '—'; const date = new Date(`${value}T00:00:00`); return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }
function formatMonth(value) { if (!value) return '—'; return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); }
function formatDay(value) { if (!value) return '—'; return new Date(`${value}T00:00:00`).getDate(); }
function daysUntil(from, to) { if (!from || !to) return 0; return Math.max(0, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000)); }
