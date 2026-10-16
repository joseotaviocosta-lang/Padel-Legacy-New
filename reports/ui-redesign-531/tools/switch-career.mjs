// Troca a carreira ativa pelo gerenciador (fluxo real da UI): sobe a partir
// do texto com o nome até o contêiner que tem o botão "Continuar"/"Abrir".
// Uso: node switch-career.mjs "Smoke 527K"
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = process.argv[2];
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
await p.evaluate(() => { history.pushState({}, '', '/careers'); dispatchEvent(new PopStateEvent('popstate')); });
await sleep(3000);
await p.evaluate(() => [...document.querySelectorAll('button,a')].find((e) => /ver todas as carreiras/i.test(e.innerText))?.click());
await sleep(2500);
const result = await p.evaluate((name) => {
  const leaf = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.getClientRects().length && e.textContent.includes(name));
  if (!leaf) return 'nome não encontrado';
  for (let el = leaf; el; el = el.parentElement) {
    const btn = [...el.querySelectorAll('button,a')].find((x) => /^(continuar|abrir|carregar|jogar)/i.test(x.innerText.trim()));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return `clicou "${btn.innerText.trim()}" no cartão de ${name}`; }
  }
  return 'botão não encontrado';
}, target);
console.log(result);
await sleep(7000);
console.log(await p.evaluate(() => ({ url: location.pathname, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260) })));
b.disconnect();
