// Fase 5.30 — validação funcional da Home com CLIQUES REAIS (page.mouse),
// 390px, na carreira ativa (rótulo --state). Nada é gravado: inscrição é
// aberta e FECHADA sem confirmar; demais ações são só navegação.
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const STATE = args.state || 'default';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('5174'));
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Volta à Home como o jogador: fecha modal aberto (Esc) e toca em "Início" na navegação.
const goHome = async (first = false) => {
  if (first) { await page.evaluate(() => { history.pushState({}, '', '/game'); dispatchEvent(new PopStateEvent('popstate')); }); await sleep(3500); return; }
  for (let i = 0; i < 2; i += 1) { if (await page.evaluate(() => Boolean(document.querySelector('[data-app-modal]')))) { await page.keyboard.press('Escape'); await sleep(700); } }
  const r = await page.evaluate(() => { const a = [...document.querySelectorAll('a, button')].find((e) => e.getClientRects().length && e.getBoundingClientRect().bottom <= window.innerHeight && e.getBoundingClientRect().top >= 0 && (/^Início/i.test((e.innerText || '').trim()) || e.getAttribute('href') === '/game')); if (!a) return null; const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  if (r) await page.mouse.click(r.x, r.y);
  await sleep(3500);
};
const path = () => page.evaluate(() => location.pathname + location.search);
async function realClick(selector) {
  const box = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); return true; }, selector);
  if (!box) return false;
  await sleep(400);
  const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, selector);
  await page.mouse.click(r.x, r.y);
  await sleep(2200);
  return true;
}
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

await goHome(true);
const blocks = await page.evaluate(() => ['[data-home-status]', '[data-home-next-commitment]', '[data-home-priorities]', '[data-home-agenda]', '[data-home-progress]', '[data-home-quick-actions]'].map((s) => Boolean(document.querySelector(s))));
check('Home: os 6 blocos da nova hierarquia renderizam', blocks.every(Boolean), JSON.stringify(blocks));
const order = await page.evaluate(() => ['[data-home-status]', '[data-home-next-commitment]', '[data-home-priorities]', '[data-home-agenda]'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
check('Home: ordem status → próximo compromisso → prioridades → agenda', order.every((y, i) => i === 0 || y > order[i - 1]), order.map(Math.round).join(' < '));
const primaries = await page.evaluate(() => [...document.querySelectorAll('main .pl-game-primary')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
check('Home: exatamente 1 CTA primário', primaries.length === 1, primaries.join(' | '));
const t = await text();
if (STATE === 'nova') {
  check('Sem parceiro: status mostra "Sem parceiro"', /Sem parceiro/i.test(t));
  check('Sem compromisso: bloco mostra estado útil (agenda livre ou oportunidade)', /Nenhum torneio imediato|Próxima oportunidade/i.test(t));
}
if (STATE === 'torneio') check('Com torneio: bloco mostra o torneio comprometido', /Seu próximo torneio/i.test(t));

// CTA primário do compromisso
const ctaHref = await page.evaluate(() => document.querySelector('[data-home-next-commitment] .pl-game-primary')?.getAttribute('href'));
if (ctaHref) {
  await realClick('[data-home-next-commitment] .pl-game-primary');
  check('CTA do próximo compromisso navega para o destino', (await path()).startsWith(ctaHref.split('?')[0]), `${ctaHref} → ${await path()}`);
  await goHome();
  let homeBack = false; const t0 = Date.now(); for (let i = 0; i < 15 && !homeBack; i += 1) { homeBack = (await path()) === '/game' && await page.evaluate(() => Boolean(document.querySelector('[data-home-status]'))); if (!homeBack) await sleep(1000); }
  check('Retorno à Home', homeBack, `${Math.round((Date.now() - t0) / 1000)}s · ${await path()} status=${await page.evaluate(() => Boolean(document.querySelector('[data-home-status]')))} skeleton=${await page.evaluate(() => Boolean(document.querySelector('[data-page-skeleton], .animate-pulse')))}`);
}
// Ação secundária do compromisso
const secHref = await page.evaluate(() => [...document.querySelectorAll('[data-home-next-commitment] a')].find((a) => !a.classList.contains('pl-game-primary'))?.getAttribute('href'));
if (secHref) {
  await realClick('[data-home-next-commitment] a:not(.pl-game-primary)');
  check('Ação secundária do compromisso navega', (await path()).startsWith(secHref.split('?')[0]), `${secHref} → ${await path()}`);
  await goHome();
}
// Ação rápida
await realClick('[data-home-quick-actions] a');
check('Ação rápida (Treinar) abre o Centro de Treinamento', (await path()).startsWith('/game/training-center'), await path());
await goHome();
// Item da agenda (link de detalhes) ou inscrição (abre e fecha sem confirmar)
const agendaLink = await page.evaluate(() => Boolean(document.querySelector('[data-home-agenda] li a')));
if (agendaLink) {
  await realClick('[data-home-agenda] li a');
  check('Item da agenda abre o torneio', (await path()).startsWith('/tournaments'), await path());
  await goHome();
}
const agendaRegister = await page.evaluate(() => Boolean(document.querySelector('[data-home-agenda] li button')));
if (agendaRegister) {
  await realClick('[data-home-agenda] li button');
  const modal = await page.evaluate(() => Boolean(document.querySelector('[data-app-modal], [role=dialog]')));
  check('Inscrever-se (agenda) abre o modal canônico de inscrição', modal);
  await page.keyboard.press('Escape'); await sleep(800);
  await page.evaluate(() => document.querySelector('[data-app-modal] .pl-modal-close, [role=dialog] [aria-label="Fechar"]')?.click()); await sleep(800);
  check('Modal fechado sem inscrever', !(await page.evaluate(() => Boolean(document.querySelector('[data-app-modal], [role=dialog]')))));
}
// Prioridade (se houver)
const priority = await page.evaluate(() => Boolean(document.querySelector('[data-home-priorities] li a')));
if (priority) {
  await realClick('[data-home-priorities] li a');
  check('Prioridade navega para o destino', (await path()) !== '/game', await path());
  await goHome();
} else {
  check('Prioridades: estado vazio "Tudo em dia" (tutorial em andamento suprime a lista — regra existente)', /Tudo em dia/i.test(await text()));
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
check('Sem erro de JavaScript', errors.length === 0, errors.join(' | '));

const out = 'reports/ui-redesign-530/functional.json';
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { runs: [] };
prev.runs = prev.runs.filter((r) => r.state !== STATE).concat([{ state: STATE, createdAt: new Date().toISOString(), viewport: '390x844', passed: checks.filter((c) => c.ok).length, total: checks.length, checks, errors }]);
writeFileSync(out, JSON.stringify(prev, null, 2));
console.log(`${STATE}: ${checks.filter((c) => c.ok).length}/${checks.length}`);
browser.disconnect();
