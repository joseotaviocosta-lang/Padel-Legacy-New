const MAX_RUNTIME_ERRORS = 25;
const runtimeErrors = [];
let listenersInstalled = false;

const cleanStack = (stack) => String(stack || '').split('\n').slice(0, 12).join('\n');

function pushRuntimeError(entry) {
  runtimeErrors.push({
    at: new Date().toISOString(),
    ...entry,
  });
  if (runtimeErrors.length > MAX_RUNTIME_ERRORS) runtimeErrors.splice(0, runtimeErrors.length - MAX_RUNTIME_ERRORS);
}

export function registerBetaDiagnostic(entry = {}) {
  pushRuntimeError({
    type: entry.type || 'diagnostic',
    ...entry,
    stack: entry.stack ? cleanStack(entry.stack) : undefined,
  });
}

export function installBetaDiagnostics() {
  if (listenersInstalled || typeof window === 'undefined') return () => {};
  listenersInstalled = true;

  const onError = (event) => pushRuntimeError({
    type: 'window-error',
    message: event?.message || event?.error?.message || 'Erro desconhecido',
    source: event?.filename || null,
    line: event?.lineno || null,
    column: event?.colno || null,
    stack: cleanStack(event?.error?.stack),
  });
  const onRejection = (event) => pushRuntimeError({
    type: 'unhandled-rejection',
    message: event?.reason?.message || String(event?.reason || 'Promise rejeitada'),
    stack: cleanStack(event?.reason?.stack),
  });

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    listenersInstalled = false;
  };
}

export function registerBoundaryError(error, info, area = 'app') {
  pushRuntimeError({
    type: 'react-boundary',
    area,
    message: error?.message || String(error || 'Erro React'),
    stack: cleanStack(error?.stack),
    componentStack: cleanStack(info?.componentStack),
  });
}

export function buildBetaDiagnosticReport({ career = null, pathname = null } = {}) {
  const storageKeys = typeof localStorage === 'undefined'
    ? []
    : Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean).sort();

  return {
    product: 'Padel Legacy',
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta',
    generatedAt: new Date().toISOString(),
    environment: import.meta.env.MODE,
    route: pathname || (typeof window !== 'undefined' ? window.location.pathname : null),
    platform: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      language: typeof navigator !== 'undefined' ? navigator.language : null,
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    },
    career: career ? {
      id: career.career_id || null,
      schemaVersion: career.save_schema_version || null,
      gameDate: career.current_date || career.game_date || null,
      tutorialVersion: career.tutorial?.version || null,
      tutorialStatus: career.tutorial?.status || null,
      careerLevel: career.profile?.career_level ?? career.player?.career_level ?? null,
    } : null,
    runtimeErrors: [...runtimeErrors],
    storageKeys,
  };
}

export function downloadBetaDiagnosticReport(options = {}) {
  const report = buildBetaDiagnosticReport(options);
  const body = JSON.stringify(report, null, 2);
  const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `padel-legacy-diagnostico-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return report;
}
