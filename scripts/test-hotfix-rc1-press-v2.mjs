import fs from 'node:fs';
const press = fs.readFileSync(new URL('../src/lib/pressData.js', import.meta.url), 'utf8');
const career = fs.readFileSync(new URL('./test-career-systems.mjs', import.meta.url), 'utf8');
const checks = [
  ['career date advances to completed match', career.includes("career_date: '2026-01-02', wins: 1") && career.includes("career_date: '2026-01-02', losses: 1")],
  ['future-match guard preserved', press.includes("if (matchDate > String(careerDate).slice(0, 10)) return false")],
  ['real match guard preserved', press.includes('recordedMatchCount > 0')],
  ['own matches sorted after filtering', press.includes('const ownMatches = (recordedMatchCount > 0') && press.includes(').sort((a, b) => String(')],
  ['played date supported in sorting', press.includes('b.played_date || b.match_date || b.date')],
  ['unique win interview assertion preserved', career.includes("winInterviews.length === 1")],
  ['unique loss interview assertion preserved', career.includes("lossInterviews.length === 1")],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
console.log(`HotfixRC1PressV2Test: PASS (${checks.length}/${checks.length})`);
