import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const tools = read('src/components/system/BetaTools.jsx');
const readiness = read('src/lib/betaReadiness.js');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['versão beta.28', pkg.version === '0.9.0-beta.28'],
  ['aba checklist', tools.includes("mode === 'checklist'") && tools.includes('BETA_CHECKLIST.map')],
  ['proteção do save', tools.includes("mode === 'save'") && tools.includes('createManualBackup')],
  ['exportação do save', tools.includes('exportActiveSave') && tools.includes('downloadJsonFile')],
  ['persistência checklist', readiness.includes('localStorage.setItem') && readiness.includes('loadBetaChecklist')],
  ['14 fluxos mínimos', (readiness.match(/id: '/g) || []).length >= 14],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error(failed.map(([name]) => `FAIL: ${name}`).join('\n')); process.exit(1); }
console.log(`BetaSafetyV35Test: PASS (${checks.length}/${checks.length})`);
