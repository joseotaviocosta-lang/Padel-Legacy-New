import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const suites = [
  'test:beta','test:missions','test:tutorial-engine','test:calendar-advance','test:living-world',
  'test:global-market','test:sports-economy','test:coaches-v28','test:partnerships-v29',
  'test:staff-architecture','test:performance-v31','test:ranking-carryover-v32','test:career-ai-v34',
  'test:match-integrity','test:match-experience-v34','test:simulation-health-v35','test:world-auditor-v35',
  'test:beta-integration-v35'
];
const results=[];
for (const name of suites) {
  const started=Date.now();
  const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','-s',name],{encoding:'utf8',timeout:60000});
  results.push({name,ok:run.status===0,code:run.status,duration_ms:Date.now()-started,output:`${run.stdout||''}${run.stderr||''}`.trim().slice(-3000)});
  console.log(`${run.status===0?'PASS':'FAIL'} ${name}`);
}
const report={version:'v36.1',generated_at:new Date().toISOString(),summary:{total:results.length,passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length},results,notes:['Testes de replay legados não fazem parte do Beta RC porque o replay foi removido.','lint, typecheck e build devem ser executados localmente com node_modules instalado.']};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/BETA-AUDIT-v36.1.json',JSON.stringify(report,null,2));
fs.writeFileSync('reports/BETA-AUDIT-v36.1.md',`# Padel Legacy v36.1 Beta Audit RC\n\n- Suítes: ${report.summary.total}\n- Aprovadas: ${report.summary.passed}\n- Falhas: ${report.summary.failed}\n\n${results.map(r=>`- ${r.ok?'✅':'❌'} ${r.name} (${r.duration_ms} ms)`).join('\n')}\n`);
if(report.summary.failed) process.exit(1);
console.log(`BetaAuditV36_1: PASS (${report.summary.passed}/${report.summary.total})`);
