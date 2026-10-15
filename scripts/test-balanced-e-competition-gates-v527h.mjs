// Playthrough 5.27-H, Bloco K (item 41) — hard gates competitivos do
// Balanced-E (perfil Normal, item 59, 2 anos): Easy ≥ 45, Medium ≥ 30,
// Hard ≤ 50, R1 ≥ 40. O número do relatório é recomputado aqui direto dos runs.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { CLASS, GATES, winPct } from './lib/v527hMetrics.mjs';
import { report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-balanced-e-competition-gates-v527h');
try {
  const ms = runs().filter((r) => r.env.preset === 'balanced-e' && r.env.profile === 'normal').flatMap((r) => r.env.result.matches);
  const independent = {
    easy: winPct(ms.filter((m) => CLASS[m.tier] === 'easy')), medium: winPct(ms.filter((m) => CLASS[m.tier] === 'medium')),
    hard: winPct(ms.filter((m) => CLASS[m.tier] === 'hard')), r1: winPct(ms.filter((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0)),
  };
  const comp = report('stage1.json').byPreset['balanced-e'].normal.competition;
  await check('analisador = recomputação independente (Easy/Medium/Hard/R1)', () => {
    assert.deepEqual({ easy: comp.easy.wr, medium: comp.medium.wr, hard: comp.hard.wr, r1: comp.r1.wr }, independent);
  });
  await check(`Easy ≥ ${GATES.competition.easyMin}%`, () => assert.ok(independent.easy >= GATES.competition.easyMin, `Easy ${independent.easy}%`));
  await check(`Medium ≥ ${GATES.competition.mediumMin}%`, () => assert.ok(independent.medium >= GATES.competition.mediumMin, `Medium ${independent.medium}%`));
  await check(`Hard ≤ ${GATES.competition.hardMax}% (ou sem partidas Hard)`, () => assert.ok(independent.hard == null || independent.hard <= GATES.competition.hardMax, `Hard ${independent.hard}%`));
  await check(`R1 ≥ ${GATES.competition.r1Min}%`, () => assert.ok(independent.r1 >= GATES.competition.r1Min, `R1 ${independent.r1}%`));
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
