import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Target, Check, Coins, Zap, Award, Calendar, Flame, Trophy, Clock, RotateCcw, GraduationCap, ArrowRight, Lock, AlertTriangle } from 'lucide-react';
import { ensureMyProfile, TUTORIAL_MISSIONS, incrementMissionProgress, missionPeriodEndsAt, missionPeriodKey, syncMissionProgressPeriods } from '@/lib/padel';
import { SectionCard, EmptyState, ProgressBar } from '@/components/padel/GameShared';
import { LoadingScreen } from '@/components/padel/ui';
import { CollapsibleSection, CompactListItem, CompactStats, Page, PageContent, PageHeader, StatusBadge, Surface } from '@/components/design-system';
import { safeModuleTask } from '@/lib/moduleLoading';
import { ATTRIBUTE_LABELS, COURT_SIDE_OPTIONS, DOMINANT_HANDS, PLAY_STYLE_OPTIONS, buildInitialProfile } from '@/lib/initialCareerProfiles';
import { CAREER_DIFFICULTY_OPTIONS, DEFAULT_NEW_CAREER_DIFFICULTY } from '@/lib/careerDifficultyLabels.js';
import { buildMissionAliasUpdates, findMissingMissionCatalog } from '@/lib/missionCatalogLogic';
import { reconcilePersistedTutorial } from '@/onboarding/tutorialReconciliation.js';
import { completeTutorialStep, isTutorialRouteMatch, resolveTutorialMission } from '@/onboarding/tutorialEngine.js';
import { getCurrentTutorialStep, getTutorialProgress } from '@/onboarding/tutorialState.js';
import { TUTORIAL_STEPS } from '@/onboarding/tutorialSteps.js';
import { deterministicMissionSelection, missionStatus, requirementsMet } from '@/missions/missionSystem.js';

const TABS = [
  { key: 'tutorial', label: 'Tutorial', icon: GraduationCap },
  { key: 'diaria', label: 'Diárias', icon: Calendar },
  { key: 'semanal', label: 'Semanais', icon: Flame },
  { key: 'mensal', label: 'Mensais', icon: Clock },
  { key: 'sazonal', label: 'Sazonais', icon: Trophy },
];

const EXTRA_MISSIONS = [
  { id:'daily-training',title:'Movimente-se',description:'Complete 1 treino leve ou normal.',mission_type:'diaria',objective_type:'complete_training',target_count:1,xp_reward:20,coins_reward:25,difficulty:'baixa',cycle_scope:'career-day' },
  { id:'daily-calendar',title:'Planeje o dia',description:'Programe uma atividade futura no calendário.',mission_type:'diaria',objective_type:'schedule_calendar_activity',target_count:1,xp_reward:15,coins_reward:20,difficulty:'baixa',cycle_scope:'career-day' },
  { id:'daily-news',title:'Informe-se',description:'Leia uma notícia do circuito.',mission_type:'diaria',objective_type:'visit_journal',target_count:1,xp_reward:15,coins_reward:20,difficulty:'baixa',cycle_scope:'career-day' },
  { id:'daily-match',title:'Entre em quadra',description:'Jogue ou simule 1 partida.',mission_type:'diaria',objective_type:'play_matches',target_count:1,xp_reward:30,coins_reward:35,difficulty:'baixa',cycle_scope:'career-day' },
  { id:'weekly-training',title:'Semana de evolução',description:'Complete 4 treinos.',mission_type:'semanal',objective_type:'complete_training',target_count:4,xp_reward:100,coins_reward:90,difficulty:'média',cycle_scope:'career-week' },
  { id:'weekly-matches',title:'Ritmo competitivo',description:'Dispute 2 partidas.',mission_type:'semanal',objective_type:'play_matches',target_count:2,xp_reward:120,coins_reward:100,difficulty:'média',cycle_scope:'career-week' },
  { id:'weekly-win',title:'Vitória da semana',description:'Vença 1 partida.',mission_type:'semanal',objective_type:'win_matches',target_count:1,xp_reward:130,coins_reward:120,difficulty:'média',cycle_scope:'career-week' },
  { id:'weekly-recovery',title:'Carga controlada',description:'Realize 2 ações de recuperação.',mission_type:'semanal',objective_type:'use_recovery',target_count:2,xp_reward:90,coins_reward:80,difficulty:'média',cycle_scope:'career-week' },
  { id:'monthly-training',title:'Bloco de preparação',description:'Complete 12 sessões de treino no mês.',mission_type:'mensal',objective_type:'complete_training',target_count:12,xp_reward:300,coins_reward:240,difficulty:'alta',cycle_scope:'career-month' },
  { id:'monthly-matches',title:'Calendário competitivo',description:'Dispute 8 partidas no mês.',mission_type:'mensal',objective_type:'play_matches',target_count:8,xp_reward:380,coins_reward:300,difficulty:'alta',cycle_scope:'career-month' },
  { id:'monthly-tournaments',title:'Presença mensal',description:'Dispute 3 torneios no mês.',mission_type:'mensal',objective_type:'join_tournament',target_count:3,xp_reward:450,coins_reward:350,difficulty:'alta',cycle_scope:'career-month',requirements:['has-partner'] },
  { id:'season-wins',title:'Temporada consistente',description:'Vença 25 partidas na temporada.',mission_type:'sazonal',objective_type:'win_matches',target_count:25,xp_reward:1200,coins_reward:900,difficulty:'muito alta',cycle_scope:'career-season' },
  { id:'season-tour',title:'Presença no circuito',description:'Participe de 12 torneios na temporada.',mission_type:'sazonal',objective_type:'join_tournament',target_count:12,xp_reward:1000,coins_reward:750,difficulty:'muito alta',cycle_scope:'career-season',requirements:['has-partner'] },
  { id:'season-titles',title:'Temporada de campeão',description:'Conquiste 3 torneios na temporada.',mission_type:'sazonal',objective_type:'win_tournament',target_count:3,xp_reward:2000,coins_reward:1500,difficulty:'muito alta',cycle_scope:'career-season',requirements:['has-partner'],medal_reward:'Temporada de Campeão' },
];

function daysRemaining(careerDate, endDate) {
  const start = new Date(`${careerDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

// Hotfix "Single Source of Truth" (docs/ONBOARDING_SINGLE_SOURCE_OF_TRUTH.md,
// bug C): as etapas ACTION (nome/lado/dificuldade/estilo) salvavam o perfil
// e recarregavam esta página, mas nunca avisavam a Home/o Guia — os dois
// ficavam com a etapa antiga até o jogador navegar para outro lugar e
// voltar. Mesmo par de eventos que `confirmUnderstanding` já dispara para
// as etapas VISIT/FINISH.
function notifyProfileUpdated(profile, stepId) {
  if (!profile?.id || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: stepId } }));
  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile } }));
}

async function syncExtendedMissionCatalog() {
  let existing = await localGame.entities.Mission.list('-created_date', 300);
  const missing = findMissingMissionCatalog(existing, [...TUTORIAL_MISSIONS, ...EXTRA_MISSIONS]);
  if (missing.length) {
    try {
      const created = await localGame.entities.Mission.bulkCreate(missing.map(m => ({ ...m, is_active: true })));
      existing = [...existing, ...created];
    }
    catch {
      const refreshed = await localGame.entities.Mission.list('-created_date', 300);
      const stillMissing = findMissingMissionCatalog(refreshed, missing);
      for (const mission of stillMissing) await localGame.entities.Mission.create({ ...mission, is_active: true });
      existing = refreshed;
    }
  }
  const aliases = buildMissionAliasUpdates(existing);
  if (aliases.length) await localGame.entities.Mission.bulkUpdate(aliases);
}

let catalogSyncPromise = null;
function ensureExtendedMissionCatalog() {
  if (!catalogSyncPromise) {
    catalogSyncPromise = syncExtendedMissionCatalog().finally(() => { catalogSyncPromise = null; });
  }
  return catalogSyncPromise;
}

function Missions() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedMissionId = searchParams.get('mission');
  const [profile, setProfile] = useState(null);
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tutorial');
  const [savingChoice, setSavingChoice] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [draftHandedness, setDraftHandedness] = useState('right');
  const [draftSide, setDraftSide] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState(DEFAULT_NEW_CAREER_DIFFICULTY);
  const [draftStyle, setDraftStyle] = useState('');

  useEffect(() => { load(); }, []);
  // Mobile M3.7.2 (docs/MOBILE_M3_7_2_MATCH_DAY_REFRESH.md): esta página só
  // buscava tudo (perfil + missões + progresso) uma vez no mount — um
  // avanço de dia disparado em outro lugar do app (atalho global) nunca
  // chegava aqui, mesma causa raiz de Matches.jsx/Training.jsx. Recarrega
  // via `load()` (não só o perfil) porque missões/progresso também podem
  // mudar com o dia. Debounce de 150ms: mesmo padrão já usado em
  // Communications.jsx/AppLayout.jsx — o avanço de dia dispara
  // padel:profile-updated duas vezes (fase rápida + secundária).
  useEffect(() => {
    let timer = null;
    const debouncedLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; load(); }, 150);
    };
    window.addEventListener('padel:profile-updated', debouncedLoad);
    window.addEventListener('padel:career-advanced', debouncedLoad);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('padel:profile-updated', debouncedLoad);
      window.removeEventListener('padel:career-advanced', debouncedLoad);
    };
  }, []);

  useEffect(() => {
    if (!requestedMissionId || !missions.length) return;
    const requested = missions.find((mission) => String(mission.id) === requestedMissionId);
    if (requested?.mission_type) setTab(requested.mission_type);
  }, [missions, requestedMissionId]);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const user = await localGame.auth.me();
      let p = await ensureMyProfile(user);
      await ensureExtendedMissionCatalog();
      const missionsData = await safeModuleTask(
        () => localGame.entities.Mission.filter({ is_active: true }),
        { label: 'missões ativas', fallback: [] },
      );
      let progData = p ? await safeModuleTask(
        () => localGame.entities.MissionProgress.filter({ profile_id: p.id }),
        { label: 'progresso das missões', fallback: [] },
      ) : [];
      const syncedProgress = await safeModuleTask(
        () => syncMissionProgressPeriods(p, missionsData, progData),
        { label: 'sincronização das missões', fallback: [] },
      );
      if (Array.isArray(syncedProgress) && syncedProgress.length) {
        const progressById = new Map(progData.map((row) => [row.id, row]));
        syncedProgress.forEach((row) => { if (row?.id) progressById.set(row.id, row); });
        progData = [...progressById.values()];
      }
      const [registrations, matches, trainings] = await Promise.all([
        localGame.entities.CalendarEvent.filter({ profile_id: p.id, event_type: 'tournament' }).catch(() => []),
        localGame.entities.Match.list('-created_date', 50).catch(() => []),
        localGame.entities.TrainingSession.filter({ profile_id: p.id }).catch(() => []),
      ]);
      const reconciliation = await reconcilePersistedTutorial(p, { registrations, matches, trainings }, missionsData, progData);
      p = reconciliation.profile || p;
      progData = reconciliation.progressRows || progData;
      setDraftHandedness(p.handedness || 'right');
      setDraftSide(p.court_side || '');
      setProfile(p);
      setMissions(missionsData || []);
      setProgress(Object.fromEntries((progData || []).map(pr => [pr.mission_id, pr])));
      // Hotfix "Single Source of Truth": os 4 handlers de etapa ACTION
      // (nome/lado/dificuldade/estilo) chamam `load()` para recarregar o
      // estado local e precisam do perfil JÁ RECONCILIADO (com
      // tutorial_onboarding.currentStepId avançado) para poder notificar a
      // Home/o Guia via evento — devolver aqui evita uma segunda chamada de
      // reconciliação.
      return p;
    } catch (e) {
      console.error(e);
      setLoadError('Não foi possível carregar o catálogo de missões. Verifique o armazenamento local e tente novamente.');
      return null;
    }
    finally { setLoading(false); }
  }


  const tutorialStep = getCurrentTutorialStep(profile?.tutorial_onboarding);
  const tutorialStatus = profile?.tutorial_onboarding?.status;
  const onboardingStage = tutorialStatus === 'completed' ? 'completed' : tutorialStep?.id;

  async function chooseSide() {
    if (!COURT_SIDE_OPTIONS.some(side => side.id === draftSide) || !profile?.id) return;
    if (savingChoice) return;
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando lado...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        handedness: draftHandedness,
        dominant_hand: draftHandedness,
        court_side: draftSide,
        preferred_side: draftSide,
        play_style: null,
        onboarding_stage: 'style-selected',
      });
      await incrementMissionProgress(updated.id, 'choose_court_side', 1, updated.career_date);
      await localGame.entities.PlayerProfile.update(updated.id, { onboarding_stage: 'difficulty' });
      setActionFeedback('Lado salvo. Próximo passo: escolha a dificuldade da carreira.');
      notifyProfileUpdated(await load(), 'side-selected');
    } catch (error) {
      console.error('[tutorial] Falha ao salvar lado.', error);
      setActionError('Não foi possível salvar o lado. Tente novamente.');
      setActionFeedback('');
    } finally {
      setSavingChoice(false);
    }
  }

  async function chooseDifficulty(difficultyId) {
    if (!CAREER_DIFFICULTY_OPTIONS.some(option => option.id === difficultyId) || !profile?.id) return;
    if (savingChoice) return;
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando dificuldade...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        career_difficulty: difficultyId,
        onboarding_stage: 'style',
      });
      await incrementMissionProgress(updated.id, 'choose_career_difficulty', 1, updated.career_date);
      setActionFeedback('Dificuldade salva. Próximo passo: escolha seu estilo.');
      notifyProfileUpdated(await load(), 'difficulty-selected');
    } catch (error) {
      console.error('[tutorial] Falha ao salvar dificuldade.', error);
      setActionError('Não foi possível salvar a dificuldade. Tente novamente.');
      setActionFeedback('');
    } finally {
      setSavingChoice(false);
    }
  }

  async function saveAthleteName(event) {
    event.preventDefault();
    const name = athleteName.trim();
    if (savingChoice || !profile?.id || !name || name.length > 40) return;
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando nome...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: name });
      await incrementMissionProgress(updated.id, 'set_player_name', 1, updated.career_date);
      setAthleteName(name);
      setActionFeedback('Nome salvo. Próximo passo: escolha seu lado de jogo.');
      notifyProfileUpdated(await load(), 'athlete-named');
    } catch (error) {
      console.error('[tutorial] Falha ao salvar nome.', error);
      setActionError('Não foi possível salvar seu nome. Tente novamente.');
      setActionFeedback('');
    } finally { setSavingChoice(false); }
  }

  async function chooseStyle(style) {
    const side = profile?.court_side;
    if (!side || !PLAY_STYLE_OPTIONS.some(option => option.id === style)) return;
    if (savingChoice) return;
    const build = buildInitialProfile({ handedness: profile.handedness || 'right', preferredSide: side, playStyle: style, careerDifficultyId: profile.career_difficulty || 'hard' });
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando estilo...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        ...build.attributes,
        play_style: style,
        tactical_role: build.tactical_role,
        archetype_id: build.archetype_id,
        archetype_label: build.archetype_label,
        build_affinity: build.affinity,
        recommended_training_attributes: build.recommended_attributes,
        unspent_attribute_points: 0,
        onboarding_completed: false,
        onboarding_stage: 'first-training',
      });
      await incrementMissionProgress(updated.id, 'choose_play_style', 1, updated.career_date);
      setActionFeedback('Estilo salvo. Próximo passo: faça seu primeiro treino.');
      notifyProfileUpdated(await load(), 'style-selected');
    } catch (error) {
      console.error('[tutorial] Falha ao salvar estilo.', error);
      setActionError('Não foi possível salvar o estilo. Tente novamente.');
      setActionFeedback('');
    } finally {
      setSavingChoice(false);
    }
  }

  async function confirmUnderstanding() {
    if (!tutorialStep?.id || savingChoice || !profile?.id) return;

    setSavingChoice(true);
    setActionError('');
    setActionFeedback('Confirmando etapa...');

    try {
      const result = await completeTutorialStep({
        profile,
        stepId: tutorialStep.id,
        triggerSource: 'mission-center',
      });
      setProfile(result.profile);
      setProgress(Object.fromEntries((result.progressRows || []).map(row => [row.mission_id, row])));
      setActionFeedback('Etapa concluída. O próximo passo já está disponível.');
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: tutorialStep.id } }));
        window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: result.profile } }));
      }
      await load();
    } catch (error) {
      console.error('[tutorial] Falha ao confirmar entendimento.', {
        stepId: tutorialStep.id,
        error,
      });
      setActionFeedback('');
      setActionError(error?.message || 'Não foi possível confirmar esta etapa. Tente novamente.');
    } finally {
      setSavingChoice(false);
    }
  }

  const tutorialMissions = useMemo(() => missions.filter(m => m.mission_type === 'tutorial' && m.is_active !== false).sort((a, b) => Number(a.tutorial_order || 0) - Number(b.tutorial_order || 0)), [missions]);
  const nextTutorial = tutorialStatus === 'in_progress' ? resolveTutorialMission(tutorialStep, tutorialMissions) : null;
  const tutorialDone = getTutorialProgress(profile?.tutorial_onboarding).completed;
  const inlineAction = ['set_player_name', 'choose_court_side', 'choose_career_difficulty', 'choose_play_style'].includes(nextTutorial?.objective_type);
  const currentStepIndex = TUTORIAL_STEPS.findIndex(step => step.id === tutorialStep?.id);
  // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): esta página é montada via
  // <Outlet/> dentro de AppLayout — antes do memo no próprio componente (ver
  // export ao fim do arquivo), qualquer re-render do shell global (ex.: o
  // header de perfil/ranking atualizando, sem relação nenhuma com missões)
  // refazia esta filtragem/ordenação do zero. useMemo aqui garante que,
  // mesmo que o componente seja chamado de novo por algum motivo alheio,
  // este trabalho só roda quando os dados que ele realmente usa mudam.
  const completedStepIds = profile?.tutorial_onboarding?.completedStepIds;
  const anticipatedCompleted = useMemo(
    () => TUTORIAL_STEPS.filter((step, index) => index > currentStepIndex && completedStepIds?.includes(step.id)),
    [currentStepIndex, completedStepIds],
  );
  const buildPreview = draftStyle && profile?.court_side
    ? buildInitialProfile({ handedness: profile.handedness || 'right', preferredSide: profile.court_side, playStyle: draftStyle, careerDifficultyId: profile.career_difficulty || 'hard' })
    : null;
  const currentChapter = tutorialStep?.chapter;
  const categoryPool = useMemo(
    () => missions.filter(m => m.mission_type === tab && requirementsMet(m, profile, { tournamentsUnlocked: true, sponsorsUnlocked: false })),
    [missions, tab, profile],
  );
  const cycleId = tab === 'tutorial' ? 'tutorial:career' : missionPeriodKey(tab, profile?.career_date);
  const categoryLimit = tab === 'diaria' ? 3 : tab === 'semanal' ? 3 : 20;
  const filtered = useMemo(
    () => (tab === 'tutorial'
      ? tutorialMissions.filter(m => !currentChapter || m.tutorial_chapter === currentChapter)
      : deterministicMissionSelection(categoryPool, { careerId: profile?.id, cycleId, category: tab, limit: categoryLimit })),
    [tab, tutorialMissions, currentChapter, categoryPool, profile?.id, cycleId, categoryLimit],
  );
  const summary = useMemo(() => {
    const current = filtered;
    return { total: current.length, completed: current.filter(m => progress[m.id]?.claimed).length };
  }, [filtered, progress]);
  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.6): calcula status/locked
  // uma vez por missão (mesma lógica de antes, `missionStatus`) e separa em
  // ativas (renderizadas como card completo, como sempre) vs. concluídas
  // (recolhidas por padrão) — não muda nenhuma regra de missão, só onde
  // cada linha é desenhada.
  const missionRows = useMemo(() => filtered.map((m, index) => {
    const pr = progress[m.id];
    const status = missionStatus(pr, { locked: tab === 'tutorial' && !pr?.claimed && nextTutorial?.id !== m.id });
    return { mission: m, index, pr, status, done: status === 'rewarded', current: Number(pr?.progress || 0), locked: status === 'locked' };
  }), [filtered, progress, tab, nextTutorial?.id]);
  const activeMissionRows = useMemo(() => missionRows.filter((row) => !row.done), [missionRows]);
  const completedMissionRows = useMemo(() => missionRows.filter((row) => row.done), [missionRows]);

  if (loading) return <LoadingScreen />;
  const careerDate = profile?.career_date || '2026-01-01';
  const remaining = tab === 'tutorial' ? null : daysRemaining(careerDate, missionPeriodEndsAt(tab, careerDate));

  return (
    <Page>
      <PageContent className="max-w-6xl space-y-5">
        <PageHeader dense eyebrow="Carreira" title="Missões e tutorial" description="Aprenda os sistemas em sequência e acompanhe objetivos recorrentes sem perder o próximo passo." icon={Target} tone="premium" breadcrumb={['Carreira', 'Missões']} stats={<><StatusBadge tone={tutorialStatus === 'completed' ? 'success' : 'brand'}>{tutorialStatus === 'completed' ? 'Tutorial concluído' : `Tutorial ${tutorialDone}/${tutorialMissions.length}`}</StatusBadge><StatusBadge tone="premium">{profile?.coins || 0} moedas</StatusBadge>{remaining != null && <StatusBadge tone="info">{remaining === 0 ? 'Renova hoje' : `${remaining} dias restantes`}</StatusBadge>}</>} />
        {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.6): 4 StatCards
            grandes viram uma linha compacta. */}
        <CompactStats items={[
          { label: tab === 'tutorial' ? 'etapas' : 'objetivos', value: summary.total, icon: Target },
          { label: 'finalizados', value: summary.completed, icon: Check, tone: 'success' },
          { label: 'em andamento', value: Math.max(0, summary.total - summary.completed), icon: Clock, tone: 'warning' },
          { label: 'recompensa', value: 'automática', icon: Award, tone: 'premium' },
        ]} />
      {loadError && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button onClick={load} className="rounded-lg border border-amber-400/40 px-3 py-1.5 font-bold">Tentar novamente</button>
        </div>
      )}
      {inlineAction && onboardingStage !== 'completed' && <div id="tutorial-primary-action" className="glass rounded-3xl border border-primary/50 p-5 md:p-7 bg-primary/5 space-y-5">
        {nextTutorial?.objective_type === 'set_player_name' && <form onSubmit={saveAthleteName} className="space-y-4">
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Identidade do atleta</p><h2 className="text-2xl font-black mt-2">Como seu atleta será conhecido?</h2><p className="text-muted-foreground mt-2">Este nome aparece em partidas e notícias. O nome do save continua separado.</p></div>
          <label className="block text-sm font-bold" htmlFor="tutorial-athlete-name">Nome do atleta</label>
          <div className="flex gap-2"><input id="tutorial-athlete-name" autoFocus value={athleteName} onChange={event => setAthleteName(event.target.value)} onFocus={event => event.target.scrollIntoView({ block: 'center', behavior: 'smooth' })} maxLength={40} placeholder="Ex.: José Silva" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3"/><button type="submit" disabled={savingChoice || !athleteName.trim()} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Salvando...' : 'Salvar nome'}</button></div>
        </form>}

        {nextTutorial?.objective_type === 'choose_court_side' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Mão e lado preferencial</p><h2 className="text-2xl font-black mt-2">Como você ocupa a quadra?</h2><p className="text-muted-foreground mt-2">Mão dominante e lado são escolhas independentes. Nenhuma delas bloqueará estilos.</p></div>
          <fieldset><legend className="text-sm font-black mb-2">1. Mão dominante</legend><div className="grid md:grid-cols-2 gap-3">{DOMINANT_HANDS.map(hand => <button type="button" key={hand.id} disabled={savingChoice} onClick={() => setDraftHandedness(hand.id)} aria-pressed={draftHandedness === hand.id} className={`rounded-2xl border p-4 text-left ${draftHandedness === hand.id ? 'border-primary bg-primary/10' : 'border-border/70'}`}><strong>{hand.label}</strong><p className="mt-1 text-xs text-muted-foreground">{hand.description}</p></button>)}</div></fieldset>
          <fieldset><legend className="text-sm font-black mb-2">2. Lado preferencial</legend><div className="grid md:grid-cols-3 gap-3">{COURT_SIDE_OPTIONS.map(side => <button type="button" key={side.id} disabled={savingChoice} onClick={() => setDraftSide(side.id)} aria-pressed={draftSide === side.id} className={`rounded-2xl border p-4 text-left ${draftSide === side.id ? 'border-primary bg-primary/10' : 'border-border/70'}`}><strong>{side.label}</strong><p className="mt-1 text-xs text-muted-foreground">{side.description}</p></button>)}</div></fieldset>
          <button type="button" disabled={savingChoice || !draftSide} onClick={chooseSide} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Salvando...' : 'Confirmar mão e lado'}</button>
        </>}

        {nextTutorial?.objective_type === 'choose_career_difficulty' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Dificuldade da carreira</p><h2 className="text-2xl font-black mt-2">Como você quer evoluir?</h2><p className="text-muted-foreground mt-2">A dificuldade muda o ritmo da sua evolução — não deixa as partidas mais fáceis nem altera seu potencial final, só quanto tempo leva para chegar lá. Você pode trocar depois no perfil.</p></div>
          <div className="grid md:grid-cols-3 gap-3">{CAREER_DIFFICULTY_OPTIONS.map(option => <button type="button" key={option.id} disabled={savingChoice} onClick={() => setDraftDifficulty(option.id)} aria-pressed={draftDifficulty === option.id} className={`rounded-2xl border p-4 text-left relative ${draftDifficulty === option.id ? 'border-primary bg-primary/10' : 'border-border/70'}`}>
            {option.recommended && <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">Recomendado</span>}
            <strong>{option.label}</strong>
            <p className="mt-1 text-xs text-muted-foreground">{option.tagline}</p>
            <p className="mt-2 text-[10px] font-bold text-primary">Auge esperado: {option.expectedPeakSeasons.min}–{option.expectedPeakSeasons.max} temporadas</p>
            <ul className="mt-2 list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">{option.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>
          </button>)}</div>
          <button type="button" disabled={savingChoice || !draftDifficulty} onClick={() => chooseDifficulty(draftDifficulty)} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Salvando...' : 'Confirmar dificuldade'}</button>
        </>}

        {nextTutorial?.objective_type === 'choose_play_style' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Estilo e arquétipo</p><h2 className="text-2xl font-black mt-2">Escolha sua identidade tática</h2><p className="text-muted-foreground mt-2">Todos os estilos estão disponíveis para todos os lados. Afinidade é recomendação, não restrição.</p></div>
          <div className="grid md:grid-cols-2 gap-3">{PLAY_STYLE_OPTIONS.map(option => <button type="button" key={option.id} disabled={savingChoice} onClick={() => setDraftStyle(option.id)} aria-pressed={draftStyle === option.id} className={`rounded-2xl border p-4 text-left ${draftStyle === option.id ? 'border-primary bg-primary/10' : 'border-border/70'}`}><div className="flex justify-between gap-2"><h3 className="font-black">{option.label}</h3><span className="text-[10px] text-primary">{option.difficulty}</span></div><p className="mt-1 text-xs text-muted-foreground">{option.description}</p><p className="mt-2 text-[10px]">Função: <strong>{option.role}</strong></p></button>)}</div>
          {buildPreview && <section className="rounded-2xl border border-primary/40 bg-background/60 p-5" aria-label="Resumo do perfil inicial"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-primary font-bold">Seu atleta</p><h3 className="text-xl font-black">{buildPreview.archetype_label}</h3><p className="text-sm text-muted-foreground">{profile.handedness === 'left' ? 'Canhoto' : 'Destro'} · lado {profile.court_side} · {buildPreview.affinity.level} {buildPreview.affinity.score}/100 · {buildPreview.difficulty}</p></div><button type="button" disabled={savingChoice} onClick={() => chooseStyle(draftStyle)} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Salvando...' : 'Confirmar perfil'}</button></div><div className="mt-4 grid md:grid-cols-2 gap-4 text-xs"><div><strong>Pontos fortes</strong><ul className="mt-1 list-disc pl-4 text-muted-foreground">{buildPreview.strengths.map(key => <li key={key}>{ATTRIBUTE_LABELS[key]}</li>)}</ul></div><div><strong>Pontos a desenvolver</strong><ul className="mt-1 list-disc pl-4 text-muted-foreground">{buildPreview.weaknesses.map(key => <li key={key}>{ATTRIBUTE_LABELS[key]}</li>)}</ul></div></div><div className="mt-4 grid grid-cols-5 gap-2">{Object.entries(buildPreview.attributes).map(([key, value]) => <div key={key} className="rounded-lg bg-secondary/50 p-2 text-center"><span className="block text-[9px] text-muted-foreground">{ATTRIBUTE_LABELS[key]}</span><strong>{value}</strong></div>)}</div>{buildPreview.affinity.challenges.length > 0 && <p className="mt-3 text-xs text-amber-300"><strong>Desafios:</strong> {buildPreview.affinity.challenges.join('; ')}.</p>}<p className="mt-3 text-[11px] text-muted-foreground">Você pode voltar e comparar outros estilos antes de confirmar. Depois, os atributos podem evoluir livremente com treinos; o arquétipo define o ponto de partida, não um teto.</p></section>}
        </>}
      </div>}

      {actionFeedback && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{actionFeedback}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</p>}
      {anticipatedCompleted.length > 0 && <p role="status" className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">Ação antecipada reconhecida: {anticipatedCompleted.map(step => step.title).join(', ')}. Você não precisará repeti-la; conclua apenas o passo atual.</p>}

      {nextTutorial && !inlineAction ? <div className="glass rounded-2xl border border-primary/40 p-5 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center"><GraduationCap className="h-6 w-6 text-primary" /></div>
          <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-primary font-bold">Próximo passo do tutorial · {tutorialDone + 1}/{tutorialMissions.length}</p><h2 className="font-black text-lg mt-1">{nextTutorial.title}</h2><p className="text-sm text-muted-foreground mt-1">{nextTutorial.description}</p>{nextTutorial.why_it_matters && <p className="mt-2 text-xs"><strong>Por que isso importa?</strong> {nextTutorial.why_it_matters}</p>}
            <div className="mt-3 flex items-center gap-3"><ProgressBar value={progress[nextTutorial.id]?.progress || 0} max={nextTutorial.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{progress[nextTutorial.id]?.progress || 0}/{nextTutorial.target_count || 1}</span></div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {nextTutorial.completion_type === 'confirm_understanding' && tutorialStep?.kind !== 'VISIT' && isTutorialRouteMatch(nextTutorial.tutorial_route, location.pathname) ? (
              <button type="button" disabled={savingChoice} onClick={confirmUnderstanding} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Confirmando...' : 'Entendi, continuar'}</button>
            ) : nextTutorial.completion_type === 'confirm_understanding' && tutorialStep?.kind === 'VISIT' && isTutorialRouteMatch(nextTutorial.tutorial_route, location.pathname) ? (
              <span className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs font-bold text-primary">Você está no lugar certo</span>
            ) : nextTutorial.tutorial_route ? (
              <button type="button" onClick={() => navigate(nextTutorial.tutorial_route)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{nextTutorial.action_label || 'Ir agora'} <ArrowRight className="h-4 w-4" /></button>
            ) : null}
          </div>
        </div>
      </div> : !nextTutorial && tutorialStatus === 'completed' ? <div className="glass rounded-2xl border border-primary/40 p-5 flex items-center gap-4"><Award className="h-9 w-9 text-primary" /><div><p className="font-black">Tutorial concluído!</p><p className="text-sm text-muted-foreground">Você conheceu os principais sistemas do Padel Legacy.</p></div></div> : null}

      <Surface padding="compact" className="sticky top-2 z-20 bg-background/90 backdrop-blur-xl"><div className="flex gap-2 overflow-x-auto pb-1">{TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`min-w-[125px] flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm ${tab === t.key ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground hover:text-foreground'}`}><t.icon className="h-4 w-4" />{t.label}</button>)}</div></Surface>

      <div className="glass rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-muted-foreground">
        <RotateCcw className="h-4 w-4 text-primary shrink-0" />
        <span>{tab === 'tutorial' ? 'As etapas são liberadas em sequência. Ao concluir, a recompensa é entregue e a próxima etapa é desbloqueada.' : `Período atual: ${missionPeriodKey(tab, careerDate).split(':')[1]}. Renovação em ${remaining === 0 ? 'hoje' : `${remaining} dia${remaining === 1 ? '' : 's'}`}.`}</span>
      </div>

      {filtered.length === 0 ? <SectionCard title="Missões" icon={Target}><EmptyState icon={Target} message="Nenhuma missão ativa." /></SectionCard> : <div className="space-y-3 animate-stagger">
        {activeMissionRows.map(({ mission: m, index, status, done, current, locked }) => {
          return <div key={m.id} aria-current={String(m.id) === requestedMissionId ? 'true' : undefined} className={`pl-surface rounded-2xl border p-4 ${locked ? 'opacity-45' : ''} ${nextTutorial?.id === m.id || String(m.id) === requestedMissionId ? 'border-primary/60 ring-2 ring-primary/15' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${locked ? 'bg-secondary/60' : 'bg-amber-500/15'}`}>{locked ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Target className="h-5 w-5 text-amber-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold text-sm">{tab === 'tutorial' && <span className="text-primary mr-2">#{index + 1}</span>}{m.title}</p><span className="text-[10px] uppercase font-bold text-muted-foreground">{{rewarded:'Recompensa recebida',completed:'Concluída',locked:'Bloqueada',available:'Disponível',in_progress:'Em andamento',expired:'Expirada'}[status]}</span></div>
                <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                {m.why_it_matters && <p className="mt-2 text-xs"><strong>Por que importa:</strong> {m.why_it_matters}</p>}
                <div className="mt-3 flex items-center gap-3"><ProgressBar value={done ? m.target_count : current} max={m.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{done ? m.target_count : current}/{m.target_count || 1}</span></div>
                {(Number(m.xp_reward)>0||Number(m.coins_reward)>0||m.medal_reward) ? <div className="flex flex-wrap gap-3 mt-3 text-xs">{Number(m.xp_reward)>0&&<span className="flex items-center gap-1 text-cyan-400"><Zap className="h-3.5 w-3.5" />+{m.xp_reward} XP</span>}{Number(m.coins_reward)>0&&<span className="flex items-center gap-1 text-amber-400"><Coins className="h-3.5 w-3.5" />+{m.coins_reward}</span>}{m.medal_reward && <span className="flex items-center gap-1 text-primary"><Award className="h-3.5 w-3.5" />{m.medal_reward}</span>}</div> : <p className="mt-3 text-xs text-muted-foreground">Etapa informativa</p>}
              </div>
              {!locked && !done && m.tutorial_route && nextTutorial?.id !== m.id && <button type="button" onClick={() => navigate(m.tutorial_route)} className="text-xs font-bold text-primary inline-flex items-center gap-1">{m.action_label || 'Abrir'} <ArrowRight className="h-3.5 w-3.5" /></button>}
            </div>
          </div>;
        })}
        {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.6): missões já
            concluídas/recompensadas não precisam permanecer como cards
            grandes — viram uma linha compacta dentro de uma seção
            recolhida por padrão. */}
        {completedMissionRows.length > 0 && (
          <CollapsibleSection icon={Check} title={`Concluídas (${completedMissionRows.length})`} description="Recompensas já processadas.">
            <div className="space-y-2">
              {completedMissionRows.map(({ mission: m }) => (
                <CompactListItem
                  key={m.id}
                  leading={<div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0"><Check className="h-4 w-4 text-primary" /></div>}
                  title={m.title}
                  meta={[Number(m.xp_reward) > 0 ? `+${m.xp_reward} XP` : null, Number(m.coins_reward) > 0 ? `+${m.coins_reward} moedas` : null, m.medal_reward].filter(Boolean).join(' · ') || 'Recompensa recebida'}
                  trailing={null}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>}
      </PageContent>
    </Page>
  );
}

// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): página roteada (via
// <Outlet/>), sem props reais vindas do pai — memo evita que um re-render de
// AppLayout alheio a missões force esta página a refazer seu próprio
// trabalho quando nem seu estado local nem o contexto de carreira mudaram.
export default React.memo(Missions);
