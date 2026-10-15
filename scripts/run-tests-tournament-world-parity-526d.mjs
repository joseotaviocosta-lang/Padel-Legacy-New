// Playthrough 5.26-D — rodar os 12 testes de paridade do campo do jogador.
//   node scripts/run-tests-tournament-world-parity-526d.mjs
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TESTS = [
  'test-player-tournament-real-world-pairs-v526d.mjs',
  'test-tournament-pair-eligibility-v526d.mjs',
  'test-no-athlete-double-entry-v526d.mjs',
  'test-tournament-teamrank-resolution-v526d.mjs',
  'test-tournament-unranked-real-pair-v526d.mjs',
  'test-historical-draw-pair-snapshot-v526d.mjs',
  'test-partnership-change-does-not-rewrite-draw-v526d.mjs',
  'test-tournament-world-assignment-conflict-v526d.mjs',
  'test-upset-real-ranked-opponent-v526d.mjs',
  'test-real-pair-draw-determinism-v526d.mjs',
  'test-real-pair-draw-performance-v526d.mjs',
  'test-progression-smoke-world-pairs-v526d.mjs',
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
