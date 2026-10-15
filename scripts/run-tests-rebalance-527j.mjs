// Playthrough 5.27-J — testes novos (Bloco Q) + regressões (Bloco R), um
// processo por teste, com timeout. Grava reports/rebalance-527j/regressions.json.
//   node scripts/run-tests-rebalance-527j.mjs [--only=<grupo>]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GROUPS = {
  'Novos 5.27-J': [
    'test-partnership-registration-after-exit-v527j', 'test-preexisting-commitment-preserved-v527j', 'test-no-new-commitment-after-exit-v527j', 'test-final-commitment-triggers-separation-v527j',
    'test-draw-after-exit-preserves-roster-v527j', 'test-settlement-after-exit-preserves-roster-v527j', 'test-save-reload-pending-separation-v527j', 'test-headless-registration-authority-v527j',
    'test-ai-partnership-exit-registration-v527j', 'test-seed3-commitment-limbo-v527j', 'test-no-overlapping-partnership-v527j', 'test-balanced-e-smoke-after-lifecycle-v527j',
  ],
  '5.27-I': ['test-optimizer-partner-refresh-v527i', 'test-optimizer-vs-normal-policy-v527i', 'test-silver-band-baseline-v527i', 'test-old-presets-semantic-freeze-v527f'],
  '5.27-H': ['test-engine-parity-regression-v527h'],
  '5.27-G': ['test-normal-partner-score-v527g', 'test-normal-partner-strength-floor-v527g', 'test-normal-vs-optimizer-partner-choice-v527g', 'test-partner-choice-compatibility-preserved-v527g', 'test-tactic-neutrality-v527g', 'test-tactic-side-swap-v527g'],
  '5.27-F': ['test-match-engine-identical-teams-v527f', 'test-match-engine-side-swap-v527f', 'test-energy-sensitivity-v527f', 'test-energy-single-application-v527f', 'test-player-opponent-strength-parity-v527f', 'test-ranking-success-monotonicity-v527f', 'test-old-presets-semantic-freeze-v527f', 'test-ranking-points-by-source-v527f', 'test-zero-win-ranking-progression-v527f'],
  'Torneio 5.26-D': [
    'test-player-tournament-real-world-pairs-v526d', 'test-tournament-pair-eligibility-v526d', 'test-no-athlete-double-entry-v526d',
    'test-tournament-teamrank-resolution-v526d', 'test-tournament-unranked-real-pair-v526d', 'test-historical-draw-pair-snapshot-v526d',
    'test-partnership-change-does-not-rewrite-draw-v526d', 'test-tournament-world-assignment-conflict-v526d', 'test-upset-real-ranked-opponent-v526d',
    'test-real-pair-draw-determinism-v526d', 'test-real-pair-draw-performance-v526d', 'test-progression-smoke-world-pairs-v526d',
  ],
  'Motor de partida': ['test-match-integrity', 'test-live-coach-tournament', 'test-tournament-result-authority'],
  Ranking: ['test-team-ranking-sum-formula-v522e', 'test-world-ranking-year-rollover-v526c', 'test-race-year-reset-v526c'],
  Parceria: ['test-first-partnership-100-careers', 'test-first-partnership-ranking', 'test-partner-offer-overall-integrity-v519', 'test-partnership-expiry-with-committed-tournament-v517', 'test-partner-resign-loop-v526c', 'test-former-partner-reintegration-v518', 'test-partner-athlete-save-reload-v512', 'test-living-partnerships-v29', 'test-ai-market-headless-integration-v518', 'test-partnership-expiry-with-committed-tournament-v517'],
  'Persistência': ['test-achievement-reward-atomicity-v524e', 'test-achievement-reward-restart-v524e', 'test-mission-reward-regression-v524e', 'test-idle-boot-zero-write-v524e', 'test-mobile-storage-m3-6'],
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
const dir = resolve('reports/rebalance-527j');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `regressions${only ? `-${only.replace(/\W+/g, '_')}` : ''}.json`), JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passaram`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
