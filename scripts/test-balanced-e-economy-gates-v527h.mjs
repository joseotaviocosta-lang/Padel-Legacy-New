// Playthrough 5.27-H, Bloco K (item 43) — gates econômicos do Balanced-E:
// Sponsor Y1 ≤ 60% e Prize Y1 ≥ 10% (mediana Normal), dívida Casual ≤ 20% e
// Normal ≤ 10% das carreiras. Money-solved é registrado, nunca reprova (item 40).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { GATES } from './lib/v527hMetrics.mjs';
import { csvRows, report } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-balanced-e-economy-gates-v527h');
try {
  const b = report('stage1.json').byPreset['balanced-e'];
  await check('economy.csv/debt.csv cobrem todas as carreiras do Balanced-E', () => {
    assert.equal(csvRows('economy.csv').filter((r) => r.preset === 'balanced-e').length, 15);
    const debtJobs = new Set(csvRows('debt.csv').filter((r) => r.preset === 'balanced-e').map((r) => r.job));
    assert.equal(debtJobs.size, b.all.debtCareers);
  });
  await check(`Sponsor Y1 (mediana Normal) ≤ ${GATES.economy.sponsorY1Max}%`, () => assert.ok(b.normal.sponsorY1.median <= GATES.economy.sponsorY1Max, `${b.normal.sponsorY1.median}%`));
  await check(`Prize Y1 (mediana Normal) ≥ ${GATES.economy.prizeY1Min}%`, () => assert.ok(b.normal.prizeY1.median >= GATES.economy.prizeY1Min, `${b.normal.prizeY1.median}%`));
  await check(`dívida Casual ≤ ${GATES.economy.casualDebtMax}%`, () => assert.ok(b.casual.debtPct <= GATES.economy.casualDebtMax, `${b.casual.debtPct}%`));
  await check(`dívida Normal ≤ ${GATES.economy.normalDebtMax}%`, () => assert.ok(b.normal.debtPct <= GATES.economy.normalDebtMax, `${b.normal.debtPct}%`));
  await check('dívida separada por perfil (Casual/Normal/Optimizer) com eventos, pico e duração', () => {
    for (const pr of ['casual', 'normal', 'optimizer']) { assert.equal(typeof b[pr].debtPct, 'number', pr); assert.ok('peakDebt' in b[pr] && 'debtDuration' in b[pr]); }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
