// Playthrough 4.6D, itens 3/12.5 — determina se Roma Pré-Temporada gera ou
// não notificação de sorteio, e por quê. Não há, em nenhum lugar do
// código (circuitCatalog.js/careerCommunications.js/calendarSystem.js),
// nenhuma regra que exclua torneios `is_exhibition`/tier 'Exibição' da
// notificação "Sorteio definido" — ensureTournamentDrawNotification só
// exclui torneios cancelados. A ausência de notificação relatada pelo
// usuário era o MESMO bug do item 1 (D-3 exato + status:'inscricoes'),
// não uma regra de produto — este teste prova que, corrigido, Roma
// notifica igual a qualquer outro torneio do jogador com chave oficial.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-preseason-draw-notification-policy', search: '' };
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
  const { ensureTournamentDrawNotification } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { buildPreSeasonExhibition } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6D Preseason Policy', playerName: 'Player 4.6D' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'preseason-notif-player', sport_name: 'Player46D', career_date: '2026-01-11', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });

  const romaPayload = buildPreSeasonExhibition(2026, null);
  await check('3. Roma Pré-Temporada é criada com is_exhibition:true/tier Exibição (confirma a identidade do torneio testado)', () => {
    assert.equal(romaPayload.is_exhibition, true);
    assert.equal(romaPayload.tier, 'Exibição');
  });

  const roma = await localGame.entities.Tournament.create({
    ...romaPayload,
    bracket_schema_version: 2, draw_date: romaPayload.start_date,
    bracket_history: [{ round: 'Rodada de 8', matches: [{ match_id: 'm1', team_a: 'Jogador & Parceiro', team_b: 'Rival & Parceiro', player_match: true }] }],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${roma.id}`, profile_id: profile.id, tournament_id: roma.id,
    status: 'confirmed', registered_at: profile.career_date,
  });

  await check('3. com a chave já persistida, Roma GERA notificação de sorteio como qualquer outro torneio do jogador (B: era regra acidental, não intencional)', async () => {
    const result = await ensureTournamentDrawNotification(profile, roma);
    assert.ok(result, 'Roma deveria gerar a notificação — não há regra de produto documentada que a exclua');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => String(m.related_entity_id) === roma.id);
    assert.ok(notif, 'notificação de Roma deveria existir persistida');
    assert.ok(/[Ss]orteio|[Ss]orteada/.test(`${notif.title} ${notif.content}`));
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-preseason-draw-notification-policy: PASS');
} finally {
  await vite.close();
}
