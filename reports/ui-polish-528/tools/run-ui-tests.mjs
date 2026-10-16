// Roda a lista de testes de UI no diretório atual e no worktree do HEAD
// (baseline), em paralelo de 2, e grava o comparativo.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const tests = readFileSync('reports/ui-polish-528/tools/ui-tests.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const run = (cwd, t) => new Promise((resolve) => {
  const p = spawn(process.execPath, [`scripts/${t}.mjs`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => p.kill(), 180000);
  p.on('close', (code) => { clearTimeout(timer); resolve({ code, tail: out.split('\n').filter((l) => /FAIL|falh|Error|passaram|PASS/i.test(l)).slice(-3).join(' | ').slice(0, 300) }); });
});
const results = [];
for (const t of tests) {
  const [now, head] = await Promise.all([run('.', t), run('../pl-head-528', t)]);
  const verdict = now.code === 0 ? 'pass' : head.code === 0 ? 'REGRESSION' : 'pre-existing';
  results.push({ test: t, now: now.code, head: head.code, verdict, nowTail: now.code ? now.tail : '' });
  console.log(`${verdict.padEnd(12)} ${t}`);
}
writeFileSync('reports/ui-polish-528/ui-tests.json', JSON.stringify({ createdAt: new Date().toISOString(), total: results.length, pass: results.filter((r) => r.verdict === 'pass').length, regressions: results.filter((r) => r.verdict === 'REGRESSION').map((r) => r.test), preExisting: results.filter((r) => r.verdict === 'pre-existing').map((r) => r.test), results }, null, 2));
