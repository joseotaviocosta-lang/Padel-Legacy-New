import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Check, GraduationCap, RotateCcw } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { DrawerShell } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel.js';
import { getCareerRecommendations } from '@/onboarding/careerRecommendations.js';
import { getPageIntroduction } from '@/onboarding/pageIntroductions.js';
import { CORE_GAME_LOOP, GLOSSARY, TUTORIAL_STEPS } from '@/onboarding/tutorialSteps.js';
import { getNextTutorialStep } from '@/onboarding/tutorialState.js';
import { reconcilePersistedTutorial } from '@/onboarding/tutorialReconciliation.js';
import { completeTutorialStep, isTutorialRouteMatch } from '@/onboarding/tutorialEngine.js';
import { ensureTutorialMissionCatalog } from '@/lib/padel.js';

// Hotfix page chrome (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md): a introdução da
// página (antes uma faixa fixa acima do conteúdo) agora só existe dentro do
// painel do Guia — sem título repetido (mesma regra do hotfix anterior) e
// sempre com o conteúdo completo (não precisa mais de recolher/expandir,
// já que abrir o painel já é uma ação deliberada do jogador).
function PageIntroductionSection({ pathname, search }) {
  const intro = getPageIntroduction(pathname, search);
  if (!intro) return null;
  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4">
      <div className="flex items-center gap-3">
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-bold">{intro.description}</p>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p><strong>Por que importa:</strong> {intro.purpose}</p>
        <p className="text-muted-foreground"><strong>Dica:</strong> {intro.tip}</p>
      </div>
    </section>
  );
}

function NextStepSection({ state, step, isOnStepPage, confirmingStepId, confirmationError, onConfirm, onPersist, onClose }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4" aria-label="Orientação contextual do tutorial">
      {!state.welcomeSeen && <div className="mb-3 border-b border-primary/20 pb-3"><p className="text-xs font-bold uppercase tracking-wider text-primary">Bem-vindo ao Padel Legacy</p><p className="mt-1 text-sm">Construa seu atleta, forme uma dupla, vença torneios e deixe seu legado. Vamos preparar os primeiros passos.</p></div>}
      <div className="flex items-start gap-3">
        <GraduationCap className="h-6 w-6 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Próximo passo · {step.phase}</p>
          <h3 className="font-black leading-tight">{step.title}</h3>
          <p className="text-xs text-muted-foreground">{step.explanation}</p>
          <button type="button" onClick={() => setShowWhy((value) => !value)} className="mt-1 text-[11px] font-bold text-primary/80 hover:text-primary" aria-expanded={showWhy}>
            {showWhy ? 'Ocultar por que usar' : 'Por que usar?'}
          </button>
          {showWhy && <p className="mt-1 text-xs text-muted-foreground"><strong className="text-foreground">Por que usar:</strong> {step.whyItMatters}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isOnStepPage && step.completionType === 'confirm_understanding' && step.kind !== 'VISIT' ? (
          <button type="button" disabled={confirmingStepId === step.id} onClick={onConfirm} className="rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground disabled:opacity-60">{confirmingStepId === step.id ? 'Confirmando...' : 'Entendi, continuar'}</button>
        ) : isOnStepPage ? (
          <span className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs font-bold text-primary">Você está no lugar certo</span>
        ) : (
          <Link to={step.route} onClick={() => { onPersist(current => ({ ...current, welcomeSeen: true })); onClose(); }} className="rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">{step.actionLabel}</Link>
        )}
        {/* Hotfix page chrome: "Minimizar" existia para recolher a faixa
            permanente sem perder o lembrete. Sem faixa permanente (o botão
            flutuante já é o lembrete sempre visível), fechar o painel tem o
            mesmo efeito — o botão foi removido para não duplicar a ação de
            fechar. "Pular guia" continua, pois é uma ação diferente
            (dispensa o tutorial de verdade, não só fecha esta visão). */}
        <button onClick={() => onPersist(current => ({ ...current, status: 'skipped', tutorialSkipped: true, minimized: false, welcomeSeen: true }))} className="px-2 py-2 text-xs text-muted-foreground">Pular guia</button>
      </div>
      {confirmationError && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{confirmationError}</p>}
    </section>
  );
}

function RecommendationSection({ recommendation, onClose }) {
  if (!recommendation) return null;
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 text-xs">
      <span className="rounded-full bg-primary/15 px-2 py-1 font-bold text-primary">{recommendation.importance}</span>
      <div className="flex-1"><strong>{recommendation.title}</strong><span className="text-muted-foreground"> · {recommendation.explanation}</span></div>
      <Link to={recommendation.route} onClick={onClose} className="font-bold text-primary">{recommendation.actionLabel}</Link>
    </section>
  );
}

// Hotfix page chrome — item 29: duas responsabilidades separadas.
// `GuideButton` é só a UI do gatilho flutuante (sempre visível, sem lógica
// de dados); `GuidePanel` é o painel contextual (reaproveita DrawerShell,
// que já resolve Android Back via useOverlayBehavior/overlayBackStack —
// nenhum overlay novo). Ambos recebem o estado já calculado pelo
// controller (`OnboardingGuide`, abaixo).
function GuideButton({ active, onClick }) {
  return (
    <button
      type="button"
      data-guide-button
      onClick={onClick}
      aria-label="Abrir guia da carreira"
      title="Guia da carreira"
      className="pl-floating-utilities pointer-events-auto fixed bottom-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] right-[max(0.75rem,env(safe-area-inset-right))] flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-xl transition-transform hover:scale-105 hover:brightness-110 md:bottom-5 md:right-5 md:h-14 md:w-14"
    >
      <GraduationCap className="h-6 w-6" />
      {active && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />}
    </button>
  );
}

function GuidePanel({
  open, onClose, pathname, search, isMissionCenter, state, step, isOnStepPage,
  confirmingStepId, confirmationError, onConfirm, onPersist, onRestart, recommendation,
}) {
  const intro = !isMissionCenter ? getPageIntroduction(pathname, search) : null;
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={(
        <span className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-primary shrink-0" />
          <span>Guia da carreira</span>
        </span>
      )}
      description="Ajuda contextual desta página e o restante do tutorial."
      size="lg"
    >
      <div className="space-y-4">
        {intro && <PageIntroductionSection pathname={pathname} search={search} />}
        {!isMissionCenter && state.status === 'in_progress' && step && (
          <NextStepSection
            state={state}
            step={step}
            isOnStepPage={isOnStepPage}
            confirmingStepId={confirmingStepId}
            confirmationError={confirmationError}
            onConfirm={onConfirm}
            onPersist={onPersist}
            onClose={onClose}
          />
        )}
        {state.status !== 'in_progress' && <RecommendationSection recommendation={recommendation} onClose={onClose} />}

        <section><h3 className="font-black">Ciclo principal</h3><div className="mt-3 flex flex-wrap gap-2">{CORE_GAME_LOOP.map((item, index) => <span key={item} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{index + 1}. {item}</span>)}</div></section>
        <section><div className="flex items-center justify-between gap-2"><h3 className="font-black">Tutorial</h3><button onClick={onRestart} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold"><RotateCcw className="h-3.5 w-3.5"/> Reiniciar explicações</button></div><div className="mt-3 space-y-1.5">{TUTORIAL_STEPS.map(tutorialStep => <div key={tutorialStep.id} className="flex gap-2 rounded-lg bg-secondary/35 p-2.5"><span className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center ${state?.completedSteps?.includes(tutorialStep.id) ? 'bg-emerald-500 text-white' : 'border border-border'}`}>{state?.completedSteps?.includes(tutorialStep.id) && <Check className="h-3 w-3"/>}</span><div><p className="text-sm font-bold">{tutorialStep.title}</p><p className="text-xs text-muted-foreground">{tutorialStep.explanation}</p></div></div>)}</div></section>
        <section><h3 className="font-black">Glossário</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(GLOSSARY).map(([term, description]) => <div key={term} className="rounded-xl border border-border/60 p-3"><dt className="text-sm font-bold">{term}</dt><dd className="mt-1 text-xs text-muted-foreground">{description}</dd></div>)}</dl></section>
      </div>
    </DrawerShell>
  );
}

export default function OnboardingGuide() {
  const location = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState({ registrations: [], matches: [], trainings: [] });
  const [state, setState] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmingStepId, setConfirmingStepId] = useState(null);
  const [confirmationError, setConfirmationError] = useState('');
  const autoCompletingStepIdRef = useRef(null);

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

  // Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 1): etapas
  // `kind: 'VISIT'` concluem sozinhas ao visitar a rota correta — o
  // jogador não precisa abrir o Guia e clicar "Entendi" para provar que
  // esteve na página. Roda aqui (não em MissionNotificationBridge.jsx, que
  // só dispara em navegação PUSH) porque este efeito já reage a
  // `location.pathname` desde a primeira montagem, cobrindo o caso de
  // aterrissar em /game logo após a criação do atleta (normalmente um
  // `replace`, não um `push`).
  useEffect(() => {
    if (!profile?.id || !step?.id || state?.status !== 'in_progress') return undefined;
    if (step.kind !== 'VISIT' || !isOnStepPage) return undefined;
    if (autoCompletingStepIdRef.current === step.id) return undefined;
    autoCompletingStepIdRef.current = step.id;
    let cancelled = false;
    (async () => {
      try {
        const result = await completeTutorialStep({ profile, stepId: step.id, triggerSource: 'auto-visit' });
        if (cancelled) return;
        setProfile(result.profile);
        setState(result.state);
        window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: step.id } }));
        // CareerHub.jsx (Home) só escuta padel:profile-updated/padel:career-
        // advanced para refrescar o próprio `profile` local — sem isto, a
        // etapa concluída automaticamente não chegaria ao CTA principal da
        // Home até a próxima navegação.
        window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: result.profile } }));
        const { dismiss } = toast({ title: '✓ Etapa concluída', description: step.title });
        setTimeout(dismiss, 1800);
      } catch (error) {
        console.error('[onboarding] Falha ao concluir etapa automaticamente.', { stepId: step.id, error });
      } finally {
        if (!cancelled) autoCompletingStepIdRef.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [profile, step, isOnStepPage, state?.status, toast]);

  const confirmCurrentStep = useCallback(async () => {
    if (!profile?.id || !step?.id || step.completionType !== 'confirm_understanding' || confirmingStepId) return;
    setConfirmingStepId(step.id);
    setConfirmationError('');
    try {
      const result = await completeTutorialStep({ profile, stepId: step.id, triggerSource: 'context-guide' });
      setProfile(result.profile);
      setState(result.state);
      window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: step.id } }));
      window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: result.profile } }));
    } catch (error) {
      console.error('[onboarding] Falha ao confirmar etapa.', { stepId: step.id, error });
      setConfirmationError(error?.message || 'Não foi possível concluir esta etapa.');
    } finally {
      setConfirmingStepId(null);
    }
  }, [confirmingStepId, profile, step]);

  if (!profile || !state) return null;

  // Hotfix page chrome — item 11: badge só enquanto o onboarding está
  // realmente ativo; tutorial concluído/pulado deixa o botão sem badge,
  // mas continua útil como guia contextual da página. Na página de
  // missões (que já ensina o próprio onboarding inline) o botão continua
  // acessível — só o conteúdo de introdução/próximo passo dentro do painel
  // fica oculto (GuidePanel já trata isso via `isMissionCenter`), igual ao
  // comportamento anterior das duas faixas inline.
  const tutorialActive = !isMissionCenter && state.status === 'in_progress' && Boolean(step);

  return <>
    <GuideButton active={tutorialActive} onClick={() => setHelpOpen(true)} />
    <GuidePanel
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      pathname={location.pathname}
      search={location.search}
      isMissionCenter={isMissionCenter}
      state={state}
      step={step}
      isOnStepPage={isOnStepPage}
      confirmingStepId={confirmingStepId}
      confirmationError={confirmationError}
      onConfirm={confirmCurrentStep}
      onPersist={persist}
      onRestart={() => persist(current => ({ ...current, status: 'in_progress', tutorialSkipped: false, minimized: false, welcomeSeen: false, pageIntroductionsSeen: [], collapsedIntroductions: [] }))}
      recommendation={recommendation}
    />
  </>;
}
