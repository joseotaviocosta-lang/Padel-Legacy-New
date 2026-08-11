import fs from 'node:fs';

const press = fs.readFileSync(new URL('../src/lib/pressData.js', import.meta.url), 'utf8');
const career = fs.readFileSync(new URL('./test-career-systems.mjs', import.meta.url), 'utf8');
const comms = fs.readFileSync(new URL('../src/lib/careerCommunications.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const checks = [
  ['RC version preserved', pkg.version.startsWith('0.9.0-rc.')],
  ['phantom guard preserved', press.includes('recordedMatchCount > 0')],
  ['official match validation centralized', press.includes('isOfficialPlayerTournamentResult(match, profile)')],
  ['post-win coverage uses persisted stats', career.includes('profileAfterWin') && career.includes('wins: 1, matches_played: 1')],
  ['post-loss coverage uses persisted stats', career.includes('profileAfterLoss') && career.includes('losses: 1, matches_played: 1')],
  ['unique interview assertion', career.includes('winInterviews.length === 1') && career.includes('lossInterviews.length === 1')],
  ['press communication dedupe', comms.includes('press-interview:${interview.sourceId}')],
  ['press route preserved', comms.includes("type: 'PRESS_INTERVIEW'") && comms.includes("route: '/press'")],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
console.log(`HotfixRC1PressTest: PASS (${checks.length}/${checks.length})`);
