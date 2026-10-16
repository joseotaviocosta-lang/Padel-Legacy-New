// Fase 5.31 — gera compare/<tela>-<vp>.png: antes | depois lado a lado.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('reports/ui-redesign-531');
mkdirSync(`${ROOT}/compare`, { recursive: true });
const PAIRS = [['partner-overview-sem-parceiro', '390'], ['partner-overview-com-parceiro', '390-full'], ['partner-market-sem-parceiro', '390-full'], ['partner-search-com-parceiro', '390'], ['partner-offer-detail-sem-parceiro', '390'], ['partner-contract-com-parceiro', '390-full'], ['coach-com-parceiro', '390'], ['coach-detail-com-parceiro', '390'], ['coach-detail-com-parceiro', '360'], ['staff-com-parceiro', '390-full'], ['staff-market-com-parceiro', '390'], ['partner-overview-com-parceiro', 'desktop'], ['coach-detail-com-parceiro', 'landscape'], ['staff-com-parceiro', 'landscape']];
const _OLD = [
  ['coach-hire', '360'], ['coach-hire', '390'], ['coach-hire', 'desktop'],
  ['tournaments', '360'], ['tournament-details', '360'], ['tournament-details', 'landscape'], ['tournament-bracket', '360'],
  ['training', '360'], ['economy-flow', '360'], ['economy-dashboard', '390'], ['missions', '390'],
  ['partners', '360'], ['home-header', '360'], ['coaches', '360'], ['staff', '360'],
];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
for (const [screen, vp] of PAIRS) {
  const before = `${ROOT}/before/${screen}-${vp}.png`; const after = `${ROOT}/after/${screen}-${vp}.png`;
  if (!existsSync(before) || !existsSync(after)) { console.log('skip', screen, vp); continue; }
  const wide = vp === 'desktop' || vp === 'landscape';
  const w = wide ? 760 : 380;
  await page.setViewport({ width: w * 2 + 60, height: 200, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#0b0d12;font:600 14px system-ui;color:#cbd5e1;padding:12px;display:flex;gap:24px">
    <figure style="margin:0;width:${w}px"><figcaption style="margin-bottom:6px;color:#f87171">ANTES · ${screen} · ${vp}</figcaption><img src="${b64(before)}" style="width:100%;border:1px solid #334155;border-radius:8px"></figure>
    <figure style="margin:0;width:${w}px"><figcaption style="margin-bottom:6px;color:#a3e635">DEPOIS · ${screen} · ${vp}</figcaption><img src="${b64(after)}" style="width:100%;border:1px solid #334155;border-radius:8px"></figure>
  </body></html>`);
  await page.screenshot({ path: `${ROOT}/compare/${screen}-${vp}.png`, fullPage: true });
  console.log('ok', screen, vp);
}
await browser.close();
