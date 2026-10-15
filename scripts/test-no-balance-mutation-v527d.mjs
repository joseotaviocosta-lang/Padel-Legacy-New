// Playthrough 5.27-D, item 2 — FREEZE ABSOLUTO: balance diff durante a 5.27-D = 0.
// O snapshot congelado bate com o código atual, com o baseline da 5.27-C, com o
// manifest e com cada resultado; analisador e orquestrador não escrevem em src/.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { analyze, orch } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-no-balance-mutation-v527d');
const ROOT = J.rootDir('reports/rebalance-527d');
const P = J.paths(ROOT);
try {
  const current = await J.computeBalanceSnapshot();

  await check('frozen-balance.json existe e cobre presets, atributos iniciais, moedas, multiplicadores, CDB, âncoras, Silver e rescisão', () => {
    assert.ok(existsSync(P.frozen), 'rode --init');
    const f = J.readJson(P.frozen);
    for (const p of J.PRESETS) for (const k of ['startingCoins', 'initialAttributeMultiplier', 'sponsorMonthlyMultiplier', 'prizeMultiplier', 'staffMultiplier', 'shopPriceMultiplier', 'investmentRateMultiplier']) assert.ok(k in f.values.presets[p], `${p}.${k}`);
    assert.equal(typeof f.values.cdbMonthlyRate, 'number');
    assert.ok(f.values.bronzeAnchors.overallRankAnchors.length >= 10);
    assert.ok(f.values.openTierBands.silver && f.values.openTierBands.bronze);
    assert.match(f.values.severance.rule, /termination_funded_by_debt/);
  });

  await check('balance diff (congelado × código atual) = 0', () => {
    const diffs = J.balanceDiff(J.readJson(P.frozen), current);
    assert.deepEqual(diffs, []);
  });

  await check('o detector pega qualquer mudança de número (prova negativa)', () => {
    const mutated = JSON.parse(JSON.stringify(current));
    mutated.values.presets.balanced.prizeMultiplier = 3.1;
    mutated.balanceHash = J.sha256(J.canonical(mutated.values));
    assert.ok(J.balanceDiff(current, mutated).some((d) => d.field === 'balanceHash'));
    const src = JSON.parse(JSON.stringify(current));
    src.sourceHashes['src/lib/economy.js'] = '0'.repeat(64);
    assert.ok(J.balanceDiff(current, src).some((d) => d.field === 'source:src/lib/economy.js'));
  });

  await check('tuning idêntico ao baseline congelado da 5.27-C (presets e âncoras)', () => {
    const f = J.readJson(P.frozen);
    assert.equal(f.vs527c?.presetsIdentical, true);
    assert.equal(f.vs527c?.populationAnchorsIdentical, true);
  });

  await check('manifest e TODOS os resultados usam o mesmo balanceHash congelado', () => {
    const m = J.loadManifest(ROOT);
    assert.equal(m.balanceHash, current.balanceHash);
    const runs = existsSync(P.runs) ? readdirSync(P.runs).filter((f) => /^[a-z]+-[a-z]+-seed\d{3}-\d+y\.json$/.test(f)) : [];
    for (const f of runs) assert.equal(J.readJson(join(P.runs, f)).balanceHash, current.balanceHash, f);
  });

  await check('analisador e orquestrador (--status) não escrevem em src/', () => {
    const before = J.computeCodeHash().codeHash;
    assert.equal(analyze(ROOT).status, 0);
    assert.equal(orch(ROOT, ['--status']).status, 0);
    assert.equal(J.computeCodeHash().codeHash, before);
  });

  await check('código do jogo inalterado desde o --init (codeHash do manifest)', () => {
    assert.equal(J.computeCodeHash().codeHash, J.loadManifest(ROOT).codeHash);
  });
} finally {
  finish();
}
