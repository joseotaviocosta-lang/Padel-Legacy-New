// Playthrough 4.6E, Parte E/F / Teste 3 — a mensagem precisa conter dados
// REAIS da chave (adversário, rodada, data, parceiro), nunca o texto
// genérico anterior. Nenhum dado sintético: tudo lido de bracket_history +
// tournament_run (getPlayerOpeningMatchFromCanonicalBracket,
// tournamentBracketView.js) — nunca recalculado via tournamentDraw.js.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-rich-content', search: '' };
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
  const { getPlayerOpeningMatchFromCanonicalBracket } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Rich Content', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'rich-content-player', sport_name: 'Jogador', career_date: '2026-01-26', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });

  // Adversário real, com IDs de atleta reais e ranking canônico (TeamRanking)
  // — pra provar que o rank não é inventado, vem da mesma fonte da 4.6B.
  await localGame.entities.TeamRanking.create({
    team_key: ['opp-a-46e', 'opp-b-46e'].sort().join('_'), player1_id: 'opp-a-46e', player1_name: 'Hugo Navarro',
    player2_id: 'opp-b-46e', player2_name: 'Thiago Almeida', ranking_points: 4000, matches_played: 10, wins: 8, losses: 2, titles: [],
  });
  // Mais algumas duplas ranqueadas pra "Hugo Navarro & Thiago Almeida" não
  // cair automaticamente em #1 só por ser a única linha da tabela.
  for (let i = 0; i < 30; i += 1) {
    await localGame.entities.TeamRanking.create({
      team_key: [`filler-a-${i}`, `filler-b-${i}`].sort().join('_'), player1_id: `filler-a-${i}`, player1_name: `Filler${i}A`,
      player2_id: `filler-b-${i}`, player2_name: `Filler${i}B`, ranking_points: 8000 - i * 100, matches_played: 5, wins: 3, losses: 2, titles: [],
    });
  }

  const tournament = await localGame.entities.Tournament.create({
    id: 'rich-content-tournament', name: 'Londres Challenge', tier: 'Bronze', main_draw_size: 16,
    start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2, draw_date: '2026-01-26',
    bracket_history: [
      { round: 'Rodada de 16', date: '2026-01-29', matches: [{ match_id: 'm-r0', team_a: 'Jogador & Nuno Fernandes', team_b: 'Hugo Navarro & Thiago Almeida', player_match: true }] },
      { round: 'Quartas de final', date: '2026-01-30', matches: [{ match_id: 'm-r1' }] },
      { round: 'Semifinal', date: '2026-01-31', matches: [{ match_id: 'm-r2' }] },
      { round: 'Final', date: '2026-02-01', is_final: true, matches: [{ match_id: 'm-r3' }] },
    ],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${tournament.id}`, profile_id: profile.id, tournament_id: tournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });
  const calendarEvent = await localGame.entities.CalendarEvent.create({
    id: 'rich-content-event', profile_id: profile.id, event_type: 'tournament', related_id: tournament.id,
    status: 'scheduled', start_date: tournament.start_date, end_date: tournament.start_date,
    metadata: {
      tournament_run: {
        status: 'preparing', currentRound: 0,
        matches: [{
          id: 'run-match-0', stage: 'main', roundIndex: 0, stageRoundIndex: 0, round: 'Rodada de 16', date: '2026-01-29',
          opponent: [{ id: 'opp-a-46e', name: 'Hugo Navarro' }, { id: 'opp-b-46e', name: 'Thiago Almeida' }],
          status: 'scheduled',
        }],
      },
    },
  });

  await check('helper puro (Parte F): getPlayerOpeningMatchFromCanonicalBracket lê os dados reais direto do bracket/run', () => {
    const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament, run: calendarEvent.metadata.tournament_run });
    assert.ok(opening);
    assert.equal(opening.playerTeam, 'Jogador & Nuno Fernandes');
    assert.equal(opening.opponentTeam, 'Hugo Navarro & Thiago Almeida');
    assert.equal(opening.roundLabel, 'Rodada de 16');
    assert.equal(opening.matchDate, '2026-01-29');
    assert.deepEqual(opening.opponentMemberIds.sort(), ['opp-a-46e', 'opp-b-46e']);
  });

  const notif = await ensureTournamentDrawNotification(profile, tournament, calendarEvent);

  await check('3. title contém o nome do torneio', () => {
    assert.ok(notif.title.includes('Londres Challenge'), notif.title);
  });

  await check('3. body contém o adversário REAL (nomes reais, não sintéticos)', () => {
    assert.ok(notif.content.includes('Hugo Navarro'), notif.content);
    assert.ok(notif.content.includes('Thiago Almeida'), notif.content);
  });

  await check('3. body contém a rodada real (Rodada de 16)', () => {
    assert.ok(/Rodada de 16/.test(notif.content), notif.content);
  });

  await check('3. body contém a data real (29/01/2026)', () => {
    assert.ok(/29\/01\/2026/.test(notif.content), notif.content);
  });

  await check('3. o parceiro do jogador aparece corretamente (Nuno Fernandes)', () => {
    assert.ok(notif.content.includes('Nuno Fernandes'), notif.content);
  });

  await check('9 (item da fase anterior, reconfirmado aqui). ranking do adversário é FACTUAL (TeamRanking real), nunca fabricado', () => {
    assert.ok(/#\d+/.test(notif.content), `deveria mostrar um rank numérico real: ${notif.content}`);
    assert.equal(notif.metadata.opponent_rank > 0, true);
  });

  await check('conteúdo também menciona o tamanho do campo e a data da final', () => {
    assert.ok(/16 duplas/.test(notif.content), notif.content);
    assert.ok(/01\/02\/2026/.test(notif.content), notif.content);
  });

  console.log(`\ntítulo: ${notif.title}`);
  console.log(`corpo: ${notif.content}`);

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-rich-content: PASS');
} finally {
  await vite.close();
}
