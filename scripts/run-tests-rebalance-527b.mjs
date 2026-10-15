// Playthrough 5.27-B — roda os 12 testes da fase.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TESTS = [
  'test-open-tier-field-strength-v527b.mjs',
  'test-bronze-silver-band-v527b.mjs',
  'test-r1-bracket-opponent-v527b.mjs',
  'test-ai-tournament-preference-parity-v527b.mjs',
  'test-initial-attributes-sensitivity-v527b.mjs',
  'test-starting-coins-sensitivity-v527b.mjs',
  'test-sponsor-scaling-v527b.mjs',
  'test-severance-exit-path-v527b.mjs',
  'test-preset-comparison-v527b.mjs',
  'test-money-solved-crossing-v527b.mjs',
  'test-balanced-5y-run-v527b.mjs',
  'test-balance-resume-determinism-v527b.mjs',
];

let failed = 0;
for (const test of TESTS) {
  const path = `scripts/${test}`;
  if (!existsSync(path)) { console.log(`AUSENTE ${test}`); failed += 1; continue; }
  const started = Date.now();
  const run = spawnSync(process.execPath, [path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const tail = `${run.stdout || ''}`.split('\n').filter((line) => /passaram|PASS|FALHOU|✗/.test(line)).slice(-2).join(' | ');
  const ok = run.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${test} (${Math.round((Date.now() - started) / 1000)}s) ${tail}`);
}
console.log(`\n${TESTS.length - failed}/${TESTS.length} arquivos de teste passaram`);
process.exit(failed ? 1 : 0);
