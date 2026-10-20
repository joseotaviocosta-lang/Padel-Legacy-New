// Fase 5.32-A — gera compare/<tela>-<vp>.png: antes | depois lado a lado.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('reports/ui-redesign-532');
// 5.32-A.1: PL532_BEFORE/PL532_AFTER/PL532_OUT/PL532_PAIRS (json) trocam os diretórios e os pares.
const BEFORE = process.env.PL532_BEFORE || 'before';
const AFTER = process.env.PL532_AFTER || 'after';
const OUTDIR = process.env.PL532_OUT || 'compare';
mkdirSync(`${ROOT}/${OUTDIR}`, { recursive: true });
const PAIRS = process.env.PL532_PAIRS ? JSON.parse(process.env.PL532_PAIRS) : [
  ['carreira-nova--mundial-individual', '390'], ['carreira-nova--mundial-individual', '360'], ['carreira-nova--mundial-duplas', '390'],
  ['t5-sem-dupla--mundial-individual', '390'], ['t5-sem-dupla--race-duplas', '390'],
  ['t5-race-sem-dupla--race-individual', '390'], ['t5-race-sem-dupla--race-duplas', '390'], ['t5-race-sem-dupla--race-individual', '390-full'],
  ['t5-com-dupla--mundial-individual', '390'], ['t5-com-dupla--mundial-individual', '390-full'], ['t5-com-dupla--mundial-duplas', '390'], ['t5-com-dupla--mundial-duplas', '360'],
  ['t5-com-dupla--race-duplas', '390'], ['t5-com-dupla--mundial-individual', 'desktop'], ['t5-com-dupla--mundial-duplas', 'desktop'], ['t5-com-dupla--mundial-individual', 'landscape'],
];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
for (const [screen, vp] of PAIRS) {
  const before = `${ROOT}/${BEFORE}/${screen}-${vp}.png`; const after = `${ROOT}/${AFTER}/${screen}-${vp}.png`;
  if (!existsSync(before) || !existsSync(after)) { console.log('skip', screen, vp); continue; }
  const wide = vp === 'desktop' || vp === 'landscape' || vp === '1600' || vp === '768';
  const w = wide ? 760 : 380;
  await page.setViewport({ width: w * 2 + 60, height: 200, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#0b0d12;font:600 14px system-ui;color:#cbd5e1;padding:12px;display:flex;gap:24px">
    <figure style="margin:0;width:${w}px"><figcaption style="margin-bottom:6px;color:#f87171">ANTES · ${screen} · ${vp}</figcaption><img src="${b64(before)}" style="width:100%;border:1px solid #334155;border-radius:8px"></figure>
    <figure style="margin:0;width:${w}px"><figcaption style="margin-bottom:6px;color:#a3e635">DEPOIS · ${screen} · ${vp}</figcaption><img src="${b64(after)}" style="width:100%;border:1px solid #334155;border-radius:8px"></figure>
  </body></html>`);
  await page.screenshot({ path: `${ROOT}/${OUTDIR}/${screen}-${vp}.png`, fullPage: true });
  console.log('ok', screen, vp);
}
await browser.close();
