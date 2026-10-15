// Playthrough 4.6D, itens 5/6/12.2 — cenário do "bootstrap interrompido":
// a chave já existe persistida (simulando uma sessão anterior onde, por
// qualquer motivo, a notificação não nasceu a tempo), e nenhuma
// CareerMessage de sorteio existe ainda. Sem abrir nenhuma tela, o
// PRÓXIMO avanço de dia (lifecycle normal) precisa perceber "chave existe
// + mensagem faltante" e reparar, criando a notificação atrasada — uma
// única vez.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-self-healing', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '4.6D Self Healing', playerName: 'Player 4.6D' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'self-healing-player', sport_name: 'Player46D', career_date: '2026-02-05', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 1000, xp: 0, morale: 70, form: 50,
  });

  // Simula EXATAMENTE o cenário do bug: chave já existe persistida (como se
  // tivesse sido sorteada dias atrás), mas nenhuma mensagem de sorteio foi
  // criada (sessão interrompida antes de qualquer tela rodar a
  // reconciliação).
  const tournament = await localGame.entities.Tournament.create({
    id: 'self-healing-tournament', name: 'Torneio Interrompido', tier: 'Silver',
    start_date: '2026-02-08', end_date: '2026-02-11',
    bracket_schema_version: 2, draw_date: '2026-02-02', status: 'chaveamento',
    // player_match:true — exatamente como buildPlayerTournamentBracket
    // sempre grava para uma campanha realmente registrada (nunca um
    // fallback textual, Playthrough 4.9 Parte F).
    bracket_history: [{ round: 'Rodada de 16', date: '2026-02-08', matches: [{ match_id: 'm1', team_a: 'Jogador & Parceiro', team_b: 'Rival & Parceiro', player_match: true }] }],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${tournament.id}`, profile_id: profile.id, tournament_id: tournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });

  await check('pré-condição: nenhuma notificação existe ainda (bootstrap interrompido)', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    assert.equal(messages.filter((m) => String(m.related_entity_id) === tournament.id).length, 0);
  });

  await check('5/6. o app "reabre" (chama o helper de novo, como o lifecycle do dia faria) e REPARA a notificação faltante', async () => {
    const result = await ensureTournamentDrawNotification(profile, tournament);
    assert.ok(result, 'deveria ter criado a notificação atrasada');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => String(m.related_entity_id) === tournament.id);
    assert.ok(notif, 'notificação de sorteio deveria existir após o reparo');
    assert.equal(notif.is_read, false);
  });

  await check('6. rodar o reparo de novo não duplica nem "desl e" a notificação já lida', async () => {
    // Marca como lida (simulando o jogador já ter visto) e chama de novo —
    // o reparo NUNCA pode reverter is_read pra false.
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => String(m.related_entity_id) === tournament.id);
    await localGame.entities.CareerMessage.update(notif.id, { is_read: true, is_new: false });
    await ensureTournamentDrawNotification(profile, tournament);
    const after = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const matches = after.filter((m) => String(m.related_entity_id) === tournament.id);
    assert.equal(matches.length, 1, 'exatamente 1 mensagem, mesmo depois do reparo rodar de novo');
    assert.equal(matches[0].is_read, true, 'reparo idempotente NUNCA pode marcar como não lida de novo');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-self-healing: PASS');
} finally {
  await vite.close();
}
