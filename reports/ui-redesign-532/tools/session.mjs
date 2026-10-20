// Fase 5.32-A — sessão de captura isolada.
//
// Chrome headless com perfil TEMPORÁRIO + o shim de storage em memória de
// scripts/lib/tauriBrowserShim.js. Nada toca no IndexedDB/AppData do usuário.
//
// O save da LOCAL-8A (38 MB) não cabe na cota do localStorage em que o shim
// persiste. Por isso, só nesta ferramenta, o load/persist do shim é trocado:
//   - o arquivo da carreira vem do disco (dev server, XHR síncrono) a cada
//     carga de página — sempre o save ORIGINAL, somente leitura;
//   - o resto (índice de carreiras etc.) persiste no localStorage do perfil
//     temporário, como antes.
// Escritas na carreira durante a sessão ficam só em memória.
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHROME, BASE } from '../../../scripts/lib/visualAuditDriver.mjs';
import { TAURI_BROWSER_SHIM } from '../../../scripts/lib/tauriBrowserShim.js';
import { dismissOverlays } from '../../../scripts/lib/auditSession.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { BASE, dismissOverlays };

export const VIEWPORTS = {
  360: { width: 360, height: 800, mobile: true },
  390: { width: 390, height: 844, mobile: true },
  desktop: { width: 1366, height: 768 },
  landscape: { width: 844, height: 390, mobile: true },
  // 5.32-A.1
  768: { width: 768, height: 1024, mobile: true },
  1600: { width: 1600, height: 900 },
};

const SEEDED_SHIM = TAURI_BROWSER_SHIM
  .replace("localStorage.getItem(KEY) || '[]'", 'window.__pl532Load()')
  .replace('localStorage.setItem(KEY, JSON.stringify(snapshot));', 'window.__pl532Persist(snapshot);');
if (SEEDED_SHIM === TAURI_BROWSER_SHIM || !SEEDED_SHIM.includes('__pl532Persist')) {
  throw new Error('shim mudou: os pontos de load/persist não foram encontrados');
}

function preShim(seed) {
  const SMALL = '__pl532_small__';
  window.__pl532Load = () => {
    let small = [];
    try { small = JSON.parse(localStorage.getItem(SMALL) || '[]'); } catch { small = []; }
    if (!seed) return JSON.stringify(small);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', seed.url, false);
    xhr.send(null);
    return JSON.stringify([...small.filter(([k]) => k !== seed.path), [seed.path, xhr.responseText]]);
  };
  window.__pl532Persist = (snapshot) => {
    localStorage.setItem(SMALL, JSON.stringify(snapshot.filter(([k]) => !k.startsWith('careers/'))));
  };
}

export async function spa(page, path, settle = 2500) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(settle);
}

export async function setViewport(page, id) {
  const vp = VIEWPORTS[id];
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) });
  await sleep(700);
}

export async function waitForText(page, re, timeout = 60000) {
  await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText || ''), { timeout }, re.source).catch(() => null);
}

/**
 * save = { url, careerId } → importa o save (uma vez) e recarrega: o provider
 * abre a última carreira. Sem save → cria uma carreira nova pela UI.
 */
export async function openSession({ save = null, careerName = 'Smoke 532A' } = {}) {
  const userDataDir = mkdtempSync(`${tmpdir().replace(/\\/g, '/')}/pl-532-`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--disable-dev-shm-usage', `--user-data-dir=${userDataDir}`],
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const seed = save ? { url: save.url, path: `careers/${save.careerId}.json` } : null;
  await page.evaluateOnNewDocument(preShim, seed);
  await page.evaluateOnNewDocument(SEEDED_SHIM);
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e.message).slice(0, 200)));
  await setViewport(page, 390);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => null);
  await sleep(2500);
  if (save) {
    // Índice: cria a entrada da carreira (o arquivo já está no storage).
    const result = await page.evaluate(async (url, name) => {
      const { CareerManager } = await import('/src/careers/CareerManager.js');
      const manager = new CareerManager();
      await manager.initialize();
      const index = await manager.loadFreshIndex();
      if (index.careers.length) return { already: true, last: index.last_career_id };
      const data = await (await fetch(url)).json();
      data.career_name = name;
      const imported = await manager.importCareer(data);
      return { imported: imported.summary.id };
    }, save.url, careerName);
    console.log('[session] índice', JSON.stringify(result));
    await page.goto(`${BASE}/game`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => null);
    await waitForText(page, /Avançar|Início|Temporada/, 120000);
    await sleep(4000);
  } else {
    const { openCareer } = await import('../../../scripts/lib/auditSession.mjs');
    await page.close();
    const fresh = await openCareer(browser, VIEWPORTS[390]);
    fresh.__errors = [];
    fresh.on('pageerror', (e) => fresh.__errors.push(String(e.message).slice(0, 200)));
    await dismissOverlays(fresh);
    return { browser, page: fresh };
  }
  await dismissOverlays(page);
  return { browser, page };
}
