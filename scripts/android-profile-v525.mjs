// Playthrough 5.25, Partes 3-19 — PERFIL NO APARELHO ANDROID REAL.
//
// Conecta ao WebView do APK (build de diagnóstico, feature `diag`) via
// ADB + DevTools Protocol e mede, NO DISPOSITIVO, com o save real:
//  - metadados (modelo, Android, WebView, versão do app);
//  - memória (dumpsys meminfo TOTAL PSS + heap JS) ao longo da sessão;
//  - save: leitura via plugin:fs (mesmo caminho do app), bytes, JSON.parse,
//    JSON.stringify, structuredClone, contagem de entidades;
//  - navegação SPA (pushState+popstate, como um toque): render útil,
//    assentamento, long tasks e perfil de CPU (self-time por função);
//  - avanço de dia (--advance=N): clica o Avançar de verdade, mede e perfila;
//  - gfxinfo (frames janky) e logcat da sessão.
// Saída: reports/android-anr-525/<label>/ (JSON + logcat + meminfo).
//
// Uso: node scripts/android-profile-v525.mjs <label> [--rounds=2] [--advance=0]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const PKG = 'com.padellegacy.game';
const label = process.argv[2] || 'run';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const ROUNDS = Number(arg('rounds', 2));
const ADVANCE = Number(arg('advance', 0));
const PORT = Number(arg('port', 9333));
const SANDBOX = process.argv.includes('--sandbox');
const OUT = resolve(`reports/android-anr-525/${label}`);
mkdirSync(OUT, { recursive: true });

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ROUTES = [
  { id: 'home', label: 'Home', path: '/game' },
  { id: 'ranking', label: 'Ranking', path: '/ranking?scope=world&type=individual' },
  { id: 'tournaments', label: 'Torneios', path: '/tournaments' },
  { id: 'training', label: 'Treinos', path: '/career/training' },
  { id: 'partners', label: 'Minha dupla', path: '/partners' },
  { id: 'economy', label: 'Economia', path: '/game/economy' },
  { id: 'world', label: 'Mundo', path: '/world/directory' },
  { id: 'countries', label: 'Países', path: '/world/directory?tab=countries' },
  { id: 'training-center', label: 'Centro de treinamento', path: '/game/training-center' },
];

function meminfo() {
  const raw = adb('shell', 'dumpsys', 'meminfo', PKG);
  const total = raw.match(/TOTAL PSS:\s+(\d+)/) || raw.match(/TOTAL\s+(\d+)/);
  return { totalPssKb: total ? Number(total[1]) : null, raw };
}

async function connect() {
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  if (!pid) throw new Error(`${PKG} não está rodando no aparelho`);
  const sockets = adb('shell', 'cat', '/proc/net/unix');
  const socket = (sockets.match(new RegExp(`@(webview_devtools_remote_${pid})`)) || sockets.match(/@(webview_devtools_remote_\d+)/) || [])[1];
  if (!socket) throw new Error('WebView sem DevTools — instale o APK de diagnóstico (feature diag).');
  adb('forward', `tcp:${PORT}`, `localabstract:${socket}`);
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, fail } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) fail(new Error(msg.error.message)); else ok(msg.result); }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { id += 1; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (fn, ...args) => {
    const expression = `(${fn})(...${JSON.stringify(args)})`;
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { pid, socket, version, page, send, evaluate, close: () => ws.close() };
}

// Sonda instalada na página: long tasks + helper de navegação medida.
const PROBE = () => {
  if (window.__pl525) return true;
  window.__pl525 = { longTasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__pl525.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* sem suporte */ }
  window.__pl525.navigate = (target) => new Promise((done) => {
    const start = performance.now();
    let last = start;
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    window.__pl525.longTasks.length = 0;
    const prevH1 = document.querySelector('.app-route-stage h1');
    history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
    let useful = null;
    const tick = () => {
      const now = performance.now();
      const stage = document.querySelector('.app-route-stage');
      const h1 = stage?.querySelector('h1');
      if (useful === null && stage && !stage.querySelector('[aria-busy="true"]') && h1 && h1 !== prevH1) useful = now - start;
      if ((useful !== null && now - last > 800) || now - start > 30000) {
        mo.disconnect();
        const lt = window.__pl525.longTasks.filter((t) => t.start >= start - 5);
        return done({ useful: useful === null ? null : Math.round(useful), settled: Math.round(last - start), longTaskMs: Math.round(lt.reduce((s, t) => s + t.duration, 0)), longest: Math.round(Math.max(0, ...lt.map((t) => t.duration))), longTasks: lt.length, dom: document.querySelectorAll('*').length });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return true;
};

// Perfil do save no aparelho, pelo MESMO plugin de arquivos do app.
const SAVE_PROFILE = async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const opts = { baseDir: 14 }; // BaseDirectory.AppData
  const readText = async (path) => {
    const t0 = performance.now();
    const arr = await invoke('plugin:fs|read_text_file', { path, options: opts });
    const t1 = performance.now();
    const bytes = arr instanceof ArrayBuffer ? new Uint8Array(arr) : Uint8Array.from(arr);
    const text = new TextDecoder('utf-8').decode(bytes);
    return { text, ipcMs: t1 - t0, decodeMs: performance.now() - t1, bytes: bytes.length };
  };
  const index = JSON.parse((await readText('careers-index.json')).text);
  const id = index.last_career_id || index.careers?.[0]?.id;
  const file = await readText(`careers/${id}.json`);
  let t = performance.now(); const career = JSON.parse(file.text); const parseMs = performance.now() - t;
  t = performance.now(); const json = JSON.stringify(career); const stringifyMs = performance.now() - t;
  t = performance.now(); structuredClone(career); const structuredCloneMs = performance.now() - t;
  t = performance.now(); JSON.parse(json); const jsonCloneMs = performance.now() - t + stringifyMs;
  const entities = Object.fromEntries(Object.entries(career.entities || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]).sort((a, b) => b[1] - a[1]));
  const entityBytes = Object.fromEntries(Object.entries(career.entities || {}).map(([k, v]) => [k, JSON.stringify(v).length]).sort((a, b) => b[1] - a[1]).slice(0, 12));
  return {
    careerId: id, careers: index.careers?.length, bytes: file.bytes, ipcReadMs: Math.round(file.ipcMs), decodeMs: Math.round(file.decodeMs),
    parseMs: Math.round(parseMs), stringifyMs: Math.round(stringifyMs), structuredCloneMs: Math.round(structuredCloneMs), jsonCloneMs: Math.round(jsonCloneMs),
    careerDate: career.player?.career_date, saveVersion: career.save_version, entities, entityBytes,
    jsHeapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
};

// I/O de arquivo que funciona nos dois builds: comandos do app (storage_*,
// build corrigido) ou plugin-fs assíncrono (build antigo).
const FS_HELPERS = `
  const inv = window.__TAURI_INTERNALS__.invoke;
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const toText = (r) => typeof r === 'string' ? r : dec.decode(r instanceof ArrayBuffer ? new Uint8Array(r) : Uint8Array.from(r));
  let hasApp = true;
  try { await inv('storage_exists', { path: 'careers-index.json' }); } catch { hasApp = false; }
  const read = async (p) => toText(hasApp ? await inv('storage_read_text', { path: p }) : await inv('plugin:fs|read_text_file', { path: p, options: { baseDir: 14 } }));
  const write = (p, t) => hasApp ? inv('storage_write_text', { path: p, content: t }) : inv('plugin:fs|write_text_file', enc.encode(t), { headers: { path: encodeURIComponent(p), options: JSON.stringify({ baseDir: 14 }) } });
  const remove = (p) => hasApp ? inv('storage_remove', { path: p }) : inv('plugin:fs|remove', { path: p, options: { baseDir: 14 } });
`;
const SANDBOX_CREATE = new Function(`return (async () => {${FS_HELPERS}
  const index = JSON.parse(await read('careers-index.json'));
  const original = index.last_career_id;
  const career = JSON.parse(await read('careers/' + original + '.json'));
  const copy = original.slice(0, 24) + 'perf525' + Date.now().toString(36);
  career.career_id = copy;
  career.career_name = (career.career_name || 'Carreira') + ' (perf 5.25)';
  await write('careers/' + copy + '.json', JSON.stringify(career));
  const entry = { ...index.careers.find((c) => c.id === original), id: copy, save_name: career.career_name };
  index.careers.push(entry);
  index.last_career_id = copy;
  await write('careers-index.json', JSON.stringify(index));
  return { original, copy, hasApp, careerDate: career.player?.career_date };
})()`);
const SANDBOX_RESTORE = new Function('original', 'copy', `return (async () => {${FS_HELPERS}
  const index = JSON.parse(await read('careers-index.json'));
  const copyCareer = JSON.parse(await read('careers/' + copy + '.json'));
  index.careers = index.careers.filter((c) => c.id !== copy);
  index.last_career_id = original;
  await write('careers-index.json', JSON.stringify(index));
  await remove('careers/' + copy + '.json').catch(() => null);
  return { restored: original, removed: copy, copyEndedAt: copyCareer.player?.career_date };
})()`);

function summarizeProfile(profile) {
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas || [];
  (profile.samples || []).forEach((nodeId, i) => self.set(nodeId, (self.get(nodeId) || 0) + (dt[i] || 0)));
  const byFn = new Map();
  for (const [nodeId, us] of self) {
    const cf = nodeById.get(nodeId).callFrame;
    const file = (cf.url || '').replace(/^.*\/assets\//, 'assets/').split('?')[0] || '(native)';
    const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) || 0) + us);
  }
  return [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`);
}

async function profiled(cdp, fn) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const result = await fn();
  const { profile } = await cdp.send('Profiler.stop');
  return { result, top: summarizeProfile(profile) };
}

async function run() {
  const report = { label, at: new Date().toISOString() };
  report.device = {
    model: adb('shell', 'getprop', 'ro.product.model'),
    manufacturer: adb('shell', 'getprop', 'ro.product.manufacturer'),
    android: adb('shell', 'getprop', 'ro.build.version.release'),
    sdk: adb('shell', 'getprop', 'ro.build.version.sdk'),
    app: (adb('shell', 'dumpsys', 'package', PKG).match(/versionName=(\S+)/) || [])[1],
    versionCode: (adb('shell', 'dumpsys', 'package', PKG).match(/versionCode=(\d+)/) || [])[1],
  };
  adb('logcat', '-c');
  adb('shell', 'dumpsys', 'gfxinfo', PKG, 'reset');
  const cdp = await connect();
  report.webview = cdp.version.Browser;
  console.log(`aparelho: ${report.device.manufacturer} ${report.device.model} · Android ${report.device.android} · ${report.webview} · app ${report.device.app} (${report.device.versionCode})`);
  await cdp.evaluate(PROBE);
  const mem = [{ at: 'inicio', ...meminfo() }];
  report.save = await cdp.evaluate(SAVE_PROFILE);
  console.log('save:', JSON.stringify({ ...report.save, entities: undefined, entityBytes: undefined }));
  console.log('maiores entidades:', JSON.stringify(report.save.entityBytes));

  report.navigation = {};
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const r of ROUTES) {
      const { result, top } = await profiled(cdp, () => cdp.evaluate((p) => window.__pl525.navigate(p), r.path));
      (report.navigation[r.id] ||= { label: r.label, runs: [] }).runs.push({ ...result, top: top.slice(0, 12) });
      console.log(`${round}:${r.id.padEnd(16)} útil=${result.useful}ms assentou=${result.settled}ms longTasks=${result.longTaskMs}ms maior=${result.longest}ms dom=${result.dom}`);
    }
    mem.push({ at: `após rodada ${round}`, ...meminfo(), jsHeapMb: await cdp.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)) });
  }

  let session = cdp;
  if (ADVANCE > 0 && SANDBOX) {
    // Cópia descartável da carreira: o save real do jogador não avança.
    report.sandbox = await session.evaluate(SANDBOX_CREATE);
    console.log('sandbox:', JSON.stringify(report.sandbox));
    await session.evaluate(() => { setTimeout(() => location.reload(), 50); return true; });
    session.close();
    await sleep(20000);
    session = await connect();
    await session.evaluate(PROBE);
    const opened = await session.evaluate(() => ({ path: location.pathname, h1: document.querySelector('h1')?.textContent }));
    console.log('carreira sandbox aberta:', JSON.stringify(opened));
  }
  if (ADVANCE > 0) {
    const cdp = session; // eslint-disable-line no-shadow
    report.advance = [];
    await cdp.evaluate((p) => window.__pl525.navigate(p), '/game');
    for (let i = 1; i <= ADVANCE; i += 1) {
      const { result, top } = await profiled(cdp, () => cdp.evaluate(() => new Promise((done) => {
        const btn = [...document.querySelectorAll('button')].find((b) => /Avançar|Avancar/i.test(b.textContent || '') && b.getBoundingClientRect().width > 0 && !b.disabled);
        if (!btn) return done({ error: 'botão Avançar não encontrado' });
        const start = performance.now();
        let last = start;
        window.__pl525.longTasks.length = 0;
        const mo = new MutationObserver(() => { last = performance.now(); });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        btn.click();
        const tick = () => {
          const now = performance.now();
          const busy = [...document.querySelectorAll('button')].some((b) => /Processando|…/.test(b.textContent || '') && b.getBoundingClientRect().width > 0);
          if ((!busy && now - last > 1500) || now - start > 60000) {
            mo.disconnect();
            const lt = window.__pl525.longTasks.filter((t) => t.start >= start - 5);
            return done({ totalMs: Math.round(last - start), longTaskMs: Math.round(lt.reduce((s, t) => s + t.duration, 0)), longest: Math.round(Math.max(0, ...lt.map((t) => t.duration))), longTasks: lt.length });
          }
          setTimeout(tick, 100);
        };
        setTimeout(tick, 100);
      })));
      report.advance.push({ day: i, ...result, top: top.slice(0, 20) });
      console.log(`avançar dia ${i}: total=${result.totalMs}ms longTasks=${result.longTaskMs}ms maior=${result.longest}ms`);
    }
    mem.push({ at: 'após avançar', ...meminfo() });
    if (SANDBOX) {
      report.sandboxRestore = await cdp.evaluate(SANDBOX_RESTORE, report.sandbox.original, report.sandbox.copy);
      console.log('sandbox restaurado:', JSON.stringify(report.sandboxRestore));
      await cdp.evaluate(() => { setTimeout(() => location.reload(), 50); return true; });
    }
  }

  report.memory = mem.map(({ raw, ...m }) => m);
  writeFileSync(resolve(OUT, 'meminfo-final.txt'), mem.at(-1).raw);
  writeFileSync(resolve(OUT, 'gfxinfo.txt'), adb('shell', 'dumpsys', 'gfxinfo', PKG));
  writeFileSync(resolve(OUT, 'logcat.txt'), adb('logcat', '-d', '-v', 'threadtime'));
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('memória:', JSON.stringify(report.memory));
  console.log(`→ ${OUT}`);
  cdp.close();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
