// Playthrough 5.27-F, Bloco M — substitui o hash de ARQUIVO do
// test-no-balance-mutation-v527d (que quebra com qualquer acréscimo, ex. os
// presets -E) por um congelamento SEMÂNTICO: os valores dos presets antigos
// (conservative/balanced/hardcore) e as demais âncoras de balanceamento
// continuam exatamente os congelados na 5.27-D.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync } from 'node:fs';
import * as J from './lib/v527dJobs.mjs';

const { check, finish } = makeSuite('test-old-presets-semantic-freeze-v527f');
const FROZEN = 'reports/rebalance-527d/frozen-balance.json';
try {
  const frozen = existsSync(FROZEN) ? J.readJson(FROZEN) : null;
  const current = await J.computeBalanceSnapshot();

  await check('snapshot congelado da 5.27-D disponível', () => assert.ok(frozen, FROZEN));

  await check('valores dos 3 presets antigos idênticos (startingCoins, atributos, sponsor, prize, staff, shop, investimento)', () => {
    assert.deepEqual(current.values.presets, frozen.values.presets);
  });

  await check('CDB, âncoras de população, bandas abertas e regra de rescisão idênticos', () => {
    for (const k of ['cdbMonthlyRate', 'bronzeAnchors', 'openTierBands', 'severance', 'defaultPreset']) assert.deepEqual(current.values[k], frozen.values[k], k);
  });

  await check('balanceHash estruturado idêntico ao da 5.27-D', () => assert.equal(current.balanceHash, frozen.balanceHash));

  await check('presets antigos sem núcleo competitivo -E; presets -E existem à parte', async () => {
    const B = await import('../src/lib/balance527.js');
    for (const id of ['conservative', 'balanced', 'hardcore']) assert.equal(B.BALANCE_527B_PRESETS[id].competition, undefined, id);
    for (const id of ['conservative-e', 'balanced-e', 'hardcore-e']) assert.ok(B.BALANCE_527E_PRESETS[id].competition, id);
    assert.equal(B.BALANCE_527_PRESETS, B.BALANCE_527B_PRESETS, 'alias retrocompatível');
  });

  await check('default sem preset selecionado continua Balanced antigo', async () => {
    const B = await import('../src/lib/balance527.js');
    const saved = globalThis.__PL527_PRESET; delete globalThis.__PL527_PRESET;
    try { assert.equal(B.getBalance527().id, 'balanced'); assert.equal(B.getBalance527().competition, undefined); } finally { if (saved) globalThis.__PL527_PRESET = saved; }
  });
} finally {
  finish();
}
