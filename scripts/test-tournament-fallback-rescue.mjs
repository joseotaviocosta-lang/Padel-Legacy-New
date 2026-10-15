// Playthrough 4.5D, item 3/7 — fallback de campo: quando a atribuição
// semanal normal (economia + fallback de tier) não preenche o mínimo
// viável de um torneio, uma dupla canônica OCIOSA (não escolhida por
// nenhum torneio desta semana) é resgatada antes de aceitar o evento como
// pendente/cancelável. Nunca inventa par, nunca duplica uma dupla entre
// dois torneios, e tiers mais altos são processados primeiro (não perdem
// pool de resgate para um tier inferior).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-tournament-fallback-rescue', search: '' };
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
  const { ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5D Fallback Rescue', playerName: 'Player 4.5D-Rescue' });
  activeCareerAdapter.setActiveCareer(career);

  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
  }

  async function seedPairs(count, idPrefix, rankStart) {
    for (let i = 0; i < count; i += 1) {
      const a = await localGame.entities.AthleteProfile.create({
        id: `${idPrefix}-${i}-a`, name: `${idPrefix} A${i}`, overall_rating: 75 - i, energy: 90,
        ranking_position: rankStart + i * 2, world_ranking_points: 4000 - i * 5, race_points: 0,
      });
      const b = await localGame.entities.AthleteProfile.create({
        id: `${idPrefix}-${i}-b`, name: `${idPrefix} B${i}`, overall_rating: 75 - i, energy: 90,
        ranking_position: rankStart + i * 2 + 1, world_ranking_points: 4000 - i * 5 - 2, race_points: 0,
      });
      await localGame.entities.Partnership.create({ id: `${idPrefix}-partnership-${i}`, athlete_a_id: a.id, athlete_b_id: b.id, status: 'ativa', chemistry: 60 });
    }
  }

  // 10 duplas ranqueadas o bastante pra Gold (rank 1-20), MAS um dos dois
  // Gold concorrentes só vai atrair uma fração pequena via chooseTournament
  // (o resto prefere o outro Gold) — sem resgate, ficaria abaixo do mínimo
  // viável (8) mesmo havendo duplas ociosas sobrando no mundo.
  await seedPairs(16, 'rescue', 1);

  const goldA = await localGame.entities.Tournament.create({
    id: 'gold-a-rescue', name: 'Gold A', tier: 'Gold', world_tour_event: true,
    start_date: '2026-11-01', end_date: '2026-11-06', main_draw_size: 8,
  });
  const goldB = await localGame.entities.Tournament.create({
    id: 'gold-b-rescue', name: 'Gold B', tier: 'Gold', world_tour_event: true,
    start_date: '2026-11-01', end_date: '2026-11-06', main_draw_size: 8,
  });

  await check('3/7. Fallback rescue: duplas ociosas preenchem o mínimo viável sem duplicar entre torneios', async () => {
    const result = await ensureWorldTourDraws('2026-10-29');
    assert.deepEqual(result.errors, [], `sorteio não pode falhar: ${JSON.stringify(result.errors)}`);

    const rowA = await localGame.entities.Tournament.get(goldA.id);
    const rowB = await localGame.entities.Tournament.get(goldB.id);
    console.log(`   Gold A: bracket=${Number(rowA.bracket_schema_version) >= 2} participantes=${rowA.draw_participant_count || 0} pending=${rowA.draw_pending_reason || null}`);
    console.log(`   Gold B: bracket=${Number(rowB.bracket_schema_version) >= 2} participantes=${rowB.draw_participant_count || 0} pending=${rowB.draw_pending_reason || null}`);

    // Com 16 duplas para 2 Gold de draw 8 (mínimo viável 8 cada, total 16),
    // o resgate deve conseguir preencher os DOIS ao mínimo viável — sem
    // ele, um dos dois ficaria pendente mesmo havendo gente sobrando.
    assert.equal(Number(rowA.bracket_schema_version) >= 2, true, 'Gold A preenchido (resgatado do pool ocioso quando necessário)');
    assert.equal(Number(rowB.bracket_schema_version) >= 2, true, 'Gold B preenchido');

    const idsA = rowA.draw_pair_ids || [];
    const idsB = rowB.draw_pair_ids || [];
    const overlap = idsA.filter((id) => idsB.includes(id));
    assert.equal(overlap.length, 0, 'nenhuma dupla resgatada aparece nos dois torneios ao mesmo tempo');
    assert.equal(new Set(idsA).size, idsA.length, 'Gold A não duplica dupla internamente');
    assert.equal(new Set(idsB).size, idsB.length, 'Gold B não duplica dupla internamente');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tournament-fallback-rescue: PASS');
} finally {
  await vite.close();
}
