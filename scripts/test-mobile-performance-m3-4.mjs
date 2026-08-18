// M3.4 — Physical Device Performance Profiling (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md).
//
// Teste real do APK release num Android físico mostrou que a lentidão
// percebida é praticamente a mesma do `npm run android:dev` — ou seja,
// não é (só) Vite/HMR/rede, existe gargalo real de runtime/render. Esta
// fase criou instrumentação de perfdebug (funciona no bundle RELEASE,
// diferente de `mark`/`measure`/`timeAsync` que são cortados em produção)
// e aplicou duas correções encontradas por evidência estática:
//   1. o mobile aumentava o backdrop-blur (16px+saturate) em vez de
//      diminuir — .glass/.glass-premium aparecem ~276x na árvore JSX;
//   2. CommunicationBell (no shell global, renderiza em toda página)
//      recalculava o filtro de "não lidas" sem useMemo.
// Não é possível medir FPS real do WebView Android em Node — este teste
// cobre a MATEMÁTICA pura da instrumentação (buckets de frame/lag) e
// guarda estaticamente que a arquitetura das correções está no lugar,
// para o gargalo não voltar sem ser notado.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (relPath) => readFileSync(relPath, 'utf8');

// ---------------------------------------------------------------------------
// 1) Matemática pura de FPS/frame stats (Parte 3).
// ---------------------------------------------------------------------------
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const probe = await server.ssrLoadModule('/src/dev/performanceProbe.js');

  // 60fps perfeito: 120 frames de ~16.67ms.
  const smooth = Array.from({ length: 120 }, () => 16.67);
  const smoothStats = probe.computeFrameStats(smooth);
  gate('60fps constante → fps calculado ~60', smoothStats.fps >= 59 && smoothStats.fps <= 60);
  gate('60fps constante → nenhum frame > 33ms', smoothStats.over33 === 0);

  // Cenário misto: metade a 16.67ms, metade a 40ms (jank real).
  const jank = [...Array.from({ length: 60 }, () => 16.67), ...Array.from({ length: 60 }, () => 40)];
  const jankStats = probe.computeFrameStats(jank);
  gate('Frames mistos: over33 conta exatamente os frames de 40ms', jankStats.over33 === 60);
  gate('Frames mistos: over16 conta só o grupo de 40ms (16.67ms fica abaixo do limiar 16.7ms)', jankStats.over16 === 60);
  gate('Frames mistos: over50/over100 ficam zerados (nenhum frame passa desses limiares)', jankStats.over50 === 0 && jankStats.over100 === 0);

  // Frame catastrófico isolado.
  const catastrophic = [...Array.from({ length: 30 }, () => 16.67), 850];
  const catastrophicStats = probe.computeFrameStats(catastrophic);
  gate('Pior frame reportado corretamente', catastrophicStats.worstFrameMs === 850);
  gate('Frame catastrófico entra em over100', catastrophicStats.over100 === 1);

  gate('Sem frames → computeFrameStats devolve null (não quebra o overlay)', probe.computeFrameStats([]) === null);

  // ── Buckets de lag do event loop (Parte 5) ──
  gate('Lag de 30ms não entra em nenhum bucket (abaixo do menor limiar)', probe.bucketEventLoopLag(30) === null);
  gate('Lag de 60ms → bucket >50ms', probe.bucketEventLoopLag(60) === '>50ms');
  gate('Lag de 120ms → bucket >100ms', probe.bucketEventLoopLag(120) === '>100ms');
  gate('Lag de 300ms → bucket >250ms', probe.bucketEventLoopLag(300) === '>250ms');
  gate('Lag de 600ms → bucket >500ms', probe.bucketEventLoopLag(600) === '>500ms');

  // ── Action log (Parte 42) ──
  probe.recordAction('test-action', 123.456, { note: 'gate' });
  const last = probe.getLastAction();
  gate('recordAction grava e getLastAction devolve a última entrada', last?.label === 'test-action');
  gate('Duração arredondada para 1 casa decimal', last.durationMs === 123.5);
  const log = probe.getActionLog();
  gate('getActionLog devolve uma cópia (não a referência interna)', log !== probe.getActionLog());

  // ── Render counters (Parte 8) ──
  probe.resetRenderCounts();
  probe.bumpRenderCount('TestComponent');
  probe.bumpRenderCount('TestComponent');
  probe.bumpRenderCount('TestComponent');
  gate('bumpRenderCount acumula corretamente', probe.getRenderCounts().TestComponent === 3);
  probe.resetRenderCounts();
  gate('resetRenderCounts zera o registro', Object.keys(probe.getRenderCounts()).length === 0);

  // ── isPerfDebugEnabled nunca ativo por padrão sem window ──
  gate('isPerfDebugEnabled() é false sem window (build/SSR) — nunca ativo por padrão', probe.isPerfDebugEnabled() === false);

  // ── Hotfix de acesso no APK sem barra de endereço ──
  const storage = new Map();
  globalThis.window = {
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent: () => true,
  };
  gate('Toggle interno ativa e persiste perfdebug', probe.setPerfDebugEnabled(true) === true && probe.isPerfDebugEnabled() === true && storage.get('padel:perfdebug') === '1');
  gate('Toggle interno desativa e remove a preferência', probe.setPerfDebugEnabled(false) === false && probe.isPerfDebugEnabled() === false && !storage.has('padel:perfdebug'));
  delete globalThis.window;
} finally {
  await server.close();
}

// ---------------------------------------------------------------------------
// 2) Guardas estáticas: as duas correções de evidência e a instrumentação
//    estão realmente no código (não só na intenção).
// ---------------------------------------------------------------------------
const indexCss = read('src/index.css');
gate(
  'Mobile não aumenta mais o blur em relação ao desktop (nenhum blur(16px)/saturate mobile-only sobrando)',
  !indexCss.includes('blur(16px) saturate(150%)'),
);
gate(
  'Regra de blur mobile usa o mesmo valor do desktop (blur(12px) aparece na base .glass E na regra mobile, sem saturate extra)',
  (indexCss.match(/backdrop-filter:\s*blur\(12px\)\s*;/g) || []).length >= 2,
);
gate('Toggle de benchmark "sem blur" existe (data-perf-no-blur)', indexCss.includes('data-perf-no-blur'));
gate('Toggle de benchmark "sem motion" existe (data-perf-no-motion)', indexCss.includes('data-perf-no-motion'));

const bellSrc = read('src/components/communications/CommunicationBell.jsx');
gate('CommunicationBell memoiza a contagem de não lidas (useMemo)', /useMemo\(\(\) => countUnreadCareerMessages\(messages\), \[messages\]\)/.test(bellSrc));
gate('CommunicationBell conta renders (Parte 8)', bellSrc.includes("useRenderCounter('CommunicationBell')"));

const hudSrc = read('src/components/career/CareerHud.jsx');
gate('CareerHud conta renders (Parte 8)', hudSrc.includes("useRenderCounter('CareerHud')"));

const bottomNavSrc = read('src/components/BottomNav.jsx');
gate('BottomNav conta renders (Parte 8)', bottomNavSrc.includes("useRenderCounter('BottomNav')"));

const appLayoutSrc = read('src/components/AppLayout.jsx');
gate('AppLayout conta renders (Parte 8)', appLayoutSrc.includes("useRenderCounter('AppLayout')"));
gate('AppLayout mede o tempo de navegação (Parte 6)', appLayoutSrc.includes("recordAction('navigate-route'"));
gate('AppLayout monta o overlay de perfdebug', appLayoutSrc.includes('<MobilePerformanceMonitor'));

const coordinatorSrc = read('src/game-core/dayAdvanceCoordinator.js');
gate('advanceCareerDayOnce é medido pelo profiler de ação (Parte 27/42)', /profileAction\('advance-day'/.test(coordinatorSrc));

const providerSrc = read('src/careers/CareerProvider.jsx');
gate('CareerProvider.selectCareer (load-career) é medido pelo profiler de ação (Parte 42)', /profileAction\('load-career'/.test(providerSrc));
gate('CareerProvider.contextValue continua memoizado (useMemo) — auditoria da Parte 9 não encontrou o anti-padrão suspeitado', /const contextValue = useMemo\(/.test(providerSrc));
gate('Todas as actions do CareerProvider continuam estabilizadas (useCallback) — nenhuma reescrita arquitetural feita', (providerSrc.match(/useCallback\(/g) || []).length >= 7);

const monitorSrc = read('src/dev/MobilePerformanceMonitor.jsx');
gate('Overlay nunca renderiza sem isPerfDebugEnabled() (gate explícito antes do JSX)', /if \(!active\) return null;/.test(monitorSrc));
gate('Overlay M3.7 amostra no máximo 1x/s (SAMPLE_INTERVAL_MS = 1000, não a cada frame)', monitorSrc.includes('SAMPLE_INTERVAL_MS = 1000'));
gate('Overlay reage ao toggle interno sem recarregar a WebView', monitorSrc.includes('PERFDEBUG_CHANGE_EVENT'));

const probeSrc = read('src/dev/performanceProbe.js');
gate('perfdebug não depende de import.meta.env.DEV (precisa sobreviver ao bundle release)', !/isPerfDebugEnabled[\s\S]{0,200}import\.meta\.env\.DEV/.test(probeSrc));
gate('mark/measure/timeAsync originais (DEV-only) continuam intocados', probeSrc.includes("const enabled = import.meta.env.DEV;"));

const settingsSrc = read('src/pages/Settings.jsx');
gate('Configurações oferece o toggle temporário Performance', settingsSrc.includes('togglePerformanceMonitor') && settingsSrc.includes('setPerfDebugEnabled'));
gate('Toggle de Performance permanece desligado por padrão', !settingsSrc.includes('setPerfDebugEnabled(true)'));

console.log(`\n${gates} gates executados, todos PASS.`);
