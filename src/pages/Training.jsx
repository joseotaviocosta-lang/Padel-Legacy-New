import React, { useEffect, useMemo, useState } from 'react';
import { formatAttributeGain, formatGameNumber } from '@/lib/numberFormat.js';
import { localGame } from '@/api/localGameClient.js';
import { Dumbbell, FastForward, Heart, Activity, Calendar, TrendingUp, Target, Users, Zap, Coins } from 'lucide-react';
import { ensureMyProfile, formatDate, isInjured, injuryRecoveryDays, isRetired, DAILY_TRAINING_LIMIT } from '@/lib/padel';
import { advanceCareerDayOnce } from '@/game-core';
import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';
import { formatPercent, normalizeFatigue } from '@/game-core/physicalStats.js';
import { TRAINING_ACTIVITIES, TRAINING_CATEGORIES, CATEGORY_ORDER, executeTraining, getWeeklyTrainingCounts, getOvertrainingStatus, getConditionScore, getRecommendedTrainings } from '@/lib/trainingSystemV2';
import { getTrainingCost } from '@/lib/trainingEconomy';
import { useToast } from '@/components/ui/use-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCareerNextAction } from '@/lib/careerNextAction.js';
import TrainingTimerModal from '@/components/training/TrainingTimerModal';
import ConditionPanel, { getConditionSummaryItems } from '@/components/training/ConditionPanel';
import TrainingActivityCard from '@/components/training/TrainingActivityCard';
import WeeklyPlanner from '@/components/training/WeeklyPlanner';
import AttributeEvolution from '@/components/training/AttributeEvolution';
import DevelopmentGoals from '@/components/training/DevelopmentGoals';
import {
  ActionFeedback,
  Button,
  CollapsibleSection,
  ContextActionBar,
  EmptyState,
  Page,
  PageContent,
  PageHeader,
  PageSkeleton,
  Section,
  StatusBadge,
  Surface,
  SurfaceHeader,
  SummaryRow,
  Tabs,
} from '@/components/design-system';

const TABS = [
  { key: 'treino', label: 'Treino', icon: Dumbbell },
  { key: 'agenda', label: 'Agenda', icon: Calendar },
  { key: 'evolucao', label: 'Evolução', icon: TrendingUp },
  { key: 'metas', label: 'Metas', icon: Target },
  { key: 'historico', label: 'Histórico', icon: Activity },
];

export default function Training() {
  const [searchParams] = useSearchParams();
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
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('training')) setActiveTab('historico');
  }, [searchParams]);
  // Mobile M3.7.2 (docs/MOBILE_M3_7_2_MATCH_DAY_REFRESH.md): mesma causa
  // raiz de Matches.jsx — o avanço de dia PRÓPRIO desta página (handleAdvance
  // abaixo) já atualizava `profile` corretamente; só o avanço disparado em
  // outro lugar do app (atalho global) nunca chegava aqui.
  useCareerProfileSync(setProfile);

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
        cost: res.cost,
        coinsAfter: res.profile.coins,
      });

      // M4.2.1 (Parte 33): feedback pós-treino mostra o débito real, nunca
      // mais "+moedas" (treino não paga mais — Parte 2).
      if (res.injured) {
        toast({ title: 'Lesão!', description: `Você se lesionou no treino! Fica parado ${res.recoveryDays} dias.`, variant: 'destructive' });
      } else if (res.gain > 0) {
        toast({ title: 'Treino concluído!', description: `+${formatAttributeGain(res.gain)} ${res.activity.attribute} · +${res.activity.xp} XP · -${res.cost} moedas` });
      } else {
        toast({ title: 'Treino concluído', description: `Sem progresso no atributo. -${res.cost} moedas.` });
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
      const updated = await advanceCareerDayOnce(profile);
      setProfile(updated);
      const [sessions, counts] = await Promise.all([
        localGame.entities.TrainingSession.filter({ profile_id: updated.id }),
        getWeeklyTrainingCounts(updated.id, updated.career_date),
      ]);
      setHistory((sessions || []).sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')));
      setWeeklyCounts(counts);
      setResult(null);
      toast({ title: 'Dia avançado', description: `${formatDate(updated.career_date)} · Energia: ${formatPercent(updated.energy)}/100 · Fadiga: ${normalizeFatigue(updated.fatigue)}/100` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Bloqueado', description: e.message || 'Não foi possível avançar o dia.', variant: 'destructive' });
    } finally {
      setAdvancing(false);
    }
  }


  // Recomendação já existente (usada hoje só para bots) — reaproveitada tal
  // qual para destacar cards, sem criar nenhum algoritmo novo (seção 5).
  const recommendedIds = useMemo(
    () => (profile ? new Set(getRecommendedTrainings(profile, { recentCounts: weeklyCounts }).map((item) => item.training.id)) : new Set()),
    [profile, weeklyCounts],
  );

  // M4.3 (docs/MOBILE_M4_3_GAME_FLOW.md, Parte G): "treino concluído" hoje
  // não sugeria nenhum próximo passo — o jogador tinha que navegar sozinho.
  // Só calculado quando há um resultado pra mostrar (Parte R: nenhum cálculo
  // por render fora desse momento); usa o profile JÁ atualizado por
  // doTraining (res.profile), nenhuma consulta nova.
  const postTrainingAction = useMemo(
    () => (result?.type === 'training' ? getCareerNextAction(profile) : null),
    [result, profile],
  );

  if (loading) return <PageSkeleton variant="dashboard" rows={4} />;

  if (!profile) {
    return (
      <Page><PageContent>
        <EmptyState icon={Dumbbell} title="Perfil não encontrado" description="Não foi possível carregar seu perfil. Tente recarregar a página." />
      </PageContent></Page>
    );
  }

  const overtraining = getOvertrainingStatus(profile);
  const conditionScore = getConditionScore(profile);

  return (
    <Page>
      <PageContent className="max-w-6xl space-y-5">
        <PageHeader
          dense
          eyebrow="Desenvolvimento"
          title="Treinos"
          description="Planeje a semana, execute sessões e acompanhe a evolução com energia, fadiga e limite diário sempre visíveis."
          icon={Dumbbell}
          tone="brand"
          breadcrumb={['Desenvolvimento', 'Treinos']}
          hudLabel="Estado para o treino"
          hudItems={[
            // M4.2.1 (Parte 27): saldo de moedas visível junto do HUD, sem
            // ocupar card próprio — agora que treino tem custo, o jogador
            // precisa comparar saldo × custo sem sair da tela.
            { label: 'moedas', value: Number(profile.coins || 0).toLocaleString('pt-BR'), icon: Coins, tone: 'success' },
            { label: 'hoje', value: `${profile.trainings_today || 0}/${DAILY_TRAINING_LIMIT}`, icon: Dumbbell },
            { label: 'energia', value: `${formatPercent(profile.energy ?? 100)}%`, icon: Zap, tone: (profile.energy ?? 100) < 30 ? 'danger' : 'success' },
            { label: 'fadiga', value: `${normalizeFatigue(profile.fatigue)}%`, icon: Activity, tone: normalizeFatigue(profile.fatigue) > 65 ? 'danger' : normalizeFatigue(profile.fatigue) > 40 ? 'warning' : 'success' },
            { label: 'forma', value: conditionScore, icon: Heart, tone: conditionScore < 45 ? 'danger' : conditionScore < 70 ? 'warning' : 'success' },
          ]}
        />

      {/* Overtraining alert */}
      {overtraining.level !== 'none' && (
        <ActionFeedback
          state={overtraining.level === 'critical' ? 'error' : 'warning'}
          title={overtraining.label}
          description={overtraining.message}
        />
      )}

      {/* Injury warning */}
      {isInjured(profile) && (
        <ActionFeedback
          state="error"
          title={`Lesionado · recupera em ${injuryRecoveryDays(profile)} dias`}
          description="Avance o calendário; um fisioterapeuta contratado acelera o controle de fadiga e reduz o risco de novas lesões."
        />
      )}

      {/* Result feedback */}
      {result?.type === 'training' && (
        <ActionFeedback
          state="success"
          title={`${result.activity.label} · ${result.intensity.label}`}
          description={[
            result.gain > 0
              ? `${formatAttributeGain(result.gain)} de progresso distribuído · +${result.activity.xp} XP · -${result.cost} moedas`
              : `Sessão de manutenção · +${result.activity.xp} XP · -${result.cost} moedas`,
            `Saldo: ${Number(result.coinsAfter || 0).toLocaleString('pt-BR')}`,
            result.diminishing < 1 ? `${Math.round(result.diminishing * 100)}% eficiência` : null,
            result.fatiguePenalty < 0 ? `fadiga: ${formatGameNumber(result.fatiguePenalty, { maximumFractionDigits: 1 })}` : null,
          ].filter(Boolean).join(' · ')}
          action={<button type="button" onClick={() => setResult(null)} className="text-xs font-bold text-muted-foreground hover:text-foreground">Fechar</button>}
        />
      )}
      {postTrainingAction && (
        <ContextActionBar
          description={postTrainingAction.description}
          primary={{
            label: postTrainingAction.label,
            icon: postTrainingAction.icon,
            onClick: () => (postTrainingAction.actionType === 'advance-day' ? handleAdvanceDay() : navigate(postTrainingAction.route)),
            disabled: postTrainingAction.actionType === 'advance-day' && advancing,
          }}
        />
      )}
      {/* Tabs */}
      <div className="sticky top-2 z-20">
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="segmented" className="bg-background/90 backdrop-blur-xl" />
      </div>

      {/* Tab content */}
      {activeTab === 'treino' && (
        <>
          {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.3 — gate
              obrigatório): categoria + atividades ficam logo após a faixa
              de status/tabs, sem passar por moral/recuperação/fisioterapia
              antes. Essas duas seções continuam 100% presentes — só
              descem para depois das atividades e ficam recolhidas por
              padrão (progressive disclosure), não removidas. */}
          <Surface padding="compact">
            <SurfaceHeader compact title="Atividades de treino" description="Escolha uma categoria e compare as sessões disponíveis para o estado atual do atleta." icon={Dumbbell} />
            <div className="mb-4">
              <Tabs
                tabs={CATEGORY_ORDER.map((catId) => ({ key: catId, label: TRAINING_CATEGORIES[catId].label }))}
                activeTab={activeCategory}
                onTabChange={setActiveCategory}
                variant="buttons"
              />
            </div>

            {/* Activity cards */}
            <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-3 lg:grid-cols-3 animate-stagger">
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
                    recommended={recommendedIds.has(activity.id)}
                    onExecute={handleExecute}
                    busy={busy === activity.id}
                    disabled={isInjured(profile) || isRetired(profile)}
                    disabledReason={isRetired(profile) ? 'Aposentado' : isInjured(profile) ? 'Lesionado' : null}
                  />
                );
              })}
            </div>
          </Surface>

          {/* Estado do atleta (moral/confiança/forma/entrosamento) — antes
              um card grande sempre expandido antes dos treinos; agora
              recolhido, com o resumo de uma linha já visível fechado. */}
          <CollapsibleSection icon={Heart} title="Estado do atleta" description={<SummaryRow items={getConditionSummaryItems(profile)} />}>
            <ConditionPanel profile={profile} />
          </CollapsibleSection>

          {/* Recuperação automática e equipe técnica */}
          <CollapsibleSection icon={FastForward} title="Recuperação e suporte" description="Descanso automático e fisioterapia da comissão.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="glass rounded-2xl p-4 border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0"><FastForward className="h-5 w-5 text-emerald-400" /></div>
                  <div>
                    <p className="font-semibold text-sm">Descanso automático</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Avance um dia sem treinar ou jogar para recuperar cerca de 32 de energia e reduzir 10 de fadiga. Não é mais necessário escolher “Descanso total”.</p>
                  </div>
                </div>
                <Button level="secondary" size="sm" onClick={handleAdvanceDay} disabled={advancing} className="mt-3 w-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">{advancing ? 'Avançando...' : 'Avançar dia'}</Button>
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
          </CollapsibleSection>
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
        <Section title="Histórico de treinos" icon={Activity}>
          {history.length === 0 ? (
            <EmptyState compact icon={Dumbbell} title="Nenhum treino registrado" description="Seus treinos concluídos aparecerão aqui." />
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
                      +{formatAttributeGain(t.attribute_gain)} {t.attribute_target} · +{t.xp_reward} XP
                      {t.category && ` · ${TRAINING_CATEGORIES[t.category]?.label || t.category}`}
                      {t.intensity && ` · ${t.intensity}`}
                    </p>
                  </div>
                  {/* M4.2.1 (Parte 34): sessões antigas (pré-M4.2.1) tinham
                      coins_reward>0 e nenhum coins_cost — continuam exibidas
                      como estavam, sem migração. Sessões novas têm
                      coins_cost (débito) e coins_reward sempre 0. */}
                  {Number(t.coins_cost || 0) > 0 ? (
                    <StatusBadge tone="neutral">-{Number(t.coins_cost).toLocaleString('pt-BR')}</StatusBadge>
                  ) : (
                    <StatusBadge tone="premium">+{Number(t.coins_reward || 0).toLocaleString('pt-BR')}</StatusBadge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Training timer modal */}
      {activeTraining && (
        <TrainingTimerModal
          training={{ id: activeTraining.activity.id, label: activeTraining.activity.label, attribute: activeTraining.activity.attribute, icon: activeTraining.activity.icon, xp: activeTraining.activity.xp, cost: getTrainingCost(profile, activeTraining.intensityId) }}
          onComplete={() => {
            const { activity, intensityId } = activeTraining;
            setActiveTraining(null);
            doTraining(activity, intensityId);
          }}
          onCancel={() => setActiveTraining(null)}
        />
      )}
      </PageContent>
    </Page>
  );
}
