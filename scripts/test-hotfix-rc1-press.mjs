import fs from 'node:fs';

const press = fs.readFileSync(new URL('../src/lib/pressData.js', import.meta.url), 'utf8');
const career = fs.readFileSync(new URL('./test-career-systems.mjs', import.meta.url), 'utf8');
const comms = fs.readFileSync(new URL('../src/lib/careerCommunications.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const checks = [
  ['RC hotfix version', pkg.version === '0.9.0-rc.1.1'],
  ['phantom guard preserved', press.includes('recordedMatchCount > 0')],
  ['completed match validation preserved', press.includes('isCompletedPlayerMatch(match, profile, playerNames, careerDate)')],
  ['post-win coverage uses persisted stats', career.includes('profileAfterWin') && career.includes('wins: 1, matches_played: 1')],
  ['post-loss coverage uses persisted stats', career.includes('profileAfterLoss') && career.includes('losses: 1, matches_played: 1')],
  ['unique interview assertion', career.includes('winInterviews.length === 1') && career.includes('lossInterviews.length === 1')],
  ['press communication dedupe', comms.includes('press-interview:${interview.sourceId}')],
  ['press route preserved', comms.includes("route: '/press?tab=interviews'")],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
console.log(`HotfixRC1PressTest: PASS (${checks.length}/${checks.length})`);
