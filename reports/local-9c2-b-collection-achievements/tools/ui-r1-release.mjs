// LOCAL-9C.2-B-R1 — liberação das recompensas de coleção no CHROME REAL.
//
// puppeteer-core + Chrome instalado (scripts/lib/visualAuditDriver.mjs), perfil
// temporário, shim de storage do Tauri: carreira criada pela UI, nenhum save
// real. Liberação no padrão do código (ligada após a R1). Compra pelo modal da
// Loja e venda pelo botão do Inventário (cliques reais); fechamento do dia pela
// etapa real do jogo (achievementLifecycle.processAchievementsDay).
//
//   1 progresso após compra · 2 conclusão legítima · 3 crédito · 4 recarga ·
//   5 sem pagamento duplicado · 6 save legado reconciliado sem pagamento ·
//   7 venda e recompra sem nova recompensa
//
// Uso: node node_modules/vite/bin/vite.js --port 5233 --strictPort --host 127.0.0.1   (outro terminal)
//      PL_AUDIT_BASE=http://127.0.0.1:5233 node reports/local-9c2-b-collection-achievements/tools/ui-r1-release.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL_AUDIT_BASE = process.env.PL_AUDIT_BASE || 'http://127.0.0.1:5233';
const { launch, goto, openCareer, dismissOverlays } = await import('../../../scripts/lib/auditSession.mjs');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(OUT, 'ui');
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generatedBy: 'LOCAL-9C.2-B-R1 ui-r1-release (Chrome real)', checks: [], steps: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail != null ? ` · ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };
const LEGEND = 'Padel Start Control One Legend';
const MIDAS = 'achv-toque-de-midas';
const ALLCAT = 'achv-pau-para-toda-obra';

const browser = await launch();
const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
async function api(src, a = null) {
  return page.evaluate(async (code, arg) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const life = await import('/src/game-core/achievementLifecycle.js');
    const engine = await import('/src/lib/achievementEngine.js');
    // eslint-disable-next-line no-new-func
    return new Function('localGame', 'life', 'engine', 'a', `return (async () => { ${code} })();`)(localGame, life, engine, arg);
  }, src, a);
}
const state = () => api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  const pa = await localGame.entities.PlayerAchievement.filter({ profile_id: p.id });
  const led = await localGame.entities.FinancialTransaction.filter({ profile_id: p.id });
  const inv = await localGame.entities.PlayerInventory.filter({ profile_id: p.id });
  return { coins: p.coins, flag: p.collection_achievements_v1_reconciled ?? null, released: engine.collectionRewardsReleased(),
    pa: pa.map((r) => r.achievement_id + ':' + r.reconciled + ':' + r.reward_delivered + ':' + r.reward_coins).sort(),
    rewards: led.filter((t) => t.category === 'conquista').map((t) => t.id.replace(/-playerprofile.*/, '') + ':' + t.amount).sort(),
    shop: led.filter((t) => t.category === 'loja').map((t) => t.type + ':' + t.amount),
    inv: inv.map((r) => r.item_name).sort() };
`);
const day = () => api(`const p = (await localGame.entities.PlayerProfile.list())[0]; return (await life.processAchievementsDay(p)).unlocked;`);
const shot = (n) => page.screenshot({ path: resolve(SHOTS, `${n}.png`) });
async function openTab(path, ready) {
  await goto(page, path, { settle: 2500 });
  await dismissOverlays(page);
  for (let i = 0; i < 15; i += 1) { if (await page.evaluate((re) => new RegExp(re).test(document.body.innerText), ready)) break; await wait(1000); }
}
async function radixTab(label) {
  for (const t of await page.$$('[role="tab"]')) { if ((await t.evaluate((el) => (el.textContent || '').trim())).startsWith(label)) { await t.click(); break; } }
  await wait(900);
}
async function typeInto(placeholder, text) {
  await page.evaluate((ph, t) => {
    const input = document.querySelector(`input[placeholder="${ph}"]`); if (!input) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, t);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, placeholder, text);
  await wait(900);
}
// Toasts (components/ui/toaster.jsx) observados durante uma ação.
const watch = () => page.evaluate(() => {
  window.__seen = []; window.__obs?.disconnect();
  window.__obs = new MutationObserver(() => { for (const c of document.querySelectorAll('button[aria-label="Fechar notificação"]')) window.__seen.push((c.parentElement?.textContent || '').trim()); });
  window.__obs.observe(document.body, { subtree: true, childList: true, characterData: true });
});
const seen = () => page.evaluate(() => [...new Set(window.__seen || [])]);
async function buyViaShop(name) {
  await openTab('/career/training?tab=shop', 'itens encontrados');
  await typeInto('Buscar equipamento...', name);
  await watch();
  await page.evaluate((n) => { const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n); h?.closest('button')?.click(); }, name);
  await wait(900);
  const clicked = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const b = dlg && [...dlg.querySelectorAll('button')].find((x) => /^\s*[\d.]+\s*([\d.]+)?\s*$/.test(x.textContent || ''));
    if (!b || b.disabled) return false; b.click(); return true;
  });
  await wait(2500);
  return { clicked, toasts: await seen() };
}
async function sellViaInventory(name) {
  await openTab('/career/training?tab=inventory', 'Itens possuídos');
  await watch();
  const clicked = await page.evaluate((n) => {
    const label = [...document.querySelectorAll('h3, h4, p, span, div')].find((x) => x.children.length === 0 && (x.textContent || '').trim() === n);
    let el = label;
    while (el && !el.querySelector('button[title^="Vender por"]')) el = el.parentElement;
    const b = el?.querySelector('button[title^="Vender por"]');
    if (!b) return false; b.click(); return true;
  }, name);
  await wait(2500);
  return { clicked, toasts: await seen() };
}
// Estado de uma conquista na aba Conquistas: card em andamento, lista Concluídas ou escada avançada.
async function achievement(name) {
  await openTab('/game/missions?tab=conquistas', 'Objetivos');
  await radixTab('Conquistas');
  await typeInto('Buscar conquista...', name);
  let res = null;
  for (let k = 0; k < 3; k += 1) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Concluídas \(\d+\)/.test(x.textContent || '')); if (b && !b.nextElementSibling) b.click(); });
    await wait(700);
    res = await page.evaluate((n) => {
      const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n);
      const card = h?.closest('button');
      const txt = card ? (card.textContent || '').replace(/\s+/g, ' ') : '';
      const section = [...document.querySelectorAll('section')].find((x) => /Concluídas \(\d+\)/.test(x.textContent || ''));
      const done = section ? [...section.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.textContent || '').trim() === n) : false;
      const ladder = [...document.querySelectorAll('h3')].map((x) => { const c = x.closest('button'); return { name: (x.textContent || '').trim(), progress: ((c?.textContent || '').match(/(\d+)\/(\d+)/) || [])[0] || null }; });
      return { inProgress: Boolean(card), progress: (txt.match(/(\d+)\/(\d+)/) || [])[0] || null, completedList: done, visible: ladder };
    }, name);
    if (res.inProgress || res.completedList || res.visible.length) break;
  }
  return res;
}

// Preparação: requisitos de lendário (nível é recalculado do XP ao carregar a página).
// Mês em que o lendário está na rotação mensal da Loja (regra inalterada).
const month = await api(`
  const eco = await import('/src/lib/sportsEconomyV26.js');
  const store = await import('/src/lib/storeCatalog.js');
  const it = store.normalizeShopItem((await localGame.entities.ShopItem.list()).find((i) => i.name === a));
  const months = Array.from({ length: 36 }, (_, i) => (2026 + Math.floor(i / 12)) + '-' + String((i % 12) + 1).padStart(2, '0') + '-15');
  return months.find((d) => eco.getEquipmentMarketState(it, { career_date: d }).available);
`, LEGEND);
report.steps.month = month;
await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { coins: 5000000, xp: 50000000, ranking_position: 1, reputation: 99, career_date: a });`, month);
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
const s0 = await state();
report.steps.start = { released: s0.released, flag: s0.flag, coins: s0.coins };
check('liberação ligada no padrão do código; perfil novo já reconciliado (flag)', s0.released === true && s0.flag === true, report.steps.start);

// 1. Progresso após compra (compra pelo modal da Loja).
const b1 = await buyViaShop(LEGEND);
const s1 = await state();
const a1 = await achievement('Toque de Midas');
await shot('r1-01-progress-after-purchase');
report.steps.purchase = { buy: b1, coinsDelta: s1.coins - s0.coins, midas: a1 };
check('1. compra pelo modal da Loja ("Compra realizada!") → "Toque de Midas" mostra 1/1 em andamento antes do fechamento do dia', b1.clicked && b1.toasts.some((t) => /^Compra realizada!/.test(t)) && a1.inProgress && a1.progress === '1/1' && !s1.pa.some((x) => x.startsWith(MIDAS)), report.steps.purchase);

// 2–3. Conclusão legítima e crédito (fechamento do dia).
const unlocked2 = await day();
const s2 = await state();
const a2 = await achievement('Toque de Midas');
const midasReward = s2.rewards.filter((x) => x.startsWith(`reward-pa-${MIDAS}`));
const newRewards = s2.rewards.filter((x) => !s1.rewards.includes(x));
const rewardSum = newRewards.reduce((s, x) => s + Number(x.split(':').pop()), 0);
await shot('r1-02-midas-completed');
report.steps.completion = { unlocked: unlocked2, midasRow: s2.pa.filter((x) => x.startsWith(MIDAS)), midasReward, coinsDelta: s2.coins - s1.coins, rewardSum, ui: { inProgress: a2.inProgress, nextLadder: a2.visible.find((v) => v.name === 'Rei Mida') } };
check('2. fechamento do dia conclui "Toque de Midas" legitimamente (registrada, paga, não reconciliada); a aba tira do andamento e avança a escada para "Rei Mida 1/10"', s2.pa.includes(`${MIDAS}:false:true:1000`) && !a2.inProgress && report.steps.completion.ui.nextLadder?.progress === '1/10', report.steps.completion);
check('3. crédito: +1.000 de "Toque de Midas" no extrato (reward-pa-…) e saldo = soma das recompensas do dia', midasReward.length === 1 && midasReward[0].endsWith(':1000') && s2.coins - s1.coins === rewardSum, report.steps.completion);

// 4. Recarregar.
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
const s4 = await state();
const a4 = await achievement('Toque de Midas');
check('4. após recarregar: saldo, registros, extrato e inventário idênticos; conquista segue concluída', JSON.stringify(s4) === JSON.stringify(s2) && !a4.inProgress, { s2: s2.coins, s4: s4.coins });

// 5. Sem pagamento duplicado.
await day(); await day();
const s5 = await state();
check('5. dois fechamentos de dia depois: nenhum pagamento novo de "Toque de Midas"; saldo inalterado', s5.coins === s4.coins && s5.rewards.filter((x) => x.startsWith(`reward-pa-${MIDAS}`)).length === 1, { coins: [s4.coins, s5.coins] });

// 7. Venda e recompra (UI) sem nova recompensa.
const sold = await sellViaInventory(LEGEND);
const s7a = await state();
const rebuy = await buyViaShop(LEGEND);
await day();
const s7 = await state();
const a7 = await achievement('Toque de Midas');
report.steps.sellRebuy = { sold, rebuy, shop: s7.shop.slice(-3), coins: [s5.coins, s7a.coins, s7.coins], midasRewards: s7.rewards.filter((x) => x.startsWith(`reward-pa-${MIDAS}`)), ui: { inProgress: a7.inProgress } };
await shot('r1-03-after-sell-rebuy');
check('7. venda pelo Inventário ("Item vendido!") e recompra pela Loja: nenhuma nova recompensa; conquista segue concluída; saldo = início − preço + revenda (sem lucro)', sold.toasts.some((t) => /^Item vendido!/.test(t)) && rebuy.toasts.some((t) => /^Compra realizada!/.test(t)) && report.steps.sellRebuy.midasRewards.length === 1 && !a7.inProgress && s7.coins < s5.coins, report.steps.sellRebuy);

// 6. Save legado reconciliado sem pagamento retroativo: perfil sem a flag
// (save anterior à 9C.2-B) com inventário legado que já prova "Pau para Toda Obra".
await api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  await localGame.entities.PlayerProfile.update(p.id, { collection_achievements_v1_reconciled: false });
  const items = await localGame.entities.ShopItem.list('catalog_order', 2000);
  for (const c of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) {
    const it = items.find((i) => i.category === c && i.catalog_order != null);
    await localGame.entities.PlayerInventory.create({ profile_id: p.id, item_id: it.id, item_name: it.name, category: it.category, rarity: it.rarity, equipped: false, acquired_date: '2025-03-01' });
  }
`);
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
const s6a = await state();
await day();
const s6 = await state();
const a6 = await achievement('Pau para Toda Obra');
await shot('r1-04-legacy-reconciled');
const newRewards6 = s6.rewards.filter((x) => !s6a.rewards.includes(x));
report.steps.legacy = { allcat: s6.pa.filter((x) => x.startsWith(ALLCAT)), flag: s6.flag, coinsDelta: s6.coins - s6a.coins, newRewards: newRewards6, ui: a6 };
check('6. save legado: "Pau para Toda Obra" registrada como reconciliada SEM pagamento; flag gravada; nenhuma moeda de coleção; aparece concluída na aba', s6.pa.includes(`${ALLCAT}:true:false:0`) && s6.flag === true && !newRewards6.some((x) => x.includes(ALLCAT)) && s6.coins - s6a.coins === newRewards6.reduce((s, x) => s + Number(x.split(':').pop()), 0) && a6.completedList, report.steps.legacy);
check('sem erros de página', (page.__errors || []).length === 0, page.__errors);

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
writeFileSync(resolve(OUT, 'ui-r1-release.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
