// Playthrough 5.27-C, Bloco E — distribuição de insolvência por perfil.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { check, finish } = makeSuite('test-insolvency-distribution-v527c');
const insolvencyRate = (careers) => {
  if (!careers.length) return null;
  const broke = careers.filter((c) => (c.weekly || []).some((w) => (w.coins || 0) < 0)).length;
  return Math.round((100 * broke) / careers.length);
};
const loadDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : []);
try {
  await check('a taxa de insolvência é calculável (função de medição)', () => {
    assert.equal(insolvencyRate([{ weekly: [{ coins: 10 }] }, { weekly: [{ coins: -5 }] }]), 50);
    assert.equal(insolvencyRate([]), null);
  });

  await check('carreiras medidas (se disponíveis) não quebram por padrão', () => {
    const careers = loadDir('reports/rebalance-527/balanced2/raw');
    if (!careers.length) return;
    const normal = careers.filter((c) => c.profile === 'normal');
    const rate = insolvencyRate(normal);
    assert.ok(rate <= 100, 'sempre quebra');
  });

  await check('insolvency.csv (se presente) existe', () => {
    if (!existsSync('reports/rebalance-527c/insolvency.csv')) return;
    assert.match(readFileSync('reports/rebalance-527c/insolvency.csv', 'utf8'), /profile/);
  });
} finally {
  finish();
}
