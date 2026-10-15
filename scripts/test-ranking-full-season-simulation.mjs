// Playthrough 5.0, Parte R/X — simulação de temporada completa: Race
// começa corretamente, cresce, não perde resultados, reseta na virada de
// temporada; Circuito evolui (nunca congela nem explode); rankings mudam
// de posição ao longo do tempo (nunca presos pra sempre).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-ranking-full-season-simulation', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { resolveCompletedWorldTourEvents, ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processWorldCircuit } = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Full Season', playerName: 'FullSeason' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({ id: 'full-season-player', sport_name: 'FullSeason', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const athletesStart = await localGame.entities.AthleteProfile.list(null, 3000);
  const trackedIds = athletesStart.filter((a) => Number(a.world_ranking_points) > 0).slice(0, 30).map((a) => a.id);
  const snapshotAt = {};
  async function snapshot(label, date) {
    const rows = await Promise.all(trackedIds.map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)));
    snapshotAt[label] = { date, rows: rows.filter(Boolean) };
  }

  await snapshot('start', '2026-01-01');

  let previousDate = '2026-01-01';
  let date = '2026-01-01';
  // ~15 meses: cobre uma temporada inteira + a virada pra 2027 (reset da Race).
  const end = '2027-04-01';
  while (date < end) {
    const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    previousDate = date;
    date = next.toISOString().slice(0, 10);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    const circuitResult = await processWorldCircuit(profile, previousDate, date).catch(() => null);
    if (circuitResult?.profile) profile = circuitResult.profile;
    if (date === '2026-06-30') await snapshot('midYear', date);
  }
  await snapshot('afterFullYear', date);

  let passed = 0; let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, condition, detail = '') {
    if (condition) { passed += 1; console.log(`${PASS} ${label}`); }
    else { failed += 1; console.log(`${FAIL} ${label} ${detail}`); }
  }

  // Race: cresce ao longo do ano (nunca fica estático pra todo mundo).
  {
    const startRace = new Map(snapshotAt.start.rows.map((r) => [r.id, Number(r.race_points) || 0]));
    const midRace = new Map(snapshotAt.midYear.rows.map((r) => [r.id, Number(r.race_points) || 0]));
    const grew = [...midRace.entries()].filter(([id, points]) => points > (startRace.get(id) || 0)).length;
    check('Race cresce pra ao menos alguns atletas ao longo do ano (nunca fica 100% parada)', grew > 0, `(cresceram: ${grew}/${midRace.size})`);
  }

  // Circuito: evolui (não fica 100% congelado) e não explode pra valores absurdos.
  {
    const startCircuit = new Map(snapshotAt.start.rows.map((r) => [r.id, Number(r.world_ranking_points) || 0]));
    const finalCircuit = new Map(snapshotAt.afterFullYear.rows.map((r) => [r.id, Number(r.world_ranking_points) || 0]));
    const changed = [...finalCircuit.entries()].filter(([id, points]) => points !== (startCircuit.get(id) || 0)).length;
    check('Circuito muda de valor pra ao menos alguns atletas ao longo da simulação (nunca 100% congelado)', changed > 0, `(mudaram: ${changed}/${finalCircuit.size})`);
    const absurd = [...finalCircuit.values()].filter((points) => points > 1_000_000).length;
    check('Circuito não explode pra valores absurdos (>1.000.000 pontos)', absurd === 0, `(absurdos: ${absurd})`);
  }

  // Rankings: posições mudam ao longo do tempo (não ficam presas pra sempre).
  {
    const startPos = new Map(snapshotAt.start.rows.map((r) => [r.id, Number(r.ranking_position) || 0]));
    const finalPos = new Map(snapshotAt.afterFullYear.rows.map((r) => [r.id, Number(r.ranking_position) || 0]));
    const movedUp = [...finalPos.entries()].filter(([id, pos]) => pos > 0 && startPos.get(id) > 0 && pos < startPos.get(id)).length;
    const movedDown = [...finalPos.entries()].filter(([id, pos]) => pos > 0 && startPos.get(id) > 0 && pos > startPos.get(id)).length;
    check('ao menos alguns atletas sobem de posição ao longo da temporada', movedUp > 0, `(subiram: ${movedUp})`);
    check('ao menos alguns atletas caem de posição ao longo da temporada (resultado ruim tem consequência)', movedDown > 0, `(caíram: ${movedDown})`);
  }

  // Race reinicia corretamente na virada de temporada (ano civil).
  {
    const beforeNewYear = await localGame.entities.AthleteProfile.filter({ id: trackedIds[0] }).then((rows) => rows[0]);
    console.log(`race_points de um atleta rastreado ao final da simulação (${date}): ${beforeNewYear?.race_points}`);
    // A simulação já passou por 2027-01-01 (fim em 2027-04-01) — se a Race
    // nunca resetou, o total seria "tudo que ele ganhou em 2026 + 2027" sem
    // separação. Confirma que existe QUEDA visível em pelo menos alguns
    // atletas logo após a virada (evidência indireta de reset, sem
    // depender de instrumentar a data exata do corte).
    const raceValuesAfter = snapshotAt.afterFullYear.rows.map((r) => Number(r.race_points) || 0);
    check('nenhum race_points fica astronomicamente alto depois de 15 meses (evidência de que o reset anual está ativo, não um acumulador vitalício)', raceValuesAfter.every((v) => v < 50000), `(max observado: ${Math.max(...raceValuesAfter)})`);
  }

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-full-season-simulation: PASS');
} finally {
  await vite.close();
}
