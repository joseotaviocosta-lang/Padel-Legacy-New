// Playthrough 4.6C, itens 2/10/11 — chamar ensureWorldTourDraws várias
// vezes no mesmo dia (ex.: o sino de notificações e o avanço de dia
// disputando o mesmo instante, ou o jogador reabrindo o app sem avançar a
// data) NÃO pode recriar a chave, mudar participantes, mudar match_id nem
// publicar uma segunda vez. Idempotência sobre o MESMO storage (fechar e
// reabrir) também é coberta.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor(files) { this.files = files || new Map(); this.directories = new Set(); }
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-tournament-draw-reload-idempotency', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const disk = new Map();
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6C Reload Idempotency', playerName: 'Player 4.6C' });
  activeCareerAdapter.setActiveCareer(career);

  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
  }

  async function seedPairs(count) {
    for (let i = 0; i < count; i += 1) {
      const a = await localGame.entities.AthleteProfile.create({ id: `idem-${i}-a`, name: `Idem ${i}A`, overall_rating: 70 - i * 0.1, energy: 100, ranking_position: i * 2 + 1, world_ranking_points: 4000 - i * 4, race_points: 0 });
      const b = await localGame.entities.AthleteProfile.create({ id: `idem-${i}-b`, name: `Idem ${i}B`, overall_rating: 70 - i * 0.1, energy: 100, ranking_position: i * 2 + 2, world_ranking_points: 4000 - i * 4 - 2, race_points: 0 });
      await localGame.entities.Partnership.create({ id: `idem-partnership-${i}`, athlete_a_id: a.id, athlete_b_id: b.id, status: 'ativa', chemistry: 60 });
    }
  }
  await seedPairs(40);

  const tournament = await localGame.entities.Tournament.create({
    id: 'idempotency-gold', name: 'Idempotency Gold', tier: 'Gold', world_tour_event: true,
    start_date: '2026-03-05', end_date: '2026-03-09', main_draw_size: 24,
  });

  await check('2/10. primeira chamada de ensureWorldTourDraws no D-3 sorteia normalmente', async () => {
    const result = await ensureWorldTourDraws('2026-03-02');
    assert.deepEqual(result.errors, []);
    const row = await localGame.entities.Tournament.get(tournament.id);
    assert.equal(Number(row.bracket_schema_version), 2);
    assert.ok(row.bracket_history.length > 0);
  });

  const firstDraw = await localGame.entities.Tournament.get(tournament.id);
  const firstBracketJson = JSON.stringify(firstDraw.bracket_history);
  const firstPairIds = [...(firstDraw.draw_pair_ids || [])].sort();
  const firstMatchIds = firstDraw.bracket_history.flatMap((r) => (r.matches || []).map((m) => m.match_id)).sort();

  await check('10. chamar ensureWorldTourDraws de novo NO MESMO DIA não recria a chave nem muda participantes/match_ids', async () => {
    await ensureWorldTourDraws('2026-03-02');
    await ensureWorldTourDraws('2026-03-02');
    const row = await localGame.entities.Tournament.get(tournament.id);
    assert.equal(JSON.stringify(row.bracket_history), firstBracketJson, 'bracket_history não pode mudar em chamadas repetidas');
    assert.deepEqual([...(row.draw_pair_ids || [])].sort(), firstPairIds, 'participantes não podem mudar');
    const matchIds = row.bracket_history.flatMap((r) => (r.matches || []).map((m) => m.match_id)).sort();
    assert.deepEqual(matchIds, firstMatchIds, 'match_ids não podem mudar');
  });

  await check('11. reabrir o app (novo adapter/repository sobre o MESMO storage) preserva a chave idêntica', async () => {
    activeCareerAdapter.clearActiveCareer();
    const manager2 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
    activeCareerAdapter.careerManager = manager2;
    const reloaded = await manager2.loadCareer(career.career_id || career.id);
    activeCareerAdapter.setActiveCareer(reloaded.career || reloaded);
    const row = await localGame.entities.Tournament.get(tournament.id);
    assert.equal(JSON.stringify(row.bracket_history), firstBracketJson, 'bracket_history deveria sobreviver ao reload idêntico');
  });

  await check('9/10. settlement (resolveCompletedWorldTourEvents) chamado duas vezes no mesmo dia é idempotente (champion não muda, não duplica WorldEvent)', async () => {
    await resolveCompletedWorldTourEvents('2026-03-10');
    const afterFirst = await localGame.entities.Tournament.get(tournament.id);
    const championFirst = afterFirst.champion;
    assert.ok(championFirst, 'settlement deveria ter decidido um campeão');
    await resolveCompletedWorldTourEvents('2026-03-10');
    const afterSecond = await localGame.entities.Tournament.get(tournament.id);
    assert.equal(afterSecond.champion, championFirst, 'campeão não pode mudar numa segunda chamada de settlement');
    const worldEvents = await localGame.entities.WorldEvent.filter({ related_tournament_id: tournament.id }).catch(() => []);
    const titleEvents = worldEvents.filter((e) => e.event_type === 'tournament_result');
    assert.ok(titleEvents.length <= 1, `settlement idempotente não pode publicar mais de um evento de título: ${titleEvents.length}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tournament-draw-reload-idempotency: PASS');
} finally {
  await vite.close();
}
