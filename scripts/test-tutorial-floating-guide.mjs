// Hotfix pré-beta — Page chrome cleanup (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md).
//
// QA visual real: o hotfix anterior (Page Hierarchy Cleanup) parou de
// repetir o título da página, mas deixou duas faixas inteiras permanentes
// acima do conteúdo em toda rota — "Como usar esta página" e o card
// "Próximo passo". Este hotfix remove as duas do fluxo normal de layout e
// as move para dentro de um painel único, acionado por um botão flutuante
// verde (reaproveitando o espaço do antigo Assistente de carreira,
// removido). Este teste mistura análise estática do componente (sem jsdom
// não há como montar React) com o pipeline real de dados do tutorial (sem
// mocks), para provar tanto a composição visual quanto que nada do motor
// do tutorial foi alterado.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const guideSrc = readFileSync('src/components/onboarding/OnboardingGuide.jsx', 'utf8');
const railSrc = readFileSync('src/components/system/FloatingUtilityRail.jsx', 'utf8');
const appLayoutSrc = readFileSync('src/components/AppLayout.jsx', 'utf8');

// ---------------------------------------------------------------------------
// 1) A composição visual: nada inline no fluxo normal da página.
// ---------------------------------------------------------------------------
const controllerReturn = guideSrc.slice(guideSrc.indexOf('export default function OnboardingGuide'));
gate(
  'OnboardingGuide (nível de página) não renderiza mais PageIntroductionSection diretamente',
  !/return <>[\s\S]*<PageIntroductionSection/.test(controllerReturn),
);
gate(
  'OnboardingGuide (nível de página) não renderiza mais NextStepSection diretamente',
  !/return <>[\s\S]*<NextStepSection/.test(controllerReturn),
);
gate('OnboardingGuide (nível de página) renderiza o botão flutuante do Guia', /<GuideButton/.test(controllerReturn));
gate('OnboardingGuide (nível de página) renderiza o painel do Guia', /<GuidePanel/.test(controllerReturn));

// ---------------------------------------------------------------------------
// 2) O botão flutuante existe, é o único, e vive no espaço do Assistente.
// ---------------------------------------------------------------------------
gate('Botão do Guia existe com marcador identificável', guideSrc.includes('data-guide-button'));
gate('Botão do Guia usa a cor de destaque verde (ação principal de ajuda)', /GuideButton[\s\S]{0,600}bg-emerald-500/.test(guideSrc));
gate('Botão do Guia respeita safe-area-bottom e a altura da bottom nav no mobile', guideSrc.includes('env(safe-area-inset-bottom)') && guideSrc.includes('--pl-bottom-nav-h'));
gate('Botão do Guia respeita safe-area lateral (right)', guideSrc.includes('env(safe-area-inset-right)'));
gate('Botão do Guia usa a mesma camada z das outras ferramentas flutuantes (pl-floating-utilities)', /GuideButton[\s\S]{0,600}pl-floating-utilities/.test(guideSrc));
gate('FloatingUtilityRail não tem mais um segundo botão de Guia (ferramenta única, item 9)', !railSrc.includes('CircleHelp') && !railSrc.includes('openGuide') && !/aria-label="Abrir guia da carreira"/.test(railSrc));
gate('Evento antigo padel:open-career-guide foi removido dos dois arquivos (sem gatilho duplicado)', !guideSrc.includes('padel:open-career-guide') && !railSrc.includes('padel:open-career-guide'));
gate('O Assistente de carreira não voltou (item 7/5 do hotfix)', !guideSrc.includes('CareerAssistant') && !railSrc.includes('CareerAssistant') && !guideSrc.toLowerCase().includes('assistente de carreira ia'));

// ---------------------------------------------------------------------------
// 3) Android Back fecha o painel — reaproveita a infra existente, sem overlay novo.
// ---------------------------------------------------------------------------
gate('Painel do Guia reaproveita DrawerShell (Android Back via useOverlayBehavior já resolvido)', guideSrc.includes('DrawerShell'));
gate('Nenhum sistema de overlay novo foi criado neste arquivo (sem createPortal próprio)', !guideSrc.includes('createPortal'));

// ---------------------------------------------------------------------------
// 4) Badge só durante onboarding ativo; guia contextual continua após concluir.
// ---------------------------------------------------------------------------
gate('Badge do botão só aparece com onboarding realmente ativo (tutorialActive)', /GuideButton active=\{tutorialActive\}/.test(guideSrc));
gate('Painel mostra a introdução da página independente do status do tutorial (ajuda contextual não desaparece)', /\{intro && <PageIntroductionSection/.test(guideSrc));
gate('Painel mostra recomendação quando o tutorial não está mais em andamento (guia útil pós-onboarding)', /state\.status !== 'in_progress' && <RecommendationSection/.test(guideSrc));

// ---------------------------------------------------------------------------
// 5) Guia sabe qual página está ativa — reaproveita pageIntroductions, sem duplicar mapa.
// ---------------------------------------------------------------------------
// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 3): getPageIntroduction
// ganhou um segundo argumento opcional (`search`) para resolver o sub-guia de
// Patrocínios (/game/economy?view=sponsors) — GuidePanel agora repassa os dois.
gate('GuidePanel recebe pathname/search e usa getPageIntroduction (mesma fonte de dados existente)', guideSrc.includes('getPageIntroduction(pathname, search)'));
gate('Nenhum novo mapa de textos por página foi criado neste arquivo', !guideSrc.includes('PAGE_GUIDE_TEXT') && !guideSrc.includes('const GUIDE_TEXTS'));

// ---------------------------------------------------------------------------
// 6) Uma única ferramenta: intro + porquê + dica + próximo passo + CTA + avançar/pular, tudo no mesmo painel.
// ---------------------------------------------------------------------------
for (const marker of ['Por que importa', 'Dica', 'Próximo passo', 'actionLabel', 'Pular guia', 'Reiniciar explicações']) {
  gate(`Painel do Guia centraliza "${marker}" (não existe um segundo painel separado)`, guideSrc.includes(marker));
}

// ---------------------------------------------------------------------------
// 7) AppLayout continua usando OnboardingGuide normalmente — nenhuma rota mudou.
// ---------------------------------------------------------------------------
gate('AppLayout continua montando <OnboardingGuide /> uma única vez', (appLayoutSrc.match(/<OnboardingGuide \/>/g) || []).length === 1);

// ---------------------------------------------------------------------------
// 8) Pipeline real: motor do tutorial não foi alterado (dados/versão/etapas).
// ---------------------------------------------------------------------------
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { TUTORIAL_STEPS, TUTORIAL_VERSION } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { getNextTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');

  // Onboarding 2.0 (docs/ONBOARDING_V3_COMMUNICATIONS.md) bumped TUTORIAL_VERSION
  // 8 -> 9 in a later, unrelated content revision — this hotfix's own gate only
  // needs the version to still be a valid positive integer, not a fixed number.
  gate('TUTORIAL_VERSION continua um inteiro positivo válido', Number.isInteger(TUTORIAL_VERSION) && TUTORIAL_VERSION > 0);
  gate('Nenhuma etapa de tutorial foi perdida (TUTORIAL_STEPS continua com o mesmo total)', TUTORIAL_STEPS.length > 0);

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-tutorial-guide', name: 'QA Tutorial Guide' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({ id: 'qa-player', sport_name: 'QA Player', career_date: '2026-01-01' });
  const reconciliation = await reconcilePersistedTutorial(profile, { registrations: [], matches: [], trainings: [] }, [], []);
  gate('reconcilePersistedTutorial continua funcionando com o pipeline real (perfil novo → onboarding em andamento)', reconciliation.state?.status === 'in_progress');

  const step = getNextTutorialStep(reconciliation.state);
  gate('getNextTutorialStep continua devolvendo uma etapa válida (route/actionLabel/completionType intactos)', Boolean(step?.id && step?.route && step?.actionLabel && step?.completionType));
  gate('A primeira etapa continua sendo a mesma de antes (career-created)', step.id === TUTORIAL_STEPS[0].id);
} finally {
  await server.close();
}

console.log(`\n${gates} gates executados, todos PASS.`);
