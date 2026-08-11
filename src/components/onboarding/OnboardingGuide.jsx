import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Check, ChevronDown, ChevronUp, CircleHelp, GraduationCap, RotateCcw } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { DrawerShell } from '@/components/design-system';
import { ensureMyProfile } from '@/lib/padel.js';
import { getCareerRecommendations } from '@/onboarding/careerRecommendations.js';
import { getPageIntroduction } from '@/onboarding/pageIntroductions.js';
import { CORE_GAME_LOOP, GLOSSARY, TUTORIAL_STEPS } from '@/onboarding/tutorialSteps.js';
import { getNextTutorialStep } from '@/onboarding/tutorialState.js';
import { reconcilePersistedTutorial } from '@/onboarding/tutorialReconciliation.js';
import { completeTutorialStep, isTutorialRouteMatch } from '@/onboarding/tutorialEngine.js';
import { ensureTutorialMissionCatalog } from '@/lib/padel.js';

function PageIntroduction({ pathname, state, onStateChange }) {
  const intro = getPageIntroduction(pathname);
  if (!intro) return null;
  const collapsedIntroductions = state?.collapsedIntroductions || [];
  const collapsed = collapsedIntroductions.includes(pathname);
  return (
    <section className="mx-3 mt-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2.5 sm:mx-4 md:mx-6 md:mt-4 md:rounded-2xl md:px-4 md:py-3" aria-label={`Introdução: ${intro.title}`}>
      <div className="flex items-center gap-3">
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0"><h2 className="text-sm font-bold">{intro.title}</h2>{collapsed && <p className="text-xs text-muted-foreground truncate">{intro.description}</p>}</div>
        <button type="button" onClick={() => onStateChange(current => ({ ...current, collapsedIntroductions: collapsed ? (current.collapsedIntroductions || []).filter(item => item !== pathname) : [...(current.collapsedIntroductions || []), pathname] }))} className="rounded-lg p-2 hover:bg-secondary" aria-expanded={!collapsed} aria-label={collapsed ? 'Expandir explicação' : 'Recolher explicação'}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && <div className="mt-3 grid gap-2 text-xs md:grid-cols-3"><p>{intro.description}</p><p><strong>Por que importa:</strong> {intro.purpose}</p><p className="text-muted-foreground"><strong>Dica:</strong> {intro.tip}</p></div>}
    </section>
  );
}

function HelpCenter({ open, onClose, state, onRestart }) {
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={(
        <span className="flex items-center gap-3">
          <CircleHelp className="h-6 w-6 text-primary shrink-0" />
          <span>Guia da carreira</span>
        </span>
      )}
      description="Reveja o tutorial quando quiser."
      size="lg"
    >
      <section><h3 className="font-black">Ciclo principal</h3><div className="mt-3 flex flex-wrap gap-2">{CORE_GAME_LOOP.map((item, index) => <span key={item} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{index + 1}. {item}</span>)}</div></section>
      <section className="mt-5"><div className="flex items-center justify-between gap-2"><h3 className="font-black">Tutorial</h3><button onClick={onRestart} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold"><RotateCcw className="h-3.5 w-3.5"/> Reiniciar explicações</button></div><div className="mt-3 space-y-1.5">{TUTORIAL_STEPS.map(step => <div key={step.id} className="flex gap-2 rounded-lg bg-secondary/35 p-2.5"><span className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center ${state?.completedSteps?.includes(step.id) ? 'bg-emerald-500 text-white' : 'border border-border'}`}>{state?.completedSteps?.includes(step.id) && <Check className="h-3 w-3"/>}</span><div><p className="text-sm font-bold">{step.title}</p><p className="text-xs text-muted-foreground">{step.explanation}</p></div></div>)}</div></section>
      <section className="mt-7"><h3 className="font-black">Glossário</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(GLOSSARY).map(([term, description]) => <div key={term} className="rounded-xl border border-border/60 p-3"><dt className="text-sm font-bold">{term}</dt><dd className="mt-1 text-xs text-muted-foreground">{description}</dd></div>)}</dl></section>
    </DrawerShell>
  );
}

export default function OnboardingGuide() {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState({ registrations: [], matches: [], trainings: [] });
  const [state, setState] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmingStepId, setConfirmingStepId] = useState(null);
  const [confirmationError, setConfirmationError] = useState('');

  const load = useCallback(async () => {
    try {
      const user = await localGame.auth.me();
      const currentProfile = await ensureMyProfile(user);
      if (!currentProfile?.id) return;
      const [registrations, matches, trainings, missions, progressRows] = await Promise.all([
        localGame.entities.CalendarEvent.filter({ profile_id: currentProfile.id, event_type: 'tournament' }).catch(() => []),
        localGame.entities.Match.list('-created_date', 20).catch(() => []),
        localGame.entities.TrainingSession.filter({ profile_id: currentProfile.id }).catch(() => []),
        ensureTutorialMissionCatalog().catch(() => []),
        localGame.entities.MissionProgress.filter({ profile_id: currentProfile.id }).catch(() => []),
      ]);
      const currentFacts = { registrations, matches, trainings };
      const reconciliation = await reconcilePersistedTutorial(currentProfile, currentFacts, missions, progressRows);
      setProfile(reconciliation.profile || currentProfile); setFacts(currentFacts); setState(reconciliation.state);
    } catch (error) { console.error('[onboarding] Falha ao carregar orientação.', error); }
  }, []);

  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('padel:mission-completed', refresh);
    window.addEventListener('padel:onboarding-refresh', refresh);
    return () => { window.removeEventListener('padel:mission-completed', refresh); window.removeEventListener('padel:onboarding-refresh', refresh); };
  }, [load]);

  const persist = useCallback(async updater => {
    const next = typeof updater === 'function' ? updater(state) : updater;
    setState(next);
    if (profile?.id) {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, { tutorial_onboarding: next });
      setProfile(updated);
    }
  }, [profile, state]);

  useEffect(() => {
    if (!state || (state.pageIntroductionsSeen || []).includes(location.pathname)) return;
    persist(current => ({ ...current, pageIntroductionsSeen: [...(current.pageIntroductionsSeen || []), location.pathname] }));
  }, [location.pathname, persist, state]);

  const step = getNextTutorialStep(state);
  const recommendation = useMemo(() => getCareerRecommendations(profile, facts)[0], [profile, facts]);
  const isMissionCenter = location.pathname === '/game/missions';
  const stepPath = step?.route?.split('?')[0];
  const isOnStepPage = Boolean(stepPath && isTutorialRouteMatch(step.route, location.pathname));

  const confirmCurrentStep = useCallback(async () => {
    if (!profile?.id || !step?.id || step.completionType !== 'confirm_understanding' || confirmingStepId) return;
    setConfirmingStepId(step.id);
    setConfirmationError('');
    try {
      const result = await completeTutorialStep({ profile, stepId: step.id, triggerSource: 'context-guide' });
      setProfile(result.profile);
      setState(result.state);
      window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: step.id } }));
    } catch (error) {
      console.error('[onboarding] Falha ao confirmar etapa.', { stepId: step.id, error });
      setConfirmationError(error?.message || 'Não foi possível concluir esta etapa.');
    } finally {
      setConfirmingStepId(null);
    }
  }, [confirmingStepId, profile, step]);

  if (!profile || !state) return null;

  return <>
    {!isMissionCenter && <PageIntroduction pathname={location.pathname} state={state} onStateChange={persist}/>}
    {!isMissionCenter && !state.minimized && state.status === 'in_progress' && step && <aside className="mx-3 mt-2 rounded-xl border border-primary/40 bg-primary/10 p-3 sm:mx-4 md:mx-6 md:mt-3 md:rounded-2xl md:p-4" aria-label="Orientação contextual do tutorial">
      {!state.welcomeSeen && <div className="mb-3 border-b border-primary/20 pb-3"><p className="text-xs font-bold uppercase tracking-wider text-primary">Bem-vindo ao Padel Legacy</p><p className="mt-1 text-sm">Construa seu atleta, forme uma dupla, vença torneios e deixe seu legado. Vamos preparar os primeiros passos.</p></div>}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <GraduationCap className="h-7 w-7 text-primary shrink-0"/>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Próximo passo · {step.phase}</p>
          <h2 className="font-black">{step.title}</h2>
          <p className="text-xs text-muted-foreground">{step.explanation}</p>
          <p className="mt-1 text-xs"><strong>Por que usar:</strong> {step.whyItMatters}</p>
        </div>
        {isOnStepPage && step.completionType === 'confirm_understanding' ? (
          <button type="button" disabled={confirmingStepId === step.id} onClick={confirmCurrentStep} className="rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground disabled:opacity-60">{confirmingStepId === step.id ? 'Confirmando...' : 'Entendi, continuar'}</button>
        ) : isOnStepPage ? (
          <span className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs font-bold text-primary">Você está no lugar certo</span>
        ) : (
          <Link to={step.route} onClick={() => persist(current => ({ ...current, welcomeSeen: true }))} className="rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">{step.actionLabel}</Link>
        )}
        <button onClick={() => persist(current => ({ ...current, minimized: true, welcomeSeen: true }))} className="rounded-xl border px-3 py-2 text-xs font-bold">Minimizar</button>
        <button onClick={() => persist(current => ({ ...current, status: 'skipped', tutorialSkipped: true, minimized: false, welcomeSeen: true }))} className="px-2 py-2 text-xs text-muted-foreground">Pular guia</button>
      </div>
      {confirmationError && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{confirmationError}</p>}
    </aside>}
    {!isMissionCenter && state.minimized && state.status === 'in_progress' && step && <button onClick={() => persist(current => ({ ...current, minimized: false }))} className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-3 z-40 max-w-[calc(100vw-1.5rem)] truncate rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xl md:bottom-20 md:right-5">Próximo passo: {step.title}</button>}
    {state.status !== 'in_progress' && recommendation && <div className="mx-4 md:mx-8 mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3 text-xs"><span className="rounded-full bg-primary/15 px-2 py-1 font-bold text-primary">{recommendation.importance}</span><div className="flex-1"><strong>{recommendation.title}</strong><span className="text-muted-foreground"> · {recommendation.explanation}</span></div><Link to={recommendation.route} className="font-bold text-primary">{recommendation.actionLabel}</Link></div>}
    <button
      type="button"
      data-layout-fullbleed
      onClick={() => setHelpOpen(true)}
      className="career-help-fab fixed bottom-[calc(8.75rem+env(safe-area-inset-bottom))] right-3 z-50 flex h-11 w-11 min-w-0 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background p-0 text-primary shadow-xl md:bottom-20 md:right-5"
      aria-label="Abrir guia e glossário"
      title="Guia da carreira"
    ><CircleHelp className="h-5 w-5"/></button>
    <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} state={state} onRestart={() => persist(current => ({ ...current, status: 'in_progress', tutorialSkipped: false, minimized: false, welcomeSeen: false, pageIntroductionsSeen: [], collapsedIntroductions: [] }))}/>
  </>;
}
