import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Crown, Trophy, Medal, Star, TrendingUp, Flame, Swords, Lock, Check, Award, Target, Zap, Calendar, GraduationCap, Flag, UserPlus } from 'lucide-react';
import { PageContainer, PageHeader, GlassCard, EmptyStateCard, LoadingScreen, InfoBanner, PrimaryButton } from '@/components/padel/ui';
import { StatCard } from '@/components/padel/Shared';
import { calculateAge, isRetired, RETIREMENT_AGE, STARTING_AGE, overallRating, winRate, levelForXp } from '@/lib/padel';
import { computeLegacyScore, computeLegacyBonuses, retireProfile, startNewCareer, getUserLegacies, getCoachLegacy } from '@/lib/legacy';
import RetirementModal from '@/components/legacy/RetirementModal';
import NewAthleteModal from '@/components/legacy/NewAthleteModal';
import HallOfFame from '@/components/legacy/HallOfFame';
import FamilyTree from '@/components/legacy/FamilyTree';
import CareerTimeline from '@/components/legacy/CareerTimeline';
import LegacyBonusesCard from '@/components/legacy/LegacyBonusesCard';

const ICON_MAP = { Crown, Trophy, Medal, Star, TrendingUp, Flame, Swords, Award, Target, Zap, Calendar };

const DEFAULT_ACHIEVEMENTS = [
  { name: 'Estreia', description: 'Jogue sua primeira partida', icon: 'Swords', rarity: 'comum', metric: 'matches_played', threshold: 1 },
  { name: 'Guerreiro', description: 'Vença 10 partidas', icon: 'Trophy', rarity: 'comum', metric: 'wins', threshold: 10 },
  { name: 'Invencível', description: 'Vença 50 partidas', icon: 'Trophy', rarity: 'épico', metric: 'wins', threshold: 50 },
  { name: 'Cem Batalhas', description: 'Jogue 100 partidas', icon: 'Swords', rarity: 'raro', metric: 'matches_played', threshold: 100 },
  { name: 'Primeiro Título', description: 'Vença seu primeiro torneio', icon: 'Crown', rarity: 'raro', metric: 'tournaments_won', threshold: 1 },
  { name: 'Dinastia', description: 'Vença 5 torneios', icon: 'Crown', rarity: 'épico', metric: 'tournaments_won', threshold: 5 },
  { name: 'Lenda Viva', description: 'Vença 10 torneios', icon: 'Crown', rarity: 'lendário', metric: 'tournaments_won', threshold: 10 },
  { name: 'Em Ascensão', description: 'Alcance o nível Amador', icon: 'Star', rarity: 'comum', metric: 'xp', threshold: 500 },
  { name: 'Competitivo', description: 'Alcance o nível Competitivo', icon: 'Target', rarity: 'raro', metric: 'xp', threshold: 3000 },
  { name: 'Avançado', description: 'Alcance o nível Avançado', icon: 'TrendingUp', rarity: 'épico', metric: 'xp', threshold: 10000 },
  { name: 'Elite', description: 'Alcance o nível Elite', icon: 'Flame', rarity: 'épico', metric: 'xp', threshold: 25000 },
  { name: 'Lenda', description: 'Alcance o nível máximo', icon: 'Crown', rarity: 'lendário', metric: 'xp', threshold: 50000 },
];

const RARITY_STYLES = {
  'comum': { border: 'border-slate-500/30', bg: 'from-slate-500/10 to-transparent', text: 'text-slate-300' },
  'raro': { border: 'border-blue-500/30', bg: 'from-blue-500/10 to-transparent', text: 'text-blue-300' },
  'épico': { border: 'border-purple-500/30', bg: 'from-purple-500/10 to-transparent', text: 'text-purple-300' },
  'lendário': { border: 'border-amber-500/40', bg: 'from-amber-500/10 to-transparent', text: 'text-amber-300' },
};

const MILESTONES = [
  { label: 'Estreia', description: 'Primeira partida', icon: Swords, check: (p) => (p.matches_played || 0) >= 1 },
  { label: 'Primeira Vitória', description: 'Primeira vitória', icon: Trophy, check: (p) => (p.wins || 0) >= 1 },
  { label: 'Primeiro Título', description: 'Primeiro torneio', icon: Crown, check: (p) => (p.tournaments_won || 0) >= 1 },
  { label: 'Amador', description: 'Nível Amador', icon: Star, check: (p) => (p.xp || 0) >= 500 },
  { label: 'Competitivo', description: 'Nível Competitivo', icon: Target, check: (p) => (p.xp || 0) >= 3000 },
  { label: 'Avançado', description: 'Nível Avançado', icon: TrendingUp, check: (p) => (p.xp || 0) >= 10000 },
  { label: 'Elite', description: 'Nível Elite', icon: Flame, check: (p) => (p.xp || 0) >= 25000 },
  { label: 'Lenda', description: 'Nível máximo', icon: Crown, check: (p) => (p.xp || 0) >= 50000 },
];

function isAchievementUnlocked(a, profile) {
  return (profile?.[a.metric] || 0) >= a.threshold;
}

export default function Legacy() {
  const [profile, setProfile] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [legacies, setLegacies] = useState([]);
  const [coachLegacy, setCoachLegacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRetirement, setShowRetirement] = useState(false);
  const [showNewAthlete, setShowNewAthlete] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const user = await localGame.auth.me();
        const profiles = await localGame.entities.PlayerProfile.filter({ created_by_id: user.id });
        const p = profiles?.[0];
        if (p) {
          setProfile(p);
          const userLegacies = await getUserLegacies(user.id);
          setLegacies(userLegacies);
          if (p.coach_legacy_id) {
            const coach = await getCoachLegacy(p.coach_legacy_id);
            setCoachLegacy(coach);
          }
        }
        let ach = await localGame.entities.Achievement.list();
        if (!ach || ach.length === 0) ach = DEFAULT_ACHIEVEMENTS;
        setAchievements(ach);
      } catch (e) {
        setAchievements(DEFAULT_ACHIEVEMENTS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingScreen />;
  if (!profile) return <EmptyStateCard icon={Crown} message="Crie seu perfil para começar seu legado." />;

  const retired = isRetired(profile);
  const age = calculateAge(profile);
  const generation = profile.legacy_generation || 1;
  const legacyScore = computeLegacyScore(profile);
  const currentLegacy = legacies.find(l => l.generation === generation);
  const hasLegacyRecord = !!currentLegacy;
  const canStartNewCareer = retired && hasLegacyRecord;
  const previewBonuses = computeLegacyBonuses({ ...profile, generation, legacy_score: legacyScore, sport_name: profile.sport_name });
  const unlockedMilestones = MILESTONES.filter(m => m.check(profile)).length;
  const unlockedAchievements = achievements.filter(a => isAchievementUnlocked(a, profile)).length;
  const ageProgress = Math.min(100, Math.round(((age - STARTING_AGE) / (RETIREMENT_AGE - STARTING_AGE)) * 100));

  async function handleRetire() {
    const legacy = await retireProfile(profile);
    if (!currentLegacy) setLegacies([...legacies, legacy]);
    setProfile({ ...profile, retired: true });
    setShowRetirement(false);
  }

  async function handleStartNewCareer(name) {
    const updated = await startNewCareer(profile, currentLegacy, name);
    setProfile(updated);
    setShowNewAthlete(false);
  }

  return (
    <PageContainer>
      <PageHeader icon={Crown} title="Sistema de Legado" subtitle="Sua dinastia no padel" />

      <div className="space-y-5">
        {/* Generation badge */}
        {generation > 1 && (
          <InfoBanner variant="info" icon={GraduationCap}>
            Geração {generation} — herdeiro de {coachLegacy?.sport_name || 'seu treinador'}
          </InfoBanner>
        )}

        {/* Career status */}
        {!retired ? (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Flame className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-sm">Construindo Legado</h2>
                  <p className="text-xs text-muted-foreground">{age} anos · {RETIREMENT_AGE - age} anos até aposentadoria</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-primary tabular-nums">{ageProgress}%</span>
                <p className="text-[10px] text-muted-foreground uppercase">Carreira</p>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-secondary overflow-hidden mb-4">
              <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-700" style={{ width: `${ageProgress}%` }} />
            </div>
            <PrimaryButton onClick={() => setShowRetirement(true)} className="w-full">
              <Flag className="h-4 w-4" /> Encerrar Carreira
            </PrimaryButton>
          </GlassCard>
        ) : !hasLegacyRecord ? (
          <GlassCard className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent">
            <div className="flex flex-col items-center gap-3 text-center">
              <Crown className="h-10 w-10 text-amber-400" />
              <div>
                <h2 className="font-black text-lg text-amber-300">Carreira Encerrada</h2>
                <p className="text-sm text-muted-foreground">Consolide seu legado para registrar sua jornada permanentemente.</p>
              </div>
              <PrimaryButton onClick={handleRetire} className="bg-amber-500 hover:opacity-90">
                <Crown className="h-4 w-4" /> Consolidar Legado
              </PrimaryButton>
            </div>
          </GlassCard>
        ) : (
          <>
            <GlassCard className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Crown className="h-7 w-7 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h2 className="font-black text-lg text-amber-300">Legado Consolidado</h2>
                  <p className="text-sm text-muted-foreground">
                    Gen {generation} · {currentLegacy?.tournaments_won || 0} títulos · {currentLegacy?.wins || 0} vitórias · Score {legacyScore.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </GlassCard>
            <LegacyBonusesCard bonuses={previewBonuses} coachName={profile.sport_name} />
            <PrimaryButton onClick={() => setShowNewAthlete(true)} className="w-full">
              <UserPlus className="h-4 w-4" /> Iniciar Nova Carreira como Treinador
            </PrimaryButton>
          </>
        )}

        {/* Legacy score + stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-stagger">
          <StatCard icon={Award} label="Legado" value={legacyScore.toLocaleString('pt-BR')} accent="text-amber-400" />
          <StatCard icon={Crown} label="Títulos" value={profile.tournaments_won || 0} accent="text-amber-400" />
          <StatCard icon={Trophy} label="Vitórias" value={profile.wins || 0} />
          <StatCard icon={TrendingUp} label="Overall" value={overallRating(profile)} accent="text-cyan-400" />
        </div>

        {/* Hall of Fame */}
        <HallOfFame />

        {/* Family Tree */}
        <FamilyTree legacies={legacies} currentGeneration={generation} />

        {/* Career Timeline */}
        <CareerTimeline profile={profile} legacies={legacies} />

        {/* Trophy Room */}
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-400" /> Sala de Troféus
          </h2>
          {(!profile.titles?.length && !profile.medals?.length) ? (
            <EmptyStateCard icon={Trophy} message="Nenhum troféu conquistado ainda. Vença torneios!" />
          ) : (
            <div className="space-y-4">
              {profile.titles?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Títulos</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.titles.map((title, i) => (
                      <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                        <Crown className="h-3.5 w-3.5" /> {title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.medals?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Medalhas</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.medals.map((medal, i) => (
                      <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold">
                        <Medal className="h-3.5 w-3.5" /> {medal}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* Career Milestones */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Marcos da Carreira
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">{unlockedMilestones}/{MILESTONES.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MILESTONES.map((m) => {
              const unlocked = m.check(profile);
              const Icon = m.icon;
              return (
                <div key={m.label} className={`rounded-xl p-3 border flex items-center gap-3 transition-all ${unlocked ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-secondary/20 opacity-60'}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${unlocked ? 'bg-primary/15 text-primary' : 'bg-secondary/40 text-muted-foreground'}`}>
                    {unlocked ? <Check className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{m.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{m.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Achievements */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" /> Conquistas
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">{unlockedAchievements}/{achievements.length}</span>
          </div>
          {achievements.length === 0 ? (
            <EmptyStateCard icon={Award} message="Nenhuma conquista disponível." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {achievements.map((a, i) => {
                const unlocked = isAchievementUnlocked(a, profile);
                const rarity = RARITY_STYLES[a.rarity] || RARITY_STYLES['comum'];
                const Icon = ICON_MAP[a.icon] || Award;
                return (
                  <div key={i} className={`rounded-xl border bg-gradient-to-br p-3 flex flex-col items-center gap-1.5 text-center transition-all ${unlocked ? rarity.border + ' ' + rarity.bg : 'border-border/40 bg-secondary/20 opacity-50'}`}>
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${unlocked ? 'bg-background/40' : 'bg-secondary/40'}`}>
                      {unlocked ? <Icon className={`h-4 w-4 ${rarity.text}`} /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <span className="text-[10px] font-bold leading-tight">{a.name}</span>
                    <span className="text-[8px] uppercase tracking-wide opacity-60">{a.rarity}</span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Modals */}
      {showRetirement && (
        <RetirementModal profile={profile} legacyScore={legacyScore} onConfirm={handleRetire} onClose={() => setShowRetirement(false)} />
      )}
      {showNewAthlete && (
        <NewAthleteModal bonuses={previewBonuses} coachName={profile.sport_name} onConfirm={handleStartNewCareer} onClose={() => setShowNewAthlete(false)} />
      )}
    </PageContainer>
  );
}