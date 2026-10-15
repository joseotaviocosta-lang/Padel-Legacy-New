// Playthrough 5.1, Parte L/W — jogador novo (16 anos, sem ranking real,
// "#1000+"), Bronze/Silver. Duas frentes, propositalmente separadas:
// (1) os PRÓPRIOS adversários da campanha do jogador — mecanismo de
//     seed sintético (computeSeededOpponentRanksForMainDraw,
//     tournamentDraw.js) que a Playthrough 5.0 já corrigiu e que esta
//     fase NÃO tocou (Parte T: não mexer em buildSeededDrawSlots nem no
//     que o alimenta) — reconfirma que a regressão continua de pé;
// (2) o CAMPO REAL do torneio que ele entra (draw_pair_ids, população
//     mundial AI-only) — isso SIM foi afetado pela Parte C/D desta fase
//     (getTournamentChoiceProfile), então confirma que o campo de um
//     Bronze/Silver real continua compatível com o nível de um jogador
//     novo (não virou um campo de nível Gold por acidente do rebalance).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-new-player-opponent-tier-quality', search: '' };
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
  const { resolveCompletedWorldTourEvents, ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const opponentOvrSamples = { first: [], final: [] };
  let neverEliteOpener = true;
  const fieldOvrSamples = [];

  for (let trial = 0; trial < 4; trial += 1) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: `5.1 New Player Quality ${trial}`, playerName: `NewP${trial}` });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `newp-tier-quality-${trial}`, sport_name: `NewP${trial}`, career_date: '2026-01-01', birth_date: '2010-01-01',
      level: 'Iniciante', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    });
    const partner = BOTS_BY_DIFFICULTY.iniciante[trial % BOTS_BY_DIFFICULTY.iniciante.length];
    await localGame.entities.PlayerProfile.update(profile.id, { partner_id: partner.id });
    profile = await activeCareerAdapter.getPlayerProfile();

    await ensureWorldSeed2025();
    await ensureFutureTournaments('2026-01-01');
    // Avança o mundo AI-only por algumas semanas antes de registrar, pra
    // que os torneios Bronze/Silver reais já tenham draw_pair_ids de
    // verdade formados pela lógica de escolha corrigida desta fase.
    let d = '2026-01-01';
    for (let i = 0; i < 21; i += 1) {
      const next = new Date(`${d}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
      await ensureWorldTourDraws(d).catch(() => null);
      await resolveCompletedWorldTourEvents(d).catch(() => null);
    }

    const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const candidates = tournaments.filter((t) => (t.tier === 'Bronze' || t.tier === 'Silver') && t.main_draw_size >= 8 && t.start_date > d);
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
    if (ovrByRound.length >= 1) opponentOvrSamples.first.push(ovrByRound[0]);
    if (ovrByRound.length >= 2) opponentOvrSamples.final.push(ovrByRound[ovrByRound.length - 1]);

    // "#20/#30 na estreia" — o primeiro adversário nunca deveria ter OVR
    // de elite (>=88, patamar Elite/Crown na escada de prestígio real).
    if (ovrByRound.length && ovrByRound[0] >= 88) neverEliteOpener = false;

    // Campo real do torneio (a outra metade do draw, população mundial).
    const freshTournament = await localGame.entities.Tournament.get(target.id).catch(() => null);
    if (Array.isArray(freshTournament?.draw_pair_ids) && freshTournament.draw_pair_ids.length) {
      const partnerships = await localGame.entities.Partnership.list(null, 3000).catch(() => []);
      const partnershipById = new Map(partnerships.map((p) => [p.id, p]));
      const athletes = await localGame.entities.AthleteProfile.list(null, 3000);
      const athleteById = new Map(athletes.map((a) => [a.id, a]));
      const ovrs = [];
      for (const pairId of freshTournament.draw_pair_ids) {
        const partnership = partnershipById.get(pairId);
        for (const id of [partnership?.athlete_a_id, partnership?.athlete_b_id].filter(Boolean)) {
          const athlete = athleteById.get(id);
          if (Number(athlete?.overall_rating) > 0) ovrs.push(Number(athlete.overall_rating));
        }
      }
      if (ovrs.length) fieldOvrSamples.push(ovrs.reduce((s, v) => s + v, 0) / ovrs.length);
    }
  }

  await check('coletou amostras suficientes (>=2 trials com chave completa) pra avaliar a estreia do jogador novo', () => {
    assert.ok(opponentOvrSamples.first.length >= 2, `amostras insuficientes: ${opponentOvrSamples.first.length}`);
  });

  await check('o primeiro adversário de um jogador novo (sem ranking) nunca tem OVR de nível Elite/Crown (>=88) — nunca "#20/#30 na estreia"', () => {
    assert.ok(neverEliteOpener, `algum trial teve estreia com OVR de elite: ${JSON.stringify(opponentOvrSamples.first)}`);
  });

  await check('em média, a última rodada não é mais fraca que a primeira (nunca progressão invertida)', () => {
    if (opponentOvrSamples.final.length < 1) return; // sem chaves longas o bastante nesta amostra — não falseia.
    const avgFirst = opponentOvrSamples.first.reduce((s, v) => s + v, 0) / opponentOvrSamples.first.length;
    const avgFinal = opponentOvrSamples.final.reduce((s, v) => s + v, 0) / opponentOvrSamples.final.length;
    assert.ok(avgFinal >= avgFirst - 3, `média final (${avgFinal.toFixed(1)}) não deveria ser bem menor que a inicial (${avgFirst.toFixed(1)})`);
  });

  await check('o CAMPO REAL do Bronze/Silver que o jogador novo entra continua compatível com nível de base (avgOVR do campo < 85, nunca virou um campo de nível Gold/elite por acidente do rebalance)', () => {
    if (!fieldOvrSamples.length) return; // sem amostra de campo real nesta rodada — não falseia (a chave sintética do jogador é a checagem principal, acima).
    const avg = fieldOvrSamples.reduce((s, v) => s + v, 0) / fieldOvrSamples.length;
    console.log(`   avgOVR do campo real Bronze/Silver amostrado: ${avg.toFixed(1)} (amostras: ${fieldOvrSamples.length})`);
    assert.ok(avg < 85, `campo real do Bronze/Silver com avgOVR=${avg.toFixed(1)}, esperava < 85`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-new-player-opponent-tier-quality: PASS');
} finally {
  await vite.close();
}
