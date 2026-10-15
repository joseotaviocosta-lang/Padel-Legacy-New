// Playthrough 5.27-I, Bloco J — hard gates do Balanced-E no Stage 1 (Normal,
// 2 anos): competição (Easy ≥ 45, Medium ≥ 30, Hard ≤ 50, R1 ≥ 40),
// economia (Sponsor Y1 ≤ 60, Prize Y1 ≥ 10, dívida Casual ≤ 20, Normal ≤ 10)
// e o gate novo pré-registrado: Silver + 5 pp ≥ Gold (chave principal).
// O WR é recomputado direto dos runs (não confia só no analisador).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { CLASS, winPct } from './lib/v527hMetrics.mjs';
import { report, runs } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-balanced-e-gates-v527i');
try {
  const ms = runs().filter((r) => r.env.preset === 'balanced-e' && r.env.profile === 'normal').flatMap((r) => r.env.result.matches);
  const ind = {
    easy: winPct(ms.filter((m) => CLASS[m.tier] === 'easy')), medium: winPct(ms.filter((m) => CLASS[m.tier] === 'medium')),
    hard: winPct(ms.filter((m) => CLASS[m.tier] === 'hard')), r1: winPct(ms.filter((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0)),
    silverMain: winPct(ms.filter((m) => m.tier === 'Silver' && m.stage !== 'qualifying')), goldMain: winPct(ms.filter((m) => m.tier === 'Gold' && m.stage !== 'qualifying')),
  };
  const b = report('stage1.json').byPreset['balanced-e'];
  await check('analisador = recomputação independente', () => {
    assert.deepEqual([b.normal.competition.easy.wr, b.normal.competition.medium.wr, b.normal.competition.hard.wr, b.normal.competition.r1.wr], [ind.easy, ind.medium, ind.hard, ind.r1]);
  });
  await check(`Easy ${ind.easy} ≥ 45`, () => assert.ok(ind.easy >= 45));
  await check(`Medium ${ind.medium} ≥ 30`, () => assert.ok(ind.medium >= 30));
  await check(`Hard ${ind.hard} ≤ 50`, () => assert.ok(ind.hard == null || ind.hard <= 50));
  await check(`R1 ${ind.r1} ≥ 40`, () => assert.ok(ind.r1 >= 40));
  await check(`Sponsor Y1 ${b.normal.sponsorY1.median} ≤ 60`, () => assert.ok(b.normal.sponsorY1.median <= 60));
  await check(`Prize Y1 ${b.normal.prizeY1.median} ≥ 10`, () => assert.ok(b.normal.prizeY1.median >= 10));
  await check(`dívida Casual ${b.casual.debtPct}% ≤ 20`, () => assert.ok(b.casual.debtPct <= 20));
  await check(`dívida Normal ${b.normal.debtPct}% ≤ 10`, () => assert.ok(b.normal.debtPct <= 10));
  await check(`Silver main ${ind.silverMain} + 5 ≥ Gold main ${ind.goldMain}`, () => assert.ok(ind.silverMain + 5 >= ind.goldMain));
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
