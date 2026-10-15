import assert from 'node:assert/strict';
import { runFinalsSeason } from './lib/finalsV57Harness.mjs';

const { circuit, legacy } = await runFinalsSeason('v57-elite-participation');
const circuitPairs = new Set(circuit.entries.map((entry) => entry.pairId));
const legacyPairs = new Set(legacy.entries.map((entry) => entry.pairId));
assert.equal(circuitPairs.size, 8);
assert.equal(legacyPairs.size, 16);
assert.ok([...circuitPairs].every((pair) => legacyPairs.has(pair)), 'Top-8 Circuit deve estar contido no convite Top-16 Legacy quando as duplas seguem ativas');
console.log(JSON.stringify({ circuit: circuit.entries, legacy: legacy.entries }, null, 2));
console.log('test-finals-elite-pair-participation-v57: PASS');
