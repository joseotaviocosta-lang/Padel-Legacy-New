// Playthrough 5.9, BUG 3 — no playtest, clicar em "Sorteio definido —
// [torneio]" abria a tela do torneio SEM a chave; indo manualmente em
// Torneios a chave estava lá normalmente.
//
// Causa raiz (auditoria + reprodução abaixo): a notificação JÁ declara o
// destino certo —
//   destination: { type:'TOURNAMENT_DETAILS', route:'/tournaments',
//                  params:{ tournament, mode:'details', openBracket:true } }
// (careerCommunications.js:ensureTournamentDrawNotification) — e
// `Tournaments.jsx` JÁ consome `searchParams.get('openBracket') === 'true'`.
// O elo perdido é `resolveNotificationDestination`
// (notificationDestinations.js): ao montar a rota, ele usa só
// `{ tournament, mode }` e NUNCA mescla `destination.params`, então
// `openBracket` é silenciosamente descartado no meio do caminho.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-deeplink-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { resolveNotificationDestination } = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');

  // Mensagem REAL, no mesmo formato que ensureTournamentDrawNotification grava.
  const drawNotification = {
    id: 'msg-draw-1',
    message_type: 'tournament_upcoming',
    notification_type: 'TOURNAMENT_UPCOMING',
    title: 'Sorteio definido — Roma Pré-Temporada',
    related_entity_type: 'Tournament',
    related_entity_id: 'tournament-2026-rom-exh-2026',
    related_entity_name: 'Roma Pré-Temporada',
    destination: {
      type: 'TOURNAMENT_DETAILS', route: '/tournaments',
      params: { tournament: 'tournament-2026-rom-exh-2026', mode: 'details', openBracket: true },
    },
    metadata: {
      tournament_id: 'tournament-2026-rom-exh-2026',
      notification_type: 'TOURNAMENT_UPCOMING',
    },
  };

  const destination = resolveNotificationDestination(drawNotification);
  console.log(`rota resolvida: ${destination?.route}`);

  check('deep link aponta para a tela de torneios', () => {
    assert.ok(destination?.route?.startsWith('/tournaments'), `rota=${destination?.route}`);
  });
  check('deep link carrega o tournamentId correto', () => {
    assert.match(destination.route, /tournament=tournament-2026-rom-exh-2026/, `rota=${destination.route}`);
  });
  check('BUG 3: deep link PRESERVA openBracket=true (era descartado por resolveNotificationDestination)', () => {
    assert.match(destination.route, /openBracket=true/, `rota=${destination.route} — a chave não abriria`);
  });
  check('deep link continua marcado como acionável', () => {
    assert.notEqual(destination.actionable, false, 'notificação de sorteio deveria ser acionável');
  });

  // Params declarados no destino devem sobreviver de forma GENÉRICA — a
  // correção não pode ser um caso especial só pra `openBracket`.
  check('params arbitrários declarados no destino sobrevivem (correção genérica, não um if para openBracket)', () => {
    const custom = resolveNotificationDestination({
      ...drawNotification,
      id: 'msg-draw-2',
      destination: { type: 'TOURNAMENT_DETAILS', route: '/tournaments', params: { tournament: 'tid-9', mode: 'details', tab: 'bracket' } },
      metadata: { tournament_id: 'tid-9', notification_type: 'TOURNAMENT_UPCOMING' },
    });
    assert.match(custom.route, /tab=bracket/, `rota=${custom.route}`);
  });

  // Regressão: uma notificação SEM params declarados continua exatamente
  // como antes (nada de parâmetro inventado).
  check('notificação sem params declarados não ganha parâmetros novos', () => {
    const plain = resolveNotificationDestination({
      id: 'msg-plain',
      notification_type: 'TOURNAMENT_UPCOMING',
      related_entity_type: 'Tournament',
      related_entity_id: 'tid-plain',
      metadata: { tournament_id: 'tid-plain', notification_type: 'TOURNAMENT_UPCOMING' },
    });
    assert.doesNotMatch(plain.route, /openBracket/, `rota=${plain.route}`);
    assert.match(plain.route, /tournament=tid-plain/, `rota=${plain.route}`);
  });

  // ---------------------------------------------------------------
  // Parte E2E — o teste acima usa uma mensagem FABRICADA. O playtest
  // reclamou da mensagem REAL. Abaixo: carreira real, inscrição real,
  // sorteio real (D-3), e a CareerMessage lida DE VOLTA do save — é ela
  // que precisa carregar `openBracket` até a rota.
  // ---------------------------------------------------------------
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
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { normalizeCareerMessage } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

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

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Draw Deeplink', playerName: 'Player59Draw' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-draw', sport_name: 'Player59Draw', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id });
  profile = await activeCareerAdapter.getPlayerProfile();
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const target = tournaments.find((t) => ['Exibição', 'Bronze', 'Silver'].includes(t.tier) && Number(t.main_draw_size) >= 4);
  const regWindow = getTournamentRegistrationWindow(target);
  if (regWindow.opensAt && profile.career_date < regWindow.opensAt) {
    profile = await activeCareerAdapter.updatePlayerProfile(profile.id, { career_date: regWindow.opensAt });
  }
  await registerForTournament(profile, target, 0, {});
  profile = await activeCareerAdapter.getPlayerProfile();

  const drawDate = new Date(`${target.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 2);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  let guard = 0;
  while (profile.career_date < drawDateStr && guard < 60) { profile = await advanceCareerDayOnce(profile); guard += 1; }

  const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id });
  const drawMessage = (messages || []).find((m) => String(m.title || '').startsWith('Sorteio definido'));
  console.log(`\n[E2E] torneio=${target.name} data=${profile.career_date}`);
  console.log(`[E2E] mensagem de sorteio encontrada: ${drawMessage ? `"${drawMessage.title}"` : 'NENHUMA'}`);
  if (drawMessage) {
    console.log(`[E2E] destination persistido: ${JSON.stringify(drawMessage.destination)}`);
  }

  check('[E2E] a notificação REAL de sorteio existe no save', () => {
    assert.ok(drawMessage, 'nenhuma CareerMessage "Sorteio definido" foi persistida');
  });

  check('[E2E] BUG 3: a rota da notificação REAL (lida de volta do save) preserva openBracket=true', () => {
    assert.ok(drawMessage, 'pré-condição: mensagem precisa existir');
    const realDestination = resolveNotificationDestination(normalizeCareerMessage(drawMessage));
    console.log(`[E2E] rota real resolvida: ${realDestination.route}`);
    assert.match(realDestination.route, /openBracket=true/, `rota=${realDestination.route}`);
    assert.match(realDestination.route, new RegExp(`tournament=${target.id}`), `rota=${realDestination.route}`);
  });

  check('[E2E] a chave realmente existe no torneio nesse momento (a notificação não está mentindo)', () => {
    const fresh = tournaments.find((t) => t.id === target.id);
    assert.ok(fresh, 'torneio deveria existir');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-deeplink-v59: PASS');
} finally {
  await vite.close();
}
