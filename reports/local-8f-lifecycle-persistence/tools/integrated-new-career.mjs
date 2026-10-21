// LOCAL-8F — teste integrado de carreira nova no Chrome real (perfil
// temporário isolado; nunca o save real do navegador do usuário).
//   criar carreira (UI) → lado + estilo (mesmo caminho de domínio de
//   Missions.jsx) → propostas → aceitar pela UI → Home, Objetivos,
//   Conquistas, Notícias, Clubes, Treinadores, Loja, Mercado → avançar 3
//   dias (UI) → recarregar → repetir a navegação → nenhuma alteração.
// Uso: node reports/local-8f-lifecycle-persistence/tools/integrated-new-career.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, goto } from '../../../scripts/lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from '../../../scripts/lib/auditSession.mjs';

const OUT = process.env.PL_INTEGRATED_OUT || 'reports/local-8f-lifecycle-persistence';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTES = ['/game', '/game/missions', '/game/missions?tab=achievements', '/world/circuit', '/world/circuit?tab=circuit', '/world/directory?tab=clubs', '/career/team', '/career/training?tab=shop', '/world-market'];
const results = []; const report = { steps: [] };
const ok = (label, cond, detail = '') => { results.push({ label, ok: Boolean(cond), detail }); console.log(`${cond ? 'PASS' : 'FAIL'} — ${label} ${cond ? '' : detail}`); };
const HASHES = async () => {
  const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js');
  const c = await activeCareerAdapter.getActiveCareer({ fresh: false });
  const h = (v) => { const s = JSON.stringify(v); let x = 2166136261; for (let i = 0; i < s.length; i += 1) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return `${(x >>> 0).toString(36)}:${s.length}`; };
  const entities = {};
  for (const [n, rows] of Object.entries(c.entities || {})) if (Array.isArray(rows)) entities[n] = Object.fromEntries(rows.map((r, i) => [String(r?.id ?? `#${i}`), h(r)]));
  return { entities, date: c.player?.career_date, intro: [...new Set([...(c.tutorial?.pageIntroductionsSeen || []), ...(c.player?.tutorial_onboarding?.pageIntroductionsSeen || [])])] };
};
const diff = (a, b) => {
  const out = {};
  for (const n of new Set([...Object.keys(a.entities), ...Object.keys(b.entities)])) {
    const x = a.entities[n] || {}; const y = b.entities[n] || {};
    const created = Object.keys(y).filter((id) => !(id in x)).length;
    const removed = Object.keys(x).filter((id) => !(id in y)).length;
    const changed = Object.keys(y).filter((id) => id in x && x[id] !== y[id]).length;
    if (created || removed || changed) out[n] = { created, removed, changed };
  }
  return out;
};
const total = (d) => Object.values(d).reduce((s, v) => s + v.created + v.removed + v.changed, 0);
const spa = (page, to) => page.evaluate((path) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, to);
async function navigateAll(page) {
  for (const r of ROUTES) { await spa(page, r); await sleep(3500); for (let i = 0; i < 3 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(400); } }
}
async function advanceDay(page) {
  await spa(page, '/game'); await sleep(3000); await dismissOverlays(page);
  const before = (await page.evaluate(HASHES)).date;
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Avançar/i.test(x.innerText.trim()) && x.getClientRects().length && !x.disabled); if (!b) return false; b.click(); return true; });
  if (!clicked) return { before, after: before, clicked: false };
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000);
    const after = (await page.evaluate(HASHES)).date;
    if (after !== before) { await sleep(3000); await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Continuar/i.test(x.innerText.trim()) && x.getClientRects().length); if (b) b.click(); }); await sleep(1500); return { before, after, clicked: true }; }
  }
  return { before, after: before, clicked: true };
}

const browser = await launch();
try {
  const page = await openCareer(browser, { id: 'desktop', width: 1366, height: 900 });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await sleep(5000);
  const created = await page.evaluate(HASHES);
  ok('carreira nova criada pela UI', Boolean(created.date), JSON.stringify(created.date));
  ok('catálogos inicializados na ativação (clubes, treinadores, Loja, missões)', ['Club', 'Coach', 'ShopItem', 'Mission'].every((n) => Object.keys(created.entities[n] || {}).length > 5), JSON.stringify(['Club', 'Coach', 'ShopItem', 'Mission'].map((n) => Object.keys(created.entities[n] || {}).length)));
  // Lado + estilo (mesmo caminho de Missions.jsx: update do perfil + lote inicial).
  const identity = await page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureInitialPartnerOffers, isReadyForInitialPartnerOffers } = await import('/src/lib/partnerOffers.js');
    const [p] = await localGame.entities.PlayerProfile.list('-created_date', 1);
    const u = await localGame.entities.PlayerProfile.update(p.id, { court_side: 'direita', preferred_side: 'direita', play_style: 'equilibrado' });
    if (isReadyForInitialPartnerOffers(u)) await ensureInitialPartnerOffers(u);
    return (await localGame.entities.PartnerOffer.filter({ profile_id: p.id })).length;
  });
  ok(`propostas recebidas ao definir lado e estilo (${identity})`, identity >= 3);
  // Aceitar pela UI.
  await goto(page, '/partners?view=offers', { settle: 4000 }); await dismissOverlays(page);
  // Card → "Analisar proposta" → modal → "Aceitar proposta" (PartnerOffersPanel.jsx).
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Analisar proposta/i.test(x.innerText.trim()) && x.getClientRects().length && !x.disabled); if (b) b.click(); });
  await sleep(2000);
  const acceptClicked = await page.evaluate(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => /^Aceitar proposta/i.test(x.innerText.trim()) && !x.disabled); if (!b) return null; b.click(); return b.innerText.trim().slice(0, 40); });
  await sleep(4000);
  const partnership = await page.evaluate(async () => { const { localGame } = await import('/src/api/localGameClient.js'); const [p] = await localGame.entities.PlayerProfile.list('-created_date', 1); const a = await localGame.entities.Partnership.filter({ profile_id: p.id, status: 'ativa' }); return { active: a.length, partner: p.partner_id || null }; });
  ok(`parceiro escolhido e dupla confirmada pela UI (botão "${acceptClicked}")`, partnership.active === 1, JSON.stringify(partnership));
  // 1ª navegação.
  let s0 = await page.evaluate(HASHES);
  await navigateAll(page);
  let s1 = await page.evaluate(HASHES);
  const nav1 = diff(s0, s1);
  const createdRows = await page.evaluate(async (ids) => { const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js'); const c = await activeCareerAdapter.getActiveCareer({ fresh: false }); const out = {}; for (const n of ['MissionProgress', 'FinancialTransaction']) out[n] = (c.entities[n] || []).filter((r) => !(ids[n] || []).includes(String(r.id))).map((r) => ({ id: r.id, mission_id: r.mission_id, status: r.status, category: r.category, description: r.description, amount: r.amount })); return out; }, Object.fromEntries(['MissionProgress', 'FinancialTransaction'].map((n) => [n, Object.keys(s0.entities[n] || {})])));
  report.steps.push({ step: 'navegação 1', diff: nav1, createdRows, introAdded: s1.intro.filter((x) => !s0.intro.includes(x)) });
  console.log('criados na navegação 1:', JSON.stringify(createdRows));
  // Onboarding (8D-13, anterior à 8F): a etapa "career-created" do tutorial é
  // concluída ao entrar na Home e paga 50 moedas UMA vez (ids determinísticos).
  // Verificado pelo conteúdo; qualquer outra escrita reprova.
  const tutorialOnly = Object.keys(nav1).every((n) => ['MissionProgress', 'FinancialTransaction'].includes(n))
    && (createdRows.MissionProgress || []).every((r) => String(r.mission_id).startsWith('tutorial-'))
    && (createdRows.FinancialTransaction || []).every((r) => r.category === 'tutorial')
    && Object.values(nav1).every((v) => v.changed === 0 && v.removed === 0 && v.created <= 1);
  ok(`1ª navegação pelas 9 telas: só a recompensa única da etapa 1 do tutorial (${JSON.stringify(nav1)})`, total(nav1) === 0 || tutorialOnly);
  // Avançar 3 dias.
  const days = [];
  for (let i = 0; i < 3; i += 1) days.push(await advanceDay(page));
  report.steps.push({ step: 'avanço', days });
  ok(`avançar 3 dias pela UI (${days.map((d) => `${d.before}→${d.after}`).join(', ')})`, days.every((d) => d.clicked && d.after > d.before));
  // Recarregar (persistência do perfil temporário) e repetir a navegação.
  const beforeReload = await page.evaluate(HASHES);
  await goto(page, '/game', { settle: 8000 }); await dismissOverlays(page);
  const afterReload = await page.evaluate(HASHES);
  const reloadDiff = diff(beforeReload, afterReload);
  report.steps.push({ step: 'recarregar', diff: reloadDiff });
  ok(`salvar e recarregar: mesma data e nenhum registro alterado (${afterReload.date}, ${JSON.stringify(reloadDiff)})`, afterReload.date === beforeReload.date && total(reloadDiff) === 0);
  s0 = await page.evaluate(HASHES);
  await navigateAll(page);
  s1 = await page.evaluate(HASHES);
  const nav2 = diff(s0, s1);
  report.steps.push({ step: 'navegação 2', diff: nav2 });
  ok(`2ª navegação após recarregar: nenhum registro alterado (${JSON.stringify(nav2)})`, total(nav2) === 0);
  ok(`sem erros de JavaScript (${errors.length})`, errors.length === 0, JSON.stringify(errors.slice(0, 3)));
} finally { await browser.close(); }
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/integrated-new-career.json`, JSON.stringify({ results, report }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`integrated-new-career: ${results.length - failed} PASS · ${failed} FAIL`);
if (failed) process.exitCode = 1;
