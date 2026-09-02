import { fnv1aHash } from '@/lib/hashUtils.js';

const STORAGE_KEY = 'padel-legacy-beta-analytics-v1';
const MAX_SESSIONS = 50;
const MAX_EVENTS = 2000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const ANALYTICS_WRITE_DELAY_MS = 900;
let cachedState = null;
let pendingWriteTimer = null;

function nowIso() { return new Date().toISOString(); }
function safeParse(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
function anonCareerId(careerId) {
  if (!careerId) return 'no-career';
  return `career-${fnv1aHash(String(careerId)).toString(16)}`;
}
function emptyState() { return { schemaVersion: 1, sessions: [], currentSession: null, events: [], totals: { screenTimeMs: {}, counters: {} } }; }
function loadState() {
  if (cachedState) return cachedState;
  if (typeof localStorage === 'undefined') {
    cachedState = emptyState();
    return cachedState;
  }
  cachedState = { ...emptyState(), ...safeParse(localStorage.getItem(STORAGE_KEY), emptyState()) };
  return cachedState;
}
function persistStateNow() {
  if (typeof localStorage === 'undefined' || !cachedState) return;
  const next = {
    ...cachedState,
    sessions: (cachedState.sessions || []).slice(-MAX_SESSIONS),
    events: (cachedState.events || []).slice(-MAX_EVENTS),
  };
  cachedState = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
function saveState(state, { immediate = false } = {}) {
  cachedState = state;
  if (typeof localStorage === 'undefined') return;
  if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
  if (immediate) {
    pendingWriteTimer = null;
    persistStateNow();
    return;
  }
  // localStorage é síncrono. Serializar até 2.000 eventos em toda troca de rota
  // travava o thread principal. Agrupamos várias ações próximas em uma escrita.
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null;
    persistStateNow();
  }, ANALYTICS_WRITE_DELAY_MS);
}
export function flushBetaAnalytics() {
  if (pendingWriteTimer) {
    clearTimeout(pendingWriteTimer);
    pendingWriteTimer = null;
  }
  persistStateNow();
}
function createSession({ careerId, pathname, version } = {}) {
  const startedAt = nowIso();
  return {
    id: `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt,
    finishedAt: null,
    lastActiveAt: startedAt,
    durationMs: 0,
    version: version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta'),
    careerRef: anonCareerId(careerId),
    currentScreen: pathname || '/',
    screenEnteredAt: Date.now(),
    screenTimeMs: {},
    counters: {},
    eventCount: 0,
  };
}
function ensureSession(context = {}) {
  const state = loadState();
  const current = state.currentSession;
  const last = current?.lastActiveAt ? new Date(current.lastActiveAt).getTime() : 0;
  if (!current || Date.now() - last > SESSION_IDLE_MS || (context.careerId && current.careerRef !== anonCareerId(context.careerId))) {
    if (current) finalizeCurrentSession(state);
    state.currentSession = createSession(context);
    saveState(state);
  }
  return state;
}
function addScreenTime(session, pathname, elapsed) {
  if (!pathname || !Number.isFinite(elapsed) || elapsed <= 0) return;
  session.screenTimeMs[pathname] = (session.screenTimeMs[pathname] || 0) + elapsed;
}
function finalizeCurrentSession(state = loadState()) {
  const session = state.currentSession;
  if (!session) return state;
  addScreenTime(session, session.currentScreen, Date.now() - Number(session.screenEnteredAt || Date.now()));
  session.finishedAt = nowIso();
  session.lastActiveAt = session.finishedAt;
  session.durationMs = Math.max(0, new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime());
  delete session.screenEnteredAt;
  state.sessions = [...(state.sessions || []), session].slice(-MAX_SESSIONS);
  state.currentSession = null;
  saveState(state);
  return state;
}
export function startBetaAnalytics(context = {}) {
  const state = ensureSession(context);
  const session = state.currentSession;
  session.lastActiveAt = nowIso();
  if (context.pathname && session.currentScreen !== context.pathname) {
    addScreenTime(session, session.currentScreen, Date.now() - Number(session.screenEnteredAt || Date.now()));
    session.currentScreen = context.pathname;
    session.screenEnteredAt = Date.now();
  }
  saveState(state);
  return session;
}
export function trackBetaScreen(pathname, context = {}) {
  const state = ensureSession({ ...context, pathname });
  const session = state.currentSession;
  const now = Date.now();
  if (session.currentScreen && session.currentScreen !== pathname) addScreenTime(session, session.currentScreen, now - Number(session.screenEnteredAt || now));
  session.currentScreen = pathname;
  session.screenEnteredAt = now;
  session.lastActiveAt = nowIso();
  const event = { id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, sessionId: session.id, at: nowIso(), type: 'SCREEN_VIEW', screen: pathname, detail: {} };
  state.events = [...(state.events || []), event].slice(-MAX_EVENTS);
  session.eventCount = (session.eventCount || 0) + 1;
  saveState(state);
}
export function trackBetaEvent(type, detail = {}, context = {}) {
  const state = ensureSession(context);
  const session = state.currentSession;
  const safeDetail = Object.fromEntries(Object.entries(detail || {}).filter(([key, value]) => !/name|email|path|token|password/i.test(key) && ['string','number','boolean'].includes(typeof value)));
  const event = { id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, sessionId: session.id, at: nowIso(), type, screen: context.pathname || session.currentScreen || '/', detail: safeDetail };
  state.events = [...(state.events || []), event].slice(-MAX_EVENTS);
  session.eventCount = (session.eventCount || 0) + 1;
  session.lastActiveAt = event.at;
  session.counters[type] = (session.counters[type] || 0) + 1;
  state.totals.counters[type] = (state.totals.counters[type] || 0) + 1;
  saveState(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:beta-analytics-updated'));
}
export function finishBetaAnalyticsSession() { finalizeCurrentSession(); flushBetaAnalytics(); }
export function getBetaAnalyticsSnapshot() {
  const state = loadState();
  const current = state.currentSession ? JSON.parse(JSON.stringify(state.currentSession)) : null;
  if (current?.currentScreen && current.screenEnteredAt) addScreenTime(current, current.currentScreen, Date.now() - Number(current.screenEnteredAt));
  if (current) current.durationMs = Date.now() - new Date(current.startedAt).getTime();
  const sessions = [...(state.sessions || []), ...(current ? [current] : [])];
  const screenTimeMs = {};
  const counters = {};
  sessions.forEach(session => {
    Object.entries(session.screenTimeMs || {}).forEach(([screen, value]) => { screenTimeMs[screen] = (screenTimeMs[screen] || 0) + value; });
    Object.entries(session.counters || {}).forEach(([key, value]) => { counters[key] = (counters[key] || 0) + value; });
  });
  return { schemaVersion: 1, generatedAt: nowIso(), currentSession: current, sessions: state.sessions || [], events: state.events || [], totals: { screenTimeMs, counters } };
}
export function clearBetaAnalytics() { cachedState = emptyState(); saveState(cachedState, { immediate: true }); if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:beta-analytics-updated')); }
export function buildBetaAnalyticsExport() {
  const snapshot = getBetaAnalyticsSnapshot();
  return {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    privacy: 'Dados locais agregados. Nomes, e-mails, caminhos e conteúdo integral do save não são exportados.',
    currentSession: snapshot.currentSession,
    sessions: snapshot.sessions,
    events: snapshot.events,
    totals: snapshot.totals,
  };
}

const FEATURE_CATALOG = [
  { id: 'career', label: 'Carreira', routes: ['/', '/career', '/profile', '/stats'] },
  { id: 'training', label: 'Treinos', routes: [APP_ROUTES.TRAINING] },
  { id: 'calendar', label: 'Calendário', routes: ['/calendar'] },
  { id: 'tournaments', label: 'Torneios', routes: [APP_ROUTES.TOURNAMENTS] },
  { id: 'ranking', label: 'Ranking', routes: ['/ranking'] },
  { id: 'team', label: 'Dupla e equipe', routes: ['/relationships', '/coach', '/staff'] },
  { id: 'market', label: 'Mercado', routes: ['/market', '/world-market'] },
  { id: 'shop', label: 'Equipamentos', routes: [APP_ROUTES.SHOP, APP_ROUTES.INVENTORY] },
  { id: 'communications', label: 'Comunicações', routes: ['/communications'] },
  { id: 'press', label: 'Imprensa', routes: ['/press'] },
  { id: 'economy', label: 'Economia', routes: [APP_ROUTES.ECONOMY] },
  { id: 'world', label: 'Mundo', routes: ['/world', '/news', '/community'] },
  { id: 'club', label: 'Clube', routes: ['/clubs'] },
  { id: 'legacy', label: 'Legado', routes: ['/legacy', '/hall-of-fame', '/achievements'] },
];

function normalizeRoute(pathname = '/') {
  const clean = String(pathname).split('?')[0].replace(/\/$/, '') || '/';
  return clean.replace(/\/[a-z0-9_-]{8,}$/i, '/:id');
}

function featureForRoute(pathname) {
  const route = normalizeRoute(pathname);
  return FEATURE_CATALOG.find(feature => feature.routes.some(prefix => route === prefix || route.startsWith(`${prefix}/`))) || null;
}

function sumValues(record = {}) { return Object.values(record).reduce((sum, value) => sum + Number(value || 0), 0); }

export function getBetaTesterInsights(snapshot = getBetaAnalyticsSnapshot()) {
  const sessions = [...(snapshot.sessions || []), ...(snapshot.currentSession ? [snapshot.currentSession] : [])];
  const events = snapshot.events || [];
  const screenVisits = {};
  const screenTimeMs = {};

  events.filter(event => event.type === 'SCREEN_VIEW').forEach(event => {
    const route = normalizeRoute(event.screen);
    screenVisits[route] = (screenVisits[route] || 0) + 1;
  });
  Object.entries(snapshot.totals?.screenTimeMs || {}).forEach(([route, time]) => {
    const normalized = normalizeRoute(route);
    screenTimeMs[normalized] = (screenTimeMs[normalized] || 0) + Number(time || 0);
  });

  const totalScreenTimeMs = Math.max(1, sumValues(screenTimeMs));
  const features = FEATURE_CATALOG.map(feature => {
    const matchingRoutes = Object.keys({ ...screenVisits, ...screenTimeMs }).filter(route => feature.routes.some(prefix => route === prefix || route.startsWith(`${prefix}/`)));
    const visits = matchingRoutes.reduce((sum, route) => sum + Number(screenVisits[route] || 0), 0);
    const timeMs = matchingRoutes.reduce((sum, route) => sum + Number(screenTimeMs[route] || 0), 0);
    return { ...feature, visits, timeMs, usageShare: Math.round((timeMs / totalScreenTimeMs) * 1000) / 10, discovered: visits > 0 || timeMs > 0 };
  });

  const discoveredCount = features.filter(feature => feature.discovered).length;
  const coverage = Math.round((discoveredCount / FEATURE_CATALOG.length) * 100);
  const totalDurationMs = sessions.reduce((sum, session) => sum + Number(session.durationMs || 0), 0);
  const totalEvents = events.length;
  const testerScore = Math.min(100, Math.round(coverage * 0.65 + Math.min(25, totalDurationMs / 3600000 * 5) + Math.min(10, totalEvents / 50)));
  const testerLevel = testerScore >= 90 ? 'Explorador' : testerScore >= 70 ? 'Completo' : testerScore >= 45 ? 'Casual' : testerScore >= 20 ? 'Iniciante' : 'Primeiros passos';

  const missed = [
    { id: 'unread', label: 'Comunicações nunca abertas', value: Math.max(0, Number(snapshot.totals?.counters?.COMMUNICATION_CREATED || 0) - Number(snapshot.totals?.counters?.COMMUNICATION_OPENED || 0)) },
    { id: 'missions', label: 'Missões concluídas', value: Number(snapshot.totals?.counters?.MISSION_COMPLETED || 0), positive: true },
    { id: 'days', label: 'Dias avançados', value: Number(snapshot.totals?.counters?.CALENDAR_ADVANCED || 0), positive: true },
  ];

  return {
    generatedAt: nowIso(),
    sessions: sessions.length,
    totalDurationMs,
    totalEvents,
    coverage,
    testerScore,
    testerLevel,
    features: features.sort((a, b) => b.timeMs - a.timeMs || b.visits - a.visits),
    unusedFeatures: features.filter(feature => !feature.discovered),
    screenVisits,
    screenTimeMs,
    missed,
  };
}
import { APP_ROUTES } from '@/navigation/routes.js';
