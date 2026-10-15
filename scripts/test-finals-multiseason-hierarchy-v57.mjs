import assert from 'node:assert/strict';
import { mean, runFinalsSeason } from './lib/finalsV57Harness.mjs';

const count = Number(process.env.PADEL_V57_FINALS_CALIB || 3);
const rows = [];
for (let seed = 0; seed < count; seed += 1) rows.push(await runFinalsSeason(`v57-calibration-${seed}`));
assert.equal(rows.length, count);
assert.equal(rows.every((row) => row.circuit.count === 8 && row.legacy.count === 16), true);
console.log(JSON.stringify({
  seasons: count,
  circuitAvgOVR: mean(rows.map((row) => row.circuit.avgOVR)), legacyAvgOVR: mean(rows.map((row) => row.legacy.avgOVR)),
  circuitAboveLegacy: rows.filter((row) => row.circuit.avgOVR > row.legacy.avgOVR).length,
  rows: rows.map((row) => ({ circuit: row.circuit, legacy: row.legacy })),
}, null, 2));
console.log('test-finals-multiseason-hierarchy-v57: PASS');
