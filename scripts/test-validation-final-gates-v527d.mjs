// Playthrough 5.27-D, Bloco T — VEREDITO FINAL só com Stage1 45/45, Stage2
// 45/45 e long >= 3/3; gates da 5.27-C aplicados aos dados (competição,
// progressão, títulos, economia, investimentos, staff, gear); money-solved
// canônico OBSERVADO (nulo quando não acontece, nunca estimado).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-validation-final-gates-v527d');
const root = tempRoot('final');
const finalJson = () => J.readJson(join(root, 'analysis', 'final.json'));
const gate = (name) => finalJson().gates.find((g) => g.name === name);
try {
  const m = initRoot(root);
  for (const j of m.jobs.filter((x) => x.stage === '1')) markDone(root, j.id);
  const s2 = m.jobs.filter((x) => x.stage === '2');
  // Normal seeds 1–8: resolve o dinheiro no mês 30 (receita recorrente 2000 >= 400 e caixa 50k >= 12×500).
  const solvesAt30 = (i) => (i >= 29 ? { prize: 500, sponsor: 2000, investment: 0, recurringExpense: 400, oneOff: 100, closing: 50000 } : { prize: 500, sponsor: 300, investment: 0, recurringExpense: 400, oneOff: 100, closing: 2000 });
  for (const j of s2) {
    markDone(root, j.id, {
      winRate: { Bronze: 0.65, Gold: 0.5, Masters: 0.3 },
      rankAt: (d) => (d <= 365 ? 1000 - Math.round(d * 1.1) : d <= 730 ? 600 - Math.round((d - 365) * 0.95) : d <= 1095 ? 250 - Math.round((d - 730) * 0.4) : Math.max(20, 105 - Math.round((d - 1095) / 10))),
      titlesPerYear: 1,
      ...(j.profile === 'normal' && j.seed <= 8 ? { monthly: solvesAt30 } : {}),
    });
  }

  await check('sem long runs: veredito final PARTIAL (VERDICT MAX = B), gates só provisórios', () => {
    assert.equal(analyze(root).status, 0);
    const f = finalJson();
    assert.equal(f.status, 'PARTIAL');
    assert.equal(f.allPass, undefined);
    assert.ok(Array.isArray(f.provisionalGates));
  });

  for (const j of m.jobs.filter((x) => x.stage === 'long' && x.required)) markDone(root, j.id);
  await check('com 45/45 + 45/45 + 3/3: veredito COMPLETE com todos os blocos de gates', () => {
    assert.equal(analyze(root).status, 0);
    const f = finalJson();
    assert.equal(f.status, 'COMPLETE');
    assert.equal(typeof f.allPass, 'boolean');
    const blocks = new Set(f.gates.map((g) => g.block));
    for (const b of ['competition', 'progression', 'titles', 'economy', 'investments', 'staff', 'gear']) assert.ok(blocks.has(b), `sem bloco ${b}`);
  });

  await check('competição: Easy ~65% passa (>=45), Hard ~30% passa (<=50), R1 avaliado', () => {
    assert.equal(gate('Easy WR').pass, true); assert.ok(gate('Easy WR').value >= 45);
    assert.equal(gate('Hard WR').pass, true);
    assert.ok(gate('R1 WR').value != null);
  });

  await check('progressão: rank Normal @1y ~#600, @2y ~#250, @3y ~#104 → dentro das faixas', () => {
    assert.equal(gate('Normal rank @1y').pass, true, JSON.stringify(gate('Normal rank @1y')));
    assert.equal(gate('Normal rank @2y').pass, true, JSON.stringify(gate('Normal rank @2y')));
    assert.equal(gate('Normal rank @3y').pass, true, JSON.stringify(gate('Normal rank @3y')));
  });

  await check('títulos: 1/ano → Y1 mediana 1 (0–1) e Y2 cumulativo 2 (1–3)', () => {
    assert.equal(gate('Normal títulos Y1 (mediana)').value, 1); assert.equal(gate('Normal títulos Y1 (mediana)').pass, true);
    assert.equal(gate('Normal títulos Y2 cumulativo (mediana)').value, 2);
  });

  await check('money-solved canônico observado no mês 30 (receita recorrente + reserva 12 meses, 6 meses seguidos)', () => {
    const rows = readFileSync(join(root, 'analysis', 'money-solved.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    const n1 = rows.find((r) => r[0] === 'balanced-normal-seed001-5y');
    assert.equal(n1[5], '30');
  });

  await check('money-solved não ocorrido → vazio (nulo), nunca estimado', () => {
    const rows = readFileSync(join(root, 'analysis', 'money-solved.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    const c1 = rows.find((r) => r[0] === 'balanced-casual-seed001-5y');
    assert.equal(c1[5], '');
    const st = J.readJson(join(root, 'analysis', 'stage2.json'));
    assert.equal(st.byProfile.normal.moneySolvedObserved, 8);
    assert.equal(st.byProfile.normal.moneySolvedCensoredMedian.censored, false);
    assert.equal(st.byProfile.casual.moneySolvedCensoredMedian.censored, true);
  });

  await check('economia: sponsor Y1 e prize Y1 medidos e avaliados contra 60% / 10%', () => {
    assert.ok(gate('Sponsor Y1 (mediana, todas)').value != null);
    assert.equal(gate('Prize Y1 (mediana, todas)').pass, true);
    assert.equal(gate('Insolvência Normal').pass, true);
  });
} finally {
  cleanup(root);
  finish();
}
