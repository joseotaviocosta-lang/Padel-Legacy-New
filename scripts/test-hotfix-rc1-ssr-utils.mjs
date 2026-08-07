import fs from 'node:fs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const utils = fs.readFileSync('src/lib/utils.js', 'utf8');
const missions = fs.readFileSync('src/pages/Missions.jsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  ['utils no longer reads window at module scope', /typeof window !== ['"]undefined['"]/.test(utils) && /window\.self !== window\.top/.test(utils)],
  ['SSR fallback for iframe is false', /:\s*false\s*;/.test(utils)],
  ['Missions onboarding event stays browser guarded', /typeof window !== ['"]undefined['"]/.test(missions) && /padel:onboarding-refresh/.test(missions)],
  ['release version bumped', pkg.version === '0.9.0-rc.1.4'],
  ['hotfix script registered', pkg.scripts?.['test:hotfix-rc1.0.4'] === 'node scripts/test-hotfix-rc1-ssr-utils.mjs'],
];
for (const [name, ok] of checks) {
  assert(ok, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`HotfixRC1SSRUtilsTest: PASS (${checks.length}/${checks.length})`);
