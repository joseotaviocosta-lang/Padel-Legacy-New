import assert from 'node:assert/strict';
import { runFinalsSeason } from './lib/finalsV57Harness.mjs';

const { circuit, legacy } = await runFinalsSeason('v57-field-strength');
assert.equal(circuit.count, 8, `Circuit=${circuit.count}`);
assert.equal(legacy.count, 16, `Legacy=${legacy.count}`);
assert.ok(circuit.avgOVR > 0 && legacy.avgOVR > 0);
assert.ok(circuit.avgRank > 0 && legacy.avgRank > 0);
console.log(JSON.stringify({ circuit, legacy }, null, 2));
console.log('test-finals-field-strength-v57: PASS');
