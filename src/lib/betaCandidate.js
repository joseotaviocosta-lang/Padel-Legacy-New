const WELCOME_KEY = 'padel-legacy:closed-beta-welcome:v1';
const SESSION_RATING_KEY = 'padel-legacy:closed-beta-ratings:v1';

export const CLOSED_BETA_CHANGELOG = Object.freeze([
  {
    version: 'RC1',
    title: 'Closed Beta Candidate',
    items: [
      'QA smoke gate aprovado e pronto para execução no Windows.',
      'Match Experience com momentum, narração contextual e recap premium.',
      'Central BETA com analytics, insights, Save Inspector e proteção do save.',
      'Calendário, comunicações, treinador ao vivo e interface estabilizados.',
      'Feature freeze ativo: a partir desta build, apenas correções e balanceamento.',
    ],
  },
  {
    version: 'beta.46',
    title: 'QA Total',
    items: [
      'RC QA Manager e relatórios consolidados.',
      'Smoke test de Match Engine, calendário, torneios e ferramentas BETA.',
    ],
  },
]);

export function hasSeenClosedBetaWelcome() {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}

export function markClosedBetaWelcomeSeen() {
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* storage indisponível */ }
}

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

export function buildBetaSuggestionReport({ careerId, pathname, suggestion = {} } = {}) {
  return {
    report_type: 'padel_legacy_closed_beta_suggestion',
    generated_at: new Date().toISOString(),
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta',
    career_id: careerId || null,
    pathname: clean(pathname, 180),
    category: clean(suggestion.category, 80) || 'Experiência geral',
    title: clean(suggestion.title, 180) || 'Sugestão sem título',
    idea: clean(suggestion.idea),
    problem: clean(suggestion.problem),
    expected_impact: clean(suggestion.impact),
  };
}

export function buildBetaRatingReport({ careerId, ratings = {}, continuePlaying = 'maybe', notes = '' } = {}) {
  const safeRatings = Object.fromEntries(
    Object.entries(ratings).map(([key, value]) => [key, Math.min(5, Math.max(1, Number(value) || 1))]),
  );
  return {
    report_type: 'padel_legacy_closed_beta_rating',
    generated_at: new Date().toISOString(),
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta',
    career_id: careerId || null,
    ratings: safeRatings,
    would_play_one_more_hour: ['yes', 'maybe', 'no'].includes(continuePlaying) ? continuePlaying : 'maybe',
    notes: clean(notes),
  };
}

export function saveLocalBetaRating(report) {
  try {
    const current = JSON.parse(localStorage.getItem(SESSION_RATING_KEY) || '[]');
    const rows = Array.isArray(current) ? current : [];
    localStorage.setItem(SESSION_RATING_KEY, JSON.stringify([...rows, report].slice(-30)));
  } catch { /* telemetria local é opcional */ }
  return report;
}

export function getLocalBetaRatings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_RATING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
