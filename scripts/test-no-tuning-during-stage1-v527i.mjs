// Playthrough 5.27-I, Bloco I (item 37) — banda Silver escolhida e política v4
// congeladas depois do micro; nenhuma mudança durante os 45 jobs. Fora dos dois
// escopos da fase, tudo igual ao frozen-before (engine, energia, ranking,
// táticas, Normal v3, lifecycle, Bronze, Gold+, economia).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import * as J from './lib/v527dJobs.mjs';
import { computeFrozenConfig, ENV_527I, envViolations, frozenDiff } from './lib/v527iFreeze.mjs';
import { manifest, report, runs } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-no-tuning-during-stage1-v527i');
try {
  const frozen = report('frozen-config.json');
  const before = report('frozen-before.json');
  const current = await computeFrozenConfig();
  await check('frozen-config.json da 5.27-I cobre a banda Silver escolhida e a política v4', () => {
    assert.equal(frozen.phase, '5.27-I'); assert.equal(frozen.policy, 'v4');
    assert.ok(frozen.blocks.silver.silverPeakLow > 0 && frozen.blocks.silver.silverFieldOffsetPct != null);
    assert.equal(frozen.blocks.optimizerPolicy.policyVersion, 'v4');
    const choice = report('silver-choice.json');
    for (const [k, v] of Object.entries(choice.values)) assert.equal(frozen.blocks.silver[k], v, k);
  });
  await check('fora dos dois escopos: engine/ranking/táticas/balance/Normal v3/commitment = frozen-before', () => {
    for (const k of ['engine', 'ranking', 'tactics', 'balance', 'partnerPolicy', 'commitment']) assert.equal(frozen.blockHashes[k], before.blockHashes[k], k);
  });
  await check('hash semântico congelado = código atual (0 diferenças)', () => assert.deepEqual(frozenDiff(frozen, current), []));
  await check('todos os resultados com o mesmo semanticHash/codeHash; nenhuma verificação com diferença', () => {
    const m = manifest();
    for (const { file, env } of runs()) { assert.equal(env.semanticHash, frozen.semanticHash, file); assert.equal(env.codeHash, m.codeHash, file); }
    assert.equal(J.computeCodeHash().codeHash, m.codeHash);
    const op = report('stage1.json').operational;
    assert.ok(op.freezeChecks.checks >= 45 * 8);
    assert.equal(op.freezeChecks.withDiffs, 0);
    assert.equal(op.configChangesDuringMatrix, 0);
  });
  await check('ambiente exigido; override de calibração recusado', () => {
    assert.deepEqual(envViolations({ ...ENV_527I }), []);
    assert.ok(envViolations({ ...ENV_527I, PL527E_COMPETITION: '{"silverFieldOffsetPct":0.2}' }).length > 0);
    assert.ok(envViolations({ ...ENV_527I, PL527E_POLICY: 'v3' }).length > 0);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
