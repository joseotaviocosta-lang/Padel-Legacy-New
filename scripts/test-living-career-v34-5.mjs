import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const momentsPath = path.join(root, 'src/lib/careerMoments.js');
const bannerPath = path.join(root, 'src/components/career/CareerMomentBanner.jsx');
const hubPath = path.join(root, 'src/pages/CareerHub.jsx');

for (const file of [momentsPath, bannerPath, hubPath]) assert.ok(fs.existsSync(file), `Arquivo ausente: ${file}`);
const { deriveCareerMoment } = await import(pathToFileURL(momentsPath));

const base = { id: 'player-1', career_date: '2028-03-10', partner_id: 'p2' };
assert.equal(deriveCareerMoment({ ...base, is_injured: true, injury_days_remaining: 4 }, {}).type, 'injury');
assert.equal(deriveCareerMoment(base, { worldRank: { rank: 8 } }).type, 'ranking');
assert.equal(deriveCareerMoment(base, { nextTournament: { id: 't1', name: 'Premier Madrid', start_date: '2028-03-12' } }).type, 'tournament');
assert.equal(deriveCareerMoment(base, { matches: [
  { id: 'm1', status: 'completed', player_won: true, match_date: '2028-03-09' },
  { id: 'm2', status: 'completed', player_won: true, match_date: '2028-03-08' },
  { id: 'm3', status: 'completed', player_won: true, match_date: '2028-03-07' },
  { id: 'm4', status: 'completed', player_won: true, match_date: '2028-03-06' },
] }).type, 'form');
assert.equal(deriveCareerMoment(base, {}), null);

const hub = fs.readFileSync(hubPath, 'utf8');
assert.match(hub, /CareerMomentBanner/);
assert.match(hub, /deriveCareerMoment/);
console.log('LivingCareerV34_5Test: PASS (atmosfera contextual e momentos da carreira)');
