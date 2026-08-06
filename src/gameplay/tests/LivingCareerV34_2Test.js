import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCareerMemory, getCareerAgent, getMemoryHighlights } from '../../lib/careerMemory.js';

const profile = { id: 'profile-test', name: 'José', career_date: '2027-01-01', partner_name: 'Alex', partner_trust: 60, coach_trust: 65 };
const matches = Array.from({ length: 10 }, (_, index) => ({ status: 'completed', player_won: index < 7 }));
const partnership = { started_career_date: '2026-01-01', shared_matches: 30, shared_wins: 20, shared_titles: 2 };
const memory = buildCareerMemory(profile, { matches, partnership, sponsorContracts: [{ is_active: true }] });
const agent = getCareerAgent(profile);
const communicationsSource = fs.readFileSync(new URL('../../lib/careerCommunications.js', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../../pages/Communications.jsx', import.meta.url), 'utf8');

assert.equal(memory.matchesPlayed, 10);
assert.equal(memory.recentWins, 7);
assert.equal(memory.partnershipMonths, 12);
assert.equal(memory.partnershipTitles, 2);
assert.equal(memory.activeSponsorContracts, 1);
assert.ok(agent.name);
assert.ok(agent.personalityLabel);
assert.ok(getMemoryHighlights(profile, memory).length >= 2);
assert.match(communicationsSource, /applyCareerCommunicationAction/);
assert.match(communicationsSource, /partner-longevity/);
assert.match(communicationsSource, /agent-sponsor-search/);
assert.match(pageSource, /Seu empresário/);
assert.match(pageSource, /action\.description/);
console.log('LivingCareerV34_2Test: PASS (12/12)');
