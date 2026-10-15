import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
await page.goto('http://127.0.0.1:5174/careers', { waitUntil: 'networkidle2' }); await sleep(2500);
await clickText('Continuar carreira'); await sleep(4000);
await page.goto('http://127.0.0.1:5174/tournaments', { waitUntil: 'networkidle2' }); await sleep(3500);
const full = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const roma = (await full()).match(/Roma Pré-Temporada PRÉ-TEMPORADA[^]{0,160}/)?.[0];
console.log('Roma card (fix "Não participante"):', roma);
// Inscreve em Londres (29/01) e avança SEM sair de /tournaments.
const reg = await page.evaluate(() => { const card = [...document.querySelectorAll('*')].find((e) => e.children.length > 2 && /Londres Challenge/.test(e.innerText) && /Inscrever/.test(e.innerText) && e.innerText.length < 600); const b = card && [...card.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Inscrever'); if (b) { b.click(); return true; } return false; });
await sleep(2000); await clickText('Confirmar inscrição'); await sleep(3000);
console.log('inscrito Londres', reg, /Londres Challenge[^]{0,120}INSCRITO|INSCRITO[^]{0,40}Londres/.test(await full()));
const dateOf = async () => ((await full()).match(/\b(\d{2}\/\d{2}\/2026)\b/) || [])[1];
for (let i = 0; i < 25; i++) {
  const d = await dateOf();
  const has = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && b.innerText.trim() === 'Ir para o torneio'));
  if (has) break;
  await clickText('Avançar'); await sleep(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continuar'); b?.click(); }); await sleep(800);
  if (i % 5 === 0) console.log('dia', d, 'url', (await state()).url);
}
console.log('data', await dateOf(), 'url', (await state()).url);
const ir = await clickText('Ir para o torneio'); await sleep(4000);
const t = await full();
console.log('ir', ir, 'resultado:', (t.match(/(VOCÊ ESTÁ DISPUTANDO[^]{0,140}|Aguardando sorteio[^]{0,40}|PLANO TÁTICO[^]{0,40}|Reunião pré-torneio[^]{0,40})/i) || [])[0]);
await shot('t13-londres'); console.log('errors', JSON.stringify(errors.filter((e) => !e.includes('[CareerDayAdvance]'))));
browser.disconnect();
