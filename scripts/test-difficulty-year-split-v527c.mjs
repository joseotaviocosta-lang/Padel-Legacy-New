// Playthrough 5.27-C, Bloco J — dificuldade dividida por temporada (não agregada).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { check, finish } = makeSuite('test-difficulty-year-split-v527c');
const yearOf = (m) => {
  if (Number.isFinite(Number(m.day))) return Math.floor(Number(m.day) / 365) + 1;
  if (m.date) return Math.floor((new Date(`${m.date}T00:00:00Z`) - new Date('2026-01-01T00:00:00Z')) / (365 * 86400000)) + 1;
  return 1;
};
const wrByYear = (matches) => {
  const out = {};
  for (const m of matches || []) { const y = yearOf(m); (out[y] ||= { n: 0, w: 0 }); out[y].n += 1; if (m.won) out[y].w += 1; }
  return Object.fromEntries(Object.entries(out).map(([y, v]) => [y, Math.round((100 * v.w) / v.n)]));
};
try {
  await check('win rate por ano é calculável (função de medição)', () => {
    const synthetic = [{ day: 10, won: true }, { day: 20, won: false }, { day: 400, won: true }];
    assert.deepEqual(wrByYear(synthetic), { 1: 50, 2: 100 });
  });

  await check('carreira medida (se disponível) tem partidas com dia', () => {
    const dir = 'reports/rebalance-527/balanced2/raw';
    if (!existsSync(dir)) return;
    const f = readdirSync(dir).find((x) => /^normal-\d{3}\.json$/.test(x));
    if (!f) return;
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.ok(c.matches.length > 0 && c.matches.every((m) => m.date || Number.isFinite(Number(m.day))));
  });

  await check('difficulty-year.csv (se presente) tem coluna de ano', () => {
    const f = 'reports/rebalance-527c/difficulty-year.csv';
    if (!existsSync(f)) return;
    assert.match(readFileSync(f, 'utf8'), /year/);
  });
} finally {
  finish();
}
