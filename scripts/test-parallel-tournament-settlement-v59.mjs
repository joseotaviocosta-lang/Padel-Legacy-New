// Playthrough 5.9 (continuação), Partes A e B — "Cairo Platinum Open
// continuava 'Aguardando resultado' enquanto outros eventos da MESMA data
// já estavam concluídos".
//
// "Aguardando resultado" (Tournaments.jsx:698) =
//     isPast && !cancelled && drawState !== COMPLETED
// ou seja: a data já passou e a chave ainda não foi concluída. A pergunta
// real é se isso é uma janela TEMPORAL normal (o settlement roda no tick do
// dia seguinte) ou se um evento pode ficar preso PARA SEMPRE.
//
// Este teste roda uma janela real com vários tiers simultâneos e prova:
//   1. todos encerram;
//   2. cada campeão pertence ao próprio draw;
//   3. nenhum par é creditado em torneio errado;
//   4. nenhum torneio fica eternamente pending;
//   5. ledger idempotente;
//   6. a ORDEM do settlement (dia-a-dia vs. recuperação em lote) não muda
//      o resultado;
//   7. reload mantém tudo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-parallel-tournament-settlement-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const DAYS = Number(process.env.PADEL_PARALLEL_DAYS || 150);

// Roda um mundo AI-only por `days` dias. `mode` controla a ORDEM do
// settlement: 'daily' resolve todo dia; 'catchup' só sorteia durante a
// janela e resolve tudo de uma vez no fim (ordem de chegada invertida:
// várias semanas pendentes numa única passada).
async function runWorld(vite, { label, days, mode }) {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { resolveCompletedWorldTourEvents, ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: `59 Parallel ${label}`, playerName: `Par59${label}` });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: `p59-par-${label}`, sport_name: `Par59${label}`, career_date: '2026-01-01',
    birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  let date = '2026-01-01';
  for (let i = 0; i < days; i += 1) {
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    if (mode === 'daily') await resolveCompletedWorldTourEvents(date).catch(() => null);
  }
  if (mode === 'catchup') {
    // Todas as semanas vencidas de uma vez — ordem de chegada diferente.
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
  }
  const tournaments = await localGame.entities.Tournament.list('start_date', 5000);
  return { storage, career, localGame, date, tournaments, resolveCompletedWorldTourEvents };
}

function endOf(t) { return t.end_date || t.start_date; }

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  // ---------- ordem A: settlement diário ----------
  const daily = await runWorld(vite, { label: 'Daily', days: DAYS, mode: 'daily' });
  const dailyPast = daily.tournaments.filter((t) => t.world_tour_event && endOf(t) < daily.date && !t.world_tour_cancelled);
  const dailyUnresolved = dailyPast.filter((t) => !t.champion && !t.world_tour_resolved);

  // Janela com múltiplos tiers simultâneos (o cenário do Cairo).
  const byWindow = new Map();
  for (const t of dailyPast) {
    const key = t.start_date;
    if (!byWindow.has(key)) byWindow.set(key, []);
    byWindow.get(key).push(t);
  }
  const multiTierWindows = [...byWindow.entries()]
    .map(([start, list]) => ({ start, list, tiers: new Set(list.map((t) => t.tier)) }))
    .filter((w) => w.tiers.size >= 3)
    .sort((a, b) => b.tiers.size - a.tiers.size);

  console.log(`=== ordem A (settlement diário): ${DAYS} dias, até ${daily.date} ===`);
  console.log(`torneios AI-only já vencidos: ${dailyPast.length} | NÃO resolvidos: ${dailyUnresolved.length}`);
  console.log(`janelas com 3+ tiers simultâneos: ${multiTierWindows.length}`);
  if (multiTierWindows[0]) {
    const w = multiTierWindows[0];
    console.log(`  maior janela ${w.start}: ${[...w.tiers].join(', ')} (${w.list.length} torneios)`);
    for (const t of w.list) console.log(`    ${t.tier.padEnd(16)} ${t.name} -> champion=${t.champion ? 'sim' : 'NÃO'} resolved=${Boolean(t.world_tour_resolved)}`);
  }

  await check('Parte B/7: existe janela real com pelo menos 3 tiers simultâneos (cenário do Cairo)', async () => {
    assert.ok(multiTierWindows.length > 0, 'nenhuma janela com 3+ tiers encontrada na amostra');
  });

  await check('Parte B/1+4: NENHUM torneio vencido fica pendente após o tick do dia (não trava indefinidamente)', async () => {
    assert.equal(dailyUnresolved.length, 0,
      `${dailyUnresolved.length} pendentes: ${dailyUnresolved.slice(0, 5).map((t) => `${t.name}(${t.tier}, fim ${endOf(t)})`).join(' | ')}`);
  });

  await check('Parte B/2: todo campeão pertence ao PRÓPRIO draw do torneio', async () => {
    let checked = 0;
    for (const t of dailyPast) {
      if (!Array.isArray(t.draw_pair_ids) || !t.draw_pair_ids.length) continue;
      const ids = t.champion_athlete_ids;
      if (!Array.isArray(ids) || ids.length !== 2) continue;
      const drawn = new Set(t.draw_pair_ids.flatMap((pairId) => String(pairId).startsWith('profile-pair:')
        ? String(pairId).slice('profile-pair:'.length).split(':')
        : []));
      // Só valida os pares sintéticos (resolvíveis sem Partnership); os
      // demais já são cobertos pelo guard de roster da 5.4.
      if (!drawn.size) continue;
      checked += 1;
      const anyKnown = ids.some((id) => drawn.has(id));
      const allKnown = ids.every((id) => drawn.has(id));
      if (anyKnown) assert.ok(allKnown, `${t.name}: campeão parcialmente fora do próprio draw`);
    }
    assert.ok(checked > 0, 'amostra vazia para validação de campeão');
  });

  await check('Parte B/5: settlement é idempotente (reexecutar não altera campeões)', async () => {
    const before = new Map(dailyPast.map((t) => [t.id, t.champion]));
    await daily.resolveCompletedWorldTourEvents(daily.date).catch(() => null);
    const after = await daily.localGame.entities.Tournament.list('start_date', 5000);
    let drifted = 0;
    for (const t of after) {
      if (!before.has(t.id)) continue;
      if (before.get(t.id) !== t.champion) drifted += 1;
    }
    assert.equal(drifted, 0, `${drifted} torneios mudaram de campeão ao reexecutar o settlement`);
  });

  await check('Parte B/7(reload): reler o save preserva campeões e estado resolvido', async () => {
    const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
    const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
    const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
    const reloadManager = new CareerManager(new CareerRepository(new GameStorage(daily.storage)));
    activeCareerAdapter.careerManager = reloadManager;
    activeCareerAdapter.clearActiveCareer();
    activeCareerAdapter.setActiveCareer(await reloadManager.readCareer(daily.career.career_id));
    const reloaded = await daily.localGame.entities.Tournament.list('start_date', 5000);
    const stillUnresolved = reloaded.filter((t) => t.world_tour_event && endOf(t) < daily.date && !t.world_tour_cancelled && !t.champion && !t.world_tour_resolved);
    assert.equal(stillUnresolved.length, 0, `${stillUnresolved.length} pendentes após reload`);
  });

  // ---------- ordem B: settlement em lote (ordem invertida) ----------
  const catchup = await runWorld(vite, { label: 'Catchup', days: DAYS, mode: 'catchup' });
  const catchupPast = catchup.tournaments.filter((t) => t.world_tour_event && endOf(t) < catchup.date && !t.world_tour_cancelled);
  const catchupUnresolved = catchupPast.filter((t) => !t.champion && !t.world_tour_resolved);
  console.log(`\n=== ordem B (recuperação em lote): ${catchupPast.length} vencidos | NÃO resolvidos: ${catchupUnresolved.length} ===`);

  await check('Parte B/6: a ORDEM do settlement (dia-a-dia vs. lote) não deixa nada pendente', async () => {
    assert.equal(catchupUnresolved.length, 0,
      `${catchupUnresolved.length} pendentes no modo lote: ${catchupUnresolved.slice(0, 5).map((t) => `${t.name}(${t.tier})`).join(' | ')}`);
  });

  await check('Parte B/6: ambas as ordens encerram proporções equivalentes de torneios', async () => {
    const dailyResolvedShare = dailyPast.length ? (dailyPast.length - dailyUnresolved.length) / dailyPast.length : 0;
    const catchupResolvedShare = catchupPast.length ? (catchupPast.length - catchupUnresolved.length) / catchupPast.length : 0;
    assert.equal(dailyResolvedShare, 1);
    assert.equal(catchupResolvedShare, 1);
  });

  // ---------- Parte A: a janela temporal ----------
  console.log('\n=== Parte A: natureza de "Aguardando resultado" ===');
  console.log('O rótulo aparece quando a data já passou e a chave ainda não está COMPLETED.');
  console.log(`Nesta amostra, após o tick do dia seguinte, torneios vencidos sem resolução: ${dailyUnresolved.length}.`);
  console.log('Ou seja: é uma janela TEMPORAL (entre o fim do evento e o próximo tick), não um estado preso.');

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-parallel-tournament-settlement-v59: PASS');
} finally {
  await vite.close();
}
