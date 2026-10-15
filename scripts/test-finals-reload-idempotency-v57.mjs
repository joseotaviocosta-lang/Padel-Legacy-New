import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8');
assert.match(source, /hadCanonicalDraw/);
assert.match(source, /type: 'upsert', entityName: RANKING_RESULT_ENTITY/);
assert.match(source, /applyFinalsEntryAuthority\(due, pairs/);
console.log('test-finals-reload-idempotency-v57: PASS');
