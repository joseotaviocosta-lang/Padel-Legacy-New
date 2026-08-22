import React, { lazy, Suspense, useCallback, useMemo } from 'react';
import { Activity, Building2, CalendarDays, Dumbbell, Swords, Zap } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Page, PageContent, PageHeader, PageSkeleton, Surface, Tabs } from '@/components/design-system';
import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';
import { ensureMyProfile, canPlayMatchToday, DAILY_MATCH_LIMIT, DAILY_TRAINING_LIMIT } from '@/lib/padel.js';
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
    const shared = { profile, onProfileUpdate: handleProfileUpdate, onSelectView: selectView };
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
  }, [activeView, handleProfileUpdate, profile, searchParams, selectView]);

  if (loading) return <PageSkeleton variant="dashboard" rows={4} className="" />;
  if (!profile) return <Page className=""><PageContent className=""><p className="rounded-2xl border border-border/60 p-5 text-sm text-muted-foreground">Perfil não encontrado.</p></PageContent></Page>;

  const matchStatus = canPlayMatchToday(profile);
  const playedToday = Number(profile.practice_matches_today || 0) >= DAILY_MATCH_LIMIT;

  return (
    <Page className="">
      <PageContent className="max-w-6xl space-y-3" data-training-center-hub data-active-view={activeView}>
        <PageHeader
          dense
          eyebrow="Preparação do atleta"
          title="Centro de Treinamento"
          description="Treino, partida, planejamento, evolução e infraestrutura em um único lugar."
          icon={Dumbbell}
          tone="brand"
          breadcrumb={['Desenvolvimento', 'Centro de Treinamento']}
          hudLabel="Estado da preparação"
          hudItems={[
            { label: 'treinos', value: `${profile.trainings_today || 0}/${DAILY_TRAINING_LIMIT}`, icon: Dumbbell },
            { label: 'partida', value: `${profile.practice_matches_today || 0}/${DAILY_MATCH_LIMIT}`, icon: Swords },
            { label: 'energia', value: `${formatPercent(profile.energy ?? 100)}%`, icon: Zap, tone: (profile.energy ?? 100) < 30 ? 'danger' : 'success' },
            { label: 'fadiga', value: `${normalizeFatigue(profile.fatigue)}%`, icon: Activity, tone: normalizeFatigue(profile.fatigue) > 65 ? 'danger' : normalizeFatigue(profile.fatigue) > 40 ? 'warning' : 'success' },
          ]}
        />

        {activeView === TRAINING_CENTER_VIEWS.TRAINING && (
          <Surface padding="compact" className="border-primary/20" data-practice-match-shortcut>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Swords className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">Partida treino</p>
                <p className="truncate text-xs font-bold">{playedToday ? 'Concluída hoje ✓' : matchStatus.allowed ? 'Disponível hoje · 0/1' : 'Indisponível hoje'}</p>
              </div>
              <button type="button" onClick={() => selectView(TRAINING_CENTER_VIEWS.MATCH)} className="min-h-11 shrink-0 rounded-xl bg-secondary px-3 text-xs font-bold">{playedToday ? 'Ver histórico' : 'Jogar'}</button>
            </div>
          </Surface>
        )}

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
