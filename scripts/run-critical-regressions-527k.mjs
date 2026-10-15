// Playthrough 5.27-K — suíte CRÍTICA consolidada de release (Bloco I), um
// processo por teste. Grava reports/release-validation-527k/critical-regressions.json.
//   node scripts/run-critical-regressions-527k.mjs [--only=<grupo>]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GROUPS = {
  Lifecycle: ['test-partnership-registration-after-exit-v527j', 'test-no-new-commitment-after-exit-v527j', 'test-preexisting-commitment-preserved-v527j', 'test-partnership-expiry-with-committed-tournament-v517', 'test-save-reload-pending-separation-v527j'],
  Engine: ['test-match-engine-identical-teams-v527f', 'test-energy-sensitivity-v527f', 'test-energy-single-application-v527f'],
  Ranking: ['test-zero-win-ranking-progression-v527f', 'test-team-ranking-sum-formula-v522e', 'test-race-year-reset-v526c'],
  Torneio: ['test-registration-deadline-authority', 'test-bye-visible-from-draw', 'test-masters-24-8byes-r16-v522f', 'test-settlement-uses-persisted-draw-roster', 'test-tournament-result-authority'],
  Parceria: ['test-normal-partner-score-v527g', 'test-optimizer-partner-refresh-v527i', 'test-partner-resign-loop-v526c'],
  'Persistência': ['test-achievement-reward-atomicity-v524e'],
};
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const results = [];
for (const [group, tests] of Object.entries(GROUPS)) {
  if (only && only !== group) continue;
  for (const name of tests) {
    const t0 = Date.now();
    const { code, tail } = await new Promise((done) => {
      const env = { ...process.env }; delete env.PL527D_ROOT; delete env.PL527D_TEST_DAYS;
      const child = spawn(process.execPath, [`scripts/${name}.mjs`], { stdio: ['ignore', 'pipe', 'pipe'], env });
      let out = '';
      const keep = (b) => { out = (out + b).slice(-6000); };
      child.stdout.on('data', keep); child.stderr.on('data', keep);
      const timer = setTimeout(() => child.kill(), 90 * 60 * 1000);
      child.on('close', (c) => { clearTimeout(timer); done({ code: c, tail: out }); });
    });
    const ok = code === 0;
    const summary = tail.split('\n').filter((l) => /passaram|PASS|\d+\/\d+/.test(l)).slice(-1)[0]?.trim() || null;
    results.push({ group, name, ok, code, seconds: Math.round((Date.now() - t0) / 1000), summary, tail: ok ? undefined : tail.split('\n').filter((l) => /✗|FAIL|Error|assert|falh|expected/i.test(l)).slice(0, 12).join('\n') });
    console.log(`${ok ? '✓' : '✗'} [${group}] ${name} (${Math.round((Date.now() - t0) / 1000)}s) ${summary || ''}`);
  }
}
const dir = resolve('reports/release-validation-527k');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `critical-regressions${only ? `-${only.replace(/\W+/g, '_')}` : ''}.json`), JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passaram`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
