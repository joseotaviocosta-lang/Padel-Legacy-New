import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
assert.ok(source.includes('grid gap-2 lg:grid-cols-2'), 'cards precisam reduzir a uma coluna abaixo do desktop largo');
assert.ok(source.includes('min-w-0 rounded-xl'), 'cards precisam poder encolher sem overflow');
assert.ok(source.includes('w-full sm:w-auto'), 'CTA precisa ser amplo no celular e compacto no desktop');
assert.ok(source.includes('aria-label={`Planejamento: ${item.name}`}'));
console.log('test-weekly-planning-mobile-contract-v58: PASS');
