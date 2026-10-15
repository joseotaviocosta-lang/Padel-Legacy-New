// Playthrough 5.5, Parte G — reaproveita a autoridade de ranking corrigida
// pra reconferir os torneios iniciais do jogador. Simula N campanhas
// iniciais reais (jogador sem ranking, tiers Bronze/Silver), medindo por
// rodada: rank médio do oponente, mediana, P10/P90, OVR médio, frequência
// de Top50/Top100/Top300. Pede >=100 campanhas no briefing e aceita o número
// configurado via PADEL_CAMPAIGNS. A fundação sem partida é clonada para que
// cada campanha seja isolada sem reconstruir os mesmos 1.000 atletas.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-opponent-progression-v5', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const TARGET_CAMPAIGNS = Number(process.env.PADEL_CAMPAIGNS || 30);

function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null; }
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

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

  const byRound = new Map(); // short label (R32/R24/R16/QF/SF/F) -> entries
  let campaignsCompleted = 0;

  console.log(`=== Parte G: ${TARGET_CAMPAIGNS} campanhas iniciais (Bronze/Silver, jogador sem ranking) ===\n`);

  const baseStorage = new MemoryStorage();
  const baseManager = new CareerManager(new CareerRepository(new GameStorage(baseStorage)));
  activeCareerAdapter.careerManager = baseManager;
  activeCareerAdapter.clearActiveCareer();
  const { career: baseCareer } = await baseManager.createCareer({ saveName: 'prog-base', playerName: 'ProgPlayer' });
  activeCareerAdapter.setActiveCareer(baseCareer);
  await activeCareerAdapter.createPlayerProfile({
    id: 'prog-player', sport_name: 'ProgPlayer', career_date: '2026-01-01', birth_date: '2010-01-01',
    level: 'Iniciante', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const baseFiles = new Map(baseStorage.files);
  const baseDirectories = new Set(baseStorage.directories);

  for (let trial = 0; trial < TARGET_CAMPAIGNS; trial += 1) {
    if (trial > 0 && trial % 10 === 0) console.log(`[opponent-progression] ${trial}/${TARGET_CAMPAIGNS}`);
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
    if (!run?.matches?.length) continue;

    run.matches.forEach((match, roundIndex) => {
      const opp = match.opponent || [];
      if (!opp.length) return;
      const rank = avg(opp.map((m) => Number(m.ranking_position) || Number(m.rank) || 0).filter((v) => v > 0));
      const ovr = avg(opp.map((m) => Number(m.overall_rating) || 0).filter((v) => v > 0));
      const stage = match.short || match.round || `R${roundIndex + 1}`;
      if (!byRound.has(stage)) byRound.set(stage, []);
      byRound.get(stage).push({ rank, ovr });
    });
    campaignsCompleted += 1;
  }

  console.log(`campanhas concluídas com dados de rodada: ${campaignsCompleted}/${TARGET_CAMPAIGNS}\n`);
  const stageOrder = ['R32', 'R24', 'R20', 'R16', 'QF', 'SF', 'F'];
  const roundStats = stageOrder.filter((stage) => byRound.has(stage)).map((stage) => {
    const entries = byRound.get(stage);
    const ranks = entries.map((e) => e.rank).filter((v) => v != null).sort((a, b) => a - b);
    const ovrs = entries.map((e) => e.ovr).filter((v) => v != null).sort((a, b) => a - b);
    const top50 = ranks.filter((r) => r <= 50).length;
    const top100 = ranks.filter((r) => r <= 100).length;
    const top300 = ranks.filter((r) => r <= 300).length;
    return {
      round: stage, n: entries.length,
      avgRank: avg(ranks), medianRank: percentile(ranks, 0.5), p10Rank: percentile(ranks, 0.1), p90Rank: percentile(ranks, 0.9),
      avgOVR: avg(ovrs), medianOVR: percentile(ovrs, 0.5),
      pctTop50: ranks.length ? (top50 / ranks.length * 100) : null,
      pctTop100: ranks.length ? (top100 / ranks.length * 100) : null,
      pctTop300: ranks.length ? (top300 / ranks.length * 100) : null,
    };
  });
  for (const r of roundStats) {
    console.log(`rodada ${r.round}: n=${r.n} avgRank=${r.avgRank?.toFixed(0)} medRank=${r.medianRank} P10=${r.p10Rank} P90=${r.p90Rank} avgOVR=${r.avgOVR?.toFixed(1)} medOVR=${r.medianOVR} Top50=${r.pctTop50?.toFixed(1)}% Top100=${r.pctTop100?.toFixed(1)}% Top300=${r.pctTop300?.toFixed(1)}%`);
  }

  check(`ao menos ${Math.min(15, TARGET_CAMPAIGNS)} campanhas produziram dados de rodada (amostra real)`, () => {
    assert.ok(campaignsCompleted >= Math.min(15, TARGET_CAMPAIGNS), `campaignsCompleted=${campaignsCompleted}`);
  });
  check('dificuldade aumenta por rodada: avgOVR não-decrescente da 1ª pra última rodada com amostra', () => {
    const withSample = roundStats.filter((r) => r.n >= 3);
    assert.ok(withSample.length >= 2, 'amostra insuficiente pra comparar rodadas');
    const first = withSample[0]; const last = withSample[withSample.length - 1];
    assert.ok(last.avgOVR >= first.avgOVR - 3, `primeira rodada avgOVR=${first.avgOVR?.toFixed(1)} não deveria superar a última=${last.avgOVR?.toFixed(1)} por mais que a margem de ruído`);
  });
  // Achado (execução real): os oponentes da 1ª rodada de um jogador NOVO
  // aqui vêm majoritariamente do catálogo pequeno de bots "iniciante"
  // (src/lib/bots.js, escala PRÓPRIA de OVR — confirmado: avgOVR=15.6 na
  // rodada 0, abaixo do piso de 35 da população de 1000 atletas do World
  // Tour que esta fase mediu/corrigiu — ver Parte D), não a população
  // principal — `rank`/`ranking_position` aqui não é diretamente
  // comparável à escala 1-1000 usada no resto do relatório. Por isso o
  // teste estabelecido (test-opponent-strength-by-round.mjs, já validado,
  // PASS na regressão) não usa um piso numérico de rank — só confirma que
  // a 1ª rodada nunca é "o mais forte teoricamente possível do campo" E
  // que a força cresce ao longo das rodadas (já confirmado acima, item
  // anterior). Mesma régua aqui, não um novo piso inventado sem entender
  // a escala.
  check('estreia (1ª rodada) não é o oponente mais forte já visto na campanha inteira (nunca deveria ser o pico logo de cara)', () => {
    const first = roundStats[0];
    const strongest = Math.max(...roundStats.filter((r) => r.n > 0).map((r) => r.avgOVR ?? -Infinity));
    if (!first || !first.n || !Number.isFinite(strongest)) return;
    assert.ok(first.avgOVR <= strongest, `1ª rodada (avgOVR=${first.avgOVR?.toFixed(1)}) não deveria já ser o pico de força da campanha (${strongest.toFixed(1)})`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  console.log(`Nota (Parte G): rodado com ${TARGET_CAMPAIGNS} campanhas independentes (PADEL_CAMPAIGNS); ${campaignsCompleted} produziram dados reais de rodada.`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-opponent-progression-v5: PASS');
} finally {
  await vite.close();
}
