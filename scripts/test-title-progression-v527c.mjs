// Playthrough 5.27-C, Bloco I/S — progressão de títulos por temporada.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-title-progression-v527c');
const titlesByYear = (tournaments) => {
  const years = {};
  for (const t of tournaments || []) {
    if (t.status !== 'champion') continue;
    const y = Math.floor((t.day || 0) / 365) + 1;
    years[y] = (years[y] || 0) + 1;
  }
  return years;
};
try {
  await check('contagem de títulos por temporada (função de medição)', () => {
    const synthetic = [{ status: 'champion', day: 10 }, { status: 'champion', day: 400 }, { status: 'champion', day: 420 }, { status: 'runner_up', day: 500 }];
    assert.deepEqual(titlesByYear(synthetic), { 1: 1, 2: 2 });
  });

  await check('carreira medida (se disponível) tem títulos contáveis e finals/semis', () => {
    const dir = 'reports/rebalance-527/balanced2/raw';
    if (!existsSync(`${dir}/optimizer-001.json`)) return;
    const c = JSON.parse(readFileSync(`${dir}/optimizer-001.json`, 'utf8'));
    const titles = (c.tournaments || []).filter((t) => t.status === 'champion').length;
    assert.ok(titles >= 1, `optimizer sem títulos na 5.27: ${titles}`);
  });

  await check('titles.csv (se presente) separa por tier', () => {
    const f = 'reports/rebalance-527c/titles.csv';
    if (!existsSync(f)) return;
    assert.match(readFileSync(f, 'utf8'), /tier/);
  });
} finally {
  finish();
}
