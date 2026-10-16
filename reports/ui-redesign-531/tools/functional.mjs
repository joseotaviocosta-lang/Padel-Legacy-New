// Fase 5.31 — roteiro funcional com CLIQUES REAIS (mouse) a 390×844, só
// leitura/navegação: abas, filtros, abrir/fechar proposta, comparar,
// expandir candidato, filtros e modal do técnico, abas/mercado da comissão,
// voltar para a Home. Nunca toca em Aceitar/Recusar/Contratar/Demitir/
// Renovar/Encerrar/Convidar.
// Uso: node functional.mjs <estado>
import puppeteer from 'puppeteer-core';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const STATE = process.argv[2] || 'default';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const p = (await b.pages()).find((x) => x.url().includes('5174'));
const cdp = await p.createCDPSession();
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const FORBIDDEN = /aceitar|recusar|contratar treinador|contratar por|confirmar|demitir|renovar 12|renovar parceria|encerrar|rescis|convidar|melhorar por|arquivar/i;
const steps = [];
const go = async (path) => { await p.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path); await sleep(3500); };
const has = (fn, arg) => p.evaluate(fn, arg);
async function tap(re, { scope = 'body', exact = false } = {}) {
  const found = await p.evaluate((src, sc, ex, forbidden) => {
    const rx = new RegExp(ex ? `^${src}$` : src, 'i'); const fx = new RegExp(forbidden, 'i');
    const el = [...document.querySelector(sc).querySelectorAll('button, a, [role=tab]')].filter((e) => e.getClientRects().length && !e.disabled)
      .find((e) => rx.test((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (!el) return null;
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    if (fx.test(text)) return { refused: text };
    el.setAttribute('data-fn-target', '1'); el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return { text };
  }, re.source, scope, exact, FORBIDDEN.source);
  if (!found || found.refused) return found;
  await sleep(600);
  const box = await p.evaluate(() => { const el = document.querySelector('[data-fn-target]'); el.removeAttribute('data-fn-target'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(box.x, box.y);
  await sleep(1400);
  return found;
}
async function step(name, run) {
  try { const ok = await run(); steps.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`); }
  catch (error) { steps.push({ name, ok: false, error: String(error.message).slice(0, 160) }); console.log(`FAIL — ${name}: ${error.message}`); }
}
const modalOpen = () => has(() => Boolean([...document.querySelectorAll('[role=dialog]')].find((e) => e.getClientRects().length)));
const mainText = () => has(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '));

// ── Dupla ──
await go('/partners?view=overview');
const hasPartner = await has(() => Boolean(document.querySelector('[data-partner-hero="active"]')));
await step('Dupla abre com o cartão da dupla no topo', async () => has(() => Boolean(document.querySelector('[data-partner-hero]'))));
await step('aba Contrato', async () => (await tap(/^contrato$/, { scope: 'main' })) && /Renovar e renegociar|Sem contrato ativo/.test(await mainText()));
await step('aba Histórico', async () => (await tap(/^hist[oó]rico$/, { scope: 'main' })) && /Sem histórico|partidas/.test(await mainText()));
await step('aba Visão geral', async () => (await tap(/^vis[aã]o geral$/, { scope: 'main' })) && has(() => Boolean(document.querySelector('[data-partner-hero]'))));
if (hasPartner) {
  await step('"Mais sobre a dupla" abre e fecha', async () => { await tap(/^Mais sobre a dupla/, { scope: 'main' }); const open = /Identidade:/.test(await mainText()); await tap(/^Mais sobre a dupla/, { scope: 'main' }); return open && !/Identidade:/.test(await mainText()); });
  // "Encerrar" só ABRE a confirmação (o filtro de segurança do tap recusa a
  // palavra): clique direto no botão exato, depois "cancelar", e a dupla
  // tem de continuar ativa.
  await step('"Encerrar" pede confirmação e "cancelar" desfaz (nada gravado)', async () => {
    await p.evaluate(() => [...document.querySelectorAll('[data-partner-overview] button')].find((b) => b.innerText.trim() === 'Encerrar')?.click()); await sleep(800);
    const asked = /Toque em "Confirmar"/.test(await mainText());
    await p.evaluate(() => [...document.querySelectorAll('[data-partner-overview] button')].find((b) => b.innerText.trim() === 'cancelar')?.click()); await sleep(800);
    return asked && !/Toque em "Confirmar"/.test(await mainText()) && await has(() => Boolean(document.querySelector('[data-partner-hero="active"]')));
  });
} else {
  await step('primário "Analisar propostas" leva às propostas recebidas', async () => { const clicked = await p.evaluate(() => { const el = [...document.querySelectorAll('main button')].find((e) => /Analisar propostas/i.test(e.innerText)); if (!el) return false; el.click(); return true; }); await sleep(1500); return clicked && /Escolha sua dupla/.test(await mainText()); });
}
// ── Mercado ──
await go('/partners?view=offers');
await step('filtro Buscar', async () => (await tap(/^buscar$/, { scope: 'main' })) && has(() => Boolean(document.querySelector('[aria-label="Ordenar candidatos"]'))));
await step('busca: expandir e recolher candidato', async () => {
  await tap(/OVR \d+/, { scope: '[data-partner-candidate="search"]' }).catch(() => null);
  const clicked = await p.evaluate(() => { const btn = document.querySelector('[data-partner-candidate="search"] button[aria-expanded]'); if (!btn) return 'none'; btn.click(); return 'ok'; });
  if (clicked === 'none') return true; // sem candidatos no recorte
  await sleep(800); const open = await has(() => document.querySelector('[data-partner-candidate="search"] button[aria-expanded]')?.getAttribute('aria-expanded') === 'true');
  await p.evaluate(() => document.querySelector('[data-partner-candidate="search"] button[aria-expanded]')?.click()); await sleep(600);
  return open && await has(() => document.querySelector('[data-partner-candidate="search"] button[aria-expanded]')?.getAttribute('aria-expanded') === 'false');
});
await step('busca: trocar lado e ordenação (selects)', async () => { await p.select('[aria-label="Filtrar por lado preferido"]', 'left'); await p.select('[aria-label="Ordenar candidatos"]', 'rating'); await sleep(600); await p.select('[aria-label="Filtrar por lado preferido"]', 'all'); await p.select('[aria-label="Ordenar candidatos"]', 'compat'); return true; });
await step('filtro Caixa de entrada', async () => Boolean(await tap(/^caixa de entrada/, { scope: 'main' })));
await step('filtro Recebidas', async () => Boolean(await tap(/^recebidas/, { scope: 'main' })));
const offerCount = await has(() => document.querySelectorAll('[data-partner-candidate="offer"]').length);
if (offerCount >= 2) {
  await step('abrir proposta 1 (modal) e fechar', async () => { await tap(/^analisar proposta$/, { scope: 'main' }); const open = await modalOpen(); await p.keyboard.press('Escape'); await sleep(800); return open && !(await modalOpen()); });
  await step('navegar para proposta 2 (modal com outro nome)', async () => {
    const names = await has(() => [...document.querySelectorAll('[data-partner-candidate="offer"] h3')].map((h) => h.innerText.trim()));
    await p.evaluate(() => document.querySelectorAll('[data-partner-candidate="offer"]')[1].scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(500);
    const box = await has(() => { const btn = [...document.querySelectorAll('[data-partner-candidate="offer"]')[1].querySelectorAll('button')].find((b) => /Analisar/.test(b.innerText)); const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(box.x, box.y); await sleep(1400);
    const title = await has(() => [...document.querySelectorAll('[role=dialog] h2')].map((h) => h.innerText).join(' '));
    await p.keyboard.press('Escape'); await sleep(800);
    return title.includes(names[1]);
  });
  await step('comparar 2 propostas e fechar a comparação', async () => {
    const boxes = await has(() => [...document.querySelectorAll('[data-partner-candidate="offer"]')].slice(0, 2).map((card) => { const btn = [...card.querySelectorAll('button')].find((b) => /Comparar/.test(b.innerText)); btn.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }));
    for (let i = 0; i < 2; i += 1) {
      await p.evaluate((k) => [...document.querySelectorAll('[data-partner-candidate="offer"]')][k].scrollIntoView({ block: 'center', behavior: 'instant' }), i); await sleep(500);
      const box = await has((k) => { const btn = [...[...document.querySelectorAll('[data-partner-candidate="offer"]')][k].querySelectorAll('button')].find((b) => /Comparar/.test(b.innerText)); const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
      await p.mouse.click(box.x, box.y); await sleep(700);
    }
    const shown = await has(() => Boolean(document.querySelector('[data-partner-comparison]')));
    const noOverflow = await has(() => document.documentElement.scrollWidth <= window.innerWidth);
    await tap(/fechar comparação/i, { scope: 'main' });
    return boxes && shown && noOverflow && !(await has(() => Boolean(document.querySelector('[data-partner-comparison]'))));
  });
}
// ── Treinador ──
await go('/career/team?tab=coach');
await p.waitForFunction(() => /Ver detalhes|Técnico/.test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }).catch(() => {});
await step('Treinador: "Filtros" abre os 3 seletores e muda a situação', async () => { await tap(/^filtros/, { scope: 'main' }); const ok = await has(() => Boolean(document.querySelector('[aria-label="Filtrar situação"]'))); await p.select('[aria-label="Filtrar situação"]', 'all'); await sleep(800); const sections = /Ainda não disponíveis|Disponíveis para você/.test(await mainText()); await p.select('[aria-label="Filtrar situação"]', 'available'); await sleep(600); await tap(/^filtros/, { scope: 'main' }); return ok && sections; });
await step('abrir técnico (Ver detalhes) → modal', async () => (await tap(/^ver detalhes$/, { scope: 'main' })) && modalOpen());
await step('modal: "Perfil completo" expande (Filosofia)', async () => { await tap(/^Perfil completo/, { scope: '[role=dialog]' }); return /Filosofia/.test(await has(() => document.querySelector('[role=dialog]')?.innerText || '')); });
await step('fechar modal do técnico', async () => { await p.keyboard.press('Escape'); await sleep(800); return !(await modalOpen()); });
// ── Comissão ──
await step('aba Comissão', async () => (await tap(/^comiss[aã]o$/, { scope: 'body' })) && /Sua comissão/.test(await mainText()));
await step('vaga livre leva ao Mercado mensal', async () => { const free = await has(() => Boolean(document.querySelector('[data-staff-position="free"]'))); if (!free) return true; await tap(/^Vaga livre/, { scope: 'main' }); return has(() => Boolean(document.querySelector('[data-staff-market]'))); });
await step('Mercado mensal: "Mostrar mais" pagina', async () => { await tap(/^mercado mensal$/, { scope: 'main' }); const before = await has(() => document.querySelectorAll('[data-staff-candidate]').length); const more = await tap(/^Mostrar mais/, { scope: 'main' }); const after = await has(() => document.querySelectorAll('[data-staff-candidate]').length); return !more || after > before; });
await step('filtro de função (select)', async () => { const roles = await has(() => [...document.querySelectorAll('[aria-label="Filtrar função"] option')].map((o) => o.value)); await p.select('[aria-label="Filtrar função"]', roles[1]); await sleep(600); const n = await has(() => document.querySelectorAll('[data-staff-candidate]').length); await p.select('[aria-label="Filtrar função"]', 'all'); return n >= 0; });
await step('aba Minha comissão + "Reunião da comissão" abre', async () => { await tap(/^minha comiss[aã]o$/, { scope: 'main' }); await tap(/^Reunião da comissão/, { scope: 'main' }); return /Reunião da comissão|Clima profissional/.test(await mainText()); });
// ── volta para a Home ──
await step('voltar para a Home pela aba Início', async () => { await tap(/^in[ií]cio$/, { scope: 'body' }); await sleep(1500); return has(() => location.pathname === '/game'); });
await step('0 erro de JS no roteiro', async () => errors.length === 0);

await cdp.send('Emulation.clearDeviceMetricsOverride');
const file = 'reports/ui-redesign-531/functional.json';
const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
prev[STATE] = { hasPartner, offerCount, steps, errors, pass: steps.filter((s) => s.ok).length, total: steps.length, at: new Date().toISOString() };
writeFileSync(file, JSON.stringify(prev, null, 2));
console.log(`${STATE}: ${prev[STATE].pass}/${prev[STATE].total}`);
b.disconnect();
