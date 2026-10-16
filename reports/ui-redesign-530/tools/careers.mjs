// Abre o gerenciador de carreiras e lista o que está na tela (sem alterar nada).
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
await p.evaluate(() => document.querySelector('[data-quick-action="careers"], [aria-label="Gerenciar carreiras"]')?.click());
await sleep(2500);
console.log(await p.evaluate(() => ({ url: location.pathname, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2500) })));
b.disconnect();
