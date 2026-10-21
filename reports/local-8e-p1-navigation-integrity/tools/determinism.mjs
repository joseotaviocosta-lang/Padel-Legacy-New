// LOCAL-8E — cópia da ferramenta da LOCAL-8D (determinism.mjs) com saída
// própria e registros de Coach por id no diff por campo.
// A navegação muda o FUTURO da carreira?
//   A : carregar o save → avançar 1 dia                 → assinatura
//   A': repetir A (mede o ruído natural do próprio avanço)
//   B : carregar → navegar pelas rotas auditadas → avançar 1 dia → assinatura
// Assinatura por entidade = multiconjunto do CONTEÚDO dos registros sem ids
// gerados por relógio/aleatório (<prefixo>-<13 dígitos>-<6>) e sem carimbos
// (created_date/updated_date/…). Diferença A×A' = ruído; diferença em B que
// não aparece em A×A' = efeito da navegação.
// Uso: node determinism.mjs <cenário> [--routes=a,b]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openSession, sleep, setViewport, dismissOverlays, BASE } from '../../ui-redesign-532/tools/session.mjs';
import { SCENARIOS, ROUTES } from '../../local-8d-navigation-persistence-audit/tools/route-audit.mjs';

const OUT = 'reports/local-8e-p1-navigation-integrity';
const SIGNATURE = async () => {
  const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js');
  const c = await activeCareerAdapter.getActiveCareer({ fresh: false });
  const RANDOM_ID = /^[a-z][a-z0-9_]*-\d{13}-[a-z0-9]{4,8}$/i;
  const STAMP = /^(created_date|updated_date|created_at|updated_at|last_played_at|generatedAt|generated_at|timestamp)$/;
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter((k) => !STAMP.test(k)).map((k) => [k, clean(v[k])]));
    if (typeof v === 'string' && RANDOM_ID.test(v)) return '<id>';
    return v;
  };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const out = {};
  for (const [name, rows] of Object.entries(c.entities || {})) {
    if (!Array.isArray(rows)) continue;
    const items = rows.map((r) => JSON.stringify(clean(r))).sort();
    out[name] = { count: rows.length, hash: hash(items.join('\n')), items: items.map(hash) };
  }
  // Registros com id estável para o diff por campo.
  out.__records = {
    AthleteProfile: Object.fromEntries((c.entities.AthleteProfile || []).map((a) => [a.id, clean(a)])),
    Match: Object.fromEntries((c.entities.Match || []).map((m) => [[m.tournament_id || m.tournament_name || '', m.round || m.tournament_round || '', m.date || m.match_date || '', [m.team_a, m.team_b].flat().filter(Boolean).join('/')].join('|'), clean(m)])),
    Mission: Object.fromEntries((c.entities.Mission || []).map((m) => [m.id, clean(m)])),
    Coach: Object.fromEntries((c.entities.Coach || []).map((m) => [m.id, clean(m)])),
    ShopItem: Object.fromEntries((c.entities.ShopItem || []).map((m) => [m.id, clean(m)])),
  };
  out.__player = { count: 1, hash: hash(JSON.stringify(clean({ ...c.player, tutorial_onboarding: undefined }))), items: [] };
  out.__date = c.player?.career_date;
  return out;
};

async function advanceOneDay(page) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, '/game');
  await sleep(3000);
  await dismissOverlays(page);
  const before = await page.evaluate(async () => { const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js'); return (await activeCareerAdapter.getActiveCareer({ fresh: false })).player.career_date; });
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Avançar/i.test(x.innerText.trim()) && x.getClientRects().length && !x.disabled); if (!b) return false; b.click(); return true; });
  if (!clicked) throw new Error('botão Avançar não encontrado');
  await page.waitForFunction(async (d) => { const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js'); return (await activeCareerAdapter.getActiveCareer({ fresh: false })).player.career_date !== d; }, { timeout: 600000, polling: 1000 }, before);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((x) => /Avançando|Simulando/i.test(x.innerText)), { timeout: 600000, polling: 1000 }).catch(() => null);
  await sleep(6000);
}

async function run(id, navigate, routes) {
  const file = SCENARIOS[id];
  const careerId = readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
  const { browser, page } = await openSession({ save: { url: `/${file}`, careerId } });
  try {
    await setViewport(page, 'desktop');
    if (navigate) {
      for (const r of routes) {
        if (r.startsWith('__')) continue;
        await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, r);
        await sleep(3500);
        for (let i = 0; i < 3 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(400); }
      }
    }
    if (!process.env.PL8D_NO_ADVANCE) await advanceOneDay(page);
    return { signature: await page.evaluate(SIGNATURE), errors: page.__errors };
  } finally { await browser.close(); }
}

const fieldDiff = (x, y) => {
  const out = {};
  for (const [entity, recsA] of Object.entries(x.__records || {})) {
    const recsB = (y.__records || {})[entity] || {};
    const fields = {}; let changed = 0;
    for (const [id, a] of Object.entries(recsA)) {
      const b = recsB[id]; if (!b) continue;
      let any = false;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { fields[k] = (fields[k] || 0) + 1; any = true; }
      if (any) changed += 1;
    }
    out[entity] = { changed, fields: Object.fromEntries(Object.entries(fields).sort((p, q) => q[1] - p[1]).slice(0, 20)) };
  }
  return out;
};
const compare = (x, y) => {
  const names = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((n) => n !== '__date' && n !== '__records');
  return Object.fromEntries(names.filter((n) => x[n]?.hash !== y[n]?.hash).map((n) => {
    const a = new Map(); (x[n]?.items || []).forEach((h) => a.set(h, (a.get(h) || 0) + 1));
    let onlyB = 0; (y[n]?.items || []).forEach((h) => { if (a.get(h)) a.set(h, a.get(h) - 1); else onlyB += 1; });
    const onlyA = [...a.values()].reduce((s, v) => s + v, 0);
    return [n, { countA: x[n]?.count ?? 0, countB: y[n]?.count ?? 0, onlyInA: onlyA, onlyInB: onlyB }];
  }));
};

if (process.argv[1] && process.argv[1].endsWith('determinism.mjs')) {
  const [id, ...flags] = process.argv.slice(2);
  const routesFlag = flags.find((f) => f.startsWith('--routes='));
  const routes = routesFlag ? routesFlag.slice(9).split(',') : ROUTES.filter((r) => !['/careers', '/admin', '/database'].includes(r));
  mkdirSync(`${OUT}/determinism`, { recursive: true });
  const A = await run(id, false, routes);
  const A2 = await run(id, false, routes);
  const B = await run(id, true, routes);
  const noise = compare(A.signature, A2.signature);
  const nav = compare(A.signature, B.signature);
  const navOnly = Object.fromEntries(Object.entries(nav).filter(([n]) => !(n in noise)));
  const report = { scenario: id, dates: [A.signature.__date, A2.signature.__date, B.signature.__date], routesNavigated: routes.length, noiseAvsA2: noise, navigationAvsB: nav, attributableToNavigation: navOnly, fieldsNoise: fieldDiff(A.signature, A2.signature), fieldsNavigation: fieldDiff(A.signature, B.signature), errors: { A: A.errors, A2: A2.errors, B: B.errors } };
  writeFileSync(`${OUT}/determinism/${id}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ scenario: id, dates: report.dates, noise: Object.keys(noise), navigation: Object.keys(nav), attributableToNavigation: navOnly }, null, 1));
}
