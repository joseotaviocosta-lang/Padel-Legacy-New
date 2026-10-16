// CLOUD-0 — runner da baseline. Um processo por teste, paralelo N, timeout
// por teste. Nunca grava em reports/<fase-antiga>/: roda num diretório de
// execução (--root, um worktree descartável do mesmo commit) e grava o
// resultado só em --out.
//   node run-baseline.mjs --root=<worktree> --out=<dir> [--list=selection.json] [--only=a,b] [--jobs=3] [--timeout-min=40]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'cloud0-out'));
const jobs = Number(arg('jobs', 3));
const timeoutMs = Number(arg('timeout-min', 40)) * 60 * 1000;
const selection = JSON.parse(readFileSync(resolve(arg('list', resolve(here, 'selection.json'))), 'utf8'));
const only = arg('only', '') ? arg('only').split(',') : null;
const tests = Object.keys(selection).filter((t) => !only || only.includes(t));
mkdirSync(resolve(out, 'logs'), { recursive: true });

const fileOf = (t) => (t.includes('/') ? t : `scripts/${t}.mjs`);
const safe = (t) => t.replace(/[^\w.-]+/g, '_');
const run = (t) => new Promise((done) => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [fileOf(t)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    writeFileSync(resolve(out, 'logs', `${safe(t)}.log`), log.length > 200000 ? `${log.slice(0, 20000)}\n…[cortado]…\n${log.slice(-100000)}` : log);
    const lines = log.split('\n');
    const summary = lines.filter((l) => /passaram|PASS|FAIL|\d+\s*\/\s*\d+/.test(l)).slice(-1)[0]?.trim().slice(0, 200) || null;
    const failLines = code === 0 ? [] : lines.filter((l) => /✗|FAIL|Error|assert|falh|expected|not ok/i.test(l)).slice(0, 15).map((l) => l.trim().slice(0, 300));
    done({ test: t, sources: selection[t], code, signal, timedOut, seconds: Math.round((Date.now() - t0) / 1000), summary, failLines });
  });
});
const results = new Array(tests.length); let i = 0; let finished = 0;
await Promise.all(Array.from({ length: jobs }, async () => {
  while (i < tests.length) {
    const k = i++; results[k] = await run(tests[k]); finished += 1;
    const r = results[k];
    console.log(`[${finished}/${tests.length}] ${r.code === 0 ? 'PASS' : r.timedOut ? 'TIMEOUT' : 'FAIL'} ${r.test} (${r.seconds}s)`);
  }
}));
const pass = results.filter((r) => r.code === 0).length;
writeFileSync(resolve(out, 'results.json'), JSON.stringify({ at: new Date().toISOString(), root, total: results.length, pass, fail: results.length - pass, results }, null, 2));
console.log(`\n${pass}/${results.length} passaram`);
