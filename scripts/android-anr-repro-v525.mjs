// Playthrough 5.25, Partes 3-6 — REPRODUÇÃO DETERMINÍSTICA do ANR no aparelho.
//
// O trace real mostrou a main thread presa no lock `plugins` do Tauri dentro
// de onPageFinished, enquanto um comando SÍNCRONO do plugin-fs segurava esse
// lock esperando a main thread (resolução de AppData). Este script recria a
// janela: dispara em sequência os comandos de arquivo que o app usa
// (`--mode=plugin`: plugin:fs|exists/mkdir/stat síncronos, como o build
// antigo; `--mode=app`: storage_exists/mkdir/stat, como o build corrigido) e
// força um carregamento de página (location.reload) no meio deles. Repete N
// vezes; após cada ciclo verifica se o WebView volta a responder e se surgiu
// ANR novo no DropBox.
// Uso: node scripts/android-anr-repro-v525.mjs <label> --mode=plugin|app [--cycles=15]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const PKG = 'com.padellegacy.game';
const label = process.argv[2] || 'repro';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const MODE = arg('mode', 'plugin');
const CYCLES = Number(arg('cycles', 15));
const PORT = 9334;
const OUT = resolve(`reports/android-anr-525/${label}`);
mkdirSync(OUT, { recursive: true });
const adb = (...a) => { try { return execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000 }).trim(); } catch (e) { return `ERRO ${e.message.slice(0, 80)}`; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anrCount = () => (adb('shell', 'dumpsys', 'dropbox', '--print', 'data_app_anr').match(new RegExp(`Process: ${PKG.replace(/\./g, '\\.')}`, 'g')) || []).length;

async function cdp() {
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  const socket = (adb('shell', 'cat', '/proc/net/unix').match(new RegExp(`@(webview_devtools_remote_${pid})`)) || [])[1];
  if (!socket) return null;
  adb('forward', `tcp:${PORT}`, `localabstract:${socket}`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) return null;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; setTimeout(() => fail(new Error('ws timeout')), 5000); });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const evaluate = (expression, timeout = 8000) => new Promise((ok) => {
    id += 1; const myId = id;
    const t = setTimeout(() => { pending.delete(myId); ok({ timeout: true }); }, timeout);
    pending.set(myId, (m) => { clearTimeout(t); ok(m.result?.result?.value ?? m.result); });
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  return { pid, evaluate, close: () => ws.close() };
}

const FLOOD = (mode) => `(() => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const o = { baseDir: 14 };
  const calls = ${mode === 'plugin'
    ? `[() => inv('plugin:fs|exists', { path: 'careers-index.json', options: o }), () => inv('plugin:fs|mkdir', { path: 'temp', options: { ...o, recursive: true } }), () => inv('plugin:fs|stat', { path: 'careers-index.json', options: o })]`
    : `[() => inv('storage_exists', { path: 'careers-index.json' }), () => inv('storage_mkdir', { path: 'temp' }), () => inv('storage_stat', { path: 'careers-index.json' })]`};
  let n = 0;
  const loop = () => { for (let i = 0; i < 6; i += 1) calls[(n++) % calls.length]().catch(() => {}); setTimeout(loop, 0); };
  loop();
  setTimeout(() => location.reload(), 120);
  return 'ok';
})()`;

async function run() {
  const anrBefore = anrCount();
  const startPid = adb('shell', 'pidof', PKG);
  const log = [];
  for (let c = 1; c <= CYCLES; c += 1) {
    const session = await cdp().catch(() => null);
    if (!session) { log.push({ cycle: c, status: 'sem WebView/DevTools' }); break; }
    await session.evaluate(FLOOD(MODE), 3000);
    session.close();
    await sleep(2500);
    // O WebView voltou a responder depois do reload?
    const after = await cdp().catch(() => null);
    const alive = after ? await after.evaluate('1+1', 12000) : { timeout: true };
    after?.close();
    const responsive = alive === 2;
    const focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*$/m)?.[0] || '';
    const anrDialog = /Application Not Responding|not responding/i.test(focus);
    log.push({ cycle: c, responsive, anrDialog, focus: focus.slice(0, 120) });
    console.log(`ciclo ${c}: responde=${responsive} diálogoANR=${anrDialog}`);
    if (!responsive || anrDialog) {
      await sleep(12000); // dá tempo do sistema registrar o ANR
      break;
    }
  }
  const anrAfter = anrCount();
  const result = { label, mode: MODE, cycles: log.length, anrBefore, anrAfter, newAnrs: anrAfter - anrBefore, startPid, endPid: adb('shell', 'pidof', PKG), log };
  writeFileSync(resolve(OUT, 'repro.json'), JSON.stringify(result, null, 2));
  if (result.newAnrs > 0) {
    const dump = adb('shell', 'dumpsys', 'dropbox', '--print', 'data_app_anr');
    writeFileSync(resolve(OUT, 'dropbox-after.txt'), dump);
  }
  console.log(JSON.stringify({ ...result, log: undefined }));
}

run().catch((e) => { console.error(e); process.exit(1); });
