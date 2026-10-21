// LOCAL-8D — auditoria DINÂMICA de escritas por rota (Chrome real + dev
// server; save em memória via ../../ui-redesign-532/tools/session.mjs — o
// arquivo original nunca é escrito; IndexedDB do usuário intocado).
//
// Para cada cenário e rota:
//   open1  : neutra → rota (1ª abertura na sessão)      diff + persist + Math.random
//   open2  : neutra → rota (2ª abertura)                 idempotência
//   reload : carga direta da rota (boot do save)         × boot na rota neutra
// "neutra" = o Diretório de atletas (somente leitura, provado na LOCAL-8C).
// Diff canônico em página: registros criados/removidos/alterados POR CAMPO,
// seções de topo do save por subchave; persist = escritas efetivas do save no
// armazenamento (conteúdo da carreira mudou entre gravações).
// Uso: node route-audit.mjs <cenário> [--no-reload] [--routes=a,b]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { openSession, sleep, setViewport, dismissOverlays, BASE } from '../../ui-redesign-532/tools/session.mjs';

const OUT = 'reports/local-8d-navigation-persistence-audit';
const SAVES = 'reports/local-8a-career-audit/run10';
export const SCENARIOS = {
  'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json',
  't5-com-dupla': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json',
  t1: `${SAVES}/save-season-1.json`,
  t5: `${SAVES}/save-season-5.json`,
  t10: `${SAVES}/save-season-10.json`,
};
const NEUTRAL = '/world/directory?tab=athletes';
export const ROUTES = [
  '/game', '/development', '/team-hub', '/competitions', '/management', '/world',
  '/game/training', '/game/matches', '/game/missions', '/game/missions?tab=achievements',
  '/game/legacy', '/game/legacy?tab=hall', '/game/legacy?tab=monthly', '/game/legacy?tab=annual',
  '/game/stats', '/game/monthly-reports', '/game/annual-reports', '/game/economy',
  '/tournaments', '/tournaments?tab=calendar', '__NEXT_TOURNAMENT__', '__LAST_FINISHED_BRACKET__',
  '/ranking', '/ranking?scope=world&type=doubles', '/ranking?scope=race&type=individual', '/ranking?scope=race&type=doubles', '/ranking?tab=season',
  '/partners', '/partners?view=offers', '/partners?view=search', '/partners?view=inbox', '/partners?view=overview', '/partners?view=contract', '/partners?view=history',
  '/career/athlete', '/career/athlete?tab=appearance', '/career/training', '/career/training?tab=inventory', '/career/training?tab=shop',
  '/career/team', '/career/team?tab=staff', '/career/relations', '/career/relations?tab=fans',
  '/world/circuit', '/world/circuit?tab=circuit', '/world/circuit?tab=press', '/world/circuit?tab=community',
  '/world/directory?tab=clubs', '/world/directory?tab=countries', '__FIRST_CLUB__',
  '/world-market', '/weather', '/encyclopedia', '/encyclopedia?tab=history',
  '/communications', '/settings', '/careers', '/admin', '/database',
];

// ── Instrumentação em página ────────────────────────────────────────────
const INSTRUMENT = () => {
  if (window.__auditInstalled) return;
  window.__auditInstalled = true;
  window.__rnd = 0;
  const realRandom = Math.random;
  Math.random = function auditedRandom() { window.__rnd += 1; return realRandom.call(Math); };
  window.__persist = { calls: 0, careerWrites: 0, lastHash: null };
  const orig = window.__pl532Persist;
  window.__pl532Persist = (snapshot) => {
    window.__persist.calls += 1;
    try {
      const career = (snapshot || []).find(([k]) => String(k).startsWith('careers/') && !String(k).includes('index'));
      if (career) {
        const s = String(career[1]); let h = 2166136261; for (let i = 0; i < s.length; i += 97) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        const tag = `${h >>> 0}:${s.length}`;
        if (tag !== window.__persist.lastHash) { window.__persist.careerWrites += 1; window.__persist.lastHash = tag; }
      }
    } catch { /* medição apenas */ }
    return orig(snapshot);
  };
};
const SNAP = async () => {
  const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js');
  const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
  const entities = new Map();
  for (const [name, rows] of Object.entries(career.entities || {})) {
    if (!Array.isArray(rows)) continue;
    entities.set(name, new Map(rows.map((row, i) => [String(row?.id ?? `#${i}`), JSON.stringify(row)])));
  }
  const top = new Map(Object.entries(career).filter(([k]) => k !== 'entities').map(([k, v]) => [k, v]));
  return { entities, top: new Map([...top].map(([k, v]) => [k, JSON.stringify(v)])), topRaw: top };
};
const TAKE = async (label) => {
  const snap = await (window.__SNAP)();
  const prev = window.__snaps?.[label === 'reset' ? '__none' : '__last'];
  window.__snaps = window.__snaps || {};
  let diff = null;
  if (prev) {
    diff = { created: {}, removed: {}, changed: {}, top: {} };
    const names = new Set([...prev.entities.keys(), ...snap.entities.keys()]);
    for (const n of names) {
      const a = prev.entities.get(n) || new Map(); const b = snap.entities.get(n) || new Map();
      const created = [...b.keys()].filter((id) => !a.has(id));
      const removed = [...a.keys()].filter((id) => !b.has(id));
      const changedFields = {};
      let changedCount = 0;
      for (const [id, json] of b) {
        if (!a.has(id) || a.get(id) === json) continue;
        changedCount += 1;
        const x = JSON.parse(a.get(id)); const y = JSON.parse(json);
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) changedFields[k] = (changedFields[k] || 0) + 1;
      }
      if (created.length) diff.created[n] = { count: created.length, sample: created.slice(0, 4) };
      if (removed.length) diff.removed[n] = { count: removed.length, sample: removed.slice(0, 4) };
      if (changedCount) diff.changed[n] = { count: changedCount, fields: changedFields };
    }
    for (const k of new Set([...prev.top.keys(), ...snap.top.keys()])) {
      if (prev.top.get(k) === snap.top.get(k)) continue;
      const x = prev.topRaw.get(k); const y = snap.topRaw.get(k);
      const sub = (x && y && typeof x === 'object' && typeof y === 'object')
        ? [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((s) => JSON.stringify(x[s]) !== JSON.stringify(y[s]))
        : ['(valor)'];
      diff.top[k] = sub.slice(0, 12);
    }
  }
  window.__snaps.__last = snap;
  return { diff, rnd: window.__rnd, persist: { ...window.__persist }, path: location.pathname + location.search };
};

async function install(page) {
  await page.evaluate(INSTRUMENT);
  await page.evaluate(`window.__SNAP = ${SNAP.toString()}; window.__TAKE = ${TAKE.toString()};`);
}
const take = (page, label = 'step') => page.evaluate((l) => window.__TAKE(l), label);
async function settle(page, minMs = 3000, maxMs = 15000) {
  await sleep(minMs);
  const t0 = Date.now();
  let last = await page.evaluate(() => window.__persist?.calls || 0);
  while (Date.now() - t0 < maxMs) {
    await sleep(1200);
    const now = await page.evaluate(() => window.__persist?.calls || 0);
    if (now === last) return;
    last = now;
  }
}
async function spa(page, to) {
  await page.evaluate((path) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, to);
}
async function closeDialogs(page) { for (let i = 0; i < 3 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(500); } }
const pack = (r, before) => ({
  diff: r.diff,
  mathRandomCalls: r.rnd - before.rnd,
  persistCalls: r.persist.calls - before.persist.calls,
  careerWrites: r.persist.careerWrites - before.persist.careerWrites,
  path: r.path,
});
const counters = (page) => page.evaluate(() => ({ rnd: window.__rnd, persist: { ...window.__persist } }));

async function resolveRoute(page, route) {
  if (!route.startsWith('__')) return route;
  return page.evaluate(async (r) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const me = (await localGame.entities.PlayerProfile.list())[0];
    if (r === '__FIRST_CLUB__') { const c = (await localGame.entities.Club.list())[0]; return c ? `/clubs/${c.id}` : null; }
    const all = await localGame.entities.Tournament.list('start_date');
    if (r === '__NEXT_TOURNAMENT__') { const t = all.find((x) => x.start_date >= me.career_date); return t ? `/tournaments?tournament=${encodeURIComponent(t.id)}` : null; }
    if (r === '__LAST_FINISHED_BRACKET__') { const t = [...all].reverse().find((x) => x.champion || (x.champion_athlete_ids || []).length); return t ? `/tournaments?tournament=${encodeURIComponent(t.id)}&openBracket=true` : null; }
    return null;
  }, route);
}

export async function auditScenario(id, { reload = true, routes = ROUTES } = {}) {
  const file = SCENARIOS[id];
  if (!existsSync(file)) return { skipped: `${file} ausente` };
  const careerId = readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
  const { browser, page } = await openSession({ save: { url: `/${file}`, careerId } });
  const result = { scenario: id, routes: {}, boot: null };
  try {
    await setViewport(page, 390);
    await install(page);
    // Base: rota neutra visitada uma vez (absorve a introdução de página).
    await spa(page, NEUTRAL); await settle(page, 4000);
    await take(page);
    for (const raw of routes) {
      const route = await resolveRoute(page, raw);
      if (!route) { result.routes[raw] = { skipped: 'sem alvo neste save' }; continue; }
      const entry = { route };
      for (const step of ['open1', 'open2']) {
        await closeDialogs(page);
        await spa(page, NEUTRAL); await settle(page, 2000);
        await take(page);
        const before = await counters(page);
        await spa(page, route); await settle(page);
        entry[step] = pack(await take(page), before);
      }
      result.routes[raw] = entry;
      // Gravação parcial: uma falha tardia (ex.: boot de save grande) não perde as aberturas.
      writeFileSync(`${OUT}/dynamic/${id}.json`, JSON.stringify(result, null, 2));
      const d = entry.open1.diff; const n = d ? Object.values(d.created).reduce((s, x) => s + x.count, 0) + Object.values(d.removed).reduce((s, x) => s + x.count, 0) + Object.values(d.changed).reduce((s, x) => s + x.count, 0) : 0;
      console.log(`[${id}] ${route.padEnd(48)} open1: ${n} reg · topo ${Object.keys(d?.top || {}).join(',') || '-'} · rnd ${entry.open1.mathRandomCalls} · saves ${entry.open1.careerWrites} | open2: ${JSON.stringify(Object.keys(entry.open2.diff?.created || {}))}${JSON.stringify(Object.keys(entry.open2.diff?.changed || {}))} saves ${entry.open2.careerWrites}`);
    }
    if (reload) {
      // Boot de referência na rota neutra, depois boot direto em cada rota.
      const bootAt = async (path) => {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 240000 }).catch(() => null);
        await install(page);
        await settle(page, 5000, 20000);
        return take(page, 'reset');
      };
      await bootAt(NEUTRAL);
      const baseline = await page.evaluate(() => window.__snaps.__last);
      void baseline;
      await page.evaluate(() => { window.__snaps.__neutralBoot = window.__snaps.__last; });
      for (const raw of routes) {
        const route = result.routes[raw]?.route;
        if (!route) continue;
        await bootAt(route);
        const cmp = await page.evaluate(() => { window.__snaps.__last2 = window.__snaps.__last; window.__snaps.__last = window.__snaps.__neutralBoot; return true; });
        void cmp;
        const r = await page.evaluate(async () => { const snap = window.__snaps.__last2; window.__SNAP = (() => Promise.resolve(snap)); const out = await window.__TAKE('x'); return out; });
        result.routes[raw].reloadVsNeutralBoot = r.diff;
        await page.evaluate(`window.__SNAP = ${SNAP.toString()}`);
      }
    }
    result.jsErrors = page.__errors;
  } finally {
    await browser.close();
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('route-audit.mjs')) {
  const [id, ...flags] = process.argv.slice(2);
  const routesFlag = flags.find((f) => f.startsWith('--routes='));
  const routes = routesFlag ? routesFlag.slice(9).split(',') : ROUTES;
  mkdirSync(`${OUT}/dynamic`, { recursive: true });
  const res = await auditScenario(id, { reload: !flags.includes('--no-reload'), routes });
  writeFileSync(`${OUT}/dynamic/${id}.json`, JSON.stringify(res, null, 2));
  console.log('ok', id);
}
