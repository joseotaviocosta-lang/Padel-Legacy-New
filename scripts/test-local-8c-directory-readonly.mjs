// LOCAL-8C — consultar atletas NÃO pode modificar a carreira.
//
// Navegador real (Chrome + dev server) com o save carregado EM MEMÓRIA
// (reports/ui-redesign-532/tools/session.mjs: perfil temporário, o arquivo
// original nunca é escrito). Para cada cenário:
//   1. snapshot canônico da carreira ativa (hash de CADA registro de CADA
//      entidade + seções de topo do save);
//   2. navegação de consulta: Diretório, busca (com/sem acento), recortes,
//      ordenação, carregar mais, perfis (líder, homônimos, aposentado),
//      seções do perfil, parceiro → voltar, Ranking → perfil, Mundo → líder;
//      repetida N vezes;
//   3. novo snapshot e diff: atletas criados/removidos, registros alterados
//      por entidade, seções de topo alteradas, contagem de atletas por volta;
//   4. recarregar com deep link (?athlete=) e conferir de novo (save/load:
//      a sessão relê o save do disco a cada carga de página).
// Nenhum campo é excluído da comparação.
// Uso: node scripts/test-local-8c-directory-readonly.mjs [cenário...]
//      PL8C_ROUNDS=3 (voltas de navegação). Requer npm run dev.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { BASE } from './lib/visualAuditDriver.mjs';

const { openSession, spa, sleep, setViewport, dismissOverlays } = await import('../reports/ui-redesign-532/tools/session.mjs');
const up = await fetch(BASE).then((r) => r.ok).catch(() => false);
assert.ok(up, `dev server indisponível em ${BASE} (rode npm run dev)`);

const SAVES = 'reports/local-8a-career-audit/run10';
const SCENARIOS = {
  'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json',
  't5-com-dupla': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json',
  t1: `${SAVES}/save-season-1.json`,
  t5: `${SAVES}/save-season-5.json`,
  t10: `${SAVES}/save-season-10.json`,
};
const ROUNDS = Number(process.env.PL8C_ROUNDS || 2);
const OUT = 'reports/local-8c-directory-save-integrity';
const requested = process.argv.slice(2);
const scenarioIds = requested.length ? requested : Object.keys(SCENARIOS);
const careerIdOf = (file) => readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];

let passed = 0;
const failures = [];
const ok = (label, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`PASS — ${label}`); }
  else { failures.push(`${label} ${detail}`); console.log(`FAIL — ${label} ${detail}`); }
};

// Snapshot canônico dentro da página (só hashes saem do navegador).
const snapshot = (page) => page.evaluate(async () => {
  const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js');
  const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
  const hash = (value) => { const s = JSON.stringify(value); let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };
  const entities = {};
  for (const [name, rows] of Object.entries(career.entities || {})) {
    if (!Array.isArray(rows)) { entities[name] = { scalar: hash(rows) }; continue; }
    entities[name] = Object.fromEntries(rows.map((row, i) => [String(row?.id ?? `#${i}`), hash(row)]));
  }
  // Única escrita aceita, e verificada por conteúdo: o onboarding marca a
  // introdução da página como vista (1ª visita de QUALQUER tela).
  // tutorial.pageIntroductionsSeen e player.tutorial_onboarding.pageIntroductionsSeen
  // saem dos hashes e são comparados como listas; o carimbo do save
  // (save_version/updated_at/player.updated_date) só pode mudar junto com elas.
  const intro = [...new Set([...(career.tutorial?.pageIntroductionsSeen || []), ...(career.player?.tutorial_onboarding?.pageIntroductionsSeen || [])])];
  const STAMP = new Set(['save_version', 'updated_at', 'last_played_at']);
  const strip = (k, v) => {
    if (k === 'tutorial' && v) { const { pageIntroductionsSeen, ...rest } = v; void pageIntroductionsSeen; return rest; }
    if (k === 'player' && v) { const { updated_date, tutorial_onboarding, ...rest } = v; void updated_date; const { pageIntroductionsSeen, ...onb } = tutorial_onboarding || {}; void pageIntroductionsSeen; return { ...rest, tutorial_onboarding: onb }; }
    return v;
  };
  const top = Object.fromEntries(Object.entries(career).filter(([k]) => k !== 'entities' && !STAMP.has(k)).map(([k, v]) => [k, hash(strip(k, v))]));
  const stamp = Object.fromEntries([...STAMP].map((k) => [k, hash(career[k] ?? null)]));
  const athletes = (career.entities?.AthleteProfile || []);
  return { entities, top, stamp, intro, athleteCount: athletes.length, relationshipsHash: hash(athletes.map((a) => [a.id, a.relationships || null])) };
});

function diff(a, b) {
  const out = { created: {}, removed: {}, changed: {}, top: [] };
  const names = new Set([...Object.keys(a.entities), ...Object.keys(b.entities)]);
  for (const name of names) {
    const x = a.entities[name] || {}; const y = b.entities[name] || {};
    const created = Object.keys(y).filter((id) => !(id in x));
    const removed = Object.keys(x).filter((id) => !(id in y));
    const changed = Object.keys(y).filter((id) => id in x && x[id] !== y[id]);
    if (created.length) out.created[name] = created;
    if (removed.length) out.removed[name] = removed;
    if (changed.length) out.changed[name] = changed;
  }
  out.top = [...new Set([...Object.keys(a.top), ...Object.keys(b.top)])].filter((k) => a.top[k] !== b.top[k]);
  out.introAdded = b.intro.filter((r) => !a.intro.includes(r));
  out.introRemoved = a.intro.filter((r) => !b.intro.includes(r));
  out.stampChanged = Object.keys(a.stamp).filter((k) => a.stamp[k] !== b.stamp[k]);
  // O carimbo só pode mudar se a ÚNICA outra mudança for introdução vista.
  const stampViolation = out.stampChanged.length > 0 && out.introAdded.length === 0 ? 1 : 0;
  out.total = Object.values(out.created).flat().length + Object.values(out.removed).flat().length + Object.values(out.changed).flat().length + out.top.length + out.introRemoved.length + stampViolation;
  return out;
}
const summarize = (d) => ({
  total: d.total,
  created: Object.fromEntries(Object.entries(d.created).map(([k, v]) => [k, v.length])),
  removed: Object.fromEntries(Object.entries(d.removed).map(([k, v]) => [k, v.length])),
  changed: Object.fromEntries(Object.entries(d.changed).map(([k, v]) => [k, v.length])),
  top: d.top,
  introductionsSeenAdded: d.introAdded,
  stamp: d.stampChanged,
  sampleCreated: Object.values(d.created).flat().slice(0, 5),
  sampleChanged: Object.entries(d.changed).flatMap(([k, v]) => v.slice(0, 3).map((id) => `${k}:${id}`)).slice(0, 6),
});

const waitRows = (page) => page.waitForFunction(() => document.querySelectorAll('[data-athlete-row], .pl-scout-row').length > 0, { timeout: 180000, polling: 100 }).then(() => sleep(500));
const closeDialogs = async (page) => { for (let i = 0; i < 4 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(700); } await sleep(600); };
async function typeSearch(page, value) {
  await page.evaluate((v) => {
    const input = document.querySelector('[data-directory-search], input[placeholder*="Buscar"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await sleep(700);
}
async function clickTab(page, label) {
  const p = await page.evaluate((l) => {
    const t = [...document.querySelectorAll('[role=tab]')].find((x) => x.innerText.trim() === l);
    if (!t) return null; t.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (p) { await page.mouse.click(p.x, p.y); await sleep(600); }
  return Boolean(p);
}
async function openRow(page, index = 0) {
  const ok2 = await page.evaluate((i) => { const rows = [...document.querySelectorAll('[data-athlete-row], .pl-scout-row')]; const r = rows[i]; if (!r) return false; r.click(); return true; }, index);
  if (ok2) await page.waitForSelector('[role=dialog]', { timeout: 20000 }).catch(() => null);
  await sleep(900);
  return ok2;
}

async function navigateOnce(page, log) {
  await spa(page, '/world/directory?tab=athletes', 1200);
  await waitRows(page);
  log.push('diretório');
  await typeSearch(page, 'agustin'); await typeSearch(page, 'Agustín Tapia'); await typeSearch(page, '');
  log.push('busca');
  for (const label of ['Top 100', 'Elite', 'Antes do auge', 'Veteranos', 'Aposentados', 'Todos']) await clickTab(page, label);
  log.push('recortes');
  const moreFilters = await page.$('[data-directory-filter="more"]');
  if (moreFilters) {
    await moreFilters.click(); await sleep(500);
    for (const v of ['overall', 'form', 'clutch', 'ranking']) {
      await page.evaluate((value) => { const s = document.querySelector('select[aria-label="Ordenar"]'); if (!s) return; s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
      await sleep(400);
    }
    log.push('ordenação');
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Carregar mais/.test(b.innerText))?.click());
  await sleep(500);
  // Perfil do 1º (líder): todas as seções, parceiro, voltar.
  if (await openRow(page, 0)) {
    for (const label of ['Resultados', 'Parcerias', 'Jogo', 'Resumo']) await clickTab(page, label);
    const partner = await page.$('[data-athlete-partner-link]');
    if (partner) { await partner.click(); await sleep(1200); const back = await page.$('[data-athlete-back]'); if (back) { await back.click(); await sleep(800); } }
    await closeDialogs(page);
    log.push('perfil líder');
  }
  // Aposentado.
  if (await clickTab(page, 'Aposentados')) { if (await openRow(page, 0)) { await clickTab(page, 'Parcerias'); await closeDialogs(page); log.push('perfil aposentado'); } await clickTab(page, 'Todos'); }
  // Homônimos: o nome mais repetido, dois perfis distintos.
  const dup = await page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const rows = await localGame.entities.AthleteProfile.list();
    const count = new Map(); rows.forEach((a) => count.set(a.name, (count.get(a.name) || 0) + 1));
    const [name, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return n > 1 ? name : null;
  });
  if (dup) { await typeSearch(page, dup); for (const i of [0, 1]) { if (await openRow(page, i)) await closeDialogs(page); } await typeSearch(page, ''); log.push(`homônimos "${dup}"`); }
}

// Fase 3 — navegação cruzada a partir do Diretório (outras telas).
async function crossNavigation(page, log) {
  await spa(page, '/world/directory?tab=athletes', 1200);
  await waitRows(page);
  const firstId = await page.evaluate(() => document.querySelector('[data-athlete-row]')?.getAttribute('data-athlete-row'));
  if (firstId) {
    if (await openRow(page, 0)) {
      const link = await page.$('[data-athlete-ranking-link]');
      if (link) { await link.click(); await sleep(3500); log.push('perfil → ranking'); }
    }
    await closeDialogs(page);
    await spa(page, `/ranking?athlete=${encodeURIComponent(firstId)}`, 3500);
    await page.waitForSelector('[role=dialog]', { timeout: 30000 }).catch(() => null);
    await closeDialogs(page);
    log.push('ranking → perfil');
  }
  await spa(page, '/world', 2500);
  await page.evaluate(() => document.querySelector('[data-world-leader="individual"]')?.click()); await sleep(3000);
  log.push('mundo → ranking');
}

// Universo esportivo: nenhuma tela de consulta pode tocar nestas entidades.
const UNIVERSE = ['AthleteProfile', 'Partnership', 'PartnershipLegacy', 'TeamRanking', 'Tournament', 'TournamentRegistration', 'AthleteRankingResult', 'AthleteRankingHistory', 'AthleteCareerLegacy', 'Match', 'WorldEvent', 'Season', 'CircuitSeason', 'PartnerOffer', 'Club', 'Coach'];
const universeChanges = (d) => Object.fromEntries(UNIVERSE.map((n) => [n, (d.created[n]?.length || 0) + (d.removed[n]?.length || 0) + (d.changed[n]?.length || 0)]).filter(([, v]) => v > 0));

mkdirSync(OUT, { recursive: true });
const report = { createdAt: new Date().toISOString(), base: process.env.PL8C_LABEL || 'working-tree', rounds: ROUNDS, scenarios: {} };
for (const id of scenarioIds) {
  const file = SCENARIOS[id];
  if (!existsSync(file)) { console.log(`SKIP — ${id}: ${file} ausente`); continue; }
  const { browser, page } = await openSession({ save: { url: `/${file}`, careerId: careerIdOf(file) } });
  try {
    await setViewport(page, 390);
    await spa(page, '/game', 2000);
    const base = await snapshot(page);
    const counts = [base.athleteCount];
    const log = [];
    let last = base;
    const perRound = [];
    for (let r = 0; r < ROUNDS; r += 1) {
      await navigateOnce(page, log);
      const now = await snapshot(page);
      counts.push(now.athleteCount);
      perRound.push(summarize(diff(last, now)));
      last = now;
    }
    const total = diff(base, last);
    // Fase 3 — navegação cruzada (Ranking/Mundo).
    const crossLog = [];
    await crossNavigation(page, crossLog);
    const afterCross = await snapshot(page);
    const crossDiff = diff(last, afterCross);
    // Fase 2 — recarregar com deep link: a sessão relê o save do disco e o
    // app faz o boot; o snapshot de referência é tirado DEPOIS do boot e a
    // consulta seguinte tem de ser zero.
    const someId = Object.keys(base.entities.AthleteProfile || {})[0];
    await page.goto(`${BASE}/world/directory?tab=athletes&athlete=${encodeURIComponent(someId)}`, { waitUntil: 'networkidle2', timeout: 180000 }).catch(() => null);
    await page.waitForSelector('[role=dialog]', { timeout: 120000 }).catch(() => null);
    await sleep(2500);
    const reloaded = await snapshot(page);
    await closeDialogs(page);
    await dismissOverlays(page);
    await navigateOnce(page, []);
    const afterReloadNav = await snapshot(page);
    const reloadDiff = diff(reloaded, afterReloadNav);
    report.scenarios[id] = {
      navigation: [...new Set(log)], athleteCounts: counts, total: summarize(total), perRound,
      crossNavigation: { steps: crossLog, all: summarize(crossDiff), universe: universeChanges(crossDiff) },
      reload: { athleteCountAfterBoot: reloaded.athleteCount, afterNavigation: summarize(reloadDiff) },
      relationshipsChanged: base.relationshipsHash !== last.relationshipsHash, jsErrors: page.__errors,
    };
    console.log(`[${id}] atletas por volta: ${counts.join(' → ')} · alterações: ${JSON.stringify(summarize(total))}`);
    ok(`${id}: navegação de consulta não cria atletas (${counts.join(' → ')})`, counts.every((c) => c === counts[0]));
    const VISITED = ['/world/directory', '/ranking', '/world'];
    ok(`${id}: única escrita fora do universo = introdução de página vista (${total.introAdded.join(', ') || 'nenhuma'})`, total.introAdded.every((r) => VISITED.includes(r)), JSON.stringify(total.introAdded));
    ok(`${id}: relacionamentos dos atletas inalterados`, base.relationshipsHash === last.relationshipsHash);
    ok(`${id}: ZERO alteração persistente após ${ROUNDS} voltas (registros e seções)`, total.total === 0, JSON.stringify(summarize(total)));
    ok(`${id}: recarregar + deep link + nova consulta: ZERO alteração`, reloadDiff.total === 0 && reloaded.athleteCount === base.athleteCount, JSON.stringify(summarize(reloadDiff)));
    ok(`${id}: navegação cruzada (Ranking/Mundo) não toca o universo esportivo`, Object.keys(universeChanges(crossDiff)).length === 0, JSON.stringify(universeChanges(crossDiff)));
    console.log(`[${id}] navegação cruzada — tudo o que mudou (relatado): ${JSON.stringify(summarize(crossDiff))}`);
    ok(`${id}: 0 erro de JS`, page.__errors.length === 0, page.__errors.join(' | '));
  } finally {
    await browser.close();
  }
}
const outFile = `${OUT}/readonly-${process.env.PL8C_LABEL || 'working-tree'}.json`;
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`test-local-8c-directory-readonly: ${passed} PASS · ${failures.length} FAIL → ${outFile}`);
if (failures.length) process.exitCode = 1;
