// Playthrough 4.6E, Parte A / Teste 1 — a suspeita principal do briefing:
//   const tournament = objetoAntigo; // sem bracket
//   await ensureTournamentDraw(...);  // banco agora tem bracket
//   await ensureTournamentDrawNotification(profile, tournament); // stale?
// Prova em duas partes independentes:
//   (1) isolado/sintético: ensureTournamentDrawNotification NÃO relê o
//       Tournament sozinho — só confia no objeto recebido. Passar um objeto
//       STALE (capturado antes do sorteio) não cria notificação nenhuma;
//       passar o objeto FRESCO (relido depois) cria normalmente;
//   (2) pipeline real: prova que processCalendarEvents (calendarSystem.js)
//       relê o Tournament do repository DEPOIS do ensureTournamentDraw,
//       nunca usa o objeto capturado antes do sorteio — a notificação já
//       existe no dia certo sem nenhuma chamada manual.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-fresh-tournament-read', search: '' };
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
  const { ensureTournamentDrawNotification } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Fresh Read', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'fresh-read-player', sport_name: 'Player46E', career_date: '2026-01-26', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });

  // Cenário sintético isolado: um Tournament SEM chave (o "objetoAntigo" da
  // suspeita), depois atualizado no storage COM chave — igual ao que
  // ensureTournamentDraw faria.
  const staleTournament = await localGame.entities.Tournament.create({
    id: 'stale-object-tournament', name: 'Torneio Stale', tier: 'Silver',
    start_date: '2026-01-29', end_date: '2026-02-01', bracket_history: [], bracket_schema_version: null,
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${staleTournament.id}`, profile_id: profile.id, tournament_id: staleTournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });
  await localGame.entities.Tournament.update(staleTournament.id, {
    bracket_schema_version: 2, draw_date: '2026-01-26', status: 'chaveamento',
    bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'Jogador & Parceiro', team_b: 'Rival & Parceiro', player_match: true }] }],
  });

  await check('1 (suspeita). objeto STALE (capturado antes do sorteio, sem bracket_history) NÃO gera notificação', async () => {
    const result = await ensureTournamentDrawNotification(profile, staleTournament);
    assert.equal(result, null, 'ensureTournamentDrawNotification não pode confiar em bracket_history de um objeto desatualizado');
  });

  await check('1. objeto FRESCO (relido do repository, já com bracket_history) gera a notificação normalmente', async () => {
    const freshTournament = await localGame.entities.Tournament.get(staleTournament.id);
    assert.ok(freshTournament.bracket_history.length > 0, 'pré-condição: o objeto fresco precisa ter a chave');
    const result = await ensureTournamentDrawNotification(profile, freshTournament);
    assert.ok(result, 'com o objeto fresco, a notificação deveria nascer');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    assert.equal(messages.filter((m) => String(m.related_entity_id) === staleTournament.id).length, 1);
  });

  console.log('\n--- Parte 2: pipeline real (calendarSystem.js) nunca usa objeto stale ---');
  const { CareerManager: CareerManager2 } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { CareerRepository: CareerRepository2 } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { GameStorage: GameStorage2 } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager2 = new CareerManager2(new CareerRepository2(new GameStorage2(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager2;
  activeCareerAdapter.clearActiveCareer();
  const { career: career2 } = await manager2.createCareer({ saveName: '4.6E Fresh Read Pipeline', playerName: 'Player 4.6E-2' });
  activeCareerAdapter.setActiveCareer(career2);
  let profile2 = await activeCareerAdapter.createPlayerProfile({
    id: 'fresh-read-pipeline-player', sport_name: 'Player46E2', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile2.id, { partner_id: starterPartner.id });
  profile2 = await activeCareerAdapter.getPlayerProfile();
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const londres = tournaments.find((t) => t.name?.includes('Londres'));
  await registerForTournament(profile2, londres, 0, {});
  while (profile2.career_date < '2026-01-26') profile2 = await advanceCareerDayOnce(profile2);

  await check('1. PROVA: no D-3 real, a notificação já existe SÓ pelo avanço de dia (produção relê o Tournament fresco internamente)', async () => {
    const row = await localGame.entities.Tournament.get(londres.id);
    assert.ok(row.bracket_history.length > 0, 'pré-condição: chave já deveria existir em D-3');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile2.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));
    assert.ok(notif, 'a notificação real de produção não pode depender de nenhuma chamada manual/adicional');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-fresh-tournament-read: PASS');
} finally {
  await vite.close();
}
