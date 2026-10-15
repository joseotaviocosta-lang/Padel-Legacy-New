// Playthrough 5.25 — rastreia os comandos IPC (cmd, duração, bytes) que uma
// navegação dispara no aparelho. Uso: node scripts/android-ipc-trace-v525.mjs /world/directory
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const PKG = 'com.padellegacy.game';
const target = process.argv[2] || '/world/directory';
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', PKG);
const socket = adb('shell', 'cat', '/proc/net/unix').match(new RegExp(`@(webview_devtools_remote_${pid})`))[1];
adb('forward', 'tcp:9336', `localabstract:${socket}`);
const list = await (await fetch('http://127.0.0.1:9336/json/list')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const evaluate = (expression) => new Promise((ok) => { id += 1; pending.set(id, (m) => ok(m.result?.result?.value ?? m)); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });

const result = await evaluate(`(async () => {
  const internals = window.__TAURI_INTERNALS__;
  const original = internals.__plOriginalInvoke || internals.invoke;
  internals.__plOriginalInvoke = original;
  const calls = [];
  internals.invoke = async (cmd, args, options) => {
    const t0 = performance.now();
    const size = typeof args?.content === 'string' ? args.content.length : 0;
    try { return await original(cmd, args, options); } finally {
      calls.push({ cmd, path: args?.path || args?.to || args?.from || '', ms: Math.round(performance.now() - t0), sentChars: size, at: Math.round(t0) });
    }
  };
  const start = performance.now();
  history.pushState(null, '', ${JSON.stringify(target)});
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise((r) => setTimeout(r, 9000));
  internals.invoke = original;
  return { totalWindowMs: Math.round(performance.now() - start), calls: calls.map((c) => ({ ...c, at: c.at - Math.round(start) })) };
})()`);
const byCmd = {};
for (const c of result.calls) { byCmd[c.cmd] = byCmd[c.cmd] || { n: 0, ms: 0 }; byCmd[c.cmd].n += 1; byCmd[c.cmd].ms += c.ms; }
console.log(`IPC em ${target}: ${result.calls.length} chamadas`);
console.log(JSON.stringify(byCmd));
for (const c of result.calls) console.log(`  +${c.at}ms ${c.cmd} ${c.path} ${c.ms}ms${c.sentChars ? ` (${c.sentChars} chars)` : ''}`);
ws.close();
process.exit(0);
