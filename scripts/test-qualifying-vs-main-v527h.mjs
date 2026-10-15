// Playthrough 5.27-H, Bloco C (item 14) — qualifying nunca agregado com chave
// principal sem breakdown: R1 é só da chave principal, e para cada tier
// qualifying + main = total.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { roundBucket } from './lib/v527hMetrics.mjs';
import { csvRows } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-qualifying-vs-main-v527h');
try {
  await check('roundBucket: qualifying → Q (nunca R1); QF/SF/F pelo nome; R1/R2 pelo índice da chave', () => {
    assert.equal(roundBucket({ stage: 'qualifying', stageRoundIndex: 0, round: 'Quartas do qualifying' }), 'Q');
    assert.equal(roundBucket({ stage: 'main', stageRoundIndex: 0, round: 'Primeira Rodada' }), 'R1');
    assert.equal(roundBucket({ stage: 'main', stageRoundIndex: 1, round: 'Rodada de 32' }), 'R2');
    assert.equal(roundBucket({ stage: 'main', stageRoundIndex: 1, round: 'Quartas de Final' }), 'QF');
    assert.equal(roundBucket({ stage: 'main', stageRoundIndex: 3, round: 'Semifinal' }), 'SF');
    assert.equal(roundBucket({ stage: 'main', stageRoundIndex: 4, round: 'Final' }), 'F');
  });
  await check('tiers.csv: qualifying + main = all em toda linha', () => {
    for (const r of csvRows('tiers.csv')) assert.equal(r.qualifyingN + r.mainN, r.allN, `${r.preset}/${r.profile}/${r.tier}`);
  });
  await check('qualifying-vs-main.csv separa Gold e Platinum para todos os presets/perfis', () => {
    const rows = csvRows('qualifying-vs-main.csv');
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) for (const pr of ['all', 'casual', 'normal', 'optimizer']) for (const t of ['Gold', 'Platinum']) {
      const x = rows.find((r) => r.preset === p && r.profile === pr && r.tier === t);
      assert.ok(x, `${p}/${pr}/${t}`);
      assert.ok(x.mainR1N <= x.mainN);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
