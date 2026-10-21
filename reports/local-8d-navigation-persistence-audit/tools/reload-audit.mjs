// LOCAL-8D — efeito de RECARREGAR diretamente numa rota (boot do app a
// partir do save original, sem navegação anterior). Referência: boot na
// rota neutra (Diretório). Os hashes por registro vêm para o Node (o
// snapshot não depende do contexto da página, que o reload descarta).
// Uso: node reload-audit.mjs <cenário> [--routes=a,b]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openSession, sleep, setViewport, BASE } from '../../ui-redesign-532/tools/session.mjs';
import { SCENARIOS, ROUTES } from './route-audit.mjs';

const OUT = 'reports/local-8d-navigation-persistence-audit';
const NEUTRAL = '/world/directory?tab=athletes';
const HASHES = async () => {
  const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js');
  const c = await activeCareerAdapter.getActiveCareer({ fresh: false });
  const h = (v) => { const s = JSON.stringify(v); let x = 2166136261; for (let i = 0; i < s.length; i += 1) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return `${(x >>> 0).toString(36)}:${s.length}`; };
  const entities = {};
  for (const [n, rows] of Object.entries(c.entities || {})) if (Array.isArray(rows)) entities[n] = Object.fromEntries(rows.map((r, i) => [String(r?.id ?? `#${i}`), h(r)]));
  const intro = [...new Set([...(c.tutorial?.pageIntroductionsSeen || []), ...(c.player?.tutorial_onboarding?.pageIntroductionsSeen || [])])];
  return { entities, intro };
};
const diff = (a, b) => {
  const out = {};
  for (const n of new Set([...Object.keys(a.entities), ...Object.keys(b.entities)])) {
    const x = a.entities[n] || {}; const y = b.entities[n] || {};
    const created = Object.keys(y).filter((id) => !(id in x)).length;
    const removed = Object.keys(x).filter((id) => !(id in y)).length;
    const changed = Object.keys(y).filter((id) => id in x && x[id] !== y[id]).length;
    if (created || removed || changed) out[n] = { created, removed, changed };
  }
  return out;
};
async function bootAt(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 240000 }).catch(() => null);
  await sleep(8000);
  return page.evaluate(HASHES);
}

const [id, ...flags] = process.argv.slice(2);
const routesFlag = flags.find((f) => f.startsWith('--routes='));
const routes = (routesFlag ? routesFlag.slice(9).split(',') : ROUTES).filter((r) => !r.startsWith('__'));
const file = SCENARIOS[id];
const careerId = readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
const { browser, page } = await openSession({ save: { url: `/${file}`, careerId } });
const result = { scenario: id, reference: NEUTRAL, routes: {} };
try {
  await setViewport(page, 390);
  const base = await bootAt(page, NEUTRAL);
  const base2 = await bootAt(page, NEUTRAL);
  result.referenceNoise = diff(base, base2);
  for (const route of routes) {
    const snap = await bootAt(page, route);
    result.routes[route] = { records: diff(base, snap), introAdded: snap.intro.filter((r) => !base.intro.includes(r)) };
    const n = Object.values(result.routes[route].records).reduce((s, v) => s + v.created + v.removed + v.changed, 0);
    console.log(`[${id}] reload ${route.padEnd(48)} ${n} registro(s) ${n ? JSON.stringify(result.routes[route].records) : ''}`);
    mkdirSync(`${OUT}/reload`, { recursive: true });
    writeFileSync(`${OUT}/reload/${id}.json`, JSON.stringify(result, null, 2));
  }
  result.jsErrors = page.__errors;
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/reload/${id}.json`, JSON.stringify(result, null, 2));
console.log('ok', id, 'ruído da referência:', JSON.stringify(result.referenceNoise));
