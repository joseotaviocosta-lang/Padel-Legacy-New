// Fase 5.32-C — captura + medição do Diretório e dos Perfis de Atletas.
// Uso: node capture-athletes.mjs before|after [estado...]
// Estados carregados na cópia em memória (../../tools/session.mjs): nenhum
// save do usuário ou da LOCAL-8A é alterado.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { openSession, spa, sleep, setViewport } from '../../tools/session.mjs';

const PHASE = process.argv[2] || 'before';
const OUT = `reports/ui-redesign-532/athletes/${PHASE}`;
const SAVES = 'reports/local-8a-career-audit/run10';
export const ATHLETE_STATES = {
  'carreira-nova': {
    url: '/reports/ui-redesign-532/fixtures/carreira-nova.json', file: 'reports/ui-redesign-532/fixtures/carreira-nova.json',
    profiles: { lider: 'Arturo Coello', comum: 'Rafael Iglesias', 'sem-parceiro': 'Mateo Ruiz' },
  },
  t10: {
    url: `/${SAVES}/save-season-10.json`, file: `${SAVES}/save-season-10.json`,
    profiles: { lider: 'Arturo Coello', comum: 'Martín Mendes', 'sem-parceiro': 'Rafael Martínez', aposentado: 'Álvaro Cepero', 'aposentado-antigo': 'Carlos Molina' },
  },
};
export function careerIdOf(state) {
  return readFileSync(state.file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
}
export const DIRECTORY = '/world/directory?tab=athletes';

export const measureDirectory = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const scrollsX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const offenders = [...main.querySelectorAll('*')].filter((el) => visible(el) && !scrollsX(el)).filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
  const rows = [...main.querySelectorAll('.pl-scout-row, [data-athlete-row]')].filter(visible);
  const firstRowY = rows.length ? Math.round(rows[0].getBoundingClientRect().top + window.scrollY) : null;
  const search = main.querySelector('input[type=search], input[placeholder*="Buscar"]');
  return {
    viewport: `${vw}x${window.innerHeight}`,
    pageHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - vw,
    offenders: offenders.slice(0, 6).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
    filterControls: [...main.querySelectorAll('select, [role=tab], [data-directory-filter]')].filter(visible).length,
    searchY: search ? Math.round(search.getBoundingClientRect().top + window.scrollY) : null,
    firstRowY,
    rowsInFold: rows.filter((r) => r.getBoundingClientRect().top + window.scrollY < window.innerHeight).length,
    rowHeights: rows.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height)),
    rowText: rows.slice(0, 5).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 90)),
    listCount: rows.length,
  };
});

export const measureProfile = (page) => page.evaluate(() => {
  const dialog = document.querySelector('[role=dialog] .pl-modal-panel') || document.querySelector('[role=dialog]');
  if (!dialog) return null;
  const vw = window.innerWidth;
  const r = dialog.getBoundingClientRect();
  const content = dialog.querySelector('.pl-modal-content');
  const inner = [...dialog.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); });
  return {
    width: Math.round(r.width), height: Math.round(r.height),
    scrollHeight: content ? content.scrollHeight : null,
    overflowX: document.documentElement.scrollWidth - vw,
    innerOverflow: inner.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
    text: dialog.innerText.replace(/\s+/g, ' ').slice(0, 700),
  };
});

export async function waitDirectory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.pl-scout-row, [data-athlete-row]').length > 0, { timeout: 120000, polling: 100 }).catch(() => null);
  await sleep(800);
}

export async function openProfileBySearch(page, name) {
  await spa(page, DIRECTORY, 1000);
  await waitDirectory(page);
  await page.waitForSelector('input[placeholder*="Buscar"]', { timeout: 60000 }).catch(() => null);
  await page.evaluate((n) => {
    const input = document.querySelector('input[placeholder*="Buscar"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, n);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await sleep(1200);
  const opened = await page.evaluate((n) => {
    const rows = [...document.querySelectorAll('.pl-scout-row, [data-athlete-row] button, button[data-athlete-row]')];
    const row = rows.find((x) => x.innerText.includes(n));
    if (!row) return false;
    row.click();
    return true;
  }, name);
  await sleep(1500);
  return opened;
}

if (process.argv[1] && process.argv[1].endsWith('capture-athletes.mjs')) {
  mkdirSync(OUT, { recursive: true });
  const requested = process.argv.slice(3);
  const stateIds = requested.length ? requested : Object.keys(ATHLETE_STATES);
  const result = existsSync(`${OUT}/measurements.json`) ? JSON.parse(readFileSync(`${OUT}/measurements.json`, 'utf8')) : {};
  for (const stateId of stateIds) {
    const state = ATHLETE_STATES[stateId];
    if (!existsSync(state.file)) { console.log('sem save', stateId); continue; }
    const { browser, page } = await openSession({ save: { url: state.url, careerId: careerIdOf(state) } });
    result[stateId] = { directory: {}, profiles: {} };
    for (const vpId of ['390', '360', '768', 'desktop', '1600', 'landscape']) {
      await setViewport(page, vpId);
      const before = page.__errors.length;
      await spa(page, DIRECTORY, 1500);
      await waitDirectory(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);
      const m = await measureDirectory(page);
      m.jsErrors = page.__errors.slice(before);
      result[stateId].directory[vpId] = m;
      await page.screenshot({ path: `${OUT}/${stateId}--directory-${vpId}.png` });
      if (vpId === '390') await page.screenshot({ path: `${OUT}/${stateId}--directory-390-full.png`, fullPage: true });
      console.log(stateId, 'directory', vpId, `h=${m.pageHeight} ovf=${m.overflowX} off=${m.offenders.length} filters=${m.filterControls} row1=${m.firstRowY} fold=${m.rowsInFold} err=${m.jsErrors.length}`);
    }
    for (const vpId of ['390', 'desktop']) {
      await setViewport(page, vpId);
      for (const [kind, name] of Object.entries(state.profiles)) {
        const before = page.__errors.length;
        await page.keyboard.press('Escape').catch(() => null);
        await sleep(600);
        const ok = await openProfileBySearch(page, name);
        const m = ok ? await measureProfile(page) : null;
        if (m) m.jsErrors = page.__errors.slice(before);
        result[stateId].profiles[`${kind}@${vpId}`] = m;
        await page.screenshot({ path: `${OUT}/${stateId}--perfil-${kind}-${vpId}.png` });
        // Seções do perfil (depois): uma captura por aba.
        const tabs = await page.$$('[data-athlete-profile] [role=tab]');
        for (let i = 1; i < tabs.length; i += 1) {
          const box = await tabs[i].boundingBox();
          if (!box) continue;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await sleep(600);
          const label = await tabs[i].evaluate((t) => t.innerText.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'));
          await page.screenshot({ path: `${OUT}/${stateId}--perfil-${kind}-${label}-${vpId}.png` });
        }
        console.log(stateId, 'perfil', kind, vpId, m ? `h=${m.height} scroll=${m.scrollHeight} ovf=${m.overflowX} inner=${m.innerOverflow.length} err=${m.jsErrors.length}` : 'NÃO ABRIU');
        await page.keyboard.press('Escape').catch(() => null);
        await sleep(800);
      }
    }
    await browser.close();
  }
  writeFileSync(`${OUT}/measurements.json`, JSON.stringify(result, null, 2));
  console.log('ok', Object.keys(result));
}
