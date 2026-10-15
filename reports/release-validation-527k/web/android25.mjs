import { attach } from './attach.mjs';
const { browser, page, sleep, shot } = await attach();
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Passados'); b?.click(); }); await sleep(5000);
const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
await shot('a25-passados');
console.log(JSON.stringify({ roma: (t.match(/Roma Pré-Temporada[^]{0,180}/gi) || []).slice(0, 2) }, null, 1));
browser.disconnect();
