import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Dumbbell, FastForward, Heart, Activity, Calendar, TrendingUp, Target, Check, AlertCircle, Users } from 'lucide-react';
import { ensureMyProfile, formatDate, isInjured, injuryRecoveryDays, isRetired, MAX_ENERGY, DAILY_TRAINING_LIMIT } from '@/lib/padel';
import { daysBetween, CAREER_START_DATE, advanceDay } from '@/lib/career';
import { simulateProRankingWeek } from '@/lib/teamRanking';
import { SectionCard, EmptyState, ProgressBar, CoinBadge } from '@/components/padel/GameShared';
import { LoadingScreen, InfoBanner, EmptyStateCard } from '@/components/padel/ui';
import { TRAINING_ACTIVITIES, TRAINING_CATEGORIES, CATEGORY_ORDER, executeTraining, getWeeklyTrainingCounts, getOvertrainingStatus, getConditionScore } from '@/lib/trainingSystemV2';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import TrainingTimerModal from '@/components/training/TrainingTimerModal';
import ConditionPanel from '@/components/training/ConditionPanel';
import TrainingActivityCard from '@/components/training/TrainingActivityCard';
import WeeklyPlanner from '@/components/training/WeeklyPlanner';
import AttributeEvolution from '@/components/training/AttributeEvolution';
import DevelopmentGoals from '@/components/training/DevelopmentGoals';

const TABS = [
  { id: 'treino', label: 'Treino', icon: Dumbbell },
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'evolucao', label: 'Evolução', icon: TrendingUp },
  { id: 'metas', label: 'Metas', icon: Target },
  { id: 'historico', label: 'Histórico', icon: Activity },
];

export default function Training() {
  const [profile, setProfile] = useState(null);
  const [coach, setCoach] = useState(null);
  const [history, setHistory] = useState([]);
  const [weeklyCounts, setWeeklyCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTraining, setActiveTraining] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [activeTab, setActiveTab] = useState('treino');
  const [activeCategory, setActiveCategory] = useState('court');
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      if (p) {
        const [sessions, counts] = await Promise.all([
          localGame.entities.TrainingSession.filter({ profile_id: p.id }),
          getWeeklyTrainingCounts(p.id, p.career_date),
        ]);
        setHistory((sessions || []).sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')));
        setWeeklyCounts(counts || {});

        // Fetch coach for training bonuses
        if (p.coach_id) {
          try {
            const c = await localGame.entities.Coach.get(p.coach_id);
            setCoach(c);
          } catch { /* coach may not exist */ }
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleExecute(activity, intensityId) {
    if (!profile) return;
    if (isRetired(profile)) {
      toast({ title: 'Aposentado', description: 'Sua carreira como jogador terminou.', variant: 'destructive' });
      return;
    }
    if (isInjured(profile)) {
      toast({ title: 'Lesionado', description: `Recupera em ${injuryRecoveryDays(profile)} dias.`, variant: 'destructive' });
      return;
    }
    // Open timer modal — actual execution happens on complete
    setActiveTraining({ activity, intensityId });
  }

  async function doTraining(activity, intensityId) {
    setBusy(activity.id);
    try {
      const coachBonus = coach?.training_bonus || {};
      const res = await executeTraining(profile, activity, intensityId, coachBonus);
      if (res.error) {
        toast({ title: 'Não foi possível treinar', description: res.error, variant: 'destructive' });
        setResult({ error: res.error });
        return;
      }
      setProfile(res.profile);
      setResult({
        type: 'training',
        activity: res.activity,
        intensity: res.intensity,
        gain: res.gain,
        gains: res.gains,
        injured: res.injured,
        recoveryDays: res.recoveryDays,
        diminishing: res.diminishing,
        fatiguePenalty: res.fatiguePenalty,
      });

      if (res.injured) {
        toast({ title: 'Lesão!', description: `Você se lesionou no treino! Fica parado ${res.recoveryDays} dias.`, variant: 'destructive' });
      } else if (res.gain > 0) {
        toast({ title: 'Treino concluído!', description: `+${res.gain} ${res.activity.attribute} · +${res.activity.xp} XP` });
      } else {
        toast({ title: 'Treino concluído', description: 'Sem progresso no atributo. Continue tentando!' });
      }

      // Refresh weekly counts and history
      const [counts, sessions] = await Promise.all([
        getWeeklyTrainingCounts(res.profile.id, res.profile.career_date),
        localGame.entities.TrainingSession.filter({ profile_id: res.profile.id }),
      ]);
      setWeeklyCounts(counts);
      setHistory((sessions || []).sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')));
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro', description: 'Falha ao registrar treino.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleAdvanceDay() {
    if (!profile) return;
    setAdvancing(true);
    try {
      const updated = await advanceDay(profile);
      setProfile(updated);
      const [sessions, counts] = await Promise.all([
        localGame.entities.TrainingSession.filter({ profile_id: updated.id }),
        getWeeklyTrainingCounts(updated.id, updated.career_date),
      ]);
      setHistory((sessions || []).sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')));
      setWeeklyCounts(counts);
      setResult(null);
      toast({ title: 'Dia avançado', description: `${formatDate(updated.career_date)} · Energia: ${updated.energy}/100 · Fadiga: ${updated.fatigue}/100` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Bloqueado', description: e.message || 'Não foi possível avançar o dia.', variant: 'destructive' });
    } finally {
      setAdvancing(false);
    }
  }


  if (loading) return <LoadingScreen />;

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <EmptyStateCard icon={Dumbbell} title="Perfil não encontrado" message="Não foi possível carregar seu perfil. Tente recarregar a página." />
      </div>
    );
  }

  const overtraining = getOvertrainingStatus(profile);
  const conditionScore = getConditionScore(profile);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
        <div className="absolute -top-10 -right-10 h-36 w-36 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
            <Dumbbell className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">Centro de Treino</h1>
            <p className="text-sm text-muted-foreground">Escolha grupo, foco e intensidade. Cada sessão distribui progresso entre atributos relacionados.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdvanceDay}
              disabled={advancing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 text-primary font-bold text-xs hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              <FastForward className="h-3.5 w-3.5" /> {advancing ? '...' : 'Avançar Dia'}
            </button>
            <CoinBadge coins={profile?.coins || 0} size="md" />
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Treinos</span>
              <span className="font-bold tabular-nums">{profile.trainings_today || 0}/{DAILY_TRAINING_LIMIT}</span>
            </div>
            <ProgressBar value={profile.trainings_today || 0} max={DAILY_TRAINING_LIMIT} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Energia</span>
              <span className="font-bold tabular-nums">{profile.energy ?? 100}/{MAX_ENERGY}</span>
            </div>
            <ProgressBar value={profile.energy ?? 100} max={MAX_ENERGY} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Condição</span>
              <span className={`font-bold ${overtraining.color}`}>{conditionScore}</span>
            </div>
            <ProgressBar value={conditionScore} max={100} />
          </div>
        </div>
      </div>

      {/* Overtraining alert */}
      {overtraining.level !== 'none' && (
        <InfoBanner variant={overtraining.level === 'critical' ? 'error' : 'warning'} icon={AlertCircle}>
          <strong>{overtraining.label}:</strong> {overtraining.message}
        </InfoBanner>
      )}

      {/* Injury warning */}
      {isInjured(profile) && (
        <InfoBanner variant="error" icon={AlertCircle}>
          Você está lesionado! Recupera em {injuryRecoveryDays(profile)} dias. Avance o calendário; um fisioterapeuta contratado acelera o controle de fadiga e reduz o risco de novas lesões.
        </InfoBanner>
      )}

      {/* Result feedback */}
      {result?.type === 'training' && (
        <div className="glass rounded-2xl p-4 border border-primary/40 flex items-center gap-3 bg-primary/5 animate-slide-up">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">{result.activity.label} · {result.intensity.label}</p>
            <p className="text-xs text-muted-foreground">
              {result.gain > 0
                ? `${Number(result.gain).toFixed(2)} de progresso distribuído · +${result.activity.xp} XP · +${result.activity.coins} moedas`
                : `Sessão de manutenção · +${result.activity.xp} XP · +${result.activity.coins} moedas`}
              {result.diminishing < 1 && ` · ${Math.round(result.diminishing * 100)}% eficiência`}
              {result.fatiguePenalty < 0 && ` · fadiga: ${result.fatiguePenalty}`}
            </p>
            {result.gains && <p className="text-[10px] text-primary mt-1">{Object.entries(result.gains).map(([key, value]) => `${key}: +${Number(value.progress || 0).toFixed(2)}${value.levels ? ` (${value.levels} nível)` : ''}`).join(' · ')}</p>}
          </div>
          <button onClick={() => setResult(null)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
        </div>
      )}



      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'treino' && (
        <>
          {/* Condition panel */}
          <ConditionPanel profile={profile} />

          {/* Recuperação automática e equipe técnica */}
          <div>
            <h2 className="font-bold text-sm mb-3 px-1 flex items-center gap-2">
              <Heart className="h-4 w-4 text-accent" /> Recuperação
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="glass rounded-2xl p-4 border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0"><FastForward className="h-5 w-5 text-emerald-400" /></div>
                  <div>
                    <p className="font-semibold text-sm">Descanso automático</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Avance um dia sem treinar ou jogar para recuperar cerca de 32 de energia e reduzir 10 de fadiga. Não é mais necessário escolher “Descanso total”.</p>
                  </div>
                </div>
                <button onClick={handleAdvanceDay} disabled={advancing} className="mt-3 w-full py-2 rounded-xl bg-emerald-500/15 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-40">{advancing ? 'Avançando...' : 'Avançar dia'}</button>
              </div>
              <div className="glass rounded-2xl p-4 border border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0"><Users className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="font-semibold text-sm">Fisioterapia pela equipe</p>
                    <p className="text-[10px] text-muted-foreground mt-1">A fisioterapia deixou de ser uma ação diária. Contrate o profissional mensalmente para reduzir fadiga todos os dias e diminuir o risco de lesões.</p>
                  </div>
                </div>
                <Link to="/staff" className="mt-3 flex w-full items-center justify-center py-2 rounded-xl bg-primary/15 text-primary font-semibold text-sm hover:bg-primary/25 transition-colors">Gerenciar comissão técnica</Link>
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div>
            <h2 className="font-bold text-sm mb-3 px-1">Atividades de Treino</h2>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-4">
              {CATEGORY_ORDER.map(catId => {
                const cat = TRAINING_CATEGORIES[catId];
                const isActive = activeCategory === catId;
                return (
                  <button
                    key={catId}
                    onClick={() => setActiveCategory(catId)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      isActive ? `bg-primary/20 ${cat.color} border border-primary/30` : 'glass text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Activity cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger">
              {TRAINING_ACTIVITIES.filter(a => a.category === activeCategory).map(activity => {
                const weeklyCount = weeklyCounts[activity.id] || 0;
                const coachBonusVal = coach?.training_bonus || {};
                return (
                  <TrainingActivityCard
                    key={activity.id}
                    activity={activity}
                    profile={profile}
                    weeklyCount={weeklyCount}
                    coachBonus={coachBonusVal}
                    onExecute={handleExecute}
                    busy={busy === activity.id}
                    disabled={isInjured(profile) || isRetired(profile)}
                    disabledReason={isRetired(profile) ? 'Aposentado' : isInjured(profile) ? 'Lesionado' : null}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {activeTab === 'agenda' && (
        <WeeklyPlanner profile={profile} onPlanSaved={setProfile} />
      )}

      {activeTab === 'evolucao' && (
        <AttributeEvolution profile={profile} />
      )}

      {activeTab === 'metas' && (
        <DevelopmentGoals profile={profile} onProfileUpdate={setProfile} />
      )}

      {activeTab === 'historico' && (
        <SectionCard title="Histórico de Treinos" icon={Activity}>
          {history.length === 0 ? (
            <EmptyState icon={Dumbbell} message="Nenhum treino registrado ainda." />
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Dumbbell className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{t.training_label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      +{t.attribute_gain} {t.attribute_target} · +{t.xp_reward} XP
                      {t.category && ` · ${TRAINING_CATEGORIES[t.category]?.label || t.category}`}
                      {t.intensity && ` · ${t.intensity}`}
                    </p>
                  </div>
                  <CoinBadge coins={t.coins_reward} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Training timer modal */}
      {activeTraining && (
        <TrainingTimerModal
          training={{ id: activeTraining.activity.id, label: activeTraining.activity.label, attribute: activeTraining.activity.attribute, icon: activeTraining.activity.icon, xp: activeTraining.activity.xp, coins: activeTraining.activity.coins }}
          onComplete={() => {
            const { activity, intensityId } = activeTraining;
            setActiveTraining(null);
            doTraining(activity, intensityId);
          }}
          onCancel={() => setActiveTraining(null)}
        />
      )}
    </div>
  );
}
