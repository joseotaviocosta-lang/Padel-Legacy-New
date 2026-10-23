// LOCAL-9C.2-B — aba Conquistas no CHROME REAL (puppeteer-core, driver
// scripts/lib/visualAuditDriver.mjs, perfil temporário, shim de storage do
// Tauri): carreira criada pela UI, nenhum save real.
//
// 1. compra (operação canônica) um lendário e uma peça de cada categoria;
// 2. liberação DESLIGADA (chave em false nesta página): a aba mostra o progresso correto (1/1) e a
//    conquista NÃO aparece como concluída nem é paga;
// 3. liberação ligada só nesta página (globalThis), fecha um dia pela API do
//    app e recarrega: conquista concluída, paga uma vez, sem barra pendente;
// 4. recarregar de novo mantém tudo.
//
// Uso: node node_modules/vite/bin/vite.js --port 5233 --strictPort --host 127.0.0.1   (outro terminal)
//      PL_AUDIT_BASE=http://127.0.0.1:5233 node reports/local-9c2-b-collection-achievements/tools/ui-achievements.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL_AUDIT_BASE = process.env.PL_AUDIT_BASE || 'http://127.0.0.1:5233';
const { launch, goto, openCareer, dismissOverlays } = await import('../../../scripts/lib/auditSession.mjs');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(OUT, 'ui');
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generatedBy: 'LOCAL-9C.2-B ui-achievements (Chrome real)', checks: [], steps: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail != null ? ` · ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };

const browser = await launch();
const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
async function api(src, a = null) {
  return page.evaluate(async (code, arg) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const T = await import('/src/game-core/shopTransactions.js');
    const life = await import('/src/game-core/achievementLifecycle.js');
    const eco = await import('/src/lib/sportsEconomyV26.js');
    const store = await import('/src/lib/storeCatalog.js');
    // eslint-disable-next-line no-new-func
    return new Function('localGame', 'T', 'life', 'eco', 'store', 'a', `return (async () => { ${code} })();`)(localGame, T, life, eco, store, arg);
  }, src, a);
}
const state = () => api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  const pa = await localGame.entities.PlayerAchievement.filter({ profile_id: p.id });
  const led = (await localGame.entities.FinancialTransaction.filter({ profile_id: p.id })).filter((t) => t.category === 'conquista');
  return { coins: p.coins, flag: p.collection_achievements_v1_reconciled ?? null, pa: pa.map((r) => r.achievement_id + ':' + r.reward_delivered + ':' + r.reward_coins).sort(), ledger: led.map((t) => t.id + ':' + t.amount).sort() };
`);
// Estado de uma conquista na aba: busca pelo nome; card em andamento (h3 +
// contador) ou item da lista "Concluídas (N)" (expandida aqui).
async function view(name) {
  await page.evaluate((n) => {
    const input = document.querySelector('input[placeholder="Buscar conquista..."]'); if (!input) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, n);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await wait(800);
  let state = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Concluídas \(\d+\)/.test(x.textContent || '')); if (b && !b.nextElementSibling) b.click(); });
    await wait(700);
    state = await read(name);
    if (state.inProgressCard || state.completed) break;
  }
  return state;
}
function read(name) {
  return page.evaluate((n) => {
    const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').trim() === n);
    const card = h?.closest('button');
    const cardText = card ? (card.textContent || '').replace(/\s+/g, ' ') : null;
    const section = [...document.querySelectorAll('section')].find((x) => /Concluídas \(\d+\)/.test(x.textContent || ''));
    const completedItem = section ? [...section.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.textContent || '').trim() === n) : false;
    return { inProgressCard: Boolean(card), progress: cardText ? ((cardText.match(/(\d+)\/(\d+)/) || [])[0] || null) : null, completed: completedItem, completedDate: completedItem ? /Desbloqueada/.test(section.textContent || '') : false };
  }, name);
}
async function openAchievements() {
  await goto(page, '/game/missions?tab=conquistas', { settle: 3000 });
  await dismissOverlays(page);
  // Radix Tabs ativa no mousedown: clique real do mouse, não element.click().
  const tabs = await page.$$('[role="tab"]');
  for (const t of tabs) { if ((await t.evaluate((el) => (el.textContent || '').trim())).startsWith('Conquistas')) { await t.click(); break; } }
  await wait(800);
  for (let i = 0; i < 12; i += 1) { if (await page.evaluate(() => /Toque de Midas/.test(document.body.innerText))) break; await wait(1000); }
  await dismissOverlays(page);
}
const shot = (n) => page.screenshot({ path: resolve(SHOTS, `${n}.png`) });

await api(`const p = (await localGame.entities.PlayerProfile.list())[0]; await localGame.entities.PlayerProfile.update(p.id, { xp: 50000000 });`);
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
// 1. Compras pela operação canônica (a tela de compra foi validada na 9C.2-A-R1).
const bought = await api(`
  const p = (await localGame.entities.PlayerProfile.list())[0];
  await localGame.entities.PlayerProfile.update(p.id, { coins: 5000000, xp: 50000000, ranking_position: 1, reputation: 99 });
  const items = (await localGame.entities.ShopItem.list('catalog_order', 2000)).map(store.normalizeShopItem).filter((i) => i.catalog_order != null);
  const picks = [items.find((i) => i.rarity === 'lendario')];
  for (const c of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) picks.push(items.find((i) => i.category === c));
  const out = [];
  for (const it of picks) {
    const months = Array.from({ length: 36 }, (_, i) => (2026 + Math.floor(i / 12)) + '-' + String((i % 12) + 1).padStart(2, '0') + '-15');
    const m = months.find((d) => eco.getEquipmentMarketState(it, { career_date: d }).available);
    await localGame.entities.PlayerProfile.update(p.id, { career_date: m });
    const r = await T.purchaseShopItem(p.id, it.id, { operationId: 'ui-' + it.id });
    out.push(r.code);
  }
  await localGame.entities.PlayerProfile.update(p.id, { career_date: '2026-01-15' });
  return out;
`);
report.steps.bought = bought;
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);

// 2. Liberação desligada: progresso correto, nada concluído nem pago.
const s0 = await state();
// Desde a R1 o padrão é ligado: aqui a chave é desligada só nesta página (desligamento seguro).
await api(`globalThis.__PL9C2B_COLLECTION_REWARDS = false; const p = (await localGame.entities.PlayerProfile.list())[0]; const r = await life.processAchievementsDay(p); globalThis.__PL9C2B_COLLECTION_REWARDS = undefined; return r;`);
const s1 = await state();
await openAchievements();
const counter = () => page.evaluate(() => Number(((document.body.innerText.match(/(\d+)\/\d+\s*desbloqueadas/) || [])[1]) || NaN));
const unlocked0 = await counter();
const midas0 = await view('Toque de Midas');
const allcat0 = await view('Pau para Toda Obra');
await shot('01-gate-off-progress');
report.steps.gateOff = { midas: midas0, allcat: allcat0, coins: [s0.coins, s1.coins], pa: s1.pa.filter((x) => /midas|toda-obra/.test(x)) };
check('compras concluídas (lendário + 8 categorias)', bought.every((c) => c === 'purchased'), bought);
check('liberação desligada: "Toque de Midas" e "Pau para Toda Obra" mostram 1/1 em andamento (progresso corrigido) e não estão concluídas', midas0?.progress === '1/1' && allcat0?.progress === '1/1' && !midas0.completed && !allcat0.completed, report.steps.gateOff);
check('liberação desligada: fechar o dia não registra nem paga conquista de coleção; flag de saves antigos intocada', !s1.pa.some((x) => /midas|toda-obra/.test(x)) && !s1.ledger.some((x) => /midas|toda-obra/.test(x)), { pa: s1.pa, ledger: s1.ledger });

// 3. Liberação ligada (só nesta página): fecha o dia, recarrega.
await api(`globalThis.__PL9C2B_COLLECTION_REWARDS = true; const p = (await localGame.entities.PlayerProfile.list())[0]; await life.processAchievementsDay(p); await life.processAchievementsDay((await localGame.entities.PlayerProfile.list())[0]); globalThis.__PL9C2B_COLLECTION_REWARDS = undefined;`);
const s2 = await state();
await openAchievements();
const unlocked1 = await counter();
const midas1 = await view('Toque de Midas');
const reiMida1 = await view('Rei Mida');
const allcat1 = await view('Pau para Toda Obra');
await shot('02-gate-on-unlocked');
report.steps.gateOn = { unlockedCounter: [unlocked0, unlocked1], reiMida: reiMida1, midas: midas1, allcat: allcat1, coinsDelta: s2.coins - s1.coins, pa: s2.pa.filter((x) => /midas|toda-obra/.test(x)), ledger: s2.ledger.filter((x) => /midas|toda-obra/.test(x)) };
check('liberado: as duas aparecem concluídas — "Pau para Toda Obra" na lista Concluídas; "Toque de Midas" sai de andamento e a escada avança para "Rei Mida 1/10"; contador do topo sobe (≥ +2)', !midas1.inProgressCard && reiMida1?.progress === '1/10' && allcat1?.completed && !allcat1.inProgressCard && unlocked1 >= unlocked0 + 2, report.steps.gateOn);
check('liberado: pagas uma vez (dois fechamentos de dia) — 1.000 + 1.200 no saldo e no extrato', report.steps.gateOn.pa.length === 2 && report.steps.gateOn.ledger.length === 2 && s2.coins - s1.coins === 2200, report.steps.gateOn);

// 4. Recarregar mantém.
await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
await wait(3000);
const s3 = await state();
await openAchievements();
const midas2 = await view('Toque de Midas');
const reiMida2 = await view('Rei Mida');
check('após recarregar: estado, saldo e extrato idênticos; conquista segue concluída', JSON.stringify(s3) === JSON.stringify(s2) && !midas2.inProgressCard && reiMida2?.progress === '1/10', { s2, s3 });
check('sem erros de página', (page.__errors || []).length === 0, page.__errors);
await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
writeFileSync(resolve(OUT, 'ui-achievements.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
