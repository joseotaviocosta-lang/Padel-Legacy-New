import fs from 'node:fs';
const runner = fs.readFileSync('scripts/rc-qa-suite-v36.mjs', 'utf8');
const hud = fs.readFileSync('src/components/career/CareerHud.jsx', 'utf8');
const checks = [
  ['portable npm launcher', runner.includes('process.env.npm_execpath') && runner.includes('process.execPath')],
  ['windows fallback', runner.includes("'cmd.exe'") && runner.includes("'/d', '/s', '/c'")],
  ['launch errors captured', runner.includes('run.error') && runner.includes('launchError')],
  ['failure diagnostics visible', runner.includes('diagnostic ---')],
  ['larger output capture', runner.includes('slice(-12000)')],
  ['career date formatted', hud.includes('formatCareerDate') && hud.includes("`${match[3]}/${match[2]}/${match[1]}`")],
  ['date card protected width', hud.includes("min-w-[7.35rem]") && hud.includes("wide && 'shrink-0")],
  ['date value not truncated', hud.includes("!wide && 'truncate'" )],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
console.log(`HotfixV36_9_1Test: PASS (${checks.length}/${checks.length})`);
