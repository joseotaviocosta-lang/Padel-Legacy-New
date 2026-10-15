// Playthrough 5.27-M — gera a evidência da repro headless do playtest
// (3 variantes) e roda os 12 testes *-v527m. Saída: critical-regressions
// fica em run-critical-regressions-527k.mjs; aqui só a fase.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const node = process.execPath;
const run = (args, label) => {
  const t0 = Date.now();
  const r = spawnSync(node, args, { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, PL527D_ISOLATE_VITE_RNG: '1' } });
  const tail = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter((l) => /passaram|falharam|FAIL|Error/.test(l)).slice(-4).join(' | ');
  console.log(`${r.status === 0 ? '✓' : '✗'} ${label} (${Math.round((Date.now() - t0) / 1000)}s) ${tail}`);
  return { label, ok: r.status === 0, seconds: Math.round((Date.now() - t0) / 1000), tail };
};

const skipRepro = process.argv.includes('--skip-repro');
const results = [];
if (!skipRepro) {
  results.push(run(['scripts/repro-onboarding-v527m.mjs', '--out=reports/release-527m/onboarding-continuous.json'], 'repro: contínuo (Conquistas no dia 1)'));
  results.push(run(['scripts/repro-onboarding-v527m.mjs', '--no-panel', '--out=reports/release-527m/onboarding-no-panel-after.json'], 'repro: sem abrir Conquistas'));
  results.push(run(['scripts/repro-onboarding-v527m.mjs', '--reload', '--out=reports/release-527m/onboarding-reload.json'], 'repro: com save/reload'));
}
for (const t of [
  'test-historical-bracket-integrity-v527m', 'test-bracket-winner-propagation-v527m', 'test-historical-bracket-after-reload-v527m',
  'test-no-current-partnership-bracket-rebuild-v527m', 'test-reward-ledger-balance-v527m', 'test-reward-no-duplicate-first-week-v527m',
  'test-financial-flow-dates-v527m', 'test-financial-flow-reconciliation-v527m', 'test-tutorial-registration-condition-v527m',
  'test-header-tournament-shortcut-v527m', 'test-name-save-android-path-v527m', 'test-completed-tournament-card-v527m',
]) results.push(run([`scripts/${t}.mjs`], t));
mkdirSync('reports/release-527m', { recursive: true });
writeFileSync('reports/release-527m/tests-527m.json', JSON.stringify({ createdAt: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
