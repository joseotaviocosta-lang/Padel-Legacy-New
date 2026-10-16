import React, { lazy, Suspense, useCallback, useMemo } from 'react';
import { Activity, Building2, CalendarDays, Dumbbell, Swords, Zap } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { localGame } from '@/api/localGameClient.js';
import { Page, PageContent, PageSkeleton, Tabs } from '@/components/design-system';
import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';
import { ensureMyProfile, canPlayMatchToday, DAILY_MATCH_LIMIT, getDailyTrainingLimit } from '@/lib/padel.js';
import { formatPercent, normalizeFatigue } from '@/game-core/physicalStats.js';
import { TRAINING_CENTER_VIEWS } from '@/navigation/routes.js';

const TrainingView = lazy(() => import('@/components/training-center/TrainingView.jsx'));
const PracticeMatchView = lazy(() => import('@/components/training-center/PracticeMatchView.jsx'));
const TrainingAgendaView = lazy(() => import('@/components/training-center/TrainingAgendaView.jsx'));
const TrainingProgressView = lazy(() => import('@/components/training-center/TrainingProgressView.jsx'));
const TrainingFacilityView = lazy(() => import('@/components/training-center/TrainingFacilityView.jsx'));

const PRIMARY_VIEWS = [
  { key: TRAINING_CENTER_VIEWS.TRAINING, label: 'Treino', icon: Dumbbell },
  { key: TRAINING_CENTER_VIEWS.MATCH, label: 'Partida', icon: Swords },
  { key: TRAINING_CENTER_VIEWS.AGENDA, label: 'Agenda', icon: CalendarDays },
  { key: TRAINING_CENTER_VIEWS.PROGRESS, label: 'Evolução', icon: Activity },
  { key: TRAINING_CENTER_VIEWS.CENTER, label: 'Centro', icon: Building2 },
];
const VALID_VIEWS = new Set(PRIMARY_VIEWS.map((view) => view.key));

export function resolveTrainingCenterView(value) {
  return VALID_VIEWS.has(value) ? value : TRAINING_CENTER_VIEWS.TRAINING;
}

export default function TrainingCenterPage() {
  const { activeCareer } = useCareer();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const activeView = resolveTrainingCenterView(searchParams.get('view'));

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await localGame.auth.me();
        const currentProfile = await ensureMyProfile(user);
        if (!cancelled) setProfile(currentProfile);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useCareerProfileSync(setProfile);

  const handleProfileUpdate = useCallback((updatedProfile, source = 'training-center') => {
    if (!updatedProfile) return;
    setProfile(updatedProfile);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('padel:profile-updated', {
        detail: { profile: updatedProfile, profileId: updatedProfile.id, careerDate: updatedProfile.career_date, source },
      }));
    }
  }, []);

  const selectView = useCallback((view, options = {}) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', resolveTrainingCenterView(view));
    if (view !== TRAINING_CENTER_VIEWS.MATCH) next.delete('play');
    setSearchParams(next, { replace: Boolean(options.replace) });
  }, [searchParams, setSearchParams]);

  const activeContent = useMemo(() => {
    if (!profile) return null;
    const shared = { profile, careerId: activeCareer?.career_id, onProfileUpdate: handleProfileUpdate, onSelectView: selectView };
    switch (activeView) {
      case TRAINING_CENTER_VIEWS.MATCH:
        return <PracticeMatchView {...shared} autoOpen={searchParams.get('play') === '1'} />;
      case TRAINING_CENTER_VIEWS.AGENDA:
        return <TrainingAgendaView {...shared} />;
      case TRAINING_CENTER_VIEWS.PROGRESS:
        return <TrainingProgressView {...shared} initialSection={searchParams.get('section') || (searchParams.get('training') ? 'history' : 'overview')} />;
      case TRAINING_CENTER_VIEWS.CENTER:
        return <TrainingFacilityView {...shared} />;
      default:
        return <TrainingView {...shared} />;
    }
  }, [activeCareer?.career_id, activeView, handleProfileUpdate, profile, searchParams, selectView]);

  if (loading) return <PageSkeleton variant="dashboard" rows={4} className="" />;
  if (!profile) return <Page className=""><PageContent className=""><p className="rounded-2xl border border-border/60 p-5 text-sm text-muted-foreground">Perfil não encontrado.</p></PageContent></Page>;

  const matchStatus = canPlayMatchToday(profile);
  const playedToday = Number(profile.practice_matches_today || 0) >= DAILY_MATCH_LIMIT;

  return (
    <Page className="">
      <PageContent className="max-w-6xl space-y-3" data-training-center-hub data-active-view={activeView}>
        {/* Fase 5.29 — PAINEL "HOJE". Antes: herói (título + sobretítulo +
            descrição) + HUD em grade 2×2 + cartão separado de partida treino,
            três blocos antes das abas. Agora um painel só: o estado do
            atleta em quatro medidores com barra (leitura de jogo, não de
            formulário) e a partida treino como uma linha dentro dele. Mesmos
            valores e mesmas fontes (getDailyTrainingLimit, DAILY_MATCH_LIMIT,
            energia/fadiga normalizadas, canPlayMatchToday). */}
        <section className="rounded-2xl border border-border/50 bg-card/70 p-3.5 shadow-sm sm:p-4" data-training-today>
          <div className="flex items-center justify-between gap-2">
            <h1 className="pl-title-display flex min-w-0 items-center gap-2 truncate text-lg font-black tracking-[-0.03em] sm:text-2xl">
              <Dumbbell className="h-5 w-5 shrink-0 text-primary" />Centro de Treinamento
            </h1>
            <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-muted-foreground md:hidden">Hoje</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Estado da preparação">
            <TodayMeter icon={Dumbbell} label="Treinos" value={`${profile.trainings_today || 0}/${getDailyTrainingLimit(profile)}`} ratio={(profile.trainings_today || 0) / Math.max(1, getDailyTrainingLimit(profile))} tone="brand" />
            <TodayMeter icon={Swords} label="Partida" value={`${profile.practice_matches_today || 0}/${DAILY_MATCH_LIMIT}`} ratio={(profile.practice_matches_today || 0) / Math.max(1, DAILY_MATCH_LIMIT)} tone="brand" />
            <TodayMeter icon={Zap} label="Energia" value={`${formatPercent(profile.energy ?? 100)}%`} ratio={(profile.energy ?? 100) / 100} tone={(profile.energy ?? 100) < 30 ? 'danger' : 'success'} />
            <TodayMeter icon={Activity} label="Fadiga" value={`${normalizeFatigue(profile.fatigue)}%`} ratio={normalizeFatigue(profile.fatigue) / 100} tone={normalizeFatigue(profile.fatigue) > 65 ? 'danger' : normalizeFatigue(profile.fatigue) > 40 ? 'warning' : 'success'} />
          </div>
          {activeView === TRAINING_CENTER_VIEWS.TRAINING && (
            <button type="button" onClick={() => selectView(TRAINING_CENTER_VIEWS.MATCH)} className="mt-3 flex w-full min-w-0 items-center gap-2 border-t border-border/40 pt-2.5 text-left" data-practice-match-shortcut>
              <Swords className="h-4 w-4 shrink-0 text-primary" />
              {/* CTA logo após o texto (não na borda direita, onde a coluna flutuante do desktop o cobria). */}
              <span className="min-w-0 truncate text-xs"><span className="font-bold">Partida treino</span><span className="text-muted-foreground"> · {playedToday ? 'concluída hoje ✓' : matchStatus.allowed ? 'disponível hoje' : 'indisponível hoje'}</span></span>
              <span className="shrink-0 text-xs font-bold text-primary">{playedToday ? 'Ver histórico' : 'Jogar'} →</span>
            </button>
          )}
        </section>

        <div className="sticky top-2 z-20" data-training-center-tabs>
          <Tabs tabs={PRIMARY_VIEWS} activeTab={activeView} onTabChange={selectView} variant="segmented" className="bg-background/90 backdrop-blur-xl" />
        </div>

        <Suspense fallback={<div className="rounded-2xl border border-border/60 p-5 text-sm text-muted-foreground">Carregando seção...</div>}>
          {activeContent}
        </Suspense>
      </PageContent>
    </Page>
  );
}

const METER_TONE = {
  brand: { text: 'text-primary', bar: 'bg-primary' },
  success: { text: 'text-emerald-400', bar: 'bg-emerald-400' },
  warning: { text: 'text-amber-400', bar: 'bg-amber-400' },
  danger: { text: 'text-red-400', bar: 'bg-red-400' },
};

/** 5.29 — medidor compacto do painel "Hoje": valor, rótulo e barra fina. */
function TodayMeter({ icon: Icon, label, value, ratio = 0, tone = 'brand' }) {
  const colors = METER_TONE[tone] || METER_TONE.brand;
  const pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
  return (
    <div className="min-w-0" aria-label={`${label}: ${value}`}>
      <p className={`flex items-center gap-1 text-base font-black tabular-nums leading-none ${colors.text}`}><Icon className="hidden h-3.5 w-3.5 shrink-0 sm:inline" />{value}</p>
      <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary/70"><div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
