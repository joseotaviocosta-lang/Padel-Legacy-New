// Playthrough 5.27-C — roda os 12 testes de validação.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TESTS = [
  'test-preset-full-matrix-v527c.mjs',
  'test-balanced-5year-distribution-v527c.mjs',
  'test-balanced-longrun-v527c.mjs',
  'test-money-solved-observed-v527c.mjs',
  'test-title-progression-v527c.mjs',
  'test-difficulty-year-split-v527c.mjs',
  'test-insolvency-distribution-v527c.mjs',
  'test-sponsor-share-distribution-v527c.mjs',
  'test-prize-share-distribution-v527c.mjs',
  'test-starting-coins-need-v527c.mjs',
  'test-initial-ovr-curve-v527c.mjs',
  'test-longrun-economy-saturation-v527c.mjs',
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
