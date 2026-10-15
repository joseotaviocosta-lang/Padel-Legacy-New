import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/weeklyCareerReview.js', import.meta.url), 'utf8');
assert.ok(source.includes('Planejamento semanal é uma projeção pura'));
assert.ok(!source.includes('ensureContextualCareerCommunications('), 'o planner não pode criar alertas');
assert.ok(!source.includes('localGame.'), 'o planner não pode fazer I/O nem persistir notificações');
console.log('test-weekly-planning-no-duplicate-notification-v58: PASS');
