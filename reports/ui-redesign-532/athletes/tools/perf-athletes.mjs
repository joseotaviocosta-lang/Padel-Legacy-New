// Fase 5.32-C — custo ANTES × DEPOIS do Diretório e do Perfil, na MESMA
// sessão (../../tools/session.mjs, save em memória). Alterna as variantes
// (depois, antes, depois, antes): "antes" = conteúdo do HEAD gravado
// temporariamente nos 4 arquivos de UI (mesmo fim de linha); os atuais são
// restaurados no final e conferidos por SHA-256.
// Mede (ms): abrir o diretório (pushState → linhas), buscar (input → 1ª
// linha certa), abrir o perfil (toque → diálogo), alternar seção (depois).
// Saída: athletes/perf.json. Uso: node perf-athletes.mjs [estado...]
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openSession, sleep, setViewport, dismissOverlays, BASE } from '../../tools/session.mjs';
import { ATHLETE_STATES, careerIdOf, DIRECTORY } from './capture-athletes.mjs';

const FILES = ['src/pages/Athletes.jsx', 'src/components/athletes/AthleteDetail.jsx', 'src/components/athletes/AthleteCard.jsx', 'src/pages/Ranking.jsx'];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const current = new Map(FILES.map((f) => [f, readFileSync(f)]));
const head = new Map(FILES.map((f) => {
  let s = execSync(`git show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n');
  if (current.get(f).includes('\r\n')) s = s.replace(/\n/g, '\r\n');
  return [f, Buffer.from(s)];
}));
const write = (variant) => { for (const f of FILES) writeFileSync(f, variant === 'after' ? current.get(f) : head.get(f)); };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const ROWS = '.pl-scout-row';

async function timed(page, action, until) {
  await page.evaluate(() => { window.__t0 = performance.now(); window.__t1 = 0; });
  await action();
  await page.waitForFunction(until, { timeout: 120000, polling: 16 }).catch(() => null);
  return page.evaluate(() => Math.round(performance.now() - window.__t0));
}
const openDirectory = (page) => timed(page,
  () => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, DIRECTORY),
  () => document.querySelectorAll('.pl-scout-row').length > 0);
const search = (page, name) => timed(page,
  () => page.evaluate((v) => { const i = document.querySelector('input[placeholder*="Buscar"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, name),
  `(() => { const r = document.querySelector('.pl-scout-row'); return r && r.innerText.includes(${JSON.stringify(name)}); })()`);
const openProfile = (page) => timed(page,
  () => page.evaluate(() => document.querySelector('.pl-scout-row').click()),
  () => Boolean(document.querySelector('[role=dialog]')));
const switchSection = (page) => timed(page,
  async () => {
    const box = await page.evaluate(() => { const t = [...document.querySelectorAll('[data-athlete-profile] [role=tab]')][1]; const r = t?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    if (box) await page.mouse.click(box.x, box.y);
  },
  () => Boolean(document.querySelector('[data-athlete-section="results"]')));

const requested = process.argv.slice(2);
const stateIds = requested.length ? requested : ['carreira-nova', 't10'];
const out = { createdAt: new Date().toISOString(), method: 'mesma sessão; rodadas alternadas depois/antes/depois/antes; 1ª abertura de cada rodada descartada; 4 medidas por rodada', states: {} };
try {
  for (const stateId of stateIds) {
    const state = ATHLETE_STATES[stateId];
    const { browser, page } = await openSession({ save: { url: state.url, careerId: careerIdOf(state) } });
    await setViewport(page, 390);
    const runs = { after: { directory: [], search: [], profile: [], section: [] }, before: { directory: [], search: [], profile: [], section: [] } };
    for (const variant of (process.env.PL532C_ORDER || 'after,before,after,before').split(',')) {
      write(variant);
      await sleep(2500);
      await page.goto(`${BASE}/game`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => null);
      await sleep(3000);
      await dismissOverlays(page);
      await openDirectory(page); // fria, descartada
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, '/game');
        await sleep(1500);
        runs[variant].directory.push(await openDirectory(page));
        await sleep(400);
        runs[variant].search.push(await search(page, 'Agustín Tapia'));
        runs[variant].profile.push(await openProfile(page));
        if (variant === 'after') runs[variant].section.push(await switchSection(page));
        await page.keyboard.press('Escape');
        await sleep(1200);
      }
      console.log(stateId, variant, JSON.stringify(runs[variant]));
    }
    out.states[stateId] = Object.fromEntries(['before', 'after'].map((v) => [v, Object.fromEntries(Object.entries(runs[v]).map(([k, xs]) => [k, { runs: xs, median: median(xs) }]))]));
    out.states[stateId].jsErrors = page.__errors;
    await browser.close();
  }
} finally {
  for (const f of FILES) writeFileSync(f, current.get(f));
  for (const f of FILES) if (sha(readFileSync(f)) !== sha(current.get(f))) throw new Error(`restauração falhou: ${f}`);
  console.log('arquivos restaurados (SHA conferido)');
}
writeFileSync('reports/ui-redesign-532/athletes/perf.json', JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out.states)) console.log(k, ['directory', 'search', 'profile', 'section'].map((m) => `${m}: ${v.before[m].median ?? '—'} → ${v.after[m].median ?? '—'}`).join(' · '));
