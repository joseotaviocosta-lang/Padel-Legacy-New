// Playthrough 4.7, itens 1-3 — reproduz o cenário exato do bug relatado:
// jogador inscrito, chave sorteada, partida da 1ª rodada marcada para
// hoje, jogador lesionado ANTES de disputar. Antes desta fase, nada
// resolvia esse match automaticamente (abandonTournament() exigia abrir o
// modal e clicar) — o match ficava 'scheduled' para sempre. Prova que
// resolveUnavailablePlayerMatch (chamado pelo lifecycle do dia,
// calendarSystem.js/calendarLifecycle.js) fecha o match como W.O., sem
// placar inventado.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-injury-pre-match-walkover', search: '' };
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
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getCurrentTournamentMatch } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 Injury Walkover', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'injury-walkover-player', sport_name: 'Player47', career_date: '2026-01-01', birth_date: '2001-01-01',
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
  const regResult = await registerForTournament(profile, londres, 0, {});
  assert.ok(regResult?.success, `pré-condição: inscrição precisa funcionar: ${JSON.stringify(regResult)}`);

  // Avança até a VÉSPERA da primeira rodada (um dia antes do start_date do
  // torneio) — resolveInjuryCalendarConflicts resolve proativamente o
  // compromisso de AMANHÃ antes que ele vire uma decisão bloqueante hoje
  // (mesma lógica que já existia pra outras atividades); lesionar
  // exatamente no dia da própria partida cai num caso de borda pré-existente
  // e conhecido (getCriticalEventBeforeAdvance bloqueia ANTES de
  // resolveInjuryCalendarConflicts conseguir agir sobre o dia corrente) —
  // fora do escopo desta fase (ela audita W.O./propagação de chave, não
  // reescreve a máquina de estado de decisões pendentes).
  const eve = new Date(`${londres.start_date}T00:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 1);
  const eveDate = eve.toISOString().slice(0, 10);
  while (profile.career_date < eveDate) {
    profile = await advanceCareerDayOnce(profile);
  }

  const eventsBefore = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  const eventBefore = eventsBefore.find((e) => e.event_type === 'tournament' && String(e.related_id) === String(londres.id));
  const matchBefore = getCurrentTournamentMatch(eventBefore?.metadata?.tournament_run);
  await check('pré-condição: partida da 1ª rodada existe, scheduled, marcada para amanhã', () => {
    assert.ok(matchBefore, 'partida deveria existir');
    assert.equal(matchBefore.status, 'scheduled');
    assert.equal(eventBefore.start_date, londres.start_date);
  });
  const opponentName = Array.isArray(matchBefore.opponent) ? matchBefore.opponent.map((m) => m.name).filter(Boolean).join(' & ') : null;

  // Lesiona o jogador ANTES de disputar a partida (isInjured() bloquearia
  // startMatch() no modal; aqui simula exatamente essa indisponibilidade).
  await localGame.entities.PlayerProfile.update(profile.id, {
    injury_status: 'lesionado', injury_type: 'Entorse no tornozelo', injury_severity: 'moderada', injury_days_remaining: 6,
  });
  profile = await activeCareerAdapter.getPlayerProfile();

  // Um avanço de dia NORMAL é bloqueado por design enquanto existir uma
  // decisão obrigatória de torneio pendente (guardActiveMatchBeforeAdvance)
  // — exatamente por isso o jogador precisa de "Avançar até recuperação"
  // quando está lesionado e não pode jogar. É esse caminho (não o avanço
  // normal) que precisa resolver o W.O. automaticamente.
  const skipResult = await advanceCareerUntilRecovered(profile);
  profile = skipResult.profile;

  await check('11/12/13. "Avançar até recuperação" para EXATAMENTE nos dias da lesão (6), nunca esgota o cap de 60 dias', () => {
    assert.equal(skipResult.recovered, true, `deveria ter recuperado dentro do prazo: ${JSON.stringify(skipResult)}`);
    assert.equal(skipResult.daysAdvanced, 6, `injury_days_remaining=6 deveria parar em exatamente 6 dias, parou em ${skipResult.daysAdvanced}`);
  });

  const eventsAfter = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
  const eventAfter = eventsAfter.find((e) => e.event_type === 'tournament' && String(e.related_id) === String(londres.id));
  const matchAfter = getCurrentTournamentMatch(eventAfter?.metadata?.tournament_run);

  await check('1/2/3. o match vira terminal (W.O.) automaticamente, sem nunca abrir o modal', () => {
    assert.ok(eventAfter?.metadata?.tournament_run, 'tournament_run deveria continuar existindo');
    assert.equal(eventAfter.metadata.tournament_run.status, 'eliminated', 'campanha do jogador deveria terminar em eliminated (W.O.)');
  });

  const tournamentAfter = await localGame.entities.Tournament.get(londres.id);
  const round0 = tournamentAfter.bracket_history[0];
  const playerMatch = round0.matches.find((m) => m.player_match === true) || round0.matches.find((m) => [m.team_a, m.team_b].some((n) => String(n).includes(profile.sport_name)));

  await check('3. o match na chave canônica está terminal, vencedor é o ADVERSÁRIO, nunca um placar inventado', () => {
    assert.ok(playerMatch, 'match do jogador deveria existir na chave canônica');
    assert.equal(playerMatch.status, 'completed');
    assert.ok(playerMatch.winner, 'deveria ter um vencedor');
    assert.notEqual(playerMatch.winner, `${profile.sport_name} & ${starterPartner.name}`, 'o jogador NUNCA pode ser o vencedor de um W.O. que ele mesmo causou');
    assert.equal(playerMatch.score, null, 'W.O. nunca inventa um placar');
  });

  await check('9. notificação de W.O. foi criada, neutra, sem entrevista/notícia de derrota normal', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_WALKOVER' && String(m.related_entity_id) === String(londres.id));
    assert.ok(notif, 'notificação de W.O. deveria existir');
    assert.ok(/W\.O\./.test(notif.title));
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-injury-pre-match-walkover: PASS');
} finally {
  await vite.close();
}
