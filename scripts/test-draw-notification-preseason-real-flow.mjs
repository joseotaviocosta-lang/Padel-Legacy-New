// Playthrough 4.6E, Parte H / Teste 4 — Roma Pré-Temporada precisa da MESMA
// notificação operacional que qualquer outro torneio do jogador, pelo
// pipeline real (não só a função isolada, como a 4.6D já validou). O que é
// amistoso é a recompensa/ranking (Playthrough 4.6B), não a informação
// operacional do sorteio — não excluir por is_exhibition/tier/ausência de
// pontos.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-preseason-real-flow', search: '' };
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
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Preseason Real Flow', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'preseason-flow-player', sport_name: 'Player46E', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const roma = tournaments.find((t) => t.is_exhibition === true || t.tier === 'Exibição');
  assert.ok(roma, 'pré-condição: Roma Pré-Temporada precisa existir no calendário gerado');
  const regResult = await registerForTournament(profile, roma, 0, {});
  assert.ok(regResult?.success, `pré-condição: inscrição em Roma precisa funcionar: ${JSON.stringify(regResult)}`);

  const eve = new Date(`${roma.start_date}T00:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 3);
  const eveDate = eve.toISOString().slice(0, 10);
  let guard = 0;
  while (profile.career_date < eveDate && guard < 30) { profile = await advanceCareerDayOnce(profile); guard += 1; }

  await check('H. a chave de Roma já existe (mesmo D-3 de qualquer outro torneio)', async () => {
    const row = await localGame.entities.Tournament.get(roma.id);
    assert.equal(Number(row.bracket_schema_version), 2);
    assert.ok(row.bracket_history.length > 0);
  });

  await check('H. Roma recebe a MESMA notificação operacional "Sorteio definido" — nunca excluída por is_exhibition/tier/ausência de pontos', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(roma.id));
    assert.ok(notif, 'Roma deveria gerar a notificação de sorteio, igual a qualquer torneio do jogador');
    assert.ok(notif.title.includes(roma.name), notif.title);
    assert.ok(/[Ss]orteio|[Ss]orteada/.test(`${notif.title} ${notif.content}`));
  });

  await check('H. a notificação de Roma também tem conteúdo rico (não o texto genérico)', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(roma.id));
    assert.notEqual(notif.content, 'A chave foi sorteada. Confira seu adversário da estreia e os compromissos no calendário.', 'Roma não pode cair no fallback genérico se a chave/run têm dados suficientes');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-preseason-real-flow: PASS');
} finally {
  await vite.close();
}
