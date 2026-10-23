// LOCAL-9C.2-C — identidade estavel + metas no Chrome real.
//
// puppeteer-core + Chrome instalado (scripts/lib/visualAuditDriver.mjs),
// perfil temporario, shim de storage do Tauri: carreira criada pela UI,
// nenhum save real. Cenarios:
//   A produto normal — compra pelo modal da Loja, progresso, fechamento,
//     recompensa, recarga estavel;
//   B alias — linha legada + item novo fundem com alias, fraturam sem alias;
//   C metas novas — a aba Conquistas exibe 115/9/8.
//
// Uso: node node_modules/vite/bin/vite.js --port 5233 --strictPort --host 127.0.0.1  (outro terminal)
//      PL_AUDIT_BASE=http://127.0.0.1:5233 node reports/local-9c2-c-collection-identity/tools/ui-9c2c-goals.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL_AUDIT_BASE = process.env.PL_AUDIT_BASE || 'http://127.0.0.1:5233';
const { launch, goto, openCareer, dismissOverlays } = await import('../../../scripts/lib/auditSession.mjs');
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(OUT_DIR, 'ui');
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generatedBy: 'LOCAL-9C.2-C ui-9c2c-goals (Chrome real)', checks: [], steps: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail != null ? ` · ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };

const browser = await launch();
const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
// Aquece o dev server: a primeira transformacao do grafo de modulos pode
// levar segundos; sem isto o primeiro import dinamico falha ("failed to
// fetch/resolve") mesmo com a pagina ja navegada.
for (let i = 0; i < 12; i += 1) {
  const ready = await page.evaluate(async () => {
    try {
      await import('/src/api/localGameClient.js');
      return document.body.innerText.length > 200;
    } catch {
      return false;
    }
  }).catch(() => false);
  if (ready) break;
  await wait(2500);
}
// Garante carreira criada (openCareer pode retornar antes da persistencia
// concluir em servidor frio/sob carga): refaz o fluxo explicitamente.
async function profileCount() {
  try {
    return await api(`return (await localGame.entities.PlayerProfile.list()).length;`);
  } catch {
    return -1;
  }
}
for (let i = 0; i < 10; i += 1) {
  const n = await profileCount();
  if (typeof n === 'number' && n > 0) break;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Nova carreira|Criar primeira/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await wait(2000);
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const input of document.querySelectorAll('input')) {
      if (!input.type || ['text', 'search'].includes(input.type)) {
        setter.call(input, 'Auditoria 9C2C');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  await wait(500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Criar carreira$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await wait(4000);
  await dismissOverlays(page);
}
async function api(src, a = null) {
  return page.evaluate(async (code, arg) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const life = await import('/src/game-core/achievementLifecycle.js');
    const engine = await import('/src/lib/achievementEngine.js');
    const CI = await import('/src/lib/collectionIdentity.js');
    // eslint-disable-next-line no-new-func
    return new Function('localGame', 'life', 'engine', 'CI', 'a', `return (async () => { ${code} })();`)(localGame, life, engine, CI, arg);
  }, src, a);
}
const state = () => api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  const pa = await localGame.entities.PlayerAchievement.filter({ profile_id: p.id });
  const led = await localGame.entities.FinancialTransaction.filter({ profile_id: p.id });
  const inv = await localGame.entities.PlayerInventory.filter({ profile_id: p.id });
  const ctx = await (await import('/src/lib/achievementContext.js')).buildAchievementContext(p);
  return { coins: p.coins, shop: (await localGame.entities.ShopItem.list()).length,
    pa: pa.map((r) => r.achievement_id + ':' + r.reconciled + ':' + r.reward_delivered + ':' + r.reward_coins).sort(),
    rewards: led.filter((t) => t.category === 'conquista').map((t) => t.source_id + ':' + t.amount),
    inv: inv.map((r) => r.item_name).sort(),
    invCount: inv.length, totalOwned: ctx.inventory.totalOwned, equipmentOwned: ctx.inventory.equipmentOwned,
    shoes: ctx.inventory.shoes, apparel: ctx.inventory.apparel };
`);
const day = () => api(`const p = (await localGame.entities.PlayerProfile.list())[0]; const r = await life.processAchievementsDay(p); return r.unlocked;`);
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
async function buyViaShop(name) {
  await openTab('/career/training?tab=shop', 'itens encontrados');
  await typeInto('Buscar equipamento...', name);
  const clicked = await page.evaluate((n) => { const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n); const b = h?.closest('button'); if (!b || b.disabled) return false; b.click(); return true; }, name);
  await wait(900);
  const confirmed = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const b = dlg && [...dlg.querySelectorAll('button')].find((x) => /^\s*[\d.]+(\s*[\d.]+)?\s*$/.test(x.textContent || ''));
    if (!b || b.disabled) return false; b.click(); return true;
  });
  await wait(2500);
  return { clicked: clicked && confirmed };
}
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
      const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
      return { inProgress: !!card, progress: m ? `${m[1]}/${m[2]}` : null, completedList: done };
    }, name);
    if (res.inProgress || res.completedList) break;
  }
  return res;
}

// Preparacao: perfil no teto + mes com todos os tenis disponiveis.
let profileReady = false;
for (let i = 0; i < 12; i += 1) {
  profileReady = await api(`return (await localGame.entities.PlayerProfile.list()).length > 0;`).catch(() => false);
  if (profileReady) break;
  await wait(2500);
}
if (!profileReady) { console.log('FAIL — perfil nao criado a tempo'); process.exit(1); }
await api(`
  const eco = await import('/src/lib/sportsEconomyV26.js');
  const store = await import('/src/lib/storeCatalog.js');
  const p = (await localGame.entities.PlayerProfile.list())[0];
  await localGame.entities.PlayerProfile.update(p.id, { coins: 50000000, xp: 50000000, ranking_position: 1, reputation: 99, career_date: '2026-01-15' });
`);
const s0 = await state();
report.steps.start = { shop: s0.shop, totalOwned: s0.totalOwned, coins: s0.coins };

// A — compra pelo modal, progresso, fechamento, recompensa, recarga.
const bought = [];
for (const name of ['Joma Court Basic', 'Asics Clay Motion']) {
  const r = await buyViaShop(name);
  bought.push({ name, ...r });
}
const s1 = await state();
const a1 = await achievement('Sapateiro');
await shot('9c2c-a1-progress-after-purchase');
check('A1: 2 tenis pelo modal da Loja -> progresso 2/9 em andamento', bought.every((b) => b.clicked) && a1.inProgress && a1.progress === '2/9', { bought, progress: a1.progress });
await day();
const s2 = await state();
check('A2: sem unlock parcial (2/9), sem pagamento de Sapateiro', !s2.pa.some((x) => x.startsWith('achv-sapateiro')) && !s2.rewards.some((x) => x.includes('sapateiro')), { pa: s2.pa.length });
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
const s3 = await state();
check('A3: recarga preserva inventario e contagem', JSON.stringify(s3.inv) === JSON.stringify(s1.inv) && s3.totalOwned === s1.totalOwned, { inv: s3.inv.length });
await shot('9c2c-a2-after-reload');

// B — alias: fratura sem alias, fusao com alias (mesma sessao, sem reload).
await api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  await localGame.entities.ShopItem.create({ id: 'shop-legacy-x', name: 'Old Grip X', category: 'grip', rarity: 'comum', price: 100, manufacturer: 'Court Labs', is_available: true, durability: 100, attribute_bonus: {} });
  await localGame.entities.ShopItem.create({ id: 'shop-newgrip-x', name: 'New Grip X', category: 'grip', rarity: 'comum', price: 100, manufacturer: 'Court Labs', is_available: true, durability: 100, attribute_bonus: {} });
  await localGame.entities.PlayerInventory.create({ id: 'inv-legacy-x', profile_id: p.id, item_id: 'shop-legacy-x', item_name: 'Old Grip X', category: 'grip' });
  await localGame.entities.PlayerInventory.create({ id: 'inv-newgrip-x', profile_id: p.id, item_id: 'shop-newgrip-x', item_name: 'New Grip X', category: 'grip' });
`);
await openTab('/game/missions?tab=conquistas', 'Objetivos');
const sB1 = await state();
report.steps.aliasFracture = { totalOwned: sB1.totalOwned };
check('B1: sem alias, old+new fraturam em +2', sB1.totalOwned === s3.totalOwned + 2, report.steps.aliasFracture);
await api(`globalThis.__PL9C2C_COLLECTION_ALIASES = { 'old grip x': 'new grip x' };`);
const sB2 = await state();
report.steps.aliasMerged = { totalOwned: sB2.totalOwned };
check('B2: com alias, old+new = +1 (funde sem duplicar)', sB2.totalOwned === s3.totalOwned + 1, report.steps.aliasMerged);
await shot('9c2c-b-alias-merged');

// C — metas novas exibidas: 115/9/8.
const aC1 = await achievement('Arsenal Completo');
const aC2 = await achievement('Sapateiro');
const aC3 = await achievement('Guarda-Roupa');
report.steps.goals = { arsenal: aC1, sapateiro: aC2, guardaRoupa: aC3 };
check('C1: Arsenal Completo exibe denominador 115', (aC1.progress || '').endsWith('/115') || aC1.completedList, aC1);
check('C2: Sapateiro exibe denominador 9', (aC2.progress || '').endsWith('/9') || aC2.completedList, aC2);
check('C3: Guarda-Roupa exibe denominador 8', (aC3.progress || '').endsWith('/8') || aC3.completedList, aC3);
await shot('9c2c-c-goals');
check('sem erros de pagina', (page.__errors || []).length === 0, page.__errors);

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
writeFileSync(resolve(OUT_DIR, 'ui-9c2c-goals.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS — LOCAL-9C.2-C Chrome`);
process.exit(failed.length ? 1 : 0);
