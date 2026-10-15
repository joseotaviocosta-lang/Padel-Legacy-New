// Playthrough 5.5, Parte G (item específico) — foco só na PRIMEIRA rodada:
// um jogador #800+ (rank muito baixo/ruim) não deveria enfrentar
// adversário rank #20-#30 como PADRÃO de estreia — pode acontecer
// excepcionalmente (zebra/wildcard/campo pequeno), mas não
// sistematicamente. Reusa o mesmo harness de campanha real (mesmo padrão
// de test-opponent-strength-by-round.mjs/test-player-opponent-
// progression-v5.mjs), com menos trials (mais barato — só round 0
// importa aqui) pra medir a fração de estreias "fortes demais".
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-low-rank-first-round-quality-v5', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const TRIALS = Number(process.env.PADEL_LOWRANK_TRIALS || 15);

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

  const firstRoundEntries = [];
  let completed = 0;

  console.log(`=== Parte G (item): qualidade da estreia — ${TRIALS} campanhas, jogador #800+ ===\n`);

  const baseStorage = new MemoryStorage();
  const baseManager = new CareerManager(new CareerRepository(new GameStorage(baseStorage)));
  activeCareerAdapter.careerManager = baseManager;
  activeCareerAdapter.clearActiveCareer();
  const { career: baseCareer } = await baseManager.createCareer({ saveName: 'firstround-base', playerName: 'FirstRound' });
  activeCareerAdapter.setActiveCareer(baseCareer);
  await activeCareerAdapter.createPlayerProfile({
    id: 'firstround-player', sport_name: 'FirstRound', career_date: '2026-01-01', birth_date: '2010-01-01',
    level: 'Iniciante', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const baseFiles = new Map(baseStorage.files);
  const baseDirectories = new Set(baseStorage.directories);

  for (let trial = 0; trial < TRIALS; trial += 1) {
    if (trial > 0 && trial % 10 === 0) console.log(`[low-rank-first-round] ${trial}/${TRIALS}`);
    const trialStorage = new MemoryStorage();
    trialStorage.files = new Map(baseFiles);
    trialStorage.directories = new Set(baseDirectories);
    const manager = new CareerManager(new CareerRepository(new GameStorage(trialStorage)));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const career = await manager.readCareer(baseCareer.career_id);
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.getPlayerProfile();
    const partner = BOTS_BY_DIFFICULTY.iniciante[trial % BOTS_BY_DIFFICULTY.iniciante.length];
    await localGame.entities.PlayerProfile.update(profile.id, { partner_id: partner.id });
    profile = await activeCareerAdapter.getPlayerProfile();

    const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
    // Every trial is an independent initial campaign. Rotate only through the
    // earliest eligible events so trial number cannot move the measurement into
    // a later progression stage of the season.
    const candidates = ['Exibição', 'Bronze', 'Silver']
      .map((tier) => tournaments.find((t) => t.tier === tier && Number(t.main_draw_size) >= 4))
      .filter(Boolean);
    const target = candidates[trial % candidates.length];
    if (!target) continue;
    const window = getTournamentRegistrationWindow(target);
    if (window.opensAt && profile.career_date < window.opensAt) {
      profile = await activeCareerAdapter.updatePlayerProfile(profile.id, { career_date: window.opensAt });
    }
    const reg = await registerForTournament(profile, target, 0, {});
    if (!reg.success) continue;
    profile = await activeCareerAdapter.getPlayerProfile();

    const drawDate = new Date(`${target.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 2);
    const drawDateStr = drawDate.toISOString().slice(0, 10);
    // The intervening empty calendar days cannot affect a brand-new player's
    // ranking or partnership. Jump to draw eve, then run the real daily
    // coordinator once so registration/draw/lifecycle behavior stays canonical.
    const drawEve = new Date(drawDate); drawEve.setUTCDate(drawEve.getUTCDate() - 1);
    if (profile.career_date < drawEve.toISOString().slice(0, 10)) {
      profile = await activeCareerAdapter.updatePlayerProfile(profile.id, { career_date: drawEve.toISOString().slice(0, 10) });
    }
    while (profile.career_date < drawDateStr) profile = await advanceCareerDayOnce(profile);

    const event = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: target.id }).catch(() => []))
      .find((item) => item.event_type === 'tournament' && item.metadata?.tournament_run);
    const run = event?.metadata?.tournament_run;
    const firstMatch = run?.matches?.[0];
    const opp = firstMatch?.opponent || [];
    if (!opp.length) continue;
    const memberRanks = opp.map((m) => Number(m.ranking_position) || Number(m.rank) || 0).filter((rank) => rank > 0);
    const memberOvrs = opp.map((m) => Number(m.overall_rating) || Number(m.overall) || 0).filter((ovr) => ovr > 0);
    const oppRank = memberRanks.length ? memberRanks.reduce((sum, rank) => sum + rank, 0) / memberRanks.length : null;
    const oppOVR = memberOvrs.length ? memberOvrs.reduce((sum, ovr) => sum + ovr, 0) / memberOvrs.length : null;
    firstRoundEntries.push({ tier: target.tier, rank: oppRank, ovr: oppOVR, unranked: memberRanks.length < opp.length });
    completed += 1;
  }

  console.log(`campanhas com dado de 1ª rodada: ${completed}/${TRIALS}`);
  const firstRoundRanks = firstRoundEntries.map((entry) => entry.rank).filter(Number.isFinite);
  const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const distribution = {};
  for (const tier of ['Exibição', 'Bronze', 'Silver']) {
    const entries = firstRoundEntries.filter((entry) => entry.tier === tier);
    const ranks = entries.map((entry) => entry.rank).filter(Number.isFinite).sort((a, b) => a - b);
    const ovrs = entries.map((entry) => entry.ovr).filter(Number.isFinite);
    distribution[tier] = {
      n: entries.length, avgRank: mean(ranks), medianRank: percentile(ranks, 0.5), p10Rank: percentile(ranks, 0.1), p25Rank: percentile(ranks, 0.25), p75Rank: percentile(ranks, 0.75), p90Rank: percentile(ranks, 0.9),
      avgOVR: mean(ovrs), pctTop25: ranks.length ? ranks.filter((rank) => rank <= 25).length / ranks.length * 100 : null,
      pctTop50: ranks.length ? ranks.filter((rank) => rank <= 50).length / ranks.length * 100 : null,
      pctTop100: ranks.length ? ranks.filter((rank) => rank <= 100).length / ranks.length * 100 : null,
      pctTop250: ranks.length ? ranks.filter((rank) => rank <= 250).length / ranks.length * 100 : null,
      pctUnranked: entries.length ? entries.filter((entry) => entry.unranked).length / entries.length * 100 : null,
    };
  }
  console.log(JSON.stringify(distribution, null, 2));

  const strongDebuts = firstRoundRanks.filter((r) => r > 0 && r <= 30).length;
  const strongDebutShare = firstRoundRanks.length ? (strongDebuts / firstRoundRanks.length) * 100 : null;
  console.log(`estreias "fortes demais" (adversário rank <= 30): ${strongDebuts}/${firstRoundRanks.length} (${strongDebutShare?.toFixed(1)}%)`);

  check('amostra real coletada', () => {
    assert.ok(completed >= Math.min(8, TRIALS), `completed=${completed}`);
  });
  check('Pré-Temporada, Bronze e Silver têm amostra independente', () => {
    for (const tier of ['Exibição', 'Bronze', 'Silver']) assert.ok(distribution[tier].n >= Math.min(3, Math.floor(TRIALS / 3)), `${tier} n=${distribution[tier].n}`);
  });
  check('estreia rank <=30 NÃO é o padrão sistemático (deve ser exceção, não maioria — Parte G)', () => {
    assert.ok(strongDebutShare == null || strongDebutShare < 30, `${strongDebutShare?.toFixed(1)}% das estreias foram contra rank<=30 — padrão sistemático, não exceção`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-low-rank-first-round-quality-v5: PASS');
} finally {
  await vite.close();
}
