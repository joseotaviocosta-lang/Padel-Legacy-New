// Fase 5.32-B — custo de abrir Mundo, ANTES × DEPOIS, na MESMA sessão.
//
// Para cada estado: abre a sessão isolada (../../tools/session.mjs), e
// alterna as variantes do WorldHub.jsx (depois, antes, depois, antes):
// a variante "antes" é o conteúdo do HEAD gravado temporariamente no lugar
// (mesmo fim de linha do checkout); o arquivo atual é restaurado no final e
// conferido por SHA-256. Cada variante: recarga completa, 1 abertura fria
// descartada + 5 aberturas Home → Mundo cronometradas (pushState → página
// pronta). Saída: world/perf.json.
// Uso: node perf-world.mjs [estado...]
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openSession, spa, sleep, setViewport, dismissOverlays, BASE } from '../../tools/session.mjs';
import { WORLD_STATES, careerIdOf, timedOpen } from './capture-world.mjs';

const FILE = 'src/pages/WorldHub.jsx';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const current = readFileSync(FILE);
const crlf = current.includes('\r\n');
let head = execSync(`git show HEAD:${FILE}`, { encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n');
if (crlf) head = head.replace(/\n/g, '\r\n');
const VARIANTS = { after: current, before: Buffer.from(head) };
const READY = { after: '[data-world-ready]', before: '.pl-content-enter' };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const requested = process.argv.slice(2);
const stateIds = requested.length ? requested : ['carreira-nova', 't10'];
const out = { createdAt: new Date().toISOString(), method: 'pushState /game → /world até a página pronta; 1 fria descartada + 5 medidas por rodada; rodadas alternadas depois/antes/depois/antes', states: {} };
try {
  for (const stateId of stateIds) {
    const state = WORLD_STATES[stateId];
    const { browser, page } = await openSession({ save: { url: state.url, careerId: careerIdOf(state) } });
    await setViewport(page, 390);
    const runs = { after: [], before: [] };
    for (const variant of ['after', 'before', 'after', 'before']) {
      writeFileSync(FILE, VARIANTS[variant]);
      await sleep(2500);
      await page.goto(`${BASE}/game`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => null);
      await sleep(3000);
      await dismissOverlays(page);
      await timedOpen(page, '/world', READY[variant]); // fria (descartada)
      for (let i = 0; i < 5; i += 1) {
        await spa(page, '/game', 2000);
        runs[variant].push(await timedOpen(page, '/world', READY[variant]));
      }
      console.log(stateId, variant, runs[variant].slice(-5));
    }
    out.states[stateId] = {
      beforeMs: runs.before, afterMs: runs.after,
      beforeMedian: median(runs.before), afterMedian: median(runs.after),
      deltaMedianMs: median(runs.after) - median(runs.before),
      jsErrors: page.__errors,
    };
    await browser.close();
  }
} finally {
  writeFileSync(FILE, current);
  if (sha(readFileSync(FILE)) !== sha(current)) throw new Error('restauração do WorldHub.jsx falhou');
  console.log('WorldHub.jsx restaurado (SHA conferido)');
}
writeFileSync('reports/ui-redesign-532/world/perf.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.states).map(([k, v]) => [k, { before: v.beforeMedian, after: v.afterMedian, delta: v.deltaMedianMs }]))));
