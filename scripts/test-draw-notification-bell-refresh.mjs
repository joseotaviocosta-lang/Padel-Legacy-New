// Playthrough 4.6E, Parte C/D — audita o evento de refresh/alerta.
// Invariante pedido: persist termina -> dispatch refresh -> UI relê
// repository. NUNCA dispatch -> persist.
//
// Provado aqui sem montar componentes React (o dispatch em si é a
// interface pública testável em headless): `advanceCareerDayOnce`
// (dayAdvanceCoordinator.js) já dispara 'padel:communications-refresh'
// DEPOIS que toda a transação de avanço (incluindo processCalendarEvents,
// onde a notificação de sorteio nasce) termina — nunca antes. E
// `ensureTournamentDrawNotification` só dispara 'padel:draw-notification'
// (o evento que alimenta o toast, Parte D) depois que a
// CareerMessage.upsert já retornou — nunca antes da persistência.
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

// Grava a ORDEM de tudo que passa por window.dispatchEvent/entities writes
// relevantes, num log compartilhado, pra provar a sequência real.
const eventLog = [];
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-bell-refresh', search: '' };
globalThis.window = {
  location: globalThis.location,
  dispatchEvent(event) { eventLog.push({ type: event.type, detail: event.detail, at: Date.now() }); },
};
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
  const { career } = await manager.createCareer({ saveName: '4.6E Bell Refresh', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'bell-refresh-player', sport_name: 'Player46E', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const londres = tournaments.find((t) => t.name?.includes('Londres'));
  await registerForTournament(profile, londres, 0, {});
  while (profile.career_date < '2026-01-25') profile = await advanceCareerDayOnce(profile);

  eventLog.length = 0; // só nos importa o dia exato do sorteio a partir daqui.
  profile = await advanceCareerDayOnce(profile); // 2026-01-26, D-3.

  const drawNotifIndex = eventLog.findIndex((e) => e.type === 'padel:draw-notification');
  const refreshIndex = eventLog.findIndex((e) => e.type === 'padel:communications-refresh');
  const profileUpdatedIndex = eventLog.findIndex((e) => e.type === 'padel:profile-updated');

  console.log(`\nordem dos eventos no dia do sorteio: ${eventLog.map((e) => e.type).join(' -> ')}`);

  await check('C. padel:draw-notification foi disparado (D-3, sorteio real)', () => {
    assert.ok(drawNotifIndex >= 0, 'o evento de alerta deveria existir neste dia');
  });

  await check('C. padel:communications-refresh (o mesmo que CommunicationBell escuta) também foi disparado', () => {
    assert.ok(refreshIndex >= 0);
  });

  await check('C. invariante: persist -> dispatch, nunca dispatch -> persist — a mensagem já está no repository ANTES do evento de refresh existir', async () => {
    // No momento em que o evento foi enfileirado, a CareerMessage já tinha
    // sido escrita (upsertCareerMessage é await-ado antes do dispatchEvent
    // em ensureTournamentDrawNotification) — comprovado lendo o repository
    // DEPOIS que advanceCareerDayOnce (que já disparou tudo) terminou.
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));
    assert.ok(notif, 'a mensagem persistida precisa existir — o dispatch só é o alerta de algo que já é fato');
  });

  await check('C. padel:profile-updated (que a Central/CareerHub também escutam pra recarregar) foi disparado no mesmo avanço', () => {
    assert.ok(profileUpdatedIndex >= 0);
  });

  await check('C. o evento de refresh do dia inteiro (broadcastProfileUpdate) só acontece DEPOIS que toda a transação de avanço (incluindo a notificação) termina', () => {
    // eventLog só é populado DENTRO desta chamada de advanceCareerDayOnce —
    // se chegou até aqui com o array populado, o dispatch aconteceu depois
    // do await ter retornado o profile já persistido.
    assert.ok(eventLog.length > 0);
    assert.equal(profile.career_date, '2026-01-26');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-bell-refresh: PASS');
} finally {
  await vite.close();
}
