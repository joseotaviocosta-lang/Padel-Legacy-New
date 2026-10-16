// Troca a carreira ativa pelo gerenciador de carreiras (fluxo real da UI).
// Uso: node switch-career.mjs "Smoke 527K"
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = process.argv[2];
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const click = async (re) => { const ok = await p.evaluate((src) => { const rx = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button,a')].filter((e) => e.getClientRects().length).find((e) => rx.test(e.innerText.trim().replace(/\s+/g, ' '))); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, re.source); await sleep(2000); return ok; };
await p.evaluate(() => document.querySelector('[data-quick-action="careers"], [aria-label="Gerenciar carreiras"]')?.click());
await sleep(2500);
await click(/^ver todas as carreiras$/);
console.log('cards:', await p.evaluate(() => [...document.querySelectorAll('button,a')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter((t) => /Smoke|carreira|Abrir|Continuar|Carregar/i.test(t)).slice(0, 25)));
// Abre o cartão cujo texto contém o alvo (botão "Abrir"/"Continuar" dentro dele ou o próprio cartão).
const opened = await p.evaluate((name) => {
  const nodes = [...document.querySelectorAll('article, li, [data-career-card], div')].filter((e) => e.getClientRects().length && e.innerText.includes(name) && e.innerText.length < 600);
  const card = nodes.sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!card) return 'card não encontrado';
  const btn = [...card.querySelectorAll('button,a')].find((e) => /abrir|continuar|carregar|jogar/i.test(e.innerText));
  (btn || card).click();
  return btn ? `clicou ${btn.innerText.trim()}` : 'clicou cartão';
}, target);
console.log(opened);
await sleep(6000);
console.log(await p.evaluate(() => ({ url: location.pathname, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300) })));
b.disconnect();
