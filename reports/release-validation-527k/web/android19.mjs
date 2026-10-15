import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep, errors } = await attach();
const { tap } = mobile(page, sleep, state, shot);
await tap(/^Fechar$/, 2000);
const full = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const t0 = Date.now(); let hit = null;
while (Date.now() - t0 < 180000) {
  const t = await full();
  const m = t.match(/(VOCÊ ESTÁ DISPUTANDO[^]{0,140}|EM TORNEIO[^]{0,80}|Quartas de Final · [^]{0,80}vs [^]{0,60})/i);
  if (m) { hit = m[0]; break; }
  await sleep(5000);
}
await shot('a19');
const t = await full();
console.log(JSON.stringify({ waitedMs: Date.now() - t0, hit, roma: (t.match(/Roma Pré-Temporada PRÉ-TEMPORADA[^]{0,220}/i) || [])[0], errors }, null, 1));
browser.disconnect();
