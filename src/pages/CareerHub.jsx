import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Gamepad2, Trophy, Target, Dumbbell, TrendingUp, Activity, ChevronRight, Flame, Crown, Zap, ShoppingBag, Package, AlertCircle, MessageCircle, BarChart3, Calendar, Wallet } from 'lucide-react';

import { ensureMyProfile, levelForXp, overallRating, winRate, getWorldRank, topAttributes, calculateAge, isRetired } from '@/lib/padel';
import { LevelBadge, StatCard, getAttributeIcon } from '@/components/padel/Shared';
import { CoinBadge, XpBar, SectionCard, EmptyState, QuickLink, ProgressBar } from '@/components/padel/GameShared';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import CareerCalendar from '@/components/career/CareerCalendar';
import PartnerSelection from '@/components/career/PartnerSelection';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import NextStepCard from '@/components/career/NextStepCard';
import { LoadingScreen, EmptyStateCard } from '@/components/padel/ui';
import StatusStrip from '@/components/home/StatusStrip';
import RankingCards from '@/components/home/RankingCards';
import SeasonPanel from '@/components/home/SeasonPanel';
import UpcomingPanel from '@/components/home/UpcomingPanel';
import FeedPanel from '@/components/home/FeedPanel';
import MedicalStatusPanel from '@/components/career/MedicalStatusPanel';
import MedicalCenterPanel from '@/components/career/MedicalCenterPanel';

export default function CareerHub() {
  const [profile, setProfile] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [recentTrainings, setRecentTrainings] = useState([]);
  const [worldRank, setWorldRank] = useState({ rank: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showPartner, setShowPartner] = useState(false);
  const [teamRank, setTeamRank] = useState({ rank: 0, total: 0 });
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);

        const [matches, missionsData, rank] = await Promise.all([
          localGame.entities.Match.list('-created_date', 4),
          localGame.entities.Mission.filter({ is_active: true }),
          getWorldRank(p),
        ]);
        setRecentMatches(matches || []);
        setMissions(missionsData || []);
        setWorldRank(rank);

        if (p) {
          const [trainings, prog, teamRankings, upcoming, latestPosts] = await Promise.all([
            localGame.entities.TrainingSession.filter({ profile_id: p.id }),
            localGame.entities.MissionProgress.filter({ profile_id: p.id }),
            p.partner_id ? localGame.entities.TeamRanking.list('-ranking_points', 500) : Promise.resolve([]),
            localGame.entities.Tournament.filter({ status: 'inscricoes' }),
            localGame.entities.Post.list('-created_date', 3),
          ]);
          setRecentTrainings((trainings || []).slice(0, 4));
          const map = {};
          (prog || []).forEach(pr => { map[pr.mission_id] = pr; });
          setProgress(map);

          if (teamRankings && teamRankings.length > 0 && p.partner_id) {
            const teamKey = [p.id, p.partner_id].sort().join('_');
            const idx = teamRankings.findIndex(t => t.team_key === teamKey);
            setTeamRank({ rank: idx + 1, total: teamRankings.length });
          }

          const careerDate = p.career_date || '2026-01-01';
          const upcomingSorted = (upcoming || [])
            .filter(t => t.start_date && t.start_date >= careerDate)
            .sort((a, b) => a.start_date.localeCompare(b.start_date))
            .slice(0, 5);
          setUpcomingTournaments(upcomingSorted);

          setPosts(latestPosts || []);
        }

      } catch (e) { console.error('CareerHub', e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <EmptyStateCard
          icon={AlertCircle}
          title="Não foi possível carregar seu perfil"
          message="Verifique sua conexão e tente novamente. Se o problema persistir, faça login novamente."
        />
      </div>
    );
  }

  const level = levelForXp(profile?.xp || 0);
  const ovr = overallRating(profile);
  const top3 = topAttributes(profile).slice(0, 3);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Hero — Career header */}
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-7 grid-bg">
        <div className="absolute -top-12 -right-12 h-44 w-44 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative">
            <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-gradient-to-br from-primary/40 to-secondary overflow-hidden flex items-center justify-center shrink-0 ring-4 ring-primary/20">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-xs ring-4 ring-background">
              {levelIndex(profile?.xp)}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{profile?.sport_name || 'Jogador'}</h1>
              <LevelBadge level={level} size="md" />
            </div>
            <p className="text-sm text-muted-foreground">
              {profile?.city || '—'}, {profile?.country || '—'} · {calculateAge(profile)} anos
            </p>
            <div className="mt-3 max-w-xs">
              <XpBar xp={profile?.xp || 0} />
            </div>
          </div>
          <div className="flex md:flex-col gap-4 md:gap-2 md:items-end">
            <div className="text-center">
              <p className="text-3xl font-black text-primary text-glow tabular-nums">{ovr}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400 tabular-nums flex items-center gap-1 justify-center">
                <Crown className="h-5 w-5" />{worldRank.rank || '—'}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mundial</p>
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-between mt-4 pt-4 border-t border-border/40">
          <CoinBadge coins={profile?.coins || 0} size="md" />
          <Link to="/profile" className="text-xs text-primary font-medium flex items-center gap-1 hover:gap-2 transition-all">
            Ver perfil <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Status strip */}
      <StatusStrip profile={profile} />

      <MedicalStatusPanel profile={profile} />
      <MedicalCenterPanel profile={profile} onProfileUpdate={setProfile} />

      {/* Next step guidance */}
      <NextStepCard profile={profile} upcomingTournaments={upcomingTournaments} />

      {/* Retirement banner */}
      {isRetired(profile) && (
        <div className="glass rounded-2xl p-4 border border-amber-500/40 flex items-center gap-3 bg-amber-500/5">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200 flex-1">
            Você se aposentou aos 40 anos! Sua carreira como jogador profissional chegou ao fim, mas seu legado no padel é eterno.
          </p>
        </div>
      )}

      {/* Career calendar */}
      {!isRetired(profile) && <CareerCalendar profile={profile} onAdvanceDay={setProfile} />}

      {/* Ranking cards */}
      <RankingCards profile={profile} worldRank={worldRank} teamRank={teamRank} />

      {/* Season panel */}
      <SeasonPanel profile={profile} />

      {/* Career status */}
      <CareerStatusBar profile={profile} onPartnerClick={() => profile.court_side && setShowPartner(true)} />
      <PlayStyleSummary profile={profile} />

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-stagger">
        <StatCard icon={Gamepad2} label="Partidas" value={profile?.matches_played || 0} />
        <StatCard icon={Trophy} label="Vitórias" value={profile?.wins || 0} accent="text-amber-400" />
        <StatCard icon={Target} label="Aproveit." value={`${winRate(profile)}%`} accent="text-cyan-400" />
        <StatCard icon={Flame} label="Torneios" value={profile?.tournaments_won || 0} accent="text-purple-400" />
      </div>

      {/* Upcoming tournaments + sponsors */}
      <UpcomingPanel tournaments={upcomingTournaments} />

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 animate-stagger">
        <QuickLink to="/game/training" icon={Dumbbell} title="Treinar" subtitle="Evolua atributos" accent="primary" />
        <QuickLink to="/game/missions" icon={Target} title="Missões" subtitle="Ganhe recompensas" accent="amber" />
        <QuickLink to="/game/calendar" icon={Calendar} title="Calendário" subtitle="Agenda da carreira" accent="cyan" />
        <QuickLink to="/game/stats" icon={BarChart3} title="Estatísticas" subtitle="Análise de desempenho" accent="cyan" />
        <QuickLink to="/game/economy" icon={Wallet} title="Economia" subtitle="Patrocinadores e finanças" accent="cyan" />
        <QuickLink to="/game/shop" icon={ShoppingBag} title="Loja" subtitle="Compre equipamentos" accent="amber" />
        <QuickLink to="/game/inventory" icon={Package} title="Inventário" subtitle="Equipe seus itens" accent="purple" />
        <QuickLink to="/game/legacy" icon={Crown} title="Legado" subtitle="Seus troféus" accent="amber" />
        <QuickLink to="/community" icon={MessageCircle} title="Social" subtitle="Feed da comunidade" accent="purple" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Active missions */}
        <SectionCard title="Missões ativas" icon={Target} action={<Link to="/game/missions" className="text-xs text-primary font-medium">Ver tudo</Link>}>
          {missions.length === 0 ? (
            <EmptyState icon={Target} message="Nenhuma missão ativa." />
          ) : (
            <div className="space-y-3">
              {missions.slice(0, 3).map((m) => {
                const pr = progress[m.id];
                const current = pr?.progress || 0;
                const pct = m.target_count > 0 ? Math.min(100, Math.round((current / m.target_count) * 100)) : 0;
                return (
                  <div key={m.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate flex-1">{m.title}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums ml-2">{current}/{m.target_count}</span>
                    </div>
                    <ProgressBar value={current} max={m.target_count} />
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Top attributes */}
        <SectionCard title="Melhores atributos" icon={Zap} action={<Link to="/profile" className="text-xs text-primary font-medium">Ver tudo</Link>}>
          <div className="space-y-3">
            {top3.map((attr) => {
              const Icon = getAttributeIcon(attr.icon);
              return (
                <div key={attr.key} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-medium">{attr.label}</span>
                      <span className="text-xs font-black text-primary tabular-nums">{attr.value}</span>
                    </div>
                    <ProgressBar value={attr.value} max={100} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Recent matches */}
        <SectionCard title="Partidas recentes" icon={Activity} action={<Link to="/matches" className="text-xs text-primary font-medium">Ver tudo</Link>}>
          {recentMatches.length === 0 ? (
            <EmptyState icon={Activity} message="Nenhuma partida ainda." />
          ) : (
            <div className="space-y-2">
              {recentMatches.slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-black ${m.winner === 'A' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                    {m.winner === 'A' ? 'W' : 'L'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{(m.team_a || []).join(' & ')}</p>
                    <p className="text-[10px] text-muted-foreground">vs {(m.team_b || []).join(' & ')}</p>
                  </div>
                  <span className="text-xs font-black tabular-nums text-muted-foreground">{m.score_a}-{m.score_b}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recent evolution */}
        <SectionCard title="Evolução recente" icon={TrendingUp} action={<Link to="/game/training" className="text-xs text-primary font-medium">Treinar</Link>}>
          {recentTrainings.length === 0 ? (
            <EmptyState icon={Dumbbell} message="Nenhum treino ainda. Comece a evoluir!" />
          ) : (
            <div className="space-y-2">
              {recentTrainings.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Dumbbell className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{t.training_label}</p>
                    <p className="text-[10px] text-muted-foreground">+{t.attribute_gain} {t.attribute_target} · +{t.xp_reward} XP</p>
                  </div>
                  <CoinBadge coins={t.coins_reward} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* News + messages + notifications */}
      <FeedPanel posts={posts} profile={profile} upcomingTournaments={upcomingTournaments} />

      {showPartner && (
        <PartnerSelection
          profile={profile}
          onClose={() => setShowPartner(false)}
          onPartnerSelected={setProfile}
        />
      )}

    </div>
  );
}

function levelIndex(xp) {
  const levels = [0, 200, 700, 1500, 3000, 5000];
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i]) return i + 1;
  }
  return 1;
}
