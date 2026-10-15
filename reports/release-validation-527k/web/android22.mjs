import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep } = await attach();
const { tap } = mobile(page, sleep, state, shot);
const full = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const snap = async () => { const t = await full(); return { url: location?.pathname, date: t.match(/\b\d{2}\/\d{2}\b/)?.[0], coins: t.match(/^\S.*?(\d[\d.]*)\s+\d+\s+RANKING/)?.[1] || t.match(/(\d[\d.]{2,})\s+\d*\s*RANKING/)?.[1], dupla: t.match(/DUPLA\s+([^O]{2,30})OVR/)?.[1]?.trim() }; };
const mode = process.argv[2];
if (mode === 'snap') { console.log(JSON.stringify(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)))); }
if (mode === 'advance') { await tap(/^Avançar$/, 8000); await tap(/^Continuar$/, 2000); console.log(JSON.stringify(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)))); }
void snap; browser.disconnect();
