// Playthrough 5.24-E, Parte A — REPRODUÇÃO do boot ocioso que grava o save.
//
// save existente → registra revisão/checksum → boot (reload) → NADA é clicado
// → espera → registra de novo. Cada escrita física é capturada com o caller
// (storageIOProbe, ligado desde o 1º script da página) e com a pilha JS no
// instante do write_text_file (shim de storage), para achar o writer.
import { createHash } from 'node:crypto';
import { launch, goto, openCareer } from './lib/auditSession.mjs';

const BOOTS = Number(process.argv.find((a) => a.startsWith('--boots='))?.split('=')[1] || 3);
const START = process.argv.find((a) => a.startsWith('--path='))?.split('=')[1] || '/game';

function careerFileState(page) {
  return page.evaluate(() => {
    const fs = new Map(JSON.parse(localStorage.getItem('__pl_audit_fs__') || '[]'));
    const key = [...fs.keys()].find((k) => /^careers\/[^/]+\.json$/.test(k));
    const text = key ? String(fs.get(key)) : '';
    let meta = null;
    try { const c = JSON.parse(text); meta = { updated_at: c.updated_at, revision: c.__save_meta?.revision ?? null, saveMeta: c.__save_meta || null }; } catch { /* vazio */ }
    return { key, text, meta };
  });
}

async function run() {
  const browser = await launch();
  try {
    const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
    // Instrumentação ativa desde o primeiro script de cada carga.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('padel:perfdebug', '1');
      window.__plWrites = [];
      const install = () => {
        const internals = window.__TAURI_INTERNALS__;
        if (!internals || internals.__plWrapped) return;
        const original = internals.invoke;
        internals.invoke = async (cmd, args, options) => {
          if (cmd === 'plugin:fs|write_text_file') {
            const path = decodeURIComponent(String(options?.headers?.path || ''));
            const stack = (new Error().stack || '').split('\n').slice(2, 40).map((l) => l.trim())
              .filter((l) => l.includes('/src/') && !/storage\/|TauriStorage|GameStorage|CareerRepository|ActiveCareerAdapter|CareerEntityRepository|careerDataStore|PlayerAdapter|runtime\.js/.test(l))
              .slice(0, 6).map((l) => l.replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, ''));
            window.__plWrites.push({ path, at: Math.round(performance.now()), stack });
          }
          return original(cmd, args, options);
        };
        internals.__plWrapped = true;
      };
      install();
      const timer = setInterval(install, 5);
      setTimeout(() => clearInterval(timer), 3000);
    });
    await goto(page, START, { settle: 6000 });
    for (let i = 1; i <= BOOTS; i += 1) {
      const before = await careerFileState(page);
      await page.reload({ waitUntil: 'networkidle2' });
      await new Promise((r) => setTimeout(r, 9000)); // ocioso: nenhum clique
      const after = await careerFileState(page);
      const writes = await page.evaluate(() => window.__plWrites);
      const callers = await page.evaluate(async () => {
        const probe = await import('/src/dev/storageIOProbe.js');
        return probe.getStoragePerformanceSnapshot(500).operations
          .filter((op) => ['write', 'stringify', 'rename'].includes(op.operation))
          .map((op) => `${op.operation}:${op.caller} x${op.count}`);
      });
      const careerWrites = writes.filter((w) => /^temp\/.*\.tmp\.json$|^careers\/[^/]+\.json$/.test(w.path));
      const sha = (t) => createHash('sha256').update(t).digest('hex').slice(0, 12);
      console.log(`\n=== boot ocioso #${i} em ${START}`);
      console.log(`   escritas físicas: ${writes.length} (carreira: ${careerWrites.length})`);
      console.log(`   checksum ${sha(before.text)} → ${sha(after.text)} · updated_at ${before.meta?.updated_at} → ${after.meta?.updated_at}`);
      for (const c of callers) console.log(`   probe ${c}`);
      for (const w of careerWrites) console.log(`   write ${w.path} @${w.at}ms\n      ${w.stack.join('\n      ')}`);
      if (before.text && after.text && before.text !== after.text) {
        const a = JSON.parse(before.text); const b = JSON.parse(after.text);
        const diff = [];
        const walk = (x, y, p, depth) => {
          if (diff.length > 25) return;
          if (JSON.stringify(x) === JSON.stringify(y)) return;
          if (depth > 4 || typeof x !== 'object' || typeof y !== 'object' || !x || !y) { diff.push(`${p}: ${JSON.stringify(x)?.slice(0, 70)} → ${JSON.stringify(y)?.slice(0, 70)}`); return; }
          for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`, depth + 1);
        };
        walk(a, b, '$', 0);
        console.log('   campos diferentes:\n      ' + diff.join('\n      '));
      }
    }
  } finally {
    await browser.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
