import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, classifyFieldLayers, TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

const seasons = Number(process.env.PADEL_V56_LABEL_SEASONS || 3);
const rows = [];
for (let i = 0; i < seasons; i += 1) {
  const sim = await runHeadlessWorldSimulation({ years: 1, label: `v56-label-${i}`, trackWeeklyDraws: false });
  rows.push(await classifyFieldLayers(sim));
}
const stats = {};
for (const tier of TIER_ORDER) {
  stats[tier] = {};
  for (const key of ['pctCORE', 'pctNEAR', 'pctSTRETCH', 'pctEMERGENCY']) {
    const values = rows.map((row) => row[tier]?.[key]).filter(Number.isFinite);
    stats[tier][key] = { mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
  }
}
console.log(JSON.stringify(stats, null, 2));
assert.equal(rows.length, seasons);
assert.ok(stats.Gold.pctCORE.mean > 1, `Gold CORE=${stats.Gold.pctCORE.mean}`);
assert.ok(stats.Gold.pctEMERGENCY.mean < 50, `Gold EMERGENCY=${stats.Gold.pctEMERGENCY.mean}`);
console.log('test-tier-entry-label-distribution-v56: PASS');
