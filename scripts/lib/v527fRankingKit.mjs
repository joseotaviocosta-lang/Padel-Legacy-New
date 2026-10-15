// Playthrough 5.27-F — leitura dos artefatos da auditoria de ranking
// (scripts/run-ranking-audit-v527f.mjs). Os testes de ranking validam as
// carreiras reais já rodadas, sem rerrodá-las (~30 min cada).
import { existsSync, readFileSync } from 'node:fs';

// Estado final da fase (após o ajuste de pontos de derrota nos tiers com corte).
export const SUMMARY = 'reports/rebalance-527f/ranking/after/summary.json';
export const POINTS_TABLE = 'reports/rebalance-527f/ranking-points-by-tier.csv';
export function loadRankingSummary() {
  if (!existsSync(SUMMARY)) throw new Error(`rode scripts/run-ranking-audit-v527f.mjs (${SUMMARY} ausente)`);
  return JSON.parse(readFileSync(SUMMARY, 'utf8'));
}
export function loadPointsTable() {
  const lines = readFileSync(POINTS_TABLE, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], Number.isNaN(Number(v)) ? v : Number(v)])));
}
