// Playthrough 5.27-H, Blocos D/N — duração do limbo (recusa → troca efetiva),
// hard signal medido e lifecycle de compromisso NÃO alterado nesta fase.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { commitmentDecision, MATERIAL, partnershipTimeline } from './lib/v527hMetrics.mjs';
import { fileHash } from './lib/v527dJobs.mjs';
import { csvRows, has, report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-commitment-limbo-duration-v527h');
try {
  await check('limbo = dia da troca − dia da recusa; sem troca → censurado no fim da carreira', () => {
    const t = partnershipTimeline({ days: 730, partners: [{ day: 0 }], renewalDecisions: [{ day: 300, partnershipId: 'x', renew: false }] });
    assert.equal(t[0].limboDays, null); assert.equal(t[0].censoredAt, 730);
  });
  await check('decisão: só recomenda fase nova com as 4 condições simultâneas', () => {
    const all = { renewalRefused: true, delaysMaterially: true, wrDuringLimboMateriallyWorse: true, repeatsAcrossSeeds: true };
    assert.equal(commitmentDecision(all).proven, true);
    for (const k of Object.keys(all)) assert.equal(commitmentDecision({ ...all, [k]: false }).recommendation, 'do not touch commitment lifecycle', k);
    assert.ok(MATERIAL.wrPp > 0 && MATERIAL.minSeeds >= 2 && MATERIAL.limboDays > 0);
  });
  await check('commitment-limbo.csv: uma linha por recusa da matriz, limbo ≥ 0 ou censurado', () => {
    assert.ok(has('commitment-limbo.csv'));
    const rows = csvRows('commitment-limbo.csv');
    const want = runs().reduce((s, r) => s + partnershipTimeline(r.env.result).length, 0);
    assert.equal(rows.length, want);
    for (const r of rows) assert.ok((r.limboDays != null && r.limboDays >= 0) || r.censoredAt != null, JSON.stringify(r));
  });
  await check('efeito do commitment medido (Balanced-E Normal) com veredito explícito', () => {
    const c = report('stage1.json').commitment.balancedNormal;
    assert.equal(c.perSeed.length, 5);
    for (const k of ['renewalRefused', 'delaysMaterially', 'wrDuringLimboMateriallyWorse', 'repeatsAcrossSeeds']) assert.equal(typeof c.conditions[k], 'boolean', k);
    assert.match(c.recommendation, /commitment lifecycle/);
  });
  await check('lifecycle de compromisso inalterado (hash congelado = código atual)', () => {
    const f = report('frozen-config.json');
    assert.equal(fileHash('src/game-core/partnerLifecycle.js'), f.blocks.commitment.partnerLifecycleHash);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
