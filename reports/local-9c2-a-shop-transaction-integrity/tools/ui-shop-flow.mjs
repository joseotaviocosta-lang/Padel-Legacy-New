// LOCAL-9C.2-A-R1 — teste funcional da Loja e do Inventário no CHROME REAL.
//
// puppeteer-core dirige o Chrome instalado (scripts/lib/visualAuditDriver.mjs)
// contra um Vite dev server local, com o shim de storage do Tauri injetado
// pelo driver e perfil de navegador TEMPORÁRIO: a carreira é criada pela UI e
// vive só no localStorage desse perfil. Nenhum save real é lido ou gravado.
//
// Cliques reais nos componentes (cards, modal, botões). A fixture (saldo,
// requisitos, estoque, data) é ajustada pela API do próprio app, importada na
// página (mesmo módulo /src/api/localGameClient.js), sempre seguida de recarga.
//
// Uso: node node_modules/vite/bin/vite.js --port 5233 --strictPort --host 127.0.0.1   (outro terminal)
//      PL_AUDIT_BASE=http://127.0.0.1:5233 node reports/local-9c2-a-shop-transaction-integrity/tools/ui-shop-flow.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL_AUDIT_BASE = process.env.PL_AUDIT_BASE || 'http://127.0.0.1:5233';
const { launch, goto, openCareer, dismissOverlays } = await import('../../../scripts/lib/auditSession.mjs');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(OUT, 'ui');
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generatedBy: 'LOCAL-9C.2-A-R1 ui-shop-flow (Chrome real, puppeteer-core)', base: process.env.PL_AUDIT_BASE, viewport: '390x844 mobile', checks: [], steps: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail != null ? ` · ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };

const browser = await launch();
const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

// ── utilitários na página ───────────────────────────────────────────────────
async function api(fn, arg = null) {
  return page.evaluate(async (src, a) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const T = await import('/src/game-core/shopTransactions.js');
    const EM = await import('/src/lib/equipmentModifiers.js');
    // eslint-disable-next-line no-new-func
    return new Function('localGame', 'T', 'EM', 'a', `return (async () => { ${src} })();`)(localGame, T, EM, a);
  }, fn, arg);
}
const state = () => api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  const inv = await localGame.entities.PlayerInventory.filter({ profile_id: p.id });
  const led = (await localGame.entities.FinancialTransaction.filter({ profile_id: p.id })).filter((t) => t.category === 'loja');
  const shopItems = await localGame.entities.ShopItem.list();
  const mods = EM.computeEquipmentModifiers(inv, shopItems);
  return { id: p.id, coins: p.coins, date: p.career_date, attrs: { forehand: p.forehand, serve: p.serve, volley: p.volley },
    inv: inv.map((r) => ({ id: r.id, item: r.item_name, equipped: !!r.equipped })).sort((x, y) => x.id.localeCompare(y.id)),
    ledger: led.map((t) => ({ id: t.id, type: t.type, amount: t.amount, date: t.date })).sort((x, y) => x.id.localeCompare(y.id)),
    mods: Object.fromEntries(Object.entries(mods).filter(([, v]) => v)) };
`);
const itemByName = (name) => api(`const i = (await localGame.entities.ShopItem.list()).find((x) => x.name === a); return i ? { id: i.id, price: i.price } : null;`, name);
async function openTab(tab) {
  await goto(page, `/career/training?tab=${tab}`, { settle: 2500 });
  for (let i = 0; i < 15; i += 1) {
    const ready = await page.evaluate((t) => (t === 'shop' ? /itens encontrados/.test(document.body.innerText) : /Itens possuídos|Nenhum item|Inventário vazio/i.test(document.body.innerText)), tab);
    if (ready) break;
    await wait(1000);
  }
  await dismissOverlays(page);
}
// Observador de textos (toasts, "Comprando", estados) instalado antes de cada ação.
const watch = () => page.evaluate(() => {
  window.__seen = [];
  window.__obs?.disconnect();
  window.__obs = new MutationObserver(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const btn = dlg && [...dlg.querySelectorAll('button')].find((b) => /Comprando/.test(b.textContent || ''));
    if (btn) window.__seen.push(`pending:${btn.disabled ? 'disabled' : 'enabled'}`);
    // Toast (components/ui/toaster.jsx): div com o botão "Fechar notificação".
    for (const close of document.querySelectorAll('button[aria-label="Fechar notificação"]')) {
      const t = (close.parentElement?.textContent || '').trim(); if (t && t.length < 300) window.__seen.push(`toast:${t}`);
    }
  });
  window.__obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
});
const seen = () => page.evaluate(() => [...new Set(window.__seen || [])]);
const cardOf = (name) => page.evaluate((n) => { const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n); return h ? (h.closest('button')?.textContent || '').slice(0, 200) : null; }, name);
async function search(text) {
  await page.evaluate((t) => {
    const input = document.querySelector('input[placeholder="Buscar equipamento..."]'); if (!input) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, t);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await wait(800);
}
async function openItem(name) {
  if (!(await cardOf(name))) await search(name); // fora da 1ª página (24 itens)
  const ok = await page.evaluate((n) => {
    const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n);
    const card = h?.closest('button'); if (!card) return false; card.click(); return true;
  }, name);
  await wait(900);
  return ok;
}
// Botão de compra do modal: o único botão primário do diálogo com preço/Comprando/Bloqueado.
const modalBuy = () => page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]'); if (!dlg) return { modal: false };
  const owned = /✓ Adquirido/.test(dlg.textContent || '');
  const b = [...dlg.querySelectorAll('button')].find((x) => /^\s*[\d.]+\s*([\d.]+)?\s*$/.test(x.textContent || '') || /Comprando|Bloqueado/.test(x.textContent || ''));
  // Preço atual = texto próprio do botão; o preço riscado (desconto) fica num span à parte.
  const price = b ? Number([...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').replace(/\D/g, '')) || null : null;
  return { modal: true, owned, found: !!b, text: b ? (b.textContent || '').trim() : null, price, disabled: b ? b.disabled : null };
});
async function clickBuy(times = 1) {
  return page.evaluate((n) => {
    const dlg = document.querySelector('[role="dialog"]');
    const b = dlg && [...dlg.querySelectorAll('button')].find((x) => /^\s*[\d.]+\s*([\d.]+)?\s*$/.test(x.textContent || ''));
    if (!b) return false;
    for (let i = 0; i < n; i += 1) b.click(); // n cliques no MESMO tick, antes do re-render
    return true;
  }, times);
}
async function clickCardButton(name, re, { click = true } = {}) {
  return page.evaluate((n, src, doClick) => {
    const rx = new RegExp(src);
    const buttons = [...document.querySelectorAll('button')].filter((b) => rx.test((b.getAttribute('title') || '') + ' ' + (b.textContent || '')));
    for (const b of buttons) {
      let el = b;
      for (let i = 0; i < 8 && el; i += 1) {
        el = el.parentElement;
        if (!el) break;
        const inside = [...el.querySelectorAll('button')].filter((x) => rx.test((x.getAttribute('title') || '') + ' ' + (x.textContent || '')));
        if (inside.length > 1) break;
        if ((el.textContent || '').includes(n)) { if (doClick) b.click(); return doClick ? true : (b.getAttribute('title') || (b.textContent || '').trim()); }
      }
    }
    return false;
  }, name, re.source, click);
}
const shot = (name) => page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
const bodyHas = (text) => page.evaluate((t) => document.body.innerText.includes(t), text);
const fmt = (n) => Number(n).toLocaleString('pt-BR');

// ── fixture inicial ───────────────────────────────────────────────────────
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 5000 });`);
await openTab('shop');
const s0 = await state();
report.steps.start = { coins: s0.coins, date: s0.date, inventory: s0.inv.length };

// 1–3. Comprar item disponível: débito e entrega.
const GRIP = 'Tour Grip Dry Start';
await watch();
await openItem(GRIP);
const before1 = await modalBuy();
await shot('01-modal-grip');
await clickBuy(1);
await wait(2500);
const seen1 = await seen();
const s1 = await state();
const row1 = s1.inv.find((r) => r.item === GRIP);
const led1 = s1.ledger.find((t) => t.id.startsWith('shop-purchase-ui-'));
const price1 = before1.price;
report.steps.buy = { modalButton: before1, price: price1, coins: [s0.coins, s1.coins], row: row1, ledger: led1, seen: seen1.slice(0, 12) };
check('1. compra pelo modal conclui (toast "Compra realizada!", modal fecha)', seen1.some((t) => /^toast:Compra realizada!/.test(t)) && !(await modalBuy()).modal, report.steps.buy);
check('2. débito = preço exibido no botão do modal; saldo do topo atualizado', s0.coins - s1.coins === price1 && (await bodyHas(fmt(s1.coins))), { coins: [s0.coins, s1.coins], price1 });
check('3. entregue ao inventário (linha inventory-shop-ui-…) e 1 linha de extrato com o mesmo valor', row1 && row1.id.startsWith('inventory-shop-ui-') && led1?.amount === price1 && s1.ledger.length === s0.ledger.length + 1, { row1, led1 });
check('pendente: botão mostra "Comprando" desabilitado durante a operação', seen1.includes('pending:disabled'), seen1.slice(0, 8));
const cardOwned = await page.evaluate((n) => { const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n); return /Adquirido/.test(h?.closest('button')?.textContent || ''); }, GRIP);
check('card passa a mostrar "Adquirido" sem recarregar', cardOwned);
await shot('02-shop-after-buy');

// 6. Item já possuído: a UI não oferece compra; tela desatualizada → domínio recusa.
await openItem(GRIP);
const ownedModal = await modalBuy();
check('6a. item possuído: modal mostra "✓ Adquirido" e nenhum botão de compra', ownedModal.owned && !ownedModal.found, ownedModal);
await page.keyboard.press('Escape'); await wait(500);
const SHOE = 'Tênis Court Pro';
await openTab('shop');
await watch();
await openItem(SHOE);
// Outra aba/fluxo compra o mesmo item depois que esta tela carregou.
const shoeId = (await itemByName(SHOE)).id;
const other = await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; return T.purchaseShopItem(p.id, a, { operationId: 'outra-aba' });`, shoeId);
const before6 = await state();
await clickBuy(1); await wait(2000);
const seen6 = await seen(); const after6 = await state();
report.steps.alreadyOwnedStale = { otherTab: other.code, seen: seen6.slice(0, 10), coins: [before6.coins, after6.coins] };
check('6b. tela desatualizada tenta comprar item já comprado em outro fluxo → "Item já adquirido", sem débito nem 2ª unidade', other.ok && seen6.some((t) => /^toast:Item já adquirido/.test(t)) && after6.coins === before6.coins && after6.inv.filter((r) => r.item === SHOE).length === 1, report.steps.alreadyOwnedStale);
await page.keyboard.press('Escape'); await wait(400);

// 7. Sem dinheiro.
const BALL = 'Padel Start Training x3';
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 10 });`);
await openTab('shop');
await openItem(BALL);
const poor = await modalBuy();
check('7a. sem saldo: botão do modal desabilitado (cadeado + preço)', poor.found === false ? false : poor.disabled === true, poor);
await shot('03-no-money');
await page.keyboard.press('Escape'); await wait(400);
// Tela carregada com saldo; o saldo cai em outro fluxo antes do clique.
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 5000 });`);
await openTab('shop');
await watch();
await openItem(BALL);
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 5 });`);
const before7 = await state();
await clickBuy(1); await wait(2000);
const seen7 = await seen(); const after7 = await state();
report.steps.noMoneyStale = { seen: seen7.slice(0, 10), coins: [before7.coins, after7.coins], rows: after7.inv.filter((r) => r.item === BALL).length };
check('7b. saldo gasto em outro fluxo depois de abrir a tela → "Moedas insuficientes" do domínio; saldo não fica negativo', seen7.some((t) => /^toast:Moedas insuficientes/.test(t)) && after7.coins === 5 && report.steps.noMoneyStale.rows === 0, report.steps.noMoneyStale);
await page.keyboard.press('Escape'); await wait(400);

// 8. Sem estoque (relíquia, mês em que está na rotação).
const relic = await api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  const { getEquipmentMarketState } = await import('/src/lib/sportsEconomyV26.js');
  const { normalizeShopItem } = await import('/src/lib/storeCatalog.js');
  const items = (await localGame.entities.ShopItem.list()).filter((i) => String(i.id).startsWith('historical-relic-'));
  const months = Array.from({ length: 36 }, (_, i) => (2026 + Math.floor(i / 12)) + '-' + String((i % 12) + 1).padStart(2, '0') + '-15');
  for (const raw of items) {
    const it = normalizeShopItem(raw);
    const m = months.find((d) => getEquipmentMarketState(it, { career_date: d }).available);
    if (!m) continue;
    const h = (await localGame.entities.MarketPriceHistory.filter({ item_id: it.id }))[0];
    await localGame.entities.MarketPriceHistory.update(h.id, { stock_remaining: 0 });
    await localGame.entities.PlayerProfile.update(p.id, { coins: 2000000, xp: 50000000, career_level: 50, ranking_position: 5, reputation: 95, career_date: m });
    return { id: it.id, name: it.name, month: m };
  }
  return null;
`);
await openTab('shop');
await watch();
await search(relic?.name);
const relicCard = await cardOf(relic?.name);
await openItem(relic?.name);
const relicModal = await modalBuy();
await shot('04-relic-zero-stock');
const before8 = await state();
await clickBuy(1); await wait(2500);
const seen8 = await seen(); const after8 = await state();
const stock8 = await api(`return (await localGame.entities.MarketPriceHistory.filter({ item_id: a }))[0]?.stock_remaining;`, relic?.id);
report.steps.zeroStock = { relic, card: relicCard, modal: relicModal, seen: seen8.slice(0, 10), coins: [before8.coins, after8.coins], stockAfter: stock8 };
check('8. relíquia com estoque 0 → "Item esgotado", sem débito, sem entrega, estoque 0', seen8.some((t) => /^toast:Item esgotado/.test(t)) && after8.coins === before8.coins && !after8.inv.some((r) => r.id.includes(relic?.id)) && stock8 === 0, report.steps.zeroStock);
check('8 (observação de UX): o card mostra "0 restam" mas o botão do modal continua habilitado — a proteção é do domínio', /0 restam/.test(relicCard || '') && relicModal.disabled === false, { relicCard, relicModal });
await page.keyboard.press('Escape'); await wait(400);

// 9. Dois cliques rápidos (mesmo tick, antes do re-render).
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 5000, career_date: '2026-01-01', xp: 0, career_level: 1, ranking_position: 9999, reputation: 0 });`);
const BAG = 'Mochila Tour';
await openTab('shop');
await watch();
await openItem(BAG);
const before9 = await state();
await clickBuy(2); await wait(3000);
const seen9 = await seen(); const after9 = await state();
const bagRows = after9.inv.filter((r) => r.item === BAG);
const bagLedger = after9.ledger.filter((t) => !before9.ledger.some((x) => x.id === t.id));
report.steps.doubleClick = { coins: [before9.coins, after9.coins], rows: bagRows, ledger: bagLedger, seen: seen9.slice(0, 10) };
check('9. dois cliques rápidos → 1 unidade, 1 débito, 1 linha de extrato, 1 toast de sucesso', bagRows.length === 1 && bagLedger.length === 1 && before9.coins - after9.coins === bagLedger[0].amount && seen9.filter((t) => /^toast:Compra realizada!/.test(t)).length === 1, report.steps.doubleClick);

// 4–5. Equipar o item comprado; bônus efetivos.
await openTab('inventory');
await watch();
const eq = await clickCardButton(GRIP, /^Equipar$|Equipar/);
await wait(2000);
const s4 = await state();
const gripRow = s4.inv.find((r) => r.item === GRIP);
const gripBonus = await api(`const i = (await localGame.entities.ShopItem.list()).find((x) => x.name === a); return EM.sanitizeBonus(i.attribute_bonus);`, GRIP);
report.steps.equip = { clicked: eq, row: gripRow, mods: s4.mods, catalogBonus: gripBonus, attrs: s4.attrs };
check('4. item comprado equipa pelo botão do Inventário', eq && gripRow?.equipped === true, report.steps.equip);
check('5. bônus efetivo = bônus do catálogo (9B); atributo natural intacto', JSON.stringify(s4.mods) === JSON.stringify(Object.fromEntries(Object.entries(gripBonus).filter(([, v]) => v))) && s4.attrs.forehand === s0.attrs.forehand, report.steps.equip);
await shot('05-inventory-equipped');

// 10–12. Vender item permitido (não equipado).
const resale = await api(`const i = (await localGame.entities.ShopItem.list()).find((x) => x.name === a); return T.computeResalePrice(i);`, BAG);
const shownSell = await clickCardButton(BAG, /^Vender por/, { click: false });
// Card do item: menor ancestral do nome que contém o botão Equipar/Desequipar.
const equippedHasSell = await page.evaluate((n) => {
  const label = [...document.querySelectorAll('h3, h4, p, span, div')].find((x) => x.children.length === 0 && (x.textContent || '').trim() === n);
  let el = label;
  while (el && ![...el.querySelectorAll('button')].some((b) => /^(Equipar|Desequipar)$/.test((b.textContent || '').trim()))) el = el.parentElement;
  return el ? Boolean(el.querySelector('button[title^="Vender por"]')) : 'card-nao-encontrado';
}, GRIP);
const before10 = await state();
await watch();
const sold = await clickCardButton(BAG, /^Vender por/);
await wait(2500);
const seen10 = await seen(); const after10 = await state();
report.steps.sell = { clicked: sold, shownTitle: shownSell, resale, coins: [before10.coins, after10.coins], seen: seen10.slice(0, 8), equippedHasSellButton: equippedHasSell };
check('10. venda pelo botão do Inventário conclui ("Item vendido!")', sold && seen10.some((t) => /^toast:Item vendido!/.test(t)), report.steps.sell);
check('11. unidade removida do inventário (dados e tela)', !after10.inv.some((r) => r.item === BAG) && !(await page.evaluate((n) => [...document.querySelectorAll('h3, h4, p, span')].some((x) => (x.textContent || '').trim() === n), BAG)), after10.inv.map((r) => r.item));
check('12. crédito = revenda exibida no botão (30% do preço gravado) + 1 linha de extrato', after10.coins - before10.coins === resale && shownSell === `Vender por ${resale} moedas` && after10.ledger.length === before10.ledger.length + 1, report.steps.sell);
check('item equipado não oferece venda (regra atual)', equippedHasSell === false, { equippedHasSell });

// 13–14. Recarregar a aplicação e confirmar persistência.
const beforeReload = await state();
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(4000);
await openTab('inventory');
const afterReload = await state();
const invText = await page.evaluate(() => document.body.innerText);
report.steps.reload = { before: beforeReload, after: afterReload };
check('13–14. após recarregar: saldo, inventário, item equipado, bônus e extrato idênticos', JSON.stringify(beforeReload) === JSON.stringify(afterReload) && invText.includes(GRIP) && !invText.includes(BAG), { before: beforeReload, after: afterReload });
await shot('06-after-reload');

report.consoleErrors = consoleErrors.slice(0, 20);
report.pageErrors = page.__errors || [];
check('sem erros de página (pageerror)', (page.__errors || []).length === 0, page.__errors);
await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
writeFileSync(resolve(OUT, 'ui-flow.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
