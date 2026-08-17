// M3.3 (docs/MOBILE_M3_3_PERFORMANCE.md, Parte 5) — instrumentação DEV-only
// para medir pontos reais do app (startup, avanço de calendário, LiveMatch)
// sem espalhar performance.now()/mark solto pelo código.
//
// `import.meta.env.DEV` é substituído por um literal (`false` em build de
// produção) pelo próprio Vite em tempo de build — o minificador elimina o
// branch morto resultante, então nada disto sobrevive no bundle release
// (nem os console.debug, nem os marks). Não precisa de remoção manual.
const enabled = import.meta.env.DEV;

export function mark(name) {
  if (!enabled || typeof performance === 'undefined' || !performance.mark) return;
  performance.mark(name);
}

/** Mede entre dois marks já registrados e loga em ms. Retorna a duração ou null (fora de DEV / marks ausentes). */
export function measure(label, startMark, endMark) {
  if (!enabled || typeof performance === 'undefined' || !performance.measure) return null;
  try {
    const entry = performance.measure(label, startMark, endMark);
    console.debug(`[perf] ${label}: ${entry.duration.toFixed(1)}ms`);
    return entry.duration;
  } catch {
    return null;
  }
}

/** Envolve uma função assíncrona e loga sua duração real, sem alterar o retorno. */
export async function timeAsync(label, fn) {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.debug(`[perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`);
  }
}

// ---------------------------------------------------------------------------
// M3.4 (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md) — ferramentas de perfdebug.
//
// Diferença deliberada em relação ao bloco acima: `mark`/`measure`/`timeAsync`
// são cortados no build de produção via `import.meta.env.DEV` (constante de
// build, o minificador elimina o código morto — nada sobrevive no bundle
// release). O teste real que motivou esta fase foi feito no APK RELEASE
// (a lentidão apareceu lá, não só em `npm run android:dev`), então o que
// vem abaixo NÃO pode depender de `import.meta.env.DEV` — precisa existir
// no bundle release e ser ativado em runtime, só quando o jogador realmente
// pede (`?perfdebug=1`), nunca por padrão.
// ---------------------------------------------------------------------------

const PERFDEBUG_STORAGE_KEY = 'padel:perfdebug';
export const PERFDEBUG_CHANGE_EVENT = 'padel:perfdebug-changed';

/** Ativado por `?perfdebug=1` (persiste em localStorage) ou já persistido de uma visita anterior. Nunca ativo por padrão. */
export function isPerfDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('perfdebug') === '1') {
      window.localStorage?.setItem(PERFDEBUG_STORAGE_KEY, '1');
      return true;
    }
    if (params.get('perfdebug') === '0') {
      window.localStorage?.removeItem(PERFDEBUG_STORAGE_KEY);
      return false;
    }
    return window.localStorage?.getItem(PERFDEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persiste o gate de diagnóstico e avisa os consumidores na mesma WebView. */
export function setPerfDebugEnabled(nextEnabled) {
  if (typeof window === 'undefined') return false;
  const enabledValue = nextEnabled === true;
  try {
    if (enabledValue) window.localStorage?.setItem(PERFDEBUG_STORAGE_KEY, '1');
    else window.localStorage?.removeItem(PERFDEBUG_STORAGE_KEY);
  } catch {
    return false;
  }
  try { window.dispatchEvent(new Event(PERFDEBUG_CHANGE_EVENT)); } catch { /* ambiente sem EventTarget */ }
  return enabledValue;
}

export function disablePerfDebug() {
  return setPerfDebugEnabled(false);
}

// ── FPS / frame timing (Parte 3) ─────────────────────────────────────────
// `computeFrameStats` é pura (recebe as durações já coletadas) para poder
// ser testada em Node sem precisar de requestAnimationFrame de verdade
// (scripts/test-mobile-performance-m3-4.mjs cobre a matemática dos buckets).
export function computeFrameStats(frameDurationsMs) {
  if (!frameDurationsMs?.length) return null;
  const total = frameDurationsMs.reduce((sum, value) => sum + value, 0);
  const avg = total / frameDurationsMs.length;
  const worst = Math.max(...frameDurationsMs);
  const over = (thresholdMs) => frameDurationsMs.filter((value) => value > thresholdMs).length;
  return {
    fps: Math.round(1000 / avg),
    avgFrameMs: Math.round(avg * 10) / 10,
    worstFrameMs: Math.round(worst * 10) / 10,
    sampleCount: frameDurationsMs.length,
    over16: over(16.7),
    over33: over(33),
    over50: over(50),
    over100: over(100),
  };
}

/**
 * Monitor de FPS por requestAnimationFrame, janela móvel de N frames.
 * `onSample` é chamado no máximo a cada `reportIntervalMs` (padrão ~2x/s —
 * Parte 3 pede explicitamente para o overlay não virar gargalo por si só).
 */
export function createFrameMonitor({ windowSize = 120, reportIntervalMs = 500 } = {}) {
  const frames = [];
  let rafId = null;
  let lastFrameTime = null;
  let lastReportTime = 0;

  function start(onSample) {
    if (rafId != null) return;
    lastFrameTime = null;
    lastReportTime = 0;
    const tick = (now) => {
      if (lastFrameTime != null) {
        frames.push(now - lastFrameTime);
        if (frames.length > windowSize) frames.shift();
      }
      lastFrameTime = now;
      if (onSample && now - lastReportTime >= reportIntervalMs) {
        lastReportTime = now;
        onSample(computeFrameStats(frames));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    frames.length = 0;
  }

  function getStats() { return computeFrameStats(frames); }

  return { start, stop, getStats };
}

// ── Long tasks (Parte 4) ─────────────────────────────────────────────────
/**
 * Usa PerformanceObserver('longtask') quando a WebView suporta; cai para um
 * fallback baseado em lag do event loop (mesmo princípio da Parte 5) quando
 * não suporta — a maioria das WebViews Android não expõe a Long Tasks API.
 */
export function createLongTaskMonitor({ fallbackIntervalMs = 50, fallbackThresholdMs = 50 } = {}) {
  let observer = null;
  let fallbackTimer = null;
  let fallbackExpected = null;
  const supported = typeof PerformanceObserver !== 'undefined'
    && Array.isArray(PerformanceObserver.supportedEntryTypes)
    && PerformanceObserver.supportedEntryTypes.includes('longtask');

  function start(onEntry) {
    if (supported) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          onEntry?.({ duration: Math.round(entry.duration), startTime: entry.startTime, source: 'longtask-api' });
        }
      });
      try { observer.observe({ entryTypes: ['longtask'] }); } catch { /* WebView sem suporte real apesar do supportedEntryTypes */ }
    } else {
      fallbackExpected = performance.now() + fallbackIntervalMs;
      fallbackTimer = setInterval(() => {
        const now = performance.now();
        const lag = now - fallbackExpected;
        if (lag > fallbackThresholdMs) onEntry?.({ duration: Math.round(lag), startTime: fallbackExpected, source: 'event-loop-lag-fallback' });
        fallbackExpected = now + fallbackIntervalMs;
      }, fallbackIntervalMs);
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  return { start, stop, supported };
}

// ── Event loop lag (Parte 5) — independente do FPS/rAF ───────────────────
export function bucketEventLoopLag(lagMs) {
  if (lagMs > 500) return '>500ms';
  if (lagMs > 250) return '>250ms';
  if (lagMs > 100) return '>100ms';
  if (lagMs > 50) return '>50ms';
  return null;
}

export function createEventLoopLagMonitor({ intervalMs = 100 } = {}) {
  let timer = null;
  let expected = null;

  function schedule(onSample) {
    expected = performance.now() + intervalMs;
    timer = setTimeout(() => {
      const now = performance.now();
      const lag = Math.max(0, now - expected);
      onSample?.(lag, bucketEventLoopLag(lag));
      schedule(onSample);
    }, intervalMs);
  }

  function start(onSample) { if (timer == null) schedule(onSample); }
  function stop() { if (timer != null) clearTimeout(timer); timer = null; }

  return { start, stop };
}

// ── Action profiler (Parte 42) ───────────────────────────────────────────
// Deliberadamente NÃO espalhado por toda função — só nos pontos listados na
// Parte 42 (load-career, navigate-route, advance-day, open-live-match,
// save-career), instrumentados manualmente onde já fazem sentido no código.
const ACTION_LOG_LIMIT = 50;
const actionLog = [];

/**
 * Registra uma duração já medida externamente (ex.: um vão que atravessa
 * requestAnimationFrame/eventos, onde `profileAction` — que só mede o
 * tempo síncrono/assíncrono da própria chamada de `fn()` — não serve).
 */
export function recordAction(label, durationMs, extra = {}) {
  const entry = { label, durationMs: Math.round(durationMs * 10) / 10, route: typeof window !== 'undefined' ? window.location.pathname : null, at: Date.now(), ...extra };
  actionLog.push(entry);
  if (actionLog.length > ACTION_LOG_LIMIT) actionLog.shift();
  if (isPerfDebugEnabled()) console.debug(`[perfdebug] ${label}: ${entry.durationMs}ms`, extra);
  return entry;
}

/** Envolve uma função (síncrona ou assíncrona) e registra a duração real, sem alterar retorno/erros. */
export function profileAction(label, fn, extra) {
  const start = performance.now();
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => { recordAction(label, performance.now() - start, extra); return value; },
        (error) => { recordAction(label, performance.now() - start, { ...extra, failed: true }); throw error; },
      );
    }
    recordAction(label, performance.now() - start, extra);
    return result;
  } catch (error) {
    recordAction(label, performance.now() - start, { ...extra, failed: true });
    throw error;
  }
}

export function getActionLog() { return [...actionLog]; }
export function getLastAction() { return actionLog[actionLog.length - 1] || null; }

// ── DOM size (Parte 23) ──────────────────────────────────────────────────
export function getDomNodeCount() {
  if (typeof document === 'undefined') return 0;
  return document.querySelectorAll('*').length;
}

// ── Render counters (Parte 8) — registro global simples, sem depender de contexto ──
const renderCounts = new Map();

export function bumpRenderCount(label) {
  const next = (renderCounts.get(label) || 0) + 1;
  renderCounts.set(label, next);
  return next;
}

export function getRenderCounts() { return Object.fromEntries(renderCounts.entries()); }
export function resetRenderCounts() { renderCounts.clear(); }

/**
 * Hook DEV/perfdebug-only para instrumentar quantas vezes um componente
 * renderiza (Parte 8). Custo é um incremento de Map — insignificante mesmo
 * fora do modo perfdebug, então pode ficar chamado incondicionalmente nos
 * componentes do shell sem precisar de um branch condicional em cada um.
 */
export function useRenderCounter(label) {
  bumpRenderCount(label);
}

// ── Perf-mode toggles para o benchmark A/B (Partes 18/20) ────────────────
// Liga/desliga atributos em <html>; o CSS correspondente vive em index.css
// (`html[data-perf-no-blur]`, `html[data-perf-no-motion]`). Nunca ativo por
// padrão — só quando o jogador aciona pelo overlay para comparar FPS.
export function setPerfModeAttribute(name, enabledValue) {
  if (typeof document === 'undefined') return;
  if (enabledValue) document.documentElement.setAttribute(name, '');
  else document.documentElement.removeAttribute(name);
}
