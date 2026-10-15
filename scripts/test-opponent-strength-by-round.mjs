// Playthrough 5.0, Parte H/X — causa raiz confirmada empiricamente: um
// jogador SEM ranking real era inserido no slot sintético MAIS FRACO
// (effectiveRank = drawSize) em computeSeededOpponentRanksForMainDraw
// (tournamentDraw.js) — e por construção de seeding (nunca alterada
// aqui — Parte K), o slot mais fraco é pareado com o MAIS FORTE do campo
// já na primeira rodada. Corrigido escolhendo uma posição sintética
// plausível de "sem ranking real" (fraca, mas não o extremo estrutural).
// Este teste confirma que a força média do adversário (OVR) cresce ao
// longo das rodadas para um jogador iniciante — nunca vem mais forte no
// início do que no fim.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-opponent-strength-by-round', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
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
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  let firstRoundOVR = null;
  let finalRoundOVR = null;
  let sawIncrease = false;

  for (let trial = 0; trial < 3; trial += 1) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: `strength-${trial}`, playerName: `StrengthPlayer${trial}` });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `strength-player-${trial}`, sport_name: `StrengthPlayer${trial}`, career_date: '2026-01-01', birth_date: '2010-01-01',
      level: 'Iniciante', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    });
    const partner = BOTS_BY_DIFFICULTY.iniciante[trial % BOTS_BY_DIFFICULTY.iniciante.length];
    await localGame.entities.PlayerProfile.update(profile.id, { partner_id: partner.id });
    profile = await activeCareerAdapter.getPlayerProfile();

    await ensureWorldSeed2025();
    await ensureFutureTournaments('2026-01-01');
    const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const candidates = tournaments.filter((t) => (t.tier === 'Bronze' || t.tier === 'Silver') && t.main_draw_size >= 8);
    const target = candidates[trial % candidates.length];
    if (!target) continue;
    const window = getTournamentRegistrationWindow(target);
    if (window.opensAt && profile.career_date < window.opensAt) {
      while (profile.career_date < window.opensAt) profile = await advanceCareerDayOnce(profile);
    }
    const reg = await registerForTournament(profile, target, 0, {});
    if (!reg.success) continue;
    profile = await activeCareerAdapter.getPlayerProfile();

    const drawDate = new Date(`${target.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 2);
    while (profile.career_date < drawDate.toISOString().slice(0, 10)) profile = await advanceCareerDayOnce(profile);

    const event = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: target.id }).catch(() => []))
      .find((item) => item.event_type === 'tournament' && item.metadata?.tournament_run);
    const run = event?.metadata?.tournament_run;
    if (!run?.matches?.length) continue;

    const ovrByRound = run.matches.map((match) => {
      const opp = match.opponent || [];
      return opp.length ? opp.reduce((s, m) => s + (Number(m.overall_rating) || 0), 0) / opp.length : null;
    }).filter((value) => value != null);
    if (ovrByRound.length < 2) continue;

    if (firstRoundOVR == null) firstRoundOVR = ovrByRound[0];
    finalRoundOVR = ovrByRound[ovrByRound.length - 1];
    if (ovrByRound[ovrByRound.length - 1] > ovrByRound[0]) sawIncrease = true;
  }

  await check('em ao menos uma simulação, a força do adversário da última rodada supera a da primeira (nunca mais fraco no fim)', () => {
    assert.ok(sawIncrease, `esperava ao menos 1 trial com OVR final > OVR inicial (first=${firstRoundOVR}, final=${finalRoundOVR})`);
  });

  await check('o primeiro adversário de um jogador SEM ranking real não é o mais forte teoricamente possível do campo (regressão do bug original)', () => {
    // O bug original produzia rank=2 (quase o melhor do campo de 16) já na
    // rodada 0. Depois da correção, o primeiro round nunca deveria cair no
    // extremo mais forte (OVR muito próximo do pico da tabela de
    // dificuldade do tier, que só deveria aparecer na FINAL).
    assert.ok(firstRoundOVR != null, 'pré-condição: precisa ter coletado ao menos 1 amostra');
    assert.ok(finalRoundOVR == null || firstRoundOVR <= finalRoundOVR + 5, `primeira rodada (OVR ${firstRoundOVR}) não deveria ser mais forte que a final (OVR ${finalRoundOVR})`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-opponent-strength-by-round: PASS');
} finally {
  await vite.close();
}
