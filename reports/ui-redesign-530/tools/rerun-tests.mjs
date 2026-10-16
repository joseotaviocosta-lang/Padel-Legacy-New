// 5.30-A: reexecuta a seleção de testes da 5.30 só no working tree e
// compara com o resultado do HEAD c5bf7c8 já gravado em ui-tests.json.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const prev = JSON.parse(readFileSync('reports/ui-redesign-530/tests.json', 'utf8'));
const results = prev.results.map((r) => {
  const p = spawnSync(process.execPath, [`scripts/${r.test}.mjs`], { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26 });
  const now = p.status ?? 1;
  const verdict = now === 0 ? 'pass' : r.head === 0 ? 'REGRESSION' : 'pre-existing';
  console.log(`${verdict.padEnd(12)} ${r.test}`);
  return { test: r.test, now, head: r.head, verdict };
});
const out = { createdAt: new Date().toISOString(), baseline: '62f549e (tests.json da 5.30)', total: results.length, pass: results.filter((r) => r.verdict === 'pass').length, regressions: results.filter((r) => r.verdict === 'REGRESSION').map((r) => r.test), preExisting: results.filter((r) => r.verdict === 'pre-existing').length, results };
writeFileSync('reports/ui-redesign-530a/tests-rerun.json', JSON.stringify(out, null, 2));
console.log(`total ${out.total} pass ${out.pass} regress ${out.regressions.length} pre ${out.preExisting}`);
