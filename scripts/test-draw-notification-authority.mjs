// Playthrough 4.6C, itens 1/2/14 — a notificação "Sorteio definido" só pode
// existir DEPOIS que a chave já está persistida (bracket_history não
// vazio). Este teste prova a condição exata em
// ensureContextualCareerCommunications (careerCommunications.js): sem
// bracket_history, nenhuma notificação nasce, mesmo que o marco D-3 já
// tenha chegado; com bracket_history persistido, a notificação nasce (uma
// única vez — createOnce/context_key), sempre no milestone D-3 exato.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-authority', search: '' };
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
  const { ensureContextualCareerCommunications, listCareerCommunications } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6C Notification Authority', playerName: 'Player 4.6C' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'notif-authority-player', sport_name: 'Player 4.6C', career_date: '2026-01-26',
    birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
    energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification agora
  // exige uma inscrição real (TournamentRegistration confirmada) antes de
  // personalizar qualquer mensagem — a causa raiz exata do bug real
  // relatado nesta fase era justamente a ausência dessa checagem. Este
  // teste passa a inscrever o jogador antes de cada torneio testado, como
  // qualquer consumidor real (registerTournament) sempre faz.
  async function registerFor(tournamentId) {
    await localGame.entities.TournamentRegistration.create({
      id: `registration-${profile.id}-${tournamentId}`, profile_id: profile.id, tournament_id: tournamentId,
      status: 'confirmed', registered_at: profile.career_date,
    });
  }

  const undrawnTournament = {
    id: 'undrawn-tournament', name: 'Torneio Sem Chave', start_date: '2026-01-29', end_date: '2026-02-01',
    bracket_history: [], bracket_schema_version: null,
  };

  await check('1/2. D-3 chegou mas bracket_history está vazio: NENHUMA notificação de sorteio é criada', async () => {
    await ensureContextualCareerCommunications(profile, { nextTournament: undrawnTournament });
    const messages = await listCareerCommunications(profile.id, 200);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === 'undrawn-tournament');
    assert.equal(notif, undefined, 'notificação não pode existir sem chave persistida');
  });

  const drawnTournament = {
    ...undrawnTournament, id: 'drawn-tournament', name: 'Torneio Com Chave',
    bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
    bracket_schema_version: 2,
  };

  await check('1/2/14. D-3 chegou E bracket_history já persistido: notificação nasce, e nunca antes da chave', async () => {
    await registerFor(drawnTournament.id);
    await ensureContextualCareerCommunications(profile, { nextTournament: drawnTournament });
    const messages = await listCareerCommunications(profile.id, 200);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === 'drawn-tournament');
    assert.ok(notif, 'notificação deveria existir quando a chave já está persistida no D-3');
    assert.ok(/sorteada|sorteio/i.test(`${notif.title} ${notif.content}`), 'conteúdo deve mencionar o sorteio real, não genérico');
  });

  await check('10/14. chamar de novo no mesmo dia não duplica a notificação (createOnce/context_key)', async () => {
    const before = (await listCareerCommunications(profile.id, 200)).filter((m) => String(m.related_entity_id) === 'drawn-tournament').length;
    await ensureContextualCareerCommunications(profile, { nextTournament: drawnTournament });
    const after = (await listCareerCommunications(profile.id, 200)).filter((m) => String(m.related_entity_id) === 'drawn-tournament').length;
    assert.equal(after, before, 'segunda chamada não pode criar uma segunda notificação para o mesmo torneio/marco');
  });

  // Playthrough 4.6D, itens 1/5/6 — o marco D-3 exato deixou de ser um
  // GATE de criação (era a causa raiz do atraso relatado: se nenhuma tela
  // rodasse a reconciliação exatamente naquele dia, a janela se perdia pra
  // sempre). Fora do D-3 (ex.: D-5), com a chave já persistida, a
  // notificação AGORA nasce mesmo assim — self-healing, condicionada só ao
  // fato (chave existe, ainda não notificado), nunca à data exata.
  await check('1/5/6. fora do marco D-3 (ex.: D-5), COM a chave já persistida, a notificação nasce mesmo assim (self-healing, item 4.6D)', async () => {
    const farProfile = { ...profile, career_date: '2026-01-24' };
    const farTournament = { ...drawnTournament, id: 'far-drawn-tournament', start_date: '2026-01-29' };
    await registerFor(farTournament.id);
    await ensureContextualCareerCommunications(farProfile, { nextTournament: farTournament });
    const messages = await listCareerCommunications(profile.id, 200);
    const notif = messages.find((m) => String(m.related_entity_id) === 'far-drawn-tournament');
    assert.ok(notif, 'com a chave já persistida, a notificação deve nascer mesmo fora do D-3 exato (self-healing)');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-authority: PASS');
} finally {
  await vite.close();
}
