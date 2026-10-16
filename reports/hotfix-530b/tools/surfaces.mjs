// 5.30-B — captura (sem gravar nada) o "próximo evento" de cada superfície:
// header, Home ("O que vem agora") e Torneios (cartão de competição).
// Uso: node surfaces.mjs <rótulo> [--reload]
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = process.argv[2] || 'run';
const reload = process.argv.includes('--reload');
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
const go = async (path) => { await p.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(3500); };
const header = () => p.evaluate(() => document.querySelector('[data-header-tournament-shortcut]')?.getAttribute('aria-label') || null);
const home = () => p.evaluate(() => document.querySelector('[data-home-next-commitment]')?.innerText.replace(/\s+/g, ' ').slice(0, 220) || null);
const hub = () => p.evaluate(() => document.querySelector('[data-competition-hero]')?.innerText.replace(/\s+/g, ' ').slice(0, 220) || null);
const steps = [];
if (reload) { await p.reload({ waitUntil: 'networkidle2' }); await sleep(5000); }
await go('/game'); steps.push({ at: 'home', header: await header(), home: await home() });
await go('/tournaments'); await sleep(2000); steps.push({ at: 'torneios', header: await header(), tournaments: await hub() });
await go('/game'); steps.push({ at: 'home-de-volta', header: await header(), home: await home() });
const hrefOk = await p.evaluate(() => document.querySelector('[data-header-tournament-shortcut]')?.getAttribute('href'));
const result = { label, reload, steps, headerHref: hrefOk, errors };
mkdirSync(new URL('../runs/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../runs/${label}.json`, import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
b.disconnect();
