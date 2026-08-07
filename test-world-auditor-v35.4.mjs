import fs from 'node:fs';
const health = fs.readFileSync('src/lib/simulationHealth.js','utf8');
const beta = fs.readFileSync('src/components/system/BetaTools.jsx','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const checks = [
 ['plano seguro', health.includes('buildWorldRepairPlan') && health.includes('safeOnly: true')],
 ['aplicação segura', health.includes('applyWorldRepairPlan') && health.includes("status: 'applied'")],
 ['backup antes da correção', beta.includes('writeBackup') && beta.includes('applySafeRepairs')],
 ['interface auditor', beta.includes('Auditor Mundial Seguro') && beta.includes('Preparar correções')],
 ['versão', /^0\.9\.0-(?:beta\.(?:3[0-9]|[4-9][0-9])|rc\.\d+)$/.test(pkg.version)],
 ['script', Boolean(pkg.scripts?.['test:world-auditor-v35'])],
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error('WorldAuditorV35Test: FAIL',failed.map(([n])=>n));process.exit(1);}
console.log(`WorldAuditorV35Test: PASS (${checks.length}/${checks.length})`);
