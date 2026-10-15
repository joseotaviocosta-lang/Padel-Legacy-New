// Playthrough 5.27-D — testes novos do pipeline (Bloco U) + regressões
// obrigatórias (Bloco V), um processo por teste, com timeout. Grava
// reports/rebalance-527d/regressions.json.
//   node scripts/run-tests-rebalance-527d.mjs [--only=<grupo>]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GROUPS = {
  'Novos 5.27-D': [
    'test-job-manifest-v527d', 'test-job-checkpoint-resume-v527d', 'test-stale-running-recovery-v527d', 'test-result-hash-v527d',
    'test-cross-machine-result-import-v527d', 'test-stage1-matrix-completeness-v527d', 'test-stage2-matrix-completeness-v527d',
    'test-longrun-completeness-v527d', 'test-incremental-analysis-v527d', 'test-no-balance-mutation-v527d', 'test-job-determinism-v527d',
    'test-validation-final-gates-v527d',
  ],
  // real pairs · TeamRank · draw imutável · sem fallback · upset
  '5.26-D': [
    'test-player-tournament-real-world-pairs-v526d', 'test-tournament-pair-eligibility-v526d', 'test-no-athlete-double-entry-v526d',
    'test-tournament-teamrank-resolution-v526d', 'test-tournament-unranked-real-pair-v526d', 'test-historical-draw-pair-snapshot-v526d',
    'test-partnership-change-does-not-rewrite-draw-v526d', 'test-tournament-world-assignment-conflict-v526d', 'test-upset-real-ranked-opponent-v526d',
    'test-real-pair-draw-determinism-v526d', 'test-real-pair-draw-performance-v526d', 'test-progression-smoke-world-pairs-v526d',
  ],
  // rollover · elegibilidade de patrocínio · re-sign
  '5.26-C': ['test-world-ranking-year-rollover-v526c', 'test-race-year-reset-v526c', 'test-ranking-expiration-window-v526c', 'test-sponsor-eligibility-authority-v526c', 'test-all-sponsors-reachable-v526c', 'test-partner-resign-loop-v526c', 'test-partner-contract-365d-v526c', 'test-progression-run-resume-v526c'],
  // OVR · sem freeze · recompensas · reputação · idade
  '5.26-B': ['test-partner-engine-ovr-authority-v526b', 'test-partner-committed-roster-ovr-v526b', 'test-career-year2-no-freeze-v526b', 'test-achievement-final-match-reward-v526b', 'test-reputation-progress-persists-v526b', 'test-player-age-career-clock-v526b', 'test-athlete-repair-idempotency-v526b'],
  // atomicidade de recompensa · boot sem escrita · storage Android
  '5.24/5.25': ['test-achievement-reward-atomicity-v524e', 'test-achievement-multi-unlock-batch-v524e', 'test-achievement-reward-restart-v524e', 'test-achievement-reward-idempotency-v524e', 'test-achievement-write-failure-recovery-v524e', 'test-mission-reward-regression-v524e', 'test-idle-boot-zero-write-v524e', 'test-legacy-boot-single-repair-write-v524e', 'test-mobile-storage-m3-6'],
  '5.27-B harness': ['test-balance-resume-determinism-v527b'],
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
const dir = resolve('reports/rebalance-527d');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `regressions${only ? `-${only.replace(/\W+/g, '_')}` : ''}.json`), JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passaram`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
