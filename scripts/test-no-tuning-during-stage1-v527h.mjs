// Playthrough 5.27-H, itens 3/4 — FREEZE: balance, política de parceiro,
// táticas, ranking e população idênticos do --init ao último resultado.
// Prova: hash semântico congelado = código atual = cada run; toda verificação
// por segmento registrada sem diferença; detector pega mudança (prova negativa).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import * as J from './lib/v527dJobs.mjs';
import { computeFrozenConfig, ENV_527H, envViolations, frozenDiff } from './lib/v527hFreeze.mjs';
import { manifest, report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-no-tuning-during-stage1-v527h');
try {
  const frozen = report('frozen-config.json');
  const current = await computeFrozenConfig();
  await check('frozen-config.json cobre balanced-e, policy v3, partner scoring, renovação, táticas, AI OFF, energia, ranking Gold+, população, Silver, multiplicadores, moedas, atributos e commitment', () => {
    const b = frozen.blocks;
    assert.deepEqual(frozen.presets, ['conservative-e', 'balanced-e', 'hardcore-e']);
    assert.equal(b.partnerPolicy.policyVersion, 'v3');
    assert.deepEqual(b.partnerPolicy.normalWeights, { compatibility: 0.5, levelFit: 0.4, affordability: 0.1 });
    assert.match(b.partnerPolicy.renewalRule, /renewVsMarket/);
    assert.equal(b.tactics.tacticRiskScale, 0);
    assert.equal(b.tactics.aiAdaptation.enabled, false);
    assert.equal(b.engine.energyConditionSlope, 0.2);
    assert.equal(b.ranking.gatedFirstRoundLossPointsRatio, 0.01);
    assert.ok(b.population.overallRankAnchors.length >= 10 && b.population.openTierBands.silver);
    for (const k of ['startingCoins', 'initialAttributeMultiplier', 'sponsor', 'prizeMultiplier', 'staffMultiplier', 'shopPriceMultiplier', 'investmentRateMultiplier']) assert.ok(k in b.balance.presets['balanced-e'], k);
    assert.ok(b.commitment.partnerLifecycleHash);
  });
  await check('hash semântico congelado = código atual (0 diferenças)', () => assert.deepEqual(frozenDiff(frozen, current), []));
  await check('todo resultado carrega o mesmo semanticHash e o codeHash do manifest', () => {
    const m = manifest();
    for (const { file, env } of runs()) { assert.equal(env.semanticHash, frozen.semanticHash, file); assert.equal(env.codeHash, m.codeHash, file); }
    assert.equal(J.computeCodeHash().codeHash, m.codeHash, 'código do jogo/harness mudou desde o --init');
  });
  await check('toda verificação por segmento registrada sem diferença e com ambiente correto', () => {
    const op = report('stage1.json').operational;
    assert.ok(op.freezeChecks.checks >= 45 * 8, `${op.freezeChecks.checks} verificações`);
    assert.equal(op.freezeChecks.withDiffs, 0);
    assert.deepEqual(op.freezeChecks.hashes, [frozen.semanticHash]);
    assert.equal(op.configChangesDuringMatrix, 0);
  });
  await check('ambiente do lançador = ambiente exigido pelo freeze; override de calibração é recusado', () => {
    assert.deepEqual(envViolations({ ...ENV_527H }), []);
    assert.ok(envViolations({ ...ENV_527H, PL527E_POLICY: 'v2' }).length > 0);
    assert.ok(envViolations({ ...ENV_527H, PL527E_COMPETITION: '{"silverPeakLow":800}' }).length > 0);
  });
  await check('detector pega mudança de tática/ranking/parceiro (prova negativa)', () => {
    for (const block of ['tactics', 'ranking', 'partnerPolicy', 'population', 'balance']) {
      const mutated = JSON.parse(JSON.stringify(current));
      mutated.blockHashes[block] = '0'.repeat(64);
      assert.ok(frozenDiff(current, mutated).some((d) => d.field === `block:${block}`), block);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
