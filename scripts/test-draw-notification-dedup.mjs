// Playthrough 4.6D, itens 8/12.6 — a mensagem de sorteio tem identidade
// estável (buildStableMessageId + tournamentReminderContextKey). Chamar o
// helper repetidamente em D-3/D-2/D-1/D0, e "abrir/fechar o torneio"
// (simulado por chamadas repetidas) várias vezes, deve resultar em
// exatamente 1 notificação.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-dedup', search: '' };
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
  const { ensureTournamentDrawNotification, ensureContextualCareerCommunications } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6D Dedup', playerName: 'Player 4.6D' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'dedup-player', sport_name: 'Player46D', career_date: '2026-02-02', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'dedup-tournament', name: 'Torneio Dedup', tier: 'Silver',
    start_date: '2026-02-05', end_date: '2026-02-08', bracket_schema_version: 2, draw_date: '2026-02-02',
    bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${tournament.id}`, profile_id: profile.id, tournament_id: tournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });

  const DAYS = ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05'];
  for (const day of DAYS) {
    // D-3/D-2/D-1/D0 — chamado pelo helper direto (equivalente ao lifecycle
    // do dia) e também pela reconciliação contextual (equivalente a abrir/
    // fechar o torneio várias vezes na mesma janela).
    await ensureTournamentDrawNotification({ ...profile, career_date: day }, tournament);
    await ensureContextualCareerCommunications({ ...profile, career_date: day }, { nextTournament: tournament });
    await ensureContextualCareerCommunications({ ...profile, career_date: day }, { nextTournament: tournament });
  }

  await check('8. D-3/D-2/D-1/D0 + múltiplas reconciliações por dia -> exatamente 1 notificação', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const matches = messages.filter((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === tournament.id);
    assert.equal(matches.length, 1, `esperado 1 notificação, encontrado ${matches.length}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-dedup: PASS');
} finally {
  await vite.close();
}
