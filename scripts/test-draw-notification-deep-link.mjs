// Playthrough 4.6E, Parte G — o clique na notificação precisa abrir a chave
// DIRETO, não só os detalhes do torneio. `destination.type:'TOURNAMENT_RUN'`
// (usado até a 4.6D) só vira modo 'run' quando já existe uma sessão ativa
// (Tournaments.jsx:resolveTournamentOpenMode) — no D-3 isso nunca é
// verdade, então sempre caía silenciosamente em DETAILS (só o modal de
// detalhes). Corrigido com `openBracket:true` explícito, independente do
// modo resolvido.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-deep-link', search: '' };
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

check('G. Tournaments.jsx sabe interpretar openBracket=true (guard estrutural de regressão)', () => {
  const source = readFileSync(new URL('../src/pages/Tournaments.jsx', import.meta.url), 'utf8');
  assert.ok(/searchParams\.get\(\s*['"]openBracket['"]\s*\)/.test(source), 'a leitura do parâmetro openBracket não pode ser removida');
  // Playthrough 5.13 — o guard fixava o NOME da variável
  // (`setBracketTournament(requested)`). A correção da race de sorteio passou
  // a abrir a chave com o torneio RELIDO do store (`fresh`) em vez do
  // snapshot da lista, que é justamente o que causava "Chave ainda não
  // sorteada". O comportamento protegido continua o mesmo, então o guard
  // agora verifica o COMPORTAMENTO: o ramo de openBracket ainda chama
  // setBracketTournament. Continua falhando se alguém remover a abertura
  // direta da chave.
  assert.ok(/if\s*\(\s*requestedOpenBracket\s*\)\s*\{\s*setBracketTournament\(/.test(source),
    'openBracket precisa continuar abrindo a chave direto (setBracketTournament)');
});

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureTournamentDrawNotification, resolveAndOpenNotification } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { resolveNotificationDestination } = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Deep Link', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'deep-link-player', sport_name: 'Player46E', career_date: '2026-01-26', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'deep-link-tournament', name: 'Londres Challenge', tier: 'Bronze',
    start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2, draw_date: '2026-01-26',
    bracket_history: [{ round: 'Rodada de 16', date: '2026-01-29', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B', player_match: true }] }],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${tournament.id}`, profile_id: profile.id, tournament_id: tournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });

  const notif = await ensureTournamentDrawNotification(profile, tournament);

  await check('G. destination.type já não é mais TOURNAMENT_RUN (que exige sessão ativa) — é TOURNAMENT_DETAILS + openBracket explícito', () => {
    assert.equal(notif.destination.type, 'TOURNAMENT_DETAILS');
    assert.equal(notif.destination.params.openBracket, true);
    assert.equal(notif.destination.params.tournament, tournament.id);
  });

  await check('G. resolveNotificationDestination produz uma rota com tournament=ID e openBracket=true, preservando o mesmo Tournament.id', () => {
    const destination = resolveNotificationDestination(notif);
    assert.ok(destination.route.includes(`tournament=${tournament.id}`), destination.route);
    assert.ok(destination.route.includes('openBracket=true'), destination.route);
    assert.ok(destination.actionable, 'a notificação precisa continuar acionável (botão "Ver chave")');
  });

  await check('G. clicar (resolveAndOpenNotification) marca como lida e devolve o destino correto — sem duplicar/alterar a chave', async () => {
    let navigatedTo = null;
    const destination = await resolveAndOpenNotification(notif, { navigate: (route) => { navigatedTo = route; } });
    assert.ok(navigatedTo, 'deveria navegar');
    assert.ok(navigatedTo.includes(`tournament=${tournament.id}`));
    assert.ok(navigatedTo.includes('openBracket=true'));
    const stored = await localGame.entities.CareerMessage.get(notif.id);
    assert.equal(stored.is_read, true, 'clicar precisa marcar como lida');
    const tournamentAfter = await localGame.entities.Tournament.get(tournament.id);
    assert.deepEqual(tournamentAfter.bracket_history, tournament.bracket_history, 'clicar na notificação nunca pode alterar a chave');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-deep-link: PASS');
} finally {
  await vite.close();
}
