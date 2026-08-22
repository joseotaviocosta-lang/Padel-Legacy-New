import React, { useEffect, useMemo, useState } from 'react';
import { Dumbbell, FastForward, Heart, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import {
  ActionFeedback,
  CollapsibleSection,
  ContextActionBar,
  Surface,
  SurfaceHeader,
  SummaryRow,
  Tabs,
} from '@/components/design-system';
import TrainingTimerModal from '@/components/training/TrainingTimerModal';
import ConditionPanel, { getConditionSummaryItems } from '@/components/training/ConditionPanel';
import TrainingActivityCard from '@/components/training/TrainingActivityCard';
import { useToast } from '@/components/ui/use-toast';
import { advanceCareerDayOnce } from '@/game-core';
import { formatPercent, normalizeFatigue } from '@/game-core/physicalStats.js';
import { getCareerNextAction } from '@/lib/careerNextAction.js';
import { formatAttributeGain, formatGameNumber } from '@/lib/numberFormat.js';
import { formatDate, injuryRecoveryDays, isInjured, isRetired } from '@/lib/padel.js';
import { getTrainingCost } from '@/lib/trainingEconomy.js';
import {
  CATEGORY_ORDER,
  executeTraining,
  getConditionScore,
  getOvertrainingStatus,
  getRecommendedTrainings,
  getWeeklyTrainingCounts,
  TRAINING_ACTIVITIES,
  TRAINING_CATEGORIES,
} from '@/lib/trainingSystemV2.js';
import { APP_ROUTES, TRAINING_CENTER_VIEWS } from '@/navigation/routes.js';

export default function TrainingView({ profile, onProfileUpdate, onSelectView }) {
  const entities = /** @type {any} */ (localGame.entities);
  const [coach, setCoach] = useState(null);
  const [weeklyCounts, setWeeklyCounts] = useState({});
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTraining, setActiveTraining] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('court');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWeeklyTrainingCounts(profile.id, profile.career_date),
      profile.coach_id ? entities.Coach.get(profile.coach_id).catch(() => null) : Promise.resolve(null),
    ]).then(([counts, currentCoach]) => {
      if (cancelled) return;
      setWeeklyCounts(counts || {});
      setCoach(currentCoach);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [entities.Coach, profile.id, profile.career_date, profile.coach_id]);

  const recommendedIds = useMemo(
    () => new Set(getRecommendedTrainings(profile, { recentCounts: weeklyCounts }).map((item) => item.training.id)),
    [profile, weeklyCounts],
  );
  const postTrainingAction = useMemo(
    () => (result?.type === 'training' ? getCareerNextAction(profile) : null),
    [result, profile],
  );
  const overtraining = getOvertrainingStatus(profile);
  const conditionScore = getConditionScore(profile);

  async function doTraining(activity, intensityId) {
    setBusy(activity.id);
    try {
      const res = await executeTraining(profile, activity, intensityId, coach?.training_bonus || {});
      if (res.error) {
        toast({ title: 'Não foi possível treinar', description: res.error, variant: 'destructive' });
        setResult({ error: res.error });
        return;
      }
      onProfileUpdate(res.profile, 'training-center:training');
      setResult({
        type: 'training', activity: res.activity, intensity: res.intensity,
        gain: res.gain, gains: res.gains, injured: res.injured,
        recoveryDays: res.recoveryDays, diminishing: res.diminishing,
        fatiguePenalty: res.fatiguePenalty, cost: res.cost, coinsAfter: res.profile.coins,
      });
      if (res.injured) {
        toast({ title: 'Lesão!', description: `Você se lesionou no treino! Fica parado ${res.recoveryDays} dias.`, variant: 'destructive' });
      } else if (res.gain > 0) {
        toast({ title: 'Treino concluído!', description: `+${formatAttributeGain(res.gain)} ${res.activity.attribute} · +${res.activity.xp} XP · -${res.cost} moedas` });
      } else {
        toast({ title: 'Treino concluído', description: `Sem progresso no atributo. -${res.cost} moedas.` });
      }
      setWeeklyCounts(await getWeeklyTrainingCounts(res.profile.id, res.profile.career_date));
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro', description: 'Falha ao registrar treino.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleAdvanceDay() {
    setAdvancing(true);
    try {
      const updated = await advanceCareerDayOnce(profile);
      onProfileUpdate(updated, 'training-center:advance-day');
      setWeeklyCounts(await getWeeklyTrainingCounts(updated.id, updated.career_date));
      setResult(null);
      toast({ title: 'Dia avançado', description: `${formatDate(updated.career_date)} · Energia: ${formatPercent(updated.energy)}/100 · Fadiga: ${normalizeFatigue(updated.fatigue)}/100` });
    } catch (error) {
      toast({ title: 'Bloqueado', description: error.message || 'Não foi possível avançar o dia.', variant: 'destructive' });
    } finally {
      setAdvancing(false);
    }
  }

  function handleExecute(activity, intensityId) {
    if (isRetired(profile)) {
      toast({ title: 'Aposentado', description: 'Sua carreira como jogador terminou.', variant: 'destructive' });
      return;
    }
    if (isInjured(profile)) {
      toast({ title: 'Lesionado', description: `Recupera em ${injuryRecoveryDays(profile)} dias.`, variant: 'destructive' });
      return;
    }
    setActiveTraining({ activity, intensityId });
  }

  function runContextAction(action) {
    if (action.actionType === 'advance-day') {
      handleAdvanceDay();
      return;
    }
    if (action.route === APP_ROUTES.MATCHES) {
      onSelectView(TRAINING_CENTER_VIEWS.MATCH);
      return;
    }
    navigate(action.route);
  }

  return (
    <div className="space-y-3" data-training-center-view="training">
      {overtraining.level !== 'none' && <ActionFeedback state={overtraining.level === 'critical' ? 'error' : 'warning'} title={overtraining.label} description={overtraining.message} action={null} className="" />}
      {isInjured(profile) && <ActionFeedback state="error" title={`Lesionado · recupera em ${injuryRecoveryDays(profile)} dias`} description="Avance o calendário; a fisioterapia da comissão reduz risco e fadiga." action={null} className="" />}
      {result?.type === 'training' && (
        <ActionFeedback
          state="success"
          title="Treino concluído"
          description={[
            result.gain > 0 ? `+${formatAttributeGain(result.gain)} de progresso` : 'Sessão de manutenção',
            `+${result.activity.xp} XP`,
            `-${result.cost} moedas`,
            result.fatiguePenalty < 0 ? `fadiga ${formatGameNumber(result.fatiguePenalty, { maximumFractionDigits: 1 })}` : null,
          ].filter(Boolean).join(' · ')}
          action={<button type="button" onClick={() => setResult(null)} className="text-xs font-bold text-muted-foreground">Fechar</button>}
          className=""
        />
      )}
      {postTrainingAction && <ContextActionBar description={postTrainingAction.description} primary={{ label: postTrainingAction.label, icon: postTrainingAction.icon, onClick: () => runContextAction(postTrainingAction), disabled: postTrainingAction.actionType === 'advance-day' && advancing }} />}

      <Surface padding="compact">
        <SurfaceHeader compact title="Atividades de treino" description={`Forma ${conditionScore} · escolha categoria, intensidade e sessão.`} icon={Dumbbell} action={null} className="" />
        <Tabs
          tabs={CATEGORY_ORDER.map((categoryId) => ({ key: categoryId, label: TRAINING_CATEGORIES[categoryId].label }))}
          activeTab={activeCategory}
          onTabChange={setActiveCategory}
          variant="buttons"
          className="mb-3"
        />
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-3 lg:grid-cols-3 animate-stagger">
          {TRAINING_ACTIVITIES.filter((activity) => activity.category === activeCategory).map((activity) => (
            <TrainingActivityCard
              key={activity.id}
              activity={activity}
              profile={profile}
              weeklyCount={weeklyCounts[activity.id] || 0}
              coachBonus={coach?.training_bonus || {}}
              recommended={recommendedIds.has(activity.id)}
              onExecute={handleExecute}
              busy={busy === activity.id}
              disabled={isInjured(profile) || isRetired(profile)}
              disabledReason={isRetired(profile) ? 'Aposentado' : isInjured(profile) ? 'Lesionado' : null}
            />
          ))}
        </div>
      </Surface>

      <CollapsibleSection icon={Heart} title="Estado do atleta" description={<SummaryRow items={getConditionSummaryItems(profile)} className="" />}>
        <ConditionPanel profile={profile} />
      </CollapsibleSection>
      <CollapsibleSection icon={FastForward} title="Recuperação e suporte" description="Descanso automático e resumo da comissão técnica.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/20 p-3">
            <p className="text-sm font-bold">Descanso automático</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Avance um dia livre para recuperar energia e reduzir fadiga.</p>
            <button type="button" onClick={handleAdvanceDay} disabled={advancing} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 text-xs font-bold disabled:opacity-50"><FastForward className="h-4 w-4" />{advancing ? 'Avançando...' : 'Avançar dia'}</button>
          </div>
          <div className="rounded-2xl border border-primary/20 p-3">
            <p className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary" />Suporte técnico</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Treinador e fisioterapia influenciam treino e recuperação; a gestão completa permanece na Comissão.</p>
            <Link to="/staff" className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-primary/15 px-3 text-xs font-bold text-primary">Ver comissão</Link>
          </div>
        </div>
      </CollapsibleSection>

      {activeTraining && (
        <TrainingTimerModal
          training={{ id: activeTraining.activity.id, label: activeTraining.activity.label, attribute: activeTraining.activity.attribute, icon: activeTraining.activity.icon, xp: activeTraining.activity.xp, cost: getTrainingCost(profile, activeTraining.intensityId) }}
          onComplete={() => { const selected = activeTraining; setActiveTraining(null); doTraining(selected.activity, selected.intensityId); }}
          onCancel={() => setActiveTraining(null)}
        />
      )}
    </div>
  );
}
