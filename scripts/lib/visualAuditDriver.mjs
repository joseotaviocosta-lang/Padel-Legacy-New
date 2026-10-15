// Playthrough 5.20-B, Partes A/AM/AN/AO — DRIVER DE AUDITORIA VISUAL.
//
// Dirige o Chrome JA INSTALADO (puppeteer-core, sem baixar navegador) contra o
// dev server, com o shim de storage injetado antes de qualquer script da pagina.
// Mede o que as Partes AM/AN/AH/AI/AE exigem e captura screenshot por viewport.
import puppeteer from 'puppeteer-core';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { TAURI_BROWSER_SHIM } from './tauriBrowserShim.js';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const BASE = process.env.PL_AUDIT_BASE || 'http://127.0.0.1:5174';

export const VIEWPORTS = [
  { id: '1920', label: 'Desktop 1920x1080', width: 1920, height: 1080 },
  { id: '1366', label: 'Notebook 1366x768', width: 1366, height: 768 },
  { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true },
  { id: '360', label: 'Mobile 360x800', width: 360, height: 800, mobile: true },
];

export async function launch() {
  const userDataDir = mkdtempSync(`${tmpdir().replace(/\\/g, '/')}/pl-audit-`);
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--disable-dev-shm-usage', `--user-data-dir=${userDataDir}`],
    protocolTimeout: 180000,
  });
}

export async function newPage(browser, viewport) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(TAURI_BROWSER_SHIM);
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    isMobile: Boolean(viewport.mobile),
    hasTouch: Boolean(viewport.mobile),
  });
  page.on('pageerror', (e) => { page.__errors = [...(page.__errors || []), String(e.message).slice(0, 160)]; });
  return page;
}

// Redirects do app (LegacyRedirect, guardas de carreira) navegam DEPOIS do
// load: avaliar cedo demais estoura "Execution context was destroyed".
// Espera-se a quietude, depois confirma-se que a URL parou de mudar.
export async function goto(page, path, { settle = 2500 } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, settle));
  // Aguarda a URL estabilizar (ate 3 verificacoes).
  let last = null;
  for (let i = 0; i < 3; i += 1) {
    const now = await page.url();
    if (now === last) break;
    last = now;
    await new Promise((r) => setTimeout(r, 700));
  }
}

/** Metricas que as Partes AM/AN/AH/AI/AE pedem, lidas na propria pagina. */
export async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const overflowX = de.scrollWidth - window.innerWidth;
    // Elementos que de fato estouram a largura da viewport.
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > window.innerWidth + 1 || r.left < -1) {
        // 5.20-B — CORRECAO DE INSTRUMENTO. A versao anterior classificava
        // pelo overflowX do PROPRIO elemento, entao todo filho de um carrossel
        // contava como estouro acidental: o HUD do PageHeader (.pl-game-hud,
        // overflow-x:auto) sozinho somava 13 "estouros" em 360px que na verdade
        // sao conteudo rolavel. Isso inflou a contagem do baseline inteiro.
        // Agora a autoridade e o ANCESTRAL que rola, e as duas situacoes ficam
        // separadas, porque custam coisas diferentes ao jogador:
        //   - cortado (bug): conteudo sem nenhuma forma de ser alcancado;
        //   - rolavel (custo de descoberta): alcancavel so com rolagem lateral,
        //     que foi a queixa real de "ultima aba cortada" da M4.1.3.
        // Tres destinos possiveis para quem passa da borda, e so um e defeito:
        // rolavel (ancestral auto/scroll), aparado de proposito (ancestral
        // hidden/clip — o caso dos circulos decorativos posicionados para fora
        // do cartao), ou realmente empurrando a pagina.
        let scroller = null; let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (['auto', 'scroll'].includes(ox)) { scroller = a; break; }
          if (['hidden', 'clip'].includes(ox)) { clipped = true; break; }
        }
        const interactive = el.matches('button, a, input, select, textarea, [role="button"], [role="tab"], [tabindex]')
          || el.querySelector('button, a, input, select, textarea, [role="button"], [role="tab"]');
        if (clipped && !interactive) continue;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 60),
          right: Math.round(r.right),
          intentional: Boolean(scroller),
          scrollerCls: scroller ? String(scroller.className || '').slice(0, 40) : null,
        });
      }
    }
    // Scroll vertical aninhado (Parte AN).
    const scrollers = [...document.querySelectorAll('body *')].filter((el) => {
      const s = getComputedStyle(el);
      return ['auto', 'scroll'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
    }).length;
    // Densidade visual (Parte AH) e CTAs (Parte AI).
    const cards = document.querySelectorAll('[class*="rounded-2xl"],[class*="rounded-xl"][class*="border"]').length;
    const buttons = [...document.querySelectorAll('button,a[role="button"]')];
    const visibleButtons = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    });
    // Alvos de toque abaixo de 44px (Parte AE).
    const smallTargets = visibleButtons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.height < 44 || r.width < 44;
    }).map((b) => ({ text: (b.textContent || '').trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }));
    const tabs = document.querySelectorAll('[role="tab"]').length;
    return {
      // 5.20-B — na emulacao mobile do Chrome, window.innerWidth pode CRESCER
      // quando o conteudo forca o layout a ficar mais largo que o aparelho.
      // Como overflowX se mede contra innerWidth, um estouro real pode zerar a
      // propria metrica que deveria denuncia-lo. Estes campos deixam isso
      // visivel: inner maior que o aparelho pedido ja e o sintoma.
      // Sintoma mais confiavel que overflowX, porque nao depende de innerWidth:
      // se o layout ficou mais largo que o aparelho, algo estourou de verdade.
      layoutWiderThanDevice: window.innerWidth - document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      visualWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
      overflowX,
      offenders,
      unintentionalOverflow: offenders.filter((o) => !o.intentional).length,
      // Quanto falta aparecer em cada carrossel horizontal da pagina. Um valor
      // alto aqui nao e bug, e opcao escondida atras de rolagem lateral.
      hiddenInScrollers: [...document.querySelectorAll('body *')]
        .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
        .map((el) => ({ cls: String(el.className || '').slice(0, 40), missing: el.scrollWidth - el.clientWidth })),
      nestedScrollers: scrollers,
      cards,
      visibleButtons: visibleButtons.length,
      smallTargets: smallTargets.slice(0, 6),
      smallTargetCount: smallTargets.length,
      tabs,
      title: (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 60),
      bodyText: (document.body.innerText || '').length,
    };
  });
}

export async function shoot(page, dir, name) {
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  try { await page.screenshot({ path, fullPage: false, timeout: 60000 }); } catch (e) { return null; }
  return path;
}
