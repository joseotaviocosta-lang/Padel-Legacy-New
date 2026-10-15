import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep } = await attach();
const { tap } = mobile(page, sleep, state, shot);
const full = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
await tap(/^Fechar$/, 1000);
await tap(/^Competir$/, 4000); await tap(/^Torneios$/, 4000);
let roma = null; for (let i = 0; i < 20 && !roma; i++) { roma = ((await full()).match(/Roma Pré-Temporada PRÉ-TEMPORADA[^]{0,120}/i) || [])[0] || null; if (!roma) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Passados'); b?.click(); }); await sleep(3000); } }
await shot('a24-roma');
console.log(JSON.stringify({ roma }, null, 1));
browser.disconnect();
