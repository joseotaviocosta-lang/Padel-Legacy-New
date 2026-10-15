// Playthrough 4.6C, itens 3/4/13 — a chave do torneio do JOGADOR precisa
// existir persistida no Tournament assim que a carreira alcança D-3, SEM
// nunca abrir a página Torneios, o modal, a campanha ou o botão Jogar
// (ensureTournamentDraw roda exclusivamente dentro do avanço de dia,
// processCalendarEvents -> calendarSystem.js, nunca de um efeito de
// montagem de componente). Prova adicional: fechar e reabrir o storage
// (simulando reiniciar o app) não perde nem regenera a chave.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor(files) { this.files = files || new Map(); this.directories = new Set(); }
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-ui-independent-persistence', search: '' };
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
  const { ensureFutureTournaments, getPartnerBot } = await vite.ssrLoadModule('/src/lib/career.js');
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  // O "disco" persiste independente de quantas vezes recriamos o
  // adapter/repository por cima dele — é ISSO que simula fechar/reabrir o
  // app (item 11), não um novo Map a cada vez.
  const disk = new Map();

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6C UI Independent', playerName: 'Player 4.6C' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'ui-independent-player', sport_name: 'Player46C', career_date: '2026-01-01',
    birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const target = tournaments.find((t) => t.name?.includes('Londres'));
  const regResult = await registerForTournament(profile, target, 0, {});
  assert.ok(regResult?.success, `pré-condição: inscrição precisa funcionar: ${JSON.stringify(regResult)}`);

  // Item 4 — avança até D-3 SEM abrir página Torneios, modal, campanha ou
  // botão Jogar (nenhuma dessas telas é importada/chamada neste teste).
  while (profile.career_date < '2026-01-26') {
    profile = await advanceCareerDayOnce(profile);
  }

  const careerIdSnapshot = career.career_id || career.id;

  await check('4. no D-3, sem NUNCA ter aberto nenhuma UI, o Tournament já tem a chave persistida', async () => {
    const row = await localGame.entities.Tournament.get(target.id);
    assert.equal(Number(row.bracket_schema_version), 2, 'bracket_schema_version deveria ser 2 só pelo avanço de dia');
    assert.ok(Array.isArray(row.bracket_history) && row.bracket_history.length > 0, 'bracket_history deveria estar populado');
    assert.equal(row.status, 'chaveamento', 'status deveria refletir o sorteio já realizado (paridade com a trilha AI-only, item 13)');
    assert.equal(row.draw_date, '2026-01-26', 'draw_date deveria estar gravado');
  });

  await check('4. a dupla do jogador está presente na chave persistida', async () => {
    const row = await localGame.entities.Tournament.get(target.id);
    const names = new Set(row.bracket_history.flatMap((round) => (round.matches || []).flatMap((m) => [m.team_a, m.team_b])));
    const playerTeamName = `${profile.sport_name} & ${starterPartner.name}`;
    assert.ok(names.has(playerTeamName), `dupla do jogador ("${playerTeamName}") deveria aparecer na chave: ${[...names].join(', ')}`);
  });

  await check('4. o CalendarEvent do jogador já tem tournament_run, sem nenhuma tela ter sido aberta', async () => {
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id });
    const event = events.find((e) => e.event_type === 'tournament' && String(e.related_id) === String(target.id));
    assert.ok(event?.metadata?.tournament_run, 'tournament_run deveria já existir no CalendarEvent');
  });

  // Item 11 — fecha/recria o adapter e o repository POR CIMA DO MESMO
  // "disco" (mesmo Map), simulando reiniciar o app, e relê a carreira do
  // zero.
  const bracketBeforeReload = JSON.stringify((await localGame.entities.Tournament.get(target.id)).bracket_history);
  activeCareerAdapter.clearActiveCareer();
  const manager2 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager2;
  const reloadedCareer = await manager2.loadCareer(careerIdSnapshot);
  activeCareerAdapter.setActiveCareer(reloadedCareer.career || reloadedCareer);

  await check('11. depois de destruir e recriar o adapter/repository sobre o mesmo storage, a chave é IDÊNTICA byte-a-byte', async () => {
    const reloadedRow = await localGame.entities.Tournament.get(target.id);
    const bracketAfterReload = JSON.stringify(reloadedRow.bracket_history);
    assert.equal(bracketAfterReload, bracketBeforeReload, 'bracket_history deveria ser idêntico após reload de storage');
    assert.equal(Number(reloadedRow.bracket_schema_version), 2);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-ui-independent-persistence: PASS');
} finally {
  await vite.close();
}
