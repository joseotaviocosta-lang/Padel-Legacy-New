// LOCAL-8C — regressão: seleções 5.32-A/B/C/C.1 + testes da LOCAL-8C,
// os testes de Mundo/LOCAL-7D..7H.1/Home (tests-extra.txt), paralelo 3, no
// estado atual; as falhas são repetidas contra o HEAD, SEM worktree/stash:
// o WorldHub.jsx recebe temporariamente o conteúdo do HEAD (mesmo fim de
// linha) e o script do teste roda na versão do HEAD (cópia temporária em
// scripts/). Ao final o arquivo atual é restaurado e conferido por SHA-256.
// Uso: node reports/ui-redesign-532/world/tools/run-tests.mjs
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const LISTS = ['reports/ui-redesign-532/tools/tests.txt', 'reports/ui-redesign-532/world/tools/tests-extra.txt', 'reports/ui-redesign-532/athletes/tools/tests-extra.txt', 'reports/ui-redesign-532/athletes/tools/tests-c1.txt', 'reports/local-8c-directory-save-integrity/tools/tests-extra.txt'];
const SRC = ['src/pages/Athletes.jsx'];
const tests = [...new Set(LISTS.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)))];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const run = (script) => new Promise((resolve) => {
  const p = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => p.kill(), 900000);
  p.on('close', (code) => { clearTimeout(timer); resolve({ code, tail: out.split('\n').filter((l) => /FAIL|falh|Error|✗/i.test(l)).slice(0, 3).join(' | ').slice(0, 400) }); });
});
async function pool(items, size, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const now = await pool(tests, 3, (t) => run(`scripts/${t}.mjs`));
const failing = tests.filter((_, k) => now[k].code !== 0);

const saved = new Map(SRC.map((p) => [p, readFileSync(p)]));
const head = new Map();
try {
  for (const p of SRC) {
    const crlf = saved.get(p).includes('\r\n');
    let s = execSync(`git show HEAD:${p}`, { encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n');
    if (crlf) s = s.replace(/\n/g, '\r\n');
    writeFileSync(p, s);
  }
  for (const t of failing) {
    let script = `scripts/${t}.mjs`;
    let temp = null;
    try {
      const headScript = execSync(`git show HEAD:scripts/${t}.mjs`, { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
      temp = `scripts/.__head8c_${t}.mjs`;
      writeFileSync(temp, headScript);
      script = temp;
    } catch { head.set(t, { code: 'novo', tail: 'teste novo da LOCAL-8C (não existe no HEAD)' }); continue; }
    try { head.set(t, await run(script)); } finally { if (temp && existsSync(temp)) unlinkSync(temp); }
  }
} finally {
  for (const [p, buf] of saved) writeFileSync(p, buf);
  for (const [p, buf] of saved) if (sha(readFileSync(p)) !== sha(buf)) throw new Error(`restauração falhou: ${p}`);
}

const results = tests.map((t, k) => {
  const h = head.get(t);
  const verdict = now[k].code === 0 ? 'pass' : h?.code === 0 ? 'REGRESSION' : h?.code === 'novo' ? 'NEW-FAIL' : 'pre-existing';
  return { test: t, now: now[k].code, head: h ? h.code : null, verdict, nowTail: now[k].code ? now[k].tail : '', headTail: h?.code ? h.tail : '' };
});
const summary = {
  createdAt: new Date().toISOString(),
  base: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  total: results.length,
  pass: results.filter((r) => r.verdict === 'pass').length,
  regressions: results.filter((r) => r.verdict === 'REGRESSION' || r.verdict === 'NEW-FAIL').map((r) => r.test),
  preExisting: results.filter((r) => r.verdict === 'pre-existing').map((r) => r.test),
  results,
};
writeFileSync('reports/local-8c-directory-save-integrity/tests.json', JSON.stringify(summary, null, 2));
console.log(`total ${summary.total} · pass ${summary.pass} · regressões ${summary.regressions.length} · preexistentes ${summary.preExisting.length}`);
for (const r of results.filter((x) => x.verdict !== 'pass')) console.log(`${r.verdict.padEnd(12)} ${r.test} :: ${r.nowTail}`);
