// Cria a carreira de teste "Smoke 530B2 — pode apagar" pelo fluxo real da UI.
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const click = async (re) => { const ok = await p.evaluate((src) => { const rx = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button,a')].filter((e) => e.getClientRects().length).find((e) => rx.test(e.innerText.trim())); if (el) { el.click(); return true; } return false; }, re.source); await sleep(1800); return ok; };
const step = process.argv[2] || 'open';
if (step === 'open') { console.log(await click(/^nova carreira$/)); }
if (step === 'fill') {
  await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find((x) => x.getClientRects().length); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Smoke 530B2 — pode apagar'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(500);
}
if (step === 'create') { console.log(await click(new RegExp(process.argv[3] || '^(criar carreira|começar|iniciar carreira|criar)$'))); await sleep(6000); }
console.log(await p.evaluate(() => ({ url: location.pathname, inputs: [...document.querySelectorAll('input,select')].filter((e) => e.getClientRects().length).map((e) => `${e.type}:${e.placeholder || e.name}:${e.value}`), buttons: [...document.querySelectorAll('button')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 30), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600) })));
b.disconnect();
