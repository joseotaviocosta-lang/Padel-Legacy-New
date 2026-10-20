// Fase 5.32-C.1 — fluxo REAL de início de carreira até a escolha do primeiro
// parceiro, num Chrome com perfil TEMPORÁRIO (nada toca nos saves do usuário
// nem no armazenamento da origem no navegador dele). Fotografa e mede os
// painéis de candidatos que o jogador encontra:
//   - Home → "Escolher parceiro" (o que a Home abrir);
//   - /partners?view=offers ("Escolha sua dupla" — propostas iniciais).
// Uso: node capture-partner-choice.mjs before|after
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, goto } from '../../../../scripts/lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from '../../../../scripts/lib/auditSession.mjs';

const PHASE = process.argv[2] || 'before';
const OUT = `reports/ui-redesign-532/athletes/partner-choice/${PHASE}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VPS = [
  { id: '390', width: 390, height: 844, mobile: true },
  { id: '360', width: 360, height: 800, mobile: true },
  { id: '768', width: 768, height: 1024, mobile: true },
  { id: '1366', width: 1366, height: 768 },
  { id: '1600', width: 1600, height: 900 },
  { id: 'landscape', width: 844, height: 390, mobile: true },
];

export const readCandidates = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const cards = [...document.querySelectorAll('[data-partner-candidate]')].filter((c) => c.getBoundingClientRect().width > 0);
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const outside = [...document.querySelectorAll('main *, [role=dialog] *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && !inScroller(el) && (r.right > vw + 1 || r.left < -1); });
  return {
    overflowX: document.documentElement.scrollWidth - vw,
    outside: outside.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
    cards: cards.map((c) => ({
      kind: c.getAttribute('data-partner-candidate'),
      text: c.innerText.replace(/\s+/g, ' ').slice(0, 220),
      age: c.querySelector('[data-candidate-age]')?.getAttribute('data-candidate-age') ?? null,
    })),
  };
});

if (process.argv[1] && process.argv[1].endsWith('capture-partner-choice.mjs')) {
  const browser = await launch();
  const result = {};
  try {
    const page = await openCareer(browser, VPS[0]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await goto(page, '/game', { settle: 3000 });
    await dismissOverlays(page);
    result.homeText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
    for (const vp of VPS) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) });
      await sleep(500);
      await goto(page, '/partners?view=offers', { settle: 4000 });
      await dismissOverlays(page);
      result[`offers@${vp.id}`] = await readCandidates(page);
      await page.screenshot({ path: `${OUT}/offers-${vp.id}.png` });
      if (vp.id === '390' || vp.id === '1366') await page.screenshot({ path: `${OUT}/offers-${vp.id}-full.png`, fullPage: true });
      console.log('offers', vp.id, JSON.stringify(result[`offers@${vp.id}`].cards.slice(0, 2)), 'ovf', result[`offers@${vp.id}`].overflowX, 'out', result[`offers@${vp.id}`].outside.length);
      // Home → "Escolher parceiro" (se a Home oferecer).
      await goto(page, '/game', { settle: 3000 });
      await dismissOverlays(page);
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('main button, main a')].find((x) => /escolher parceiro|escolha (seu|sua) parceir|escolher dupla|toque para escolher/i.test(x.innerText));
        if (!b) return null;
        b.click();
        return b.innerText.trim().slice(0, 60);
      });
      await sleep(2500);
      result[`home@${vp.id}`] = { clicked, url: await page.evaluate(() => location.pathname + location.search), ...(await readCandidates(page)) };
      await page.screenshot({ path: `${OUT}/home-choose-${vp.id}.png` });
      console.log('home', vp.id, 'clicked:', clicked, '→', result[`home@${vp.id}`].url, 'cards', result[`home@${vp.id}`].cards.length);
      await page.keyboard.press('Escape').catch(() => null);
      await sleep(800);
    }
    result.jsErrors = errors;
  } finally {
    writeFileSync(`${OUT}/measurements.json`, JSON.stringify(result, null, 2));
    await browser.close();
  }
  console.log('errors', result.jsErrors);
}
