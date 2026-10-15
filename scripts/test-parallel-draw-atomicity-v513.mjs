// Playthrough 5.13 (continuação), Parte N — vários torneios sorteando no
// MESMO D-3 não podem interferir entre si.
//
// No playtest, além do Dubai, "outro torneio simultâneo no mesmo dia também
// podia estar sem chave visível". Este teste roda o D-3 com Bronze, Gold e
// Masters na mesma data e verifica, para cada um: chave persistida,
// consultável numa leitura nova e sem contaminar os demais.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-parallel-draw-atomicity-v513', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const hasUsableBracket = (t) => Number(t?.bracket_schema_version) >= 2
  && Array.isArray(t?.bracket_history) && t.bracket_history.length > 0;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 ParallelDraw', playerName: 'P513P' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p513p', sport_name: 'P513P', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 10000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  // Procura uma data em que o próprio calendário já tem VÁRIOS eventos.
  const all = await localGame.entities.Tournament.list('start_date', 5000);
  const byStart = new Map();
  for (const t of all) {
    if (!t.start_date || !t.world_tour_event) continue;
    if (!byStart.has(t.start_date)) byStart.set(t.start_date, []);
    byStart.get(t.start_date).push(t);
  }
  const candidate = [...byStart.entries()]
    .filter(([start, list]) => start > '2026-01-10' && list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)[0];
  assert.ok(candidate, 'pré-condição: nenhuma data com 3+ eventos simultâneos');

  const [startDate, sameDay] = candidate;
  const drawDay = (() => {
    const d = new Date(`${startDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 3);
    return d.toISOString().slice(0, 10);
  })();

  console.log(`data: ${startDate} | eventos simultâneos: ${sameDay.length} | D-3 = ${drawDay}`);
  console.log(`tiers: ${sameDay.map((t) => t.tier).join(', ')}`);

  await check('Parte N/16: o cenário tem 3+ eventos no mesmo dia', () => {
    assert.ok(sameDay.length >= 3, `só ${sameDay.length} eventos`);
    assert.ok(new Set(sameDay.map((t) => t.tier)).size >= 2, 'todos do mesmo tier — cenário fraco');
  });

  const beforeIds = sameDay.map((t) => t.id);
  const before = await Promise.all(beforeIds.map((id) => localGame.entities.Tournament.get(id)));

  await check('pré-condição: nenhum deles tem chave antes do D-3', () => {
    const already = before.filter(hasUsableBracket);
    assert.equal(already.length, 0, `${already.length} já tinham chave`);
  });

  // UMA passada do D-3 para todos.
  const result = await ensureWorldTourDraws(drawDay);
  console.log(`ensureWorldTourDraws(${drawDay}): sorteados=${result?.drawn} cancelados=${result?.cancelled} erros=${result?.errors?.length || 0}`);

  const after = await Promise.all(beforeIds.map((id) => localGame.entities.Tournament.get(id)));
  const drawnOrResolved = after.filter((t) => hasUsableBracket(t) || t.world_tour_cancelled);

  console.log('\nestado após o D-3:');
  for (const t of after) {
    console.log(`  ${String(t.tier).padEnd(9)} ${String(t.name).slice(0, 30).padEnd(32)} chave=${hasUsableBracket(t)} cancelado=${Boolean(t.world_tour_cancelled)}`);
  }

  await check('Parte N/17: cada evento simultâneo resolveu (chave persistida ou cancelamento explícito)', () => {
    assert.equal(drawnOrResolved.length, after.length,
      `${after.length - drawnOrResolved.length} eventos ficaram em limbo (sem chave e sem cancelamento)`);
  });

  await check('Parte N: os que sortearam têm chave CONSULTÁVEL numa leitura nova', async () => {
    const drawn = after.filter(hasUsableBracket);
    assert.ok(drawn.length > 0, 'nenhum evento sorteou');
    for (const t of drawn) {
      const fresh = await localGame.entities.Tournament.get(t.id);
      assert.ok(hasUsableBracket(fresh), `${t.name}: chave não reconstrói numa leitura nova`);
    }
    console.log(`   [registro] ${drawn.length}/${after.length} eventos com chave consultável`);
  });

  await check('Parte N: zero interferência cruzada — cada chave tem os próprios participantes', () => {
    const drawn = after.filter(hasUsableBracket);
    const seen = new Map();
    for (const t of drawn) {
      const ids = Array.isArray(t.draw_pair_ids) ? t.draw_pair_ids : [];
      assert.ok(ids.length > 0, `${t.name}: sorteou sem elenco persistido`);
      for (const pairId of ids) {
        const other = seen.get(pairId);
        assert.ok(!other, `a dupla ${pairId} aparece em ${other} e ${t.name} no mesmo dia`);
        seen.set(pairId, t.name);
      }
    }
  });

  await check('Parte N: rodar o mesmo D-3 de novo não duplica nem altera as chaves', async () => {
    const snapshot = after.filter(hasUsableBracket).map((t) => ({ id: t.id, rounds: t.bracket_history.length, pairs: (t.draw_pair_ids || []).length }));
    await ensureWorldTourDraws(drawDay);
    for (const s of snapshot) {
      const again = await localGame.entities.Tournament.get(s.id);
      assert.equal(again.bracket_history.length, s.rounds, `${s.id}: número de rodadas mudou`);
      assert.equal((again.draw_pair_ids || []).length, s.pairs, `${s.id}: elenco mudou`);
    }
  });

  await check('Parte N: nenhum evento de OUTRA data foi afetado por esta passada', async () => {
    const otherDate = [...byStart.keys()].find((d) => d > startDate);
    if (!otherDate) return;
    const others = byStart.get(otherDate) || [];
    for (const t of others.slice(0, 5)) {
      const fresh = await localGame.entities.Tournament.get(t.id);
      const daysAway = Math.round((new Date(`${otherDate}T00:00:00Z`) - new Date(`${drawDay}T00:00:00Z`)) / 86400000);
      if (daysAway <= 3) continue; // legitimamente dentro da própria janela
      assert.ok(!hasUsableBracket(fresh), `${t.name} (${otherDate}) sorteou fora da janela`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-parallel-draw-atomicity-v513: PASS');
} finally {
  await vite.close();
}
