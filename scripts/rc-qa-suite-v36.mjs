import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const args = new Set(process.argv.slice(2));
const profile = args.has('--full') ? 'full' : args.has('--smoke') ? 'smoke' : 'core';
const dryRun = args.has('--dry-run');
const noReport = args.has('--no-report');

const GROUPS = {
  foundation: ['validate:architecture','test:vite-config','test:career-systems','test:players','test:player-builds'],
  onboarding: ['test:onboarding-v2','test:tutorial-chronology','test:missions','test:tutorial-engine'],
  gameplay: ['test:match-integrity','test:match-playback','test:live-coach','test:rc-gameplay-balance','test:rc-match-experience'],
  career: ['test:training-v2','test:tournament-registration','test:partner-offers','test:career-pace','test:injuries','test:calendar-advance'],
  world: ['test:living-world','test:global-market','test:sports-economy','test:coaches-v28','test:partnerships-v29','test:rc-world-ai','test:simulation-health-v35','test:world-auditor-v35'],
  ux: ['test:ui-quality','test:closed-beta-v35','test:beta-safety-v35','test:beta-integration-v35','test:beta-rc','test:ux-home-v36','test:ux-interfaces-v36','test:polish-ui-v36','test:performance-responsive-v36'],
  beta: ['test:beta-analytics','test:beta-analytics-pro','test:rc-beta-intelligence'],
  regression: ['test:replay','test:replay-gameplay','test:replay-career','test:ranking-carryover-v32','test:v30-audit','test:performance-v31','test:massive-v32']
};
const SMOKE = ['test:match-integrity','test:calendar-advance','test:tournament-registration','test:rc-match-experience','test:rc-beta-intelligence','test:beta-rc'];
const CORE_GROUPS = ['foundation','gameplay','career','world','ux','beta'];
const selected = profile === 'smoke' ? SMOKE : profile === 'full' ? Object.values(GROUPS).flat() : CORE_GROUPS.flatMap(k => GROUPS[k]);
const unique = [...new Set(selected)].filter(name => scripts[name]);
const missing = [...new Set(selected)].filter(name => !scripts[name]);

const results = [];
console.log(`\nPadel Legacy RC QA — ${pkg.version} — perfil ${profile.toUpperCase()}`);
console.log(`Suítes selecionadas: ${unique.length}${missing.length ? ` | ausentes: ${missing.length}` : ''}\n`);

for (let i=0;i<unique.length;i++) {
  const name = unique[i];
  const started = Date.now();
  process.stdout.write(`[${String(i+1).padStart(2,'0')}/${unique.length}] ${name} ... `);
  if (dryRun) {
    console.log('DRY RUN');
    results.push({name,status:'SKIP',durationMs:0});
    continue;
  }
  // Do not spawn `npm.cmd` directly on Windows. Depending on the Node/Windows
  // combination, spawnSync can return EINVAL before npm is even started. When
  // this runner is itself launched by npm, npm_execpath points to npm-cli.js;
  // invoking that script through the current Node executable is portable and
  // preserves the same package environment.
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'cmd.exe' : 'npm');
  const commandArgs = npmExecPath
    ? [npmExecPath, 'run', name]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm run ${name}`]
      : ['run', name];

  const run = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    windowsHide: true,
  });
  const durationMs = Date.now()-started;
  const launchError = run.error ? `${run.error.name || 'Error'}: ${run.error.message || String(run.error)}` : '';
  const ok = !run.error && run.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} (${(durationMs/1000).toFixed(1)}s)`);

  const stdout = (run.stdout || '').slice(-12000);
  const stderr = (run.stderr || '').slice(-12000);
  const diagnostic = [launchError, stderr, stdout].filter(Boolean).join('\n').trim();
  if (!ok) {
    console.log('');
    console.log(`--- ${name} diagnostic ---`);
    console.log(diagnostic || `Processo terminou sem saída (exitCode=${run.status ?? 'null'}, signal=${run.signal ?? 'none'}).`);
    console.log(`--- fim ${name} ---\n`);
  }

  results.push({
    name,
    status: ok ? 'PASS' : 'FAIL',
    durationMs,
    exitCode: run.status,
    signal: run.signal || null,
    launchError: launchError || null,
    stdout,
    stderr,
  });
}

const passed = results.filter(r=>r.status==='PASS').length;
const failed = results.filter(r=>r.status==='FAIL').length;
const skipped = results.filter(r=>r.status==='SKIP').length;
const score = results.length ? Math.round((passed / Math.max(1, passed+failed))*100) : 0;
const status = failed ? 'BLOCKED' : dryRun ? 'DRY_RUN' : 'READY';
const report = {generatedAt:new Date().toISOString(),version:pkg.version,profile,status,score,summary:{total:results.length,passed,failed,skipped,missing:missing.length},missingScripts:missing,results};

if (!noReport) {
  const dir=path.join(ROOT,'reports'); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'rc-qa-latest.json'),JSON.stringify(report,null,2));
  const md=[`# Padel Legacy — RC QA Report`,``,`- Version: ${pkg.version}`,`- Profile: ${profile}`,`- Status: **${status}**`,`- Score: **${score}/100**`,`- PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped} | Missing: ${missing.length}`,``,`## Suites`,``,...results.map(r=>`- ${r.status==='PASS'?'✅':r.status==='FAIL'?'❌':'⏭️'} **${r.name}** — ${(r.durationMs/1000).toFixed(1)}s`),...(missing.length?['','## Missing scripts','',...missing.map(x=>`- ⚠️ ${x}`)]:[])].join('\n');
  fs.writeFileSync(path.join(dir,'rc-qa-latest.md'),md);
  console.log(`\nRelatórios: reports/rc-qa-latest.json e reports/rc-qa-latest.md`);
}
console.log(`\nRC QA: ${status} — ${passed}/${passed+failed} aprovadas — score ${score}/100\n`);
process.exit(failed ? 1 : 0);
