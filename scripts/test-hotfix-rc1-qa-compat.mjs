import fs from 'node:fs';
import assert from 'node:assert/strict';
import { isAtLeastBetaOrRC, parsePadelVersion } from './release-version-utils.mjs';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const playback=fs.readFileSync('scripts/test-match-playback-tactics.mjs','utf8');
const ux=fs.readFileSync('scripts/test-ux-interfaces-v36-3-2.mjs','utf8');
const checks=[
 ['release parser accepts patched RC', parsePadelVersion(pkg.version)?.channel==='rc' && isAtLeastBetaOrRC(pkg.version,45)],
 ['historical beta remains comparable', isAtLeastBetaOrRC('0.9.0-beta.45',45) && !isAtLeastBetaOrRC('0.9.0-beta.44',45)],
 ['retired replay contract removed', !playback.includes('validateReplay(original.replay)') && !playback.includes('ReplayPlayer')],
 ['tactics timeline remains covered', playback.includes('tacticsTimeline')],
 ['tactic diversity remains covered', playback.includes('variedade suficiente')],
 ['Press shared loading state accepted', ux.includes("content.includes('LoadingScreen')")],
 ['hotfix version', pkg.version==='0.9.0-rc.1.5'],
 ['hotfix script', Boolean(pkg.scripts?.['test:hotfix-rc1.0.5'])],
];
for(const [name,ok] of checks){assert(ok,name);console.log(`PASS: ${name}`)}
console.log(`HotfixRC1QACompatibilityTest: PASS (${checks.length}/${checks.length})`);
