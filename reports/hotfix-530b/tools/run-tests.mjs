// 5.30-B — roda a seleção de regressão no diretório atual (paralelo 3) e
// repete só as falhas no worktree limpo do HEAD (../pl-head-530b) para
// separar regressão de falha preexistente.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const tests = readFileSync('reports/hotfix-530b/tools/tests.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const run = (cwd, t) => new Promise((resolve) => {
  const p = spawn(process.execPath, [`scripts/${t}.mjs`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => p.kill(), 240000);
  p.on('close', (code) => { clearTimeout(timer); resolve({ code, tail: out.split('\n').filter((l) => /FAIL|falh|Error/i.test(l)).slice(0, 3).join(' | ').slice(0, 400) }); });
});
async function pool(items, size, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const now = await pool(tests, 3, (t) => run('.', t));
const failing = tests.filter((_, k) => now[k].code !== 0);
const head = new Map((await pool(failing, 3, (t) => run('../pl-head-530b', t))).map((r, k) => [failing[k], r]));
const results = tests.map((t, k) => {
  const h = head.get(t);
  const verdict = now[k].code === 0 ? 'pass' : h?.code === 0 ? 'REGRESSION' : 'pre-existing';
  return { test: t, now: now[k].code, head: h ? h.code : null, verdict, nowTail: now[k].code ? now[k].tail : '', headTail: h?.code ? h.tail : '' };
});
const summary = { createdAt: new Date().toISOString(), total: results.length, pass: results.filter((r) => r.verdict === 'pass').length, regressions: results.filter((r) => r.verdict === 'REGRESSION').map((r) => r.test), preExisting: results.filter((r) => r.verdict === 'pre-existing').map((r) => r.test), results };
writeFileSync('reports/hotfix-530b/tests.json', JSON.stringify(summary, null, 2));
console.log(`total ${summary.total} · pass ${summary.pass} · regressões ${summary.regressions.length} · preexistentes ${summary.preExisting.length}`);
for (const r of results.filter((x) => x.verdict !== 'pass')) console.log(`${r.verdict.padEnd(12)} ${r.test} :: ${r.nowTail}`);
