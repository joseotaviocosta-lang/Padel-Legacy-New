import fs from 'node:fs';

const missionsPath = new URL('../src/pages/Missions.jsx', import.meta.url);
const source = fs.readFileSync(missionsPath, 'utf8');

const checks = [
  ['browser guard exists', source.includes("typeof window !== 'undefined'")],
  ['dispatch guard exists', source.includes("typeof window.dispatchEvent === 'function'")],
  ['CustomEvent guard exists', source.includes("typeof CustomEvent !== 'undefined'")],
  ['onboarding event preserved', source.includes("padel:onboarding-refresh")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`PASS: ${label}`);
  }
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`HotfixRC1SSRmissionsTest: PASS (${passed}/${checks.length})`);
