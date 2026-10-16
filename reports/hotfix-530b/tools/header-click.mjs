// 5.30-B — clique real no atalho do header: precisa abrir a página geral de Torneios.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
await p.evaluate(() => { history.pushState({}, '', '/game'); dispatchEvent(new PopStateEvent('popstate')); });
await sleep(3000);
const box = await p.evaluate(() => { const r = [...document.querySelectorAll('[data-header-tournament-shortcut]')].find((e) => e.getClientRects().length)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
const label = await p.evaluate(() => [...document.querySelectorAll('[data-header-tournament-shortcut]')].find((e) => e.getClientRects().length)?.getAttribute('aria-label'));
await p.mouse.click(box.x, box.y);
await sleep(3000);
const out = { label, path: await p.evaluate(() => location.pathname + location.search), detailOpen: await p.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))), hero: await p.evaluate(() => document.querySelector('[data-competition-hero]')?.innerText.replace(/\s+/g, ' ').slice(0, 120) || null) };
writeFileSync(new URL('../runs/header-click.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(out);
b.disconnect();
