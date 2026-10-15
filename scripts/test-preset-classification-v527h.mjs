// Playthrough 5.27-H, Bloco L — classificação REJECT/VIABLE/PREFERRED após
// 45/45; VIABLE só com todos os hard gates; PREFERRED entre os VIABLE; default
// do jogo NUNCA trocado automaticamente; Stage 2 só com Balanced-E VIABLE/PREFERRED.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';
import { classifyPresets } from './lib/v527hMetrics.mjs';
import { report } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-preset-classification-v527h');
try {
  await check('regra pura: falhou hard gate → REJECT; VIABLE mais equilibrado → PREFERRED; empate favorece Balanced-E', () => {
    const c = classifyPresets({ 'conservative-e': { allHardPass: true, balanceScore: 5 }, 'balanced-e': { allHardPass: true, balanceScore: 5 }, 'hardcore-e': { allHardPass: false, balanceScore: 0 } });
    assert.deepEqual(c.classification, { 'conservative-e': 'VIABLE', 'balanced-e': 'PREFERRED', 'hardcore-e': 'REJECT' });
    assert.equal(classifyPresets({ a: { allHardPass: false, balanceScore: 1 } }).preferred, null);
  });
  const d = report('preset-comparison.json');
  await check('os 3 presets classificados após 45/45, coerentes com os gates', () => {
    assert.equal(d.complete, true);
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) {
      assert.ok(['REJECT', 'VIABLE', 'PREFERRED'].includes(d.classification[p]), p);
      assert.equal(d.classification[p] !== 'REJECT', d.gates[p].allHardPass, p);
    }
    assert.ok(Object.values(d.classification).filter((x) => x === 'PREFERRED').length <= 1);
  });
  await check('pelo menos um preset VIABLE', () => assert.ok(d.viable.length >= 1, JSON.stringify(d.classification)));
  await check('default do jogo não trocado automaticamente (getBalance527 → balanced)', () => {
    assert.match(readFileSync('src/lib/balance527.js', 'utf8'), /globalThis\.__PL527_PRESET\) \|\| 'balanced'/);
  });
  await check('Stage 2 liberado ⇔ Balanced-E VIABLE/PREFERRED e matriz íntegra', () => {
    const s = report('stage1.json').operational;
    const want = ['VIABLE', 'PREFERRED'].includes(d.classification['balanced-e']) && s.failedUnresolved === 0 && s.determinismFailures === 0 && s.configChangesDuringMatrix === 0;
    assert.equal(d.proceedToStage2, want);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
