// Playthrough 5.27-I, Bloco A (itens 8/11) — Normal v3 e Casual inalterados;
// Otimizador ≠ Normal e ≠ Casual em mercados representativos e na matriz.
import { readFileSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { normalPartnerScore } from './lib/v527gPartnerScore.mjs';
import { pickOptimizerPartner } from './lib/v527iOptimizerScore.mjs';
import { computeFrozenConfig } from './lib/v527hFreeze.mjs';
import { report, runs } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-optimizer-vs-normal-policy-v527i');
// Mercados representativos (forma dos mercados reais medidos na 5.27-G: muito
// compatível e fraco × forte e menos compatível × forte e caro).
const MARKETS = [
  { playerOvr: 47, coins: 8000, rows: [[38, 85, 80], [82, 68, 450], [90, 55, 4000], [60, 75, 200]] },
  { playerOvr: 60, coins: 12000, rows: [[55, 90, 300], [86, 62, 520], [79, 70, 420], [91, 50, 6000]] },
  { playerOvr: 35, coins: 4000, rows: [[33, 88, 80], [70, 60, 350], [80, 55, 1600]] },
];
try {
  await check('Normal v3 e Casual: definição de política idêntica à congelada na 5.27-H', async () => {
    const before = report('frozen-before.json');
    const now = await computeFrozenConfig();
    assert.equal(now.blockHashes.partnerPolicy, before.blockHashes.partnerPolicy);
    const sim = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(sim, /const OPTIMIZER_V4 = POLICY_VERSION === 'v4' && PROFILE === 'optimizer';/);
  });
  await check('mercados representativos: escolha do Otimizador ≠ escolha do Normal', () => {
    let differ = 0;
    for (const m of MARKETS) {
      const rows = m.rows.map(([ovr, compatibility, salary]) => ({ candidate: { ovr, salary }, offer: { compatibility } }));
      const opt = pickOptimizerPartner(rows, { coins: m.coins, ovrOf: (c) => c.ovr, termsOf: (c) => ({ monthlySalary: c.salary }) });
      const nor = [...rows].sort((a, b) => normalPartnerScore({ compatibility: b.offer.compatibility, candidateOvr: b.candidate.ovr, playerOvr: m.playerOvr, coins: m.coins, salary: b.candidate.salary, prizeSplit: 50 })
        - normalPartnerScore({ compatibility: a.offer.compatibility, candidateOvr: a.candidate.ovr, playerOvr: m.playerOvr, coins: m.coins, salary: a.candidate.salary, prizeSplit: 50 }))[0];
      if (opt !== nor) differ += 1;
    }
    assert.ok(differ >= 2, `${differ}/3 mercados diferentes`);
  });
  await check('matriz: sequências de parceiros do Otimizador ≠ Normal ≠ Casual (mesma seed/preset)', () => {
    const rs = runs();
    assert.equal(rs.length, 45);
    const seq = (p, pr, s) => JSON.stringify((rs.find((r) => r.env.preset === p && r.env.profile === pr && r.env.seed === s)?.env.result.partners || []).map((x) => x.partnerId));
    let same = 0; let total = 0;
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) for (let s = 1; s <= 5; s += 1) {
      total += 2; if (seq(p, 'optimizer', s) === seq(p, 'normal', s)) same += 1; if (seq(p, 'optimizer', s) === seq(p, 'casual', s)) same += 1;
    }
    assert.ok(same === 0, `${same}/${total} sequências idênticas`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
