import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCareerDecisionCenter } from '../src/lib/careerDecisionCenter.js';

const profile = { id: 'p1', career_date: '2026-03-10', energy: 20, fatigue: 80, partner_id: null, injury_days_remaining: 0 };
const center = buildCareerDecisionCenter(profile, {
  messages: [{ id: 'm1', status: 'decisao_pendente', title: 'Renovação', content: 'Escolha uma opção.' }],
  partnerOffers: [{ id: 'o1', status: 'pending' }],
  nextTournament: { id: 't1', name: 'Future Porto Alegre', start_date: '2026-03-12' },
});
assert.ok(center.totalCount >= 4, 'deve reunir decisões de diferentes sistemas');
assert.ok(center.urgentCount >= 3, 'deve sinalizar decisões urgentes');
assert.equal(center.decisions[0].priority, 'critical', 'decisões críticas devem vir primeiro');
assert.ok(center.decisions.some((item) => item.id === 'partner-offers'));
assert.ok(center.decisions.some((item) => item.id === 'physical-load'));

const healthy = buildCareerDecisionCenter({ id: 'p2', career_date: '2026-03-10', energy: 90, fatigue: 10, partner_id: 'a2' });
assert.equal(healthy.totalCount, 0, 'carreira organizada não deve criar falsas pendências');

const hub = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
assert.match(hub, /CareerDecisionCenter/);
assert.match(hub, /buildCareerDecisionCenter/);
console.log('LivingCareerV34_7Test: PASS (decision center, priorities and empty state)');
