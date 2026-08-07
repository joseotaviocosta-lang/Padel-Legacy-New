import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json'));
const adapter = read('src/gameplay/adapters/ActiveCareerAdapter.js');
const entities = read('src/gameplay/repositories/CareerEntityRepository.js');
const manager = read('src/careers/CareerManager.js');
const analytics = read('src/lib/betaAnalytics.js');
const betaTools = read('src/components/system/BetaTools.jsx');
const bell = read('src/components/communications/CommunicationBell.jsx');

const checks = [
  ['release version', pkg.version === '0.9.0-rc.1.7'],
  ['hot entity reads', entities.includes('fresh: false, cloneResult: false')],
  ['routine mutations avoid disk reread', adapter.includes('fresh: false') && adapter.includes('cloneResult: false') && adapter.includes('const career = clone(current)')],
  ['routine backup throttled', adapter.includes('ROUTINE_BACKUP_INTERVAL_MS') && adapter.includes('shouldBackup')],
  ['career index sync throttled', adapter.includes('INDEX_SYNC_INTERVAL_MS') && manager.includes('updateIndex = true')],
  ['analytics writes debounced', analytics.includes('ANALYTICS_WRITE_DELAY_MS') && analytics.includes('persistStateNow')],
  ['beta panel does not poll while closed', betaTools.includes('if (!open) return undefined')],
  ['communication polling relaxed', bell.includes('60000') && bell.includes('document.hidden')],
  ['script registered', pkg.scripts?.['test:performance-deep-rc1'] === 'node scripts/test-performance-deep-rc1.mjs'],
];
for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS: ${name}`);
}
console.log(`PerformanceDeepRC1Test: PASS (${checks.length}/${checks.length})`);
