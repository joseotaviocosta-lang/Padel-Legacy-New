// Mobile M3.3 — Performance Audit & Optimization (docs/MOBILE_M3_3_PERFORMANCE.md).
//
// Feedback de hardware real: "o jogo funciona, mas parece perceptivelmente
// lento". Este script cobre os invariantes de performance que podem ser
// verificados automaticamente (sem device físico) — estruturais (regex sobre
// o código real, mesmo padrão dos hotfixes anteriores) e comportamentais
// (custo real do motor via engine real, sem mocks).
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

const appSource = read('src/App.jsx');
const liveMatch = read('src/components/matches/LiveMatch.jsx');
const hitTestProbe = read('src/lib/hitTestProbe.js');
const performanceProbe = read('src/dev/performanceProbe.js');
const useKeyboardInset = read('src/hooks/useKeyboardInset.js');
const missions = read('src/pages/Missions.jsx');
const careerProvider = read('src/careers/CareerProvider.jsx');
const dayAdvanceCoordinator = read('src/game-core/dayAdvanceCoordinator.js');
const pkg = JSON.parse(read('package.json'));

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLE / LAZY LOADING (Partes 18-19)
// ═══════════════════════════════════════════════════════════════════════════

const routeModules = read('src/lib/routeModules.js');
const lazyPageCount = (routeModules.match(/\(\) => import\('@\/pages\//g) || []).length;
check('menos de 30 páginas continuam lazy-loaded via import() dinâmico', lazyPageCount >= 30);
check('App.jsx parou de usar lazy()/Suspense para as páginas (todas entrariam no bundle inicial)', appSource.includes('const lazyPage = (name) => lazy(PAGE_LOADERS[name]);') && appSource.includes('<Suspense'));
check('App.jsx importou uma página estaticamente em vez de via PAGE_LOADERS (entraria no chunk inicial)', !/^import \w+ from '@\/pages\//m.test(appSource));

// ═══════════════════════════════════════════════════════════════════════════
// LIVEMATCH — RENDER (Parte 6, 11)
// ═══════════════════════════════════════════════════════════════════════════

check('NarrationEntry deixou de ser memoizado (React.memo) — 120 itens seriam reexecutados a cada ponto', liveMatch.includes('const NarrationEntry = React.memo(function NarrationEntry({ event })'));
check('limite de 120 eventos renderizados na narração foi removido', liveMatch.includes('.slice(-120)'));
check('checkpoint do LiveMatch passou a gravar a cada ponto (deveria gravar só em momentos seguros, via assinatura)', liveMatch.includes('checkpointSignatureRef.current === signature'));
check('painéis inativos (tática/técnico/stats) passaram a ficar sempre montados (deveriam só montar quando activePanel os seleciona)', /activePanel === 'tactics' &&\s*\(/.test(liveMatch) && /activePanel === 'coach' &&\s*\(/.test(liveMatch) && /activePanel === 'stats' &&/.test(liveMatch));

// ═══════════════════════════════════════════════════════════════════════════
// LISTENERS (Partes 33-35)
// ═══════════════════════════════════════════════════════════════════════════

check('useKeyboardInset usa mais de um listener (deveria ser só visualViewport.resize)', (useKeyboardInset.match(/addEventListener/g) || []).length === 1);
check('useKeyboardInset perdeu o cleanup do listener de resize', useKeyboardInset.includes('removeEventListener'));
check('useKeyboardInset chama setState mesmo quando o valor não muda de fato (causaria update redundante)', useKeyboardInset.includes('const open =') && useKeyboardInset.includes('setKeyboardOpen(open)'));
check('LiveMatch (visibilitychange) perdeu o cleanup do listener', /document\.removeEventListener\('visibilitychange'/.test(liveMatch));

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG PROBES / LOGS (Partes 31-32)
// ═══════════════════════════════════════════════════════════════════════════

check('hitTestProbe deixou de ser opt-in (function isEnabled ausente)', hitTestProbe.includes('function isEnabled()') && hitTestProbe.includes('STORAGE_KEY'));
check('hitTestProbe registra listeners sem checar isEnabled() primeiro (rodaria sempre em produção)', /export function initHitTestProbe\(\) \{\s*if \(!isEnabled\(\)\) return;/.test(hitTestProbe));
check('performanceProbe.js não existe (instrumentação DEV-only)', fs.existsSync(path.join(root, 'src/dev/performanceProbe.js')));
check('performanceProbe não é DEV-only (rodaria/logaria em produção)', performanceProbe.includes('import.meta.env.DEV'));
check('performanceProbe usa console.log/console.warn incondicional em vez de console.debug guardado', !/^\s*console\.(log|warn)\(/m.test(performanceProbe));

// ═══════════════════════════════════════════════════════════════════════════
// MISSÕES — NÃO MONTAR TODAS AS ETAPAS (Parte 10)
// ═══════════════════════════════════════════════════════════════════════════

check('tutorial em Missions.jsx parou de filtrar por capítulo atual (montaria as etapas todas de uma vez)', missions.includes("filtered = tab === 'tutorial' ? tutorialMissions.filter(m => !currentChapter || m.tutorial_chapter === currentChapter)"));
check('categorias não-tutorial perderam o limite de itens exibidos por ciclo', /categoryLimit = tab === 'diaria' \? 3 : tab === 'semanal' \? 3 : \d+/.test(missions));

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUMENTAÇÃO ESTÁ REALMENTE LIGADA NOS PONTOS CERTOS (sem mudar lógica)
// ═══════════════════════════════════════════════════════════════════════════

check('CareerProvider não importa mais o performanceProbe (startup deixou de ser medido)', careerProvider.includes("import { timeAsync } from '@/dev/performanceProbe.js';"));
check('CareerProvider parou de medir o carregamento inicial da carreira', careerProvider.includes("timeAsync('startup: CareerProvider ready'"));
check('dayAdvanceCoordinator parou de medir o avanço de 1 dia', dayAdvanceCoordinator.includes("timeAsync('calendar: advance 1 day"));
check('advanceCareerDayOnce deixou de delegar para controller.run (instrumentação alterou o comportamento real)', dayAdvanceCoordinator.includes('() => controller.run(profile)'));
check('LiveMatch parou de marcar o início/fim do mount', liveMatch.includes("mark('livematch: render-start')") && liveMatch.includes("mark('livematch: mount-end')"));

check('script test:mobile-performance não está registrado em package.json', pkg.scripts?.['test:mobile-performance'] === 'node scripts/test-mobile-performance-m3-3.mjs');

// ═══════════════════════════════════════════════════════════════════════════
// COMPORTAMENTAL — custo real do motor (engine real, sem mock)
// ═══════════════════════════════════════════════════════════════════════════

function fakePlayer(id, name) {
  return { id, name, attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 }, energy: 90, fatigue: 10 };
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

let engineStats;
try {
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const teamA = [fakePlayer('p1', 'A'), fakePlayer('p2', 'B')];
  const teamB = [fakePlayer('p3', 'C'), fakePlayer('p4', 'D')];

  const perPointMs = [];
  for (let run = 0; run < 10; run += 1) {
    let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: `perf-regression-${run}` });
    let safety = 5000;
    while (!state.finished && safety-- > 0) {
      const start = performance.now();
      state = playPoint(state);
      perPointMs.push(performance.now() - start);
    }
  }
  perPointMs.sort((a, b) => a - b);
  const avg = perPointMs.reduce((s, v) => s + v, 0) / perPointMs.length;
  const p95 = perPointMs[Math.floor(perPointMs.length * 0.95)];
  engineStats = { avg, p95, samples: perPointMs.length };

  // Budget generoso (Parte 38): mesmo num dispositivo bem mais lento que este
  // ambiente de CI, um ponto isolado do motor não deveria se aproximar do
  // orçamento de frame do timer de autoplay (100ms no modo 10x). Isto pega
  // uma regressão algorítmica real (ex.: um novo O(n²) por ponto), não ruído
  // de máquina.
  check(`custo médio por ponto do motor ficou muito alto (${avg.toFixed(3)}ms, esperado < 20ms)`, avg < 20);
  check(`p95 do custo por ponto do motor ficou muito alto (${p95.toFixed(3)}ms, esperado < 50ms)`, p95 < 50);
} finally {
  await server.close();
}

console.log(`Motor: ${engineStats.samples} pontos, média ${engineStats.avg.toFixed(3)}ms, p95 ${engineStats.p95.toFixed(3)}ms — bem abaixo do orçamento de 100ms/tick do modo 10x.`);
console.log(`\ntest:mobile-performance OK — ${checks} verificações estruturais + comportamentais.`);
