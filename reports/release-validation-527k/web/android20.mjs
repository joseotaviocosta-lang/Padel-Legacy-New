import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep, errors } = await attach();
const { tap, waitFor } = mobile(page, sleep, state, shot);
const full = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
await tap(/^Fechar$/, 1500);
console.log('início', await tap(/^Início$/, 6000));
console.log('competir', await tap(/^Competir$/, 4000));
console.log('torneios', await tap(/^Torneios$/, 4000));
const t0 = Date.now(); let hit = null;
while (Date.now() - t0 < 120000) { const t = await full(); const m = t.match(/(VOCÊ ESTÁ DISPUTANDO[^]{0,140}|EM TORNEIO[^]{0,80})/i); if (m) { hit = m[0]; break; } await sleep(4000); }
await shot('a20');
console.log(JSON.stringify({ ms: Date.now() - t0, hit, errors }, null, 1));
browser.disconnect();
