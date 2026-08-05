import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, ArrowRight, Bell, CalendarDays, CheckCircle2,
  ChevronRight, Crown, Dumbbell, Gamepad2, GraduationCap,
  Inbox, MessageCircle, Newspaper, Target, Trophy, TrendingUp, Users, Zap,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  ensureMyProfile, incrementMissionProgress, careerExperienceSummary, overallRating, winRate,
  getWorldRank, topAttributes, calculateAge, isRetired,
} from '@/lib/padel';
import { LevelBadge, StatCard, getAttributeIcon } from '@/components/padel/Shared';
import { CoinBadge, XpBar, SectionCard, EmptyState, ProgressBar } from '@/components/padel/GameShared';
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
    const warning = `Avançar ${days} dia${days === 1 ? '' : 's'} até a recuperação?\n\nTorneios, rankings, despesas, agenda, notícias, contratos e missões continuarão sendo processados. O avanço será interrompido antes de qualquer torneio ou decisão obrigatória.`;
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

        const [matches, missionsData, rank, trainings, prog, teamRankings, upcoming, latestPosts, inboxRows, offerRows] = await Promise.all([
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
        ]);
        if (!mounted) return;

        setRecentMatches(matches || []);
        setMissions(missionsData || []);
        setWorldRank(rank || { rank: 0, total: 0 });
        setRecentTrainings((trainings || []).slice(0, 6));
        setPosts(latestPosts || []);
        setMessages(inboxRows || []);
        setPartnerOffers(offerRows || []);

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

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 md:px-6 lg:px-8 animate-fade-in">
      <CareerCommandHeader profile={profile} careerExperience={careerExperience} overall={ovr} worldRank={worldRank} nextTournament={nextTournament} unreadCount={unreadMessages.length + pendingOffers.length} />
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
          {!isRetired(profile) && <CareerCalendar profile={profile} onAdvanceDay={setProfile} />}
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
    </div>
  );
}

function CareerCommandHeader({ profile, careerExperience, overall, worldRank, nextTournament, unreadCount }) {
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-card via-card to-primary/[0.08] p-5 shadow-2xl shadow-black/20 md:p-7">
      <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-primary/30 bg-primary/15 text-3xl font-black text-primary md:h-24 md:w-24">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : (profile.sport_name || 'J')[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-bold uppercase tracking-[.28em] text-primary">Centro de controle da carreira</p><LevelBadge level={`Experiência ${careerExperience.level}/${careerExperience.maxLevel}`} size="md" /></div>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight md:text-4xl">{profile.sport_name || 'Jogador'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{profile.city || '—'}, {profile.country || '—'} · {calculateAge(profile)} anos · {profile.career_date || '—'}</p>
            <div className="mt-3 max-w-sm"><XpBar xp={profile.xp || 0} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[520px]">
          <HeaderMetric label="Overall" value={overall} icon={Zap} accent="text-primary" />
          <HeaderMetric label="Ranking" value={worldRank.rank ? `#${worldRank.displayRank || worldRank.rank}` : '—'} icon={Crown} accent="text-amber-400" />
          <HeaderMetric label="Próximo torneio" value={nextTournament ? formatShortDate(nextTournament.start_date) : 'Livre'} icon={Trophy} accent="text-cyan-400" />
          <HeaderMetric label="Pendências" value={unreadCount} icon={Bell} accent={unreadCount ? 'text-rose-400' : 'text-muted-foreground'} />
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <CoinBadge coins={profile.coins || 0} size="md" />
        <div className="flex flex-wrap gap-2">
          <CommandLink to="/game/training" icon={Dumbbell}>Treinar</CommandLink>
          <CommandLink to="/tournaments" icon={Trophy}>Torneios</CommandLink>
          <CommandLink to="/partners" icon={Users}>Dupla</CommandLink>
          <CommandLink to="/game/calendar" icon={CalendarDays}>Calendário</CommandLink>
        </div>
      </div>
    </header>
  );
}

function HeaderMetric({ label, value, icon: Icon, accent }) {
  return <div className="rounded-2xl border border-white/8 bg-black/15 p-3"><Icon className={`h-4 w-4 ${accent}`} /><p className="mt-2 truncate text-xl font-black tabular-nums">{value}</p><p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p></div>;
}

function CommandLink({ to, icon: Icon, children }) {
  return <Link to={to} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"><Icon className="h-3.5 w-3.5" />{children}</Link>;
}

function InboxControl({ messages, pendingOffers, profile, onChoosePartner }) {
  const rows = [...pendingOffers.map((offer) => ({ id: `offer-${offer.id}`, title: offer.candidate_name || offer.player_name || 'Nova proposta de dupla', body: 'Um atleta demonstrou interesse em jogar com você.', type: 'offer' })), ...messages.map((message) => ({ id: `message-${message.id}`, title: message.subject || message.sender_name || 'Nova mensagem', body: message.body || message.message || '', type: 'message' }))].slice(0, 5);
  return <GlassCard className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border/60 p-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Comunicação</p><h2 className="font-black">Mensagens e dupla</h2></div><span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{rows.length}</span></div><div className="p-3">{rows.length ? <div className="space-y-2">{rows.map((row) => <Link key={row.id} to={row.type === 'offer' ? '/partners?view=offers' : '/partners?view=inbox'} className="group flex gap-3 rounded-xl bg-secondary/30 p-3 hover:bg-secondary/60"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">{row.type === 'offer' ? <Users className="h-4 w-4 text-primary" /> : <Inbox className="h-4 w-4 text-cyan-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{row.title}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{row.body}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></Link>)}</div> : <div className="py-5 text-center"><MessageCircle className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 text-xs font-semibold">Nenhuma pendência nova</p><p className="mt-1 text-[10px] text-muted-foreground">Sua caixa de entrada está organizada.</p></div>}<div className="mt-3 grid grid-cols-2 gap-2"><Link to="/partners?view=inbox" className="rounded-xl bg-secondary px-3 py-2 text-center text-xs font-bold">Caixa de entrada</Link><button type="button" onClick={onChoosePartner} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{profile.partner_id ? 'Gerenciar dupla' : 'Escolher dupla'}</button></div></div></GlassCard>;
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
