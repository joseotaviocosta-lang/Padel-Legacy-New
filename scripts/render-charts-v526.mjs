// Playthrough 5.26 — converte charts/*.svg em PNG usando o Edge/Chromium
// instalado (puppeteer-core já é dependência do projeto). Sem Python.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const DIR = resolve(arg('dir', 'reports/progression-economy-526/charts'));
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error('Nenhum navegador Chromium encontrado (defina CHROME_PATH).'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
  for (const f of files) {
    const svg = readFileSync(resolve(DIR, f), 'utf8');
    const w = Number(svg.match(/width="(\d+)"/)?.[1] || 900);
    const h = Number(svg.match(/height="(\d+)"/)?.[1] || 520);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: resolve(DIR, f.replace(/\.svg$/, '.png')), clip: { x: 0, y: 0, width: w, height: h } });
  }
  console.log(`${files.length} gráficos → PNG em ${DIR}`);
} finally {
  await browser.close();
}
