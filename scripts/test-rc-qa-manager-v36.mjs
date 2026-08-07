import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
const runner=fs.readFileSync('scripts/rc-qa-suite-v36.mjs','utf8');
const checks=[
 ['version beta.46',p.version==='0.9.0-beta.46'],
 ['rc qa command',!!p.scripts['test:rc-qa']],
 ['smoke command',!!p.scripts['test:rc-qa:smoke']],
 ['full command',!!p.scripts['test:rc-qa:full']],
 ['report json',runner.includes('rc-qa-latest.json')],
 ['report md',runner.includes('rc-qa-latest.md')],
 ['blocking exit',runner.includes('process.exit(failed ? 1 : 0)')],
 ['match gate',runner.includes("'test:match-integrity'")],
 ['world gate',runner.includes("'test:world-auditor-v35'")],
 ['beta gate',runner.includes("'test:rc-beta-intelligence'")],
];
for(const [n,ok] of checks){if(!ok) throw new Error('FAIL: '+n); console.log('PASS:',n)}
console.log(`RCQAManagerV36Test: PASS (${checks.length}/${checks.length})`);
