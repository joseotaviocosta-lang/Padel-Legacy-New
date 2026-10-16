// Fase 5.30 — kit dos testes da nova Home.
import { existsSync, readFileSync } from 'node:fs';
export { gateRunner, withModules } from './v527mTestKit.mjs';

export const read = (p) => readFileSync(p, 'utf8');
export const homeSource = () => read('src/pages/CareerHub.jsx');
export const HOME_LIB = '/src/lib/homeDashboard.js';

/** Medições do app real (scripts/ui-audit-530.mjs --phase=after). */
export function afterMeasurements() {
  const file = 'reports/ui-redesign-530/after/measurements.json';
  if (!existsSync(file)) throw new Error(`Evidência ausente: ${file} — rode scripts/ui-audit-530.mjs --phase=after`);
  return JSON.parse(readFileSync(file, 'utf8'));
}
/** Cliques reais (reports/ui-redesign-530/tools/functional.mjs). */
export function functionalRuns() {
  const file = 'reports/ui-redesign-530/functional.json';
  if (!existsSync(file)) throw new Error(`Evidência ausente: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8')).runs;
}
/** Trecho de um componente de CareerHub.jsx (da declaração até a próxima `function `). */
export function componentSource(name) {
  const src = homeSource().replace(/\r\n/g, '\n');
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

// Fixtures no formato real de buildWeeklyCareerReview().upcomingTournaments.
export const CAREER_DATE = '2026-01-20';
export const planningItem = (over = {}) => ({
  id: 't-lon', name: 'Londres Challenge', tier: 'Bronze', startDate: '2026-01-29', endDate: '2026-02-01',
  drawn: false, drawDate: '2026-01-26', registrationState: 'REGISTERED', isRecommended: false,
  deadlineInfo: { label: 'Inscrito', tone: 'resolved' }, action: { id: 'details', label: 'Ver compromisso' },
  ...over,
});
