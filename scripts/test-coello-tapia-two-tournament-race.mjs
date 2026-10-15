// Playthrough 5.0, Parte S/X — reprodução obrigatória do cenário real
// relatado: uma dupla real vence um torneio, some pontos na Race; no
// torneio seguinte chega à final de novo (campeã ou vice) — a Race
// precisa refletir a SOMA dos dois resultados, nunca só o mais recente.
// Usa o pipeline AI-only real (WorldTourLifecycle.js/resolveCompletedWorldTourEvents
// — já confirmado correto pela auditoria desta fase: credita TODOS os
// pares do bracket, não só o campeão). Em vez de scriptar partida a
// partida (não determinístico por design — resultado depende da
// simulação, Parte K), reforça o OVR de uma dupla real específica o
// suficiente para que ela vença consistentemente e colha múltiplos
// resultados datados ao longo de uma janela real de calendário — depois
// verifica que `race_points`/`world_ranking_points` são a SOMA de todos
// os `AthleteRankingResult` datados dela, nunca só o último.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-coello-tapia-two-tournament-race', search: '' };
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

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Coello Tapia', playerName: 'CoelloTapia' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'ct-player', sport_name: 'CoelloTapia', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  // Encontra a dupla de atletas reais Coello/Tapia (se existirem no
  // catálogo real) — senão, usa quaisquer dois atletas parceiros de IA
  // reais e reforça o OVR pra garantir domínio consistente na simulação.
  const athletes = await localGame.entities.AthleteProfile.list(null, 3000);
  const coello = athletes.find((a) => /coello/i.test(a.name || '')) || athletes.find((a) => a.ai_partner_id);
  const tapia = coello ? athletes.find((a) => a.id === coello.ai_partner_id) : null;
  assert.ok(coello && tapia, 'pré-condição: precisa haver ao menos uma dupla de IA real no mundo seedado');
  await localGame.entities.AthleteProfile.update(coello.id, { overall_rating: 99, form: 100, energy: 100 });
  await localGame.entities.AthleteProfile.update(tapia.id, { overall_rating: 99, form: 100, energy: 100 });
  const raceBefore = { coello: 0, tapia: 0 };

  let date = '2026-01-01';
  const end = '2026-09-30';
  while (date < end) {
    const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
  }

  const coelloResults = await localGame.entities.AthleteRankingResult.filter({ athlete_id: coello.id }).catch(() => []);
  const realResults = coelloResults.filter((row) => !row.is_legacy_seed);
  console.log(`Coello/Tapia disputaram ${realResults.length} torneios reais na janela simulada.`);
  console.log('resultados:', realResults.map((r) => `${r.tournament_name}:${r.finish}:+${r.points}`));

  let passed = 0; let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, condition, detail = '') {
    if (condition) { passed += 1; console.log(`${PASS} ${label}`); }
    else { failed += 1; console.log(`${FAIL} ${label} ${detail}`); }
  }

  check('a dupla disputou ao menos 2 torneios reais na janela simulada (amostra suficiente pra testar acumulação)', realResults.length >= 2, `(obtido: ${realResults.length})`);

  const finalRow = await localGame.entities.AthleteProfile.get(coello.id);
  const sumOfResults = realResults.reduce((sum, row) => sum + (Number(row.points) || 0), 0);

  check('race_points final é a SOMA de todos os resultados datados — nunca só o último', Number(finalRow.race_points) === sumOfResults, `(race_points=${finalRow.race_points}, soma=${sumOfResults})`);

  const partnerFinalRow = await localGame.entities.AthleteProfile.get(tapia.id);
  check('o PARCEIRO (Tapia) recebeu o MESMO crédito total — simetria da dupla', Number(partnerFinalRow.race_points) === Number(finalRow.race_points), `(coello=${finalRow.race_points}, tapia=${partnerFinalRow.race_points})`);

  const hasChampionResult = realResults.some((r) => r.finish === 'champion');
  // Nota: com OVR 99 reforçado (dominância deliberada, pra garantir uma
  // amostra grande dentro da janela simulada), a dupla tende a vencer
  // TODOS os torneios que disputa — não é garantido observar uma
  // colocação diferente de campeão nesta amostra específica. O cenário
  // EXATO "título + vice" (colocações diferentes) já é coberto,
  // determinístico e por ID real, em test-race-runner-up-points.mjs; aqui
  // o que importa é confirmar que MÚLTIPLOS resultados reais (mesmo que
  // todos títulos) somam corretamente via o pipeline real de produção.
  check('a amostra inclui ao menos um resultado de título (dupla venceu ao menos 1 torneio real)', hasChampionResult, `(finishes: ${realResults.map((r) => r.finish).join(', ')})`);

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-coello-tapia-two-tournament-race: PASS');
} finally {
  await vite.close();
}
