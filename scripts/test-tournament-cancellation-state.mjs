// Playthrough 4.5C — estado terminal de "torneio cancelado" (Cidade do
// Cabo: chega ao início sem campo mínimo). Prova o fluxo completo (D-3 →
// retry D-2/D-1 → D0 → cancelamento explícito no D+1), a projeção visível
// (UI distingue cancelado de "aguardando sorteio" e de "concluído"), o
// WorldEvent de cancelamento, e que o evento cancelado NUNCA revive
// (idempotência: avançar dia, reler, "reiniciar" não gera chave, campeão
// ou Race retroativos).
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-tournament-cancellation-state', search: '' };
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
  const {
    getVisibleTournamentBracketState, isTournamentCancelled, getTournamentCancellationLabel,
  } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5C Cancellation State', playerName: 'Player 4.5C' });
  activeCareerAdapter.setActiveCareer(career);

  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
  }

  // Nenhuma dupla no mundo — Cidade do Cabo não consegue campo mínimo em
  // nenhuma tentativa, o cenário mais simples e determinístico do bug.
  const capeTown = await localGame.entities.Tournament.create({
    id: 'cape-town-cancel', name: 'Cidade do Cabo Gold Series', tier: 'Gold', world_tour_event: true,
    start_date: '2026-10-01', end_date: '2026-10-06', main_draw_size: 24,
  });

  await check('1. Estado persistido real: D-3/D-2/D-1 tentam sem sucesso, sem cancelar cedo demais', async () => {
    await ensureWorldTourDraws('2026-09-28'); // D-3
    let row = await localGame.entities.Tournament.get(capeTown.id);
    assert.equal(row.world_tour_cancelled, undefined, 'D-3: ainda não pode cancelar');
    assert.equal(row.draw_pending_reason, 'inscritos_insuficientes_ate_agora');

    await ensureWorldTourDraws('2026-09-29'); // D-2
    await ensureWorldTourDraws('2026-09-30'); // D-1
    row = await localGame.entities.Tournament.get(capeTown.id);
    assert.equal(row.world_tour_cancelled, undefined, 'D-2/D-1: ainda dentro da janela de retry');
    assert.equal(row.champion, undefined);
    assert.equal(Number(row.bracket_schema_version) >= 2, false);
  });

  await check('5. D0 sem campo: continua sem chave; D+1: cancelamento explícito com todos os campos corretos', async () => {
    await ensureWorldTourDraws('2026-10-01'); // D0 — última tentativa real.
    let row = await localGame.entities.Tournament.get(capeTown.id);
    assert.equal(row.world_tour_cancelled, undefined, 'D0 ainda não é cancelamento — é a última tentativa de sorteio');

    await ensureWorldTourDraws('2026-10-02'); // D+1 — passou do início.
    row = await localGame.entities.Tournament.get(capeTown.id);
    assert.equal(row.status, 'cancelado');
    assert.equal(row.current_phase, 'cancelado');
    assert.equal(row.cancellation_reason, 'sem_chave_ate_o_inicio');
    assert.equal(row.world_tour_cancelled, true);
    assert.equal(row.world_tour_resolved, true);
    assert.equal(Array.isArray(row.bracket_history) && row.bracket_history.length > 0, false, 'bracket vazio');
    assert.equal(Number(row.bracket_schema_version) >= 2, false);
    assert.equal(row.champion, undefined, 'champion null');
    assert.equal(row.runner_up, undefined, 'runner_up null');
  });

  await check('4/5. WorldEvent.tournament_cancelled foi criado e persiste', async () => {
    const events = await localGame.entities.WorldEvent.filter({ related_tournament_id: capeTown.id, event_type: 'tournament_cancelled' });
    assert.equal(events.length, 1, 'exatamente um WorldEvent de cancelamento, nunca zero nem duplicado');
    assert.ok(events[0].title.includes(capeTown.name));
    // Nenhuma notícia de campeão para este torneio.
    const championEvents = await localGame.entities.WorldEvent.filter({ related_tournament_id: capeTown.id, event_type: 'tournament_result' });
    assert.equal(championEvents.length, 0, 'nenhuma notícia de campeão para um torneio cancelado');
  });

  await check('2/3. Projeção visível (UI) distingue CANCELADO de "aguardando sorteio" e de "concluído"', async () => {
    const row = await localGame.entities.Tournament.get(capeTown.id);
    const visible = getVisibleTournamentBracketState(row, '2026-10-10');
    assert.equal(visible.cancelled, true);
    assert.equal(visible.champion, null, 'nunca revela campeão para um evento cancelado');
    assert.equal(isTournamentCancelled(row), true);
    assert.ok(getTournamentCancellationLabel(row).toLowerCase().includes('insuficiente'), 'motivo amigável traduzido');

    // Um torneio genuinamente "aguardando sorteio" (ainda dentro da janela,
    // sem chave) não pode ser confundido com cancelado.
    const pending = { ...row, world_tour_cancelled: false, status: 'agendado', current_phase: 'inscricoes', cancellation_reason: null, bracket_history: [] };
    assert.equal(isTournamentCancelled(pending), false);
    assert.equal(getVisibleTournamentBracketState(pending, '2026-09-28').cancelled, false);
  });

  // ── Item 6 — evento cancelado não pode reviver.
  await check('6. Depois de cancelado: advance day / reload / settlement não criam chave, campeão ou Race retroativos', async () => {
    const beforeRepeat = await localGame.entities.Tournament.get(capeTown.id);

    // "advance day" — chamadas repetidas de ensureWorldTourDraws em datas
    // futuras não tocam mais o torneio (já não é due, já está cancelado).
    await ensureWorldTourDraws('2026-10-03');
    await ensureWorldTourDraws('2026-10-15');
    let after = await localGame.entities.Tournament.get(capeTown.id);
    assert.deepEqual(after, beforeRepeat, 'nenhuma mudança — nem um único campo — depois de avançar dias adicionais');

    // "settlement" — mesmo bem depois do end_date, resolveCompletedWorldTourEvents
    // não pode reabrir/reprocessar um torneio já world_tour_resolved.
    await resolveCompletedWorldTourEvents('2026-11-01');
    after = await localGame.entities.Tournament.get(capeTown.id);
    assert.deepEqual(after, beforeRepeat, 'settlement não fabrica chave/campeão retroativo para um torneio já cancelado');

    // "reload" — releitura pura via getVisibleTournamentBracketState não
    // pode mudar de opinião sobre a mesma data.
    const read1 = getVisibleTournamentBracketState(after, '2026-11-01');
    const read2 = getVisibleTournamentBracketState(after, '2026-11-01');
    assert.deepEqual(read1, read2, 'releitura idempotente — reload não regenera nem varia o estado');
    assert.equal(read1.champion, null);

    // Nenhum Race foi distribuído para ninguém por causa deste torneio
    // (nenhum AthleteProfile referencia related_tournament_id do evento
    // cancelado em recent_results).
    const anyRaceReference = (await localGame.entities.AthleteProfile.list('-race_points', 50))
      .some((athlete) => (athlete.recent_results || []).some((result) => result.tournament_id === capeTown.id));
    assert.equal(anyRaceReference, false, 'nenhum atleta recebeu Race de um torneio cancelado');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tournament-cancellation-state: PASS');
} finally {
  await vite.close();
}
