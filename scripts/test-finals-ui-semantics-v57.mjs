import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [catalog, tournaments] = await Promise.all([
  readFile(new URL('../src/lib/circuitCatalog.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Tournaments.jsx', import.meta.url), 'utf8'),
]);
assert.match(catalog, /Circuit Finals[\s\S]{0,600}8 melhores/);
assert.match(catalog, /Legacy Finals[\s\S]{0,600}16 melhores parcerias/);
assert.match(tournaments, /Top 8/);
assert.match(tournaments, /Top 16/);
console.log('test-finals-ui-semantics-v57: PASS');
