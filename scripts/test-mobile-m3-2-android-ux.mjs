// Mobile M3.2 — Android UX Stability (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md).
//
// Novo teste em Android físico, feito DEPOIS de M3.1, revelou que "Continuar
// partida" ainda fechava a simulação sem avançar, que digitar o nome da
// carreira/atleta podia fechar o teclado a partir do 2º caractere, que
// páginas do onboarding não rolavam até o fim, e que a bottom nav podia
// cobrir conteúdo/CTAs — inclusive com o teclado Android aberto. Este script
// cobre as causas raiz encontradas para as 5 classes de bug (A-E do
// enunciado), com verificações estruturais (regex sobre o código real) e
// comportamentais (engine real via Vite SSR, mesmo padrão usado em
// test-tournament-resume-recovery.mjs para o caminho de torneio).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

const indexHtml = read('index.html');
const indexCss = read('src/index.css');
const appLayout = read('src/components/AppLayout.jsx');
const bottomNav = read('src/components/BottomNav.jsx');
const useOverlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
const useKeyboardInset = read('src/hooks/useKeyboardInset.js');
const page = read('src/components/design-system/Page.jsx');
const missions = read('src/pages/Missions.jsx');
const careerManager = read('src/pages/CareerManager.jsx');
const simulationModal = read('src/components/matches/SimulationModal.jsx');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
const liveMatch = read('src/components/matches/LiveMatch.jsx');
const recoveryBanner = read('src/components/career/ActiveMatchRecoveryBanner.jsx');
const matchesPage = read('src/pages/Matches.jsx');
const tournamentsPage = read('src/pages/Tournaments.jsx');
const appSource = read('src/App.jsx');
const practiceRecoveryEngineSource = read('src/game-core/practiceMatchRecoveryEngine.js');
const pkg = JSON.parse(read('package.json'));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA D/E — bottom nav, safe-area e teclado (Partes 1-2, 6-7, 10-12)
// ═══════════════════════════════════════════════════════════════════════════

// 1/2/29. reserva inferior de main deriva de um token compartilhado com a
// altura real da bottom nav + safe-area, em vez de um número solto.
check('main.pb deixou de derivar de --pl-bottom-nav-h (token compartilhado com BottomNav)', appLayout.includes('pb-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+'));
check('BottomNav.jsx parou de usar --pl-bottom-nav-h para a própria altura (token dessincronizaria dos dois lados)', bottomNav.includes('h-[var(--pl-bottom-nav-h)]'));
check('token --pl-bottom-nav-h foi removido de index.css', indexCss.includes('--pl-bottom-nav-h:'));
check('BottomNav perdeu o padding de safe-area inferior', bottomNav.includes('pb-[env(safe-area-inset-bottom)]'));

// 4/5/6. bottom nav pode ser ocultada com o teclado aberto e volta sozinha.
// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): BottomNav passou a ser
// `function BottomNav(...)` + `export default React.memo(BottomNav)` no fim
// do arquivo (memoização do shell), em vez de `export default function`
// inline — a prop `hidden` continua igual, só a forma do export mudou.
check('BottomNav parou de aceitar prop `hidden` (ocultar durante teclado)', /function BottomNav\(\{\s*hidden = false\s*\}\)/.test(bottomNav));
check('BottomNav não aplica translate-y-full quando hidden=true', bottomNav.includes("hidden ? 'translate-y-full' : 'translate-y-0'"));
check('AppLayout parou de repassar o estado do teclado para BottomNav', appLayout.includes('<BottomNav hidden={keyboardOpen} />'));
check('useKeyboardInset.js não existe mais (hook de detecção de teclado)', fs.existsSync(path.join(root, 'src/hooks/useKeyboardInset.js')));
check('useKeyboardInset usa mais de um listener pesado (deveria ser só visualViewport.resize)', (useKeyboardInset.match(/addEventListener/g) || []).length === 1);
check('useKeyboardInset não distingue rotação (mudança de largura) de teclado (mudança de altura)', useKeyboardInset.includes('widthStable'));
check('AppLayout parou de usar useKeyboardInset', appLayout.includes('useKeyboardInset()'));

// 19/20. meta viewport controla explicitamente o comportamento do teclado —
// sem isto, o layout viewport (100dvh, position:fixed) podia ignorar o
// teclado dependendo da versão do WebView Android, deixando a bottom nav e
// CTAs presos atrás/sob o teclado de forma inconsistente entre devices.
check('meta viewport perdeu interactive-widget=resizes-content (causa raiz de D/E)', indexHtml.includes('interactive-widget=resizes-content'));
check('meta viewport perdeu viewport-fit=cover (necessário para env(safe-area-inset-*) correto)', indexHtml.includes('viewport-fit=cover'));

// 7/8. documento continua sendo o único scroll container em mobile — nenhum
// overflow:hidden extra em html/body/#root que criaria um segundo container
// concorrente (arquitetura já validada: body só trava overflow via
// useOverlayBehavior enquanto um overlay está aberto, nunca globalmente).
check('body ganhou overflow-y:hidden fixo (quebraria o scroll principal do documento)', !/body\s*\{[^}]*overflow-y:\s*hidden/.test(indexCss));
check('#root ganhou height/overflow restritivo (criaria scroll container concorrente)', !/#root\s*\{[^}]*(height|overflow)/.test(indexCss));

// 10/11. Page.jsx continua sem impor altura/overflow fixos — precisa poder
// crescer com o conteúdo e deixar o documento rolar livremente até o fim.
check('Page.jsx passou a impor overflow-hidden ou height fixa na raiz da página', !/'pl-page pl-page-enter pl-auto-contain[^']*(overflow-hidden|h-screen|max-h-)/.test(page));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA B — input de nome de carreira/atleta fechando (Partes 4-5, 23)
// ═══════════════════════════════════════════════════════════════════════════

// Causa raiz real: o efeito de useOverlayBehavior tinha onClose/closeOnEscape
// nas deps — como a maioria dos callers passa `onClose` como arrow function
// inline (nova referência a cada re-render), digitar num input controlado
// dentro de um overlay reexecutava o efeito inteiro a cada tecla, e o
// cleanup chamava previousFocusRef.current?.focus(), arrancando o foco do
// input (fechando o teclado Android) no 2º caractere.
check('useOverlayBehavior voltou a colocar onClose/closeOnEscape nas deps do efeito principal (causa raiz do Problema B)', /\}, \[open, overlayId\]\);/.test(useOverlayBehavior));
check('onKey (Escape) do useOverlayBehavior voltou a ler onClose/closeOnEscape direto em vez dos refs', !/if \(event\.key === 'Escape' && closeOnEscape\)/.test(useOverlayBehavior) && useOverlayBehavior.includes("if (event.key === 'Escape' && closeOnEscapeRef.current)") && useOverlayBehavior.includes('onCloseRef.current?.()'));
check('timer de foco inicial voltou a ignorar um elemento já focado dentro do painel (brigaria com autoFocus)', useOverlayBehavior.includes('panelRef.current.contains(document.activeElement)'));

// 12/13. inputs de onboarding continuam controlados simples, sem handlers
// que dependam de estado que mude a cada tecla de forma perigosa (submit
// involuntário, remount por key, etc.) — e ganham scrollIntoView no foco
// para o campo não ficar coberto pelo teclado (Parte 8, só em formulário).
check('input de nome da carreira perdeu o scrollIntoView no foco (Parte 8, ficaria coberto pelo teclado)', /id="save-name"[\s\S]{0,220}onFocus=\{\(event\) => event\.target\.scrollIntoView/.test(careerManager));
check('input de nome do atleta perdeu o scrollIntoView no foco (Parte 8, ficaria coberto pelo teclado)', /id="tutorial-athlete-name"[\s\S]{0,220}onFocus=\{event => event\.target\.scrollIntoView/.test(missions));
check('LiveMatch/narração da partida passou a usar scrollIntoView (Parte 8 proíbe reaproveitar isso na narração)', !liveMatch.includes('scrollIntoView'));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA C — onboarding não rola até o fim (Partes 13-16)
// ═══════════════════════════════════════════════════════════════════════════

// As etapas de lado/estilo do tutorial (Missions.jsx) são conteúdo de página
// normal (mesmo scroll do documento) — não podem ganhar altura/overflow
// próprios que as isolem do scroll principal e escondam o CTA final.
const sideStepMatch = /choose_court_side' && <>([\s\S]*?)<\/>\}/.exec(missions);
check('não foi possível isolar o bloco de "lado preferencial" em Missions.jsx (regex desatualizado?)', Boolean(sideStepMatch));
if (sideStepMatch) check('etapa de lado/mão dominante ganhou max-height/overflow-hidden (impediria rolar até o CTA)', !/max-h-|overflow-hidden/.test(sideStepMatch[1]));
const styleStepMatch = /choose_play_style' && <>([\s\S]*?)<\/>\}/.exec(missions);
check('não foi possível isolar o bloco de "estilo" em Missions.jsx (regex desatualizado?)', Boolean(styleStepMatch));
if (styleStepMatch) check('etapa de estilo/arquétipo ganhou max-height/overflow-hidden (impediria rolar até o CTA)', !/max-h-|overflow-hidden/.test(styleStepMatch[1]));

// PositionSelection/OnboardingAttributes (etapas mais antigas, overlay
// próprio) usam dvh + overflow-y-auto no próprio painel — não podem regredir
// para um max-height fixo que quebra com o teclado aberto.
const positionSelection = read('src/components/career/PositionSelection.jsx');
const onboardingAttributes = read('src/components/career/OnboardingAttributes.jsx');
check('PositionSelection perdeu max-h baseado em dvh + overflow-y-auto próprio', positionSelection.includes('max-h-[calc(100dvh-2rem)]') && positionSelection.includes('overflow-y-auto'));
check('OnboardingAttributes deixou de rolar dentro do próprio overlay (overflow-y-auto)', onboardingAttributes.includes('overflow-y-auto'));

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA A — "Continuar partida" (treino) fechando sem avançar (Partes 17-22)
// ═══════════════════════════════════════════════════════════════════════════

// Causa raiz real: resumeMatch() confiava cegamente em checkpoint.engine_state
// sem validar formato/compatibilidade, e o LiveMatch da partida treino não
// tinha nenhum error boundary local — diferente do torneio (que já validava
// via probeTournamentRecoverySession + LiveMatchRecoveryBoundary desde antes
// deste hotfix). Qualquer exceção de render/runtime subia direto para o
// BetaErrorBoundary global, derrubando o app inteiro — o sintoma relatado de
// "abre e fecha sozinho, sem avançar".
check('practiceMatchRecoveryEngine.js não existe (sonda de checkpoint de treino)', fs.existsSync(path.join(root, 'src/game-core/practiceMatchRecoveryEngine.js')));
check('probePracticeRecoverySession não reaproveita a validação genérica de engine_state do torneio', practiceRecoveryEngineSource.includes("import { inspectResumableTournamentEngineState } from './tournamentMatchLifecycle.js'"));
check('probePracticeRecoverySession parou de rodar playPoint num clone antes de confiar no checkpoint (mesmo princípio do probe de torneio)', practiceRecoveryEngineSource.includes('playPoint(JSON.parse(JSON.stringify(checkpoint.engine_state)))'));
check('SimulationModal parou de importar probePracticeRecoverySession', simulationModal.includes("import { probePracticeRecoverySession } from '@/game-core/practiceMatchRecoveryEngine.js';"));
check('resumeMatch() (treino) parou de validar a sessão antes de montar o LiveMatch', /function resumeMatch\(\) \{[\s\S]{0,700}probePracticeRecoverySession\(checkpoint\)/.test(simulationModal));
check('resumeMatch() (treino) não descarta mais um checkpoint irrecuperável (session.status !== resumable)', /session\.status !== 'resumable'[\s\S]{0,150}clearCheckpoint\(\)/.test(simulationModal));
check('SimulationModal parou de importar LiveMatchRecoveryBoundary', simulationModal.includes("import LiveMatchRecoveryBoundary from '@/components/matches/LiveMatchRecoveryBoundary.jsx';"));
check('LiveMatch da partida treino (fase live) deixou de estar protegido por LiveMatchRecoveryBoundary', /phase === 'live' && teams && \(\s*<LiveMatchRecoveryBoundary key=\{liveMatchSessionKey\} onRecoveryError=\{handleLiveMatchCrash\}>/.test(simulationModal));
check('handleLiveMatchCrash não força uma nova sessão do LiveMatch (liveMatchSessionKey) após uma falha', simulationModal.includes('setLiveMatchSessionKey((value) => value + 1)'));
check('handleLiveMatchCrash não limpa o checkpoint corrompido/travado ao recuperar da falha', /function handleLiveMatchCrash\(error\) \{[\s\S]{0,300}getMatchCheckpointRepository\(\)\.clear\(careerId\)/.test(simulationModal));

// TournamentModal continua com a mesma proteção (regressão indireta se
// alguém remover o boundary do torneio ao editar este arquivo).
check('TournamentModal perdeu o LiveMatchRecoveryBoundary da partida ao vivo (torneio)', tournamentModal.includes('LiveMatchRecoveryBoundary') && tournamentModal.includes('onRecoveryError={(error) => handleResumeFailure(error, recoverySession)}'));

// 20/25. checkpoint não é apagado antes do restore, e finish continua
// limpando (comportamento pré-existente de M3.1 — não pode regredir aqui).
check('resumeMatch() (treino) limpa o checkpoint antes de confirmar que a sessão é resumable', !/function resumeMatch\(\) \{[\s\S]{0,100}clearCheckpoint/.test(simulationModal));
check('SimulationModal parou de limpar o checkpoint ao finalizar a partida treino', simulationModal.includes('getMatchCheckpointRepository().clear(careerId)'));

// 26. nenhuma rota 404 — reconfirma a tabela real do router (regressão desde
// M3.1, continua válida aqui).
const validRoutes = new Set([...appSource.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
check('não foi possível extrair rotas de App.jsx (regex desatualizado?)', validRoutes.size > 10);
for (const [label, source] of [
  ['ActiveMatchRecoveryBanner.jsx', recoveryBanner],
  ['SimulationModal.jsx', simulationModal],
  ['TournamentModal.jsx', tournamentModal],
  ['Matches.jsx', matchesPage],
  ['Tournaments.jsx', tournamentsPage],
]) {
  check(`${label} passou a referenciar a rota inexistente game/matches ou game/tournaments`, !/game\/(matches|tournaments)/.test(source));
}

check('script test:mobile-m3-android-ux não está registrado em package.json', pkg.scripts?.['test:mobile-m3-android-ux'] === 'node scripts/test-mobile-m3-2-android-ux.mjs');

// ═══════════════════════════════════════════════════════════════════════════
// COMPORTAMENTAL — engine real via Vite SSR (Parte 22 do enunciado)
// ═══════════════════════════════════════════════════════════════════════════

function fakePlayer(id, name) {
  return { id, name, attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 }, energy: 90, fatigue: 10 };
}
class FakeStorage {
  constructor() { this.files = new Map(); }
  async initialize() {}
  async ensureDirectory() {}
  async exists(p) { return this.files.has(p); }
  async readJsonIfExists(p, defaultValue) { return this.files.has(p) ? JSON.parse(this.files.get(p)) : defaultValue; }
  async writeJson(p, data) { this.files.set(p, JSON.stringify(data)); return data; }
  async remove(p) { return this.files.delete(p); }
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const matchModule = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const checkpointModule = await server.ssrLoadModule('/src/careers/MatchCheckpointRepository.js');
  const practiceRecoveryModule = await server.ssrLoadModule('/src/game-core/practiceMatchRecoveryEngine.js');
  const { createMatch, playPoint } = matchModule;
  const { MatchCheckpointRepository } = checkpointModule;
  const { probePracticeRecoverySession } = practiceRecoveryModule;

  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];

  // 23/24. checkpoint válido (mesmo formato salvo pelo LiveMatch real) →
  // "Continuar" avança de fato (playPoint muda o estado) e o checkpoint
  // continua existindo até a partida terminar de verdade.
  let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-2-practice-resume' });
  for (let i = 0; i < 6 && !state.finished; i += 1) state = playPoint(state);
  const storage = new FakeStorage();
  const repo = new MatchCheckpointRepository(storage);
  await repo.save('career-m32', { match_id: 'match-m32', type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: state });
  const restored = await repo.read('career-m32');
  const session = probePracticeRecoverySession(restored);
  check('checkpoint de treino válido não ficou "resumable" (regressão do probe)', session.status === 'resumable');
  const advanced = playPoint(session.engineState);
  check('"Continuar" (probe.engineState) não avança o placar/estado da partida', advanced.pointNumber === state.pointNumber + 1);
  check('checkpoint some antes da partida terminar (deveria continuar até o finish real)', await repo.exists('career-m32'));

  // 30. checkpoint com engine_state incompatível/corrompido (ex.: campo
  // essencial ausente, como um schema antigo) vira restart_required em vez
  // de estourar exceção — exatamente o caso que faltava validação em
  // SimulationModal e que o BetaErrorBoundary global engolia inteiro.
  const corrupted = JSON.parse(JSON.stringify(restored));
  corrupted.engine_state.stats = null;
  const corruptedSession = probePracticeRecoverySession(corrupted);
  check('checkpoint de treino com engine_state incompleto continuou "resumable" (deveria virar restart_required)', corruptedSession.status === 'restart_required');
  check('checkpoint de treino corrompido não relata o campo com problema (engine_stats)', corruptedSession.issues.includes('engine_stats'));

  // checkpoint totalmente ausente (ex.: arquivo apagado entre a leitura e o
  // clique em "Continuar") não pode ser tratado como resumable.
  const missingSession = probePracticeRecoverySession(null);
  check('checkpoint ausente (null) foi tratado como resumable', missingSession.status !== 'resumable');

  // partida chega ao fim normalmente a partir do estado retomado — prova
  // ponta a ponta de que o caminho de resume não trava a simulação real.
  let resumed = session.engineState;
  let safety = 4000;
  while (!resumed.finished && safety-- > 0) resumed = playPoint(resumed);
  check('partida retomada não chega ao fim jogando pontos normalmente', resumed.finished === true);
  await repo.clear('career-m32');
  check('checkpoint não foi removido após o finish real da partida retomada', await repo.exists('career-m32') === false);

  console.log('✓ checkpoint de treino válido reabre e avança o engine de verdade');
  console.log('✓ checkpoint de treino corrompido vira restart_required (nunca derruba o app)');
  console.log('✓ partida retomada termina normalmente e limpa o checkpoint no finish');
} finally {
  await server.close();
}

console.log(`test:mobile-m3-android-ux OK — ${checks} verificações estruturais + comportamentais (recovery de treino, foco/teclado, scroll do onboarding, bottom nav).`);
