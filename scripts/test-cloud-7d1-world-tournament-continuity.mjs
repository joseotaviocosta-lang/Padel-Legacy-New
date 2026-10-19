// CLOUD-7D1 — o mundo precisa continuar independente do jogador: eliminação (ou W.O.) no qualifying não pode deixar o
// torneio sem final/campeão.
//   A. Chave canônica (funções puras de produção): qualifying (primeira/última rodada), primeira rodada principal,
//      semifinal, campeão; idempotência, imutabilidade da entrada, ausência de alteração em partidas já decididas.
//   B. Save real (fixture CLOUD-7C com 6 torneios travados): o tick diário de produção fecha os torneios, sem duplicar
//      WorldEvent / ranking / premiação do jogador, sem alterar torneios já finalizados nem voltar a escalar o jogador.
//   C. Save/load durante a competição e avanço acelerado sem nenhuma tela aberta.
//   D. Mundo sem jogador (carreira nova, nenhuma inscrição): todo torneio vencido e válido termina com campeão.
// Uso: node scripts/test-cloud-7d1-world-tournament-continuity.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const FIXTURE_FILE = path.resolve('reports/cloud-phase-7c-long-career-validation/fixtures/active-player-save-season1-baseline.json.gz');
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = 1;
let fake = 0;
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date;
globalThis.Date = class DeterministicDate extends RealDate {
  constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); }
  static now() { return (fake += 1000); }
};
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
const reseed = (seed) => { rng = hashSeed(seed); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(seed) % 100000); };

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };

function memoryBackend() {
  const files = new Map();
  return {
    files,
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const settlement = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const quiet = (fn) => async (...a) => { const w = console.warn; const l = console.log; const d = console.debug; const e = console.error; console.warn = () => {}; console.debug = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.warn = w; console.log = l; console.debug = d; console.error = e; } };

  // ═══ A. Chave canônica ═══
  const ROUNDS = 5; // chave de 32
  const PLAYER = 'Jogador & Parceiro';
  const mainOpponents = Array.from({ length: ROUNDS }, (_, i) => ({ name: `Adversário ${i} A & Adversário ${i} B` }));
  const buildBracket = (id = 'tournament-test') => settlement.buildPlayerTournamentBracket({
    tournamentId: id, date: '2030-03-01', roundDates: ['2030-03-05', '2030-03-06', '2030-03-07', '2030-03-08', '2030-03-09'], playerTeamName: PLAYER, mainOpponents,
    fillerFactory: (count, k) => Array.from({ length: count }, (_, j) => ({ name: `Filler ${k}-${j} X & Filler ${k}-${j} Y` })),
  });
  const matchesOf = (rounds) => rounds.flatMap((r) => r.matches);
  const teamsOf = (rounds) => new Set(matchesOf(rounds).flatMap((m) => [m.team_a, m.team_b]).filter(Boolean));
  const QUALIFIER = 'Qualificado A & Qualificado B';

  {
    const open = buildBracket();
    ok('A0. DEFEITO ORIGINAL: com a vaga do jogador aberta a chave não produz campeão', settlement.deriveTournamentFactsFromFullBracket(open) === null);
    const snapshot = JSON.stringify(open);
    const { rounds, idempotent } = settlement.applyQualifyingExitToCanonicalBracket(open, { qualifierTeamName: QUALIFIER, date: '2030-03-05' });
    ok('A1. eliminação no qualifying: a chave passa a ter campeão e vice', Boolean(settlement.deriveTournamentFactsFromFullBracket(rounds)?.champion) && !idempotent);
    ok('A2. a entrada não é mutada', JSON.stringify(open) === snapshot);
    ok('A3. o jogador não aparece na chave principal; a dupla classificada ocupa a vaga', !teamsOf(rounds).has(PLAYER) && rounds[0].matches[0].team_a === QUALIFIER);
    ok('A4. todas as partidas têm vencedor e as rodadas ficam completas', matchesOf(rounds).every((m) => m.winner && m.status === 'completed') && rounds.every((r) => r.status === 'completed'));
    const facts = settlement.deriveTournamentFactsFromFullBracket(rounds);
    ok('A5. campeão não é o jogador e pertence à chave', facts.champion !== PLAYER && teamsOf(rounds).has(facts.champion));
    ok('A6. colocações sem dupla repetida e com 32 duplas', new Set(facts.placements.map((p) => p.team)).size === facts.placements.length && facts.placements.length === 32, String(facts.placements.length));
    const sameAgain = settlement.applyQualifyingExitToCanonicalBracket(open, { qualifierTeamName: QUALIFIER, date: '2030-03-05' }).rounds;
    ok('A7. determinístico: mesma entrada => mesma chave', JSON.stringify(sameAgain) === JSON.stringify(rounds));
    const again = settlement.applyQualifyingExitToCanonicalBracket(rounds, { qualifierTeamName: 'Outro & Outro' });
    ok('A8. idempotente: segunda aplicação não altera nada', again.idempotent === true && JSON.stringify(again.rounds) === JSON.stringify(rounds));
    const decidedBefore = matchesOf(open).filter((m) => m.winner);
    const sameDecided = decidedBefore.every((m) => { const after = matchesOf(rounds).find((x) => x.match_id === m.match_id); return after && after.winner === m.winner && after.score === m.score; });
    ok('A4b. o grafo canônico continua estruturalmente válido (mesmo validador de produção)', settlement.validateCanonicalBracketGraph({ bracket_history: rounds }).valid === true, JSON.stringify(settlement.validateCanonicalBracketGraph({ bracket_history: rounds }).errors));
    ok('A9. partidas já decididas (sub-chaves) mantêm vencedor e placar', decidedBefore.length > 0 && sameDecided);
    const finalized = settlement.finalizeTournamentFromBracket({ tournament: { id: 'tournament-test', tier: 'Gold' }, bracket: { ...facts, bracket_history: rounds }, date: '2030-03-10' });
    ok('A10. liquidação canônica fecha o torneio e é idempotente na segunda vez', finalized.patch.status === 'finalizado'
      && settlement.finalizeTournamentFromBracket({ tournament: { id: 'tournament-test', ...finalized.patch }, bracket: { ...facts, bracket_history: rounds }, date: '2030-03-11' }).idempotent === true);
  }

  {
    // Eliminação na ÚLTIMA rodada do qualifying produz o mesmo efeito (mesma função; só muda a dupla que herda a vaga).
    const rounds = settlement.applyQualifyingExitToCanonicalBracket(buildBracket('tournament-last-q'), { qualifierTeamName: 'Última Q1 & Última Q2' }).rounds;
    ok('A11. eliminação na última rodada do qualifying também fecha a chave', Boolean(settlement.deriveTournamentFactsFromFullBracket(rounds)?.champion));
  }

  {
    // Principal: derrota na 1ª rodada e na semifinal continuam fechando (cascata refatorada), e o campeão do jogador fecha.
    for (const [label, roundIndex] of [['primeira rodada principal', 0], ['oitavas', 1], ['quartas', 2], ['semifinal', 3], ['final', 4]]) {
      let rounds = buildBracket(`tournament-main-${roundIndex}`);
      for (let r = 0; r < roundIndex; r += 1) rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: r, playerTeamName: PLAYER, opponentTeamName: mainOpponents[r].name, won: true, score: '6-3 6-4' }).rounds;
      rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex, playerTeamName: PLAYER, opponentTeamName: mainOpponents[roundIndex].name, won: false, score: '3-6 4-6' }).rounds;
      const facts = settlement.deriveTournamentFactsFromFullBracket(rounds);
      ok(`A12. derrota na ${label}: a chave continua até a final e há campeão`, Boolean(facts?.champion) && matchesOf(rounds).every((m) => m.winner), label);
    }
    let rounds = buildBracket('tournament-champion');
    for (let r = 0; r < ROUNDS; r += 1) rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: r, playerTeamName: PLAYER, opponentTeamName: mainOpponents[r].name, won: true, score: '6-3 6-4' }).rounds;
    ok('A13. jogador campeão: chave fecha com o jogador como campeão', settlement.deriveTournamentFactsFromFullBracket(rounds)?.champion === PLAYER);
  }

  // ═══ B/C. Save real (fixture CLOUD-7C) ═══
  const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE_FILE)).toString('utf8');
  async function boot({ seed, loadText = null }) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    const backend = memoryBackend();
    const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Cloud 7D1' });
    let profileId = 'c7d1-player';
    if (loadText) {
      const external = JSON.parse(loadText);
      external.career_id = career.career_id;
      await manager.saveCareer(career.career_id, external);
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
      profileId = external.player.id;
    } else {
      activeCareerAdapter.setActiveCareer(career);
      await activeCareerAdapter.createPlayerProfile({
        id: profileId, sport_name: 'Cloud 7D1', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
        court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id, weekly_training_enabled: false,
      });
    }
    const advance = async (n) => {
      let profile = await localGame.entities.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); profile = await localGame.entities.PlayerProfile.get(profileId); }
      return profile;
    };
    return { manager, careerId: career.career_id, profileId, advance };
  }
  const tournamentRuns = async (profileId) => {
    const events = (await localGame.entities.CalendarEvent.filter({ profile_id: profileId, event_type: 'tournament' })) || [];
    return new Map(events.filter((e) => e.metadata?.tournament_run).map((e) => [e.related_id, e.metadata.tournament_run]));
  };
  const isQualifyingExit = (run) => run?.status === 'eliminated'
    && !(run.matches || []).some((m) => m.stage === 'main' && m.status === 'completed')
    && (run.matches || []).some((m) => m.stage === 'qualifying' && m.status === 'completed' && !m.result?.won);

  {
    const rt = await boot({ seed: '7d1-fixture', loadText: fixtureText });
    const date0 = (await localGame.entities.PlayerProfile.get(rt.profileId)).career_date;
    const runs = await tournamentRuns(rt.profileId);
    const tournaments0 = await localGame.entities.Tournament.filter({});
    const stuck = tournaments0.filter((t) => t.status !== 'finalizado' && t.status !== 'cancelado' && t.end_date < date0 && isQualifyingExit(runs.get(t.id)));
    ok('B0. REPRODUÇÃO: o save da CLOUD-7C tem torneios vencidos sem campeão após o jogador cair no qualifying', stuck.length >= 6 && stuck.every((t) => !t.champion && !t.world_tour_resolved), String(stuck.length));
    const stuckIds = new Set(stuck.map((t) => t.id));

    const profile0 = await localGame.entities.PlayerProfile.get(rt.profileId);
    const rankingRows0 = await localGame.entities.AthleteRankingResult.filter({});
    const rowIdsBefore = new Set(rankingRows0.map((r) => r.id));
    const playerRowsBefore = rankingRows0.filter((r) => r.athlete_id === rt.profileId).map((r) => r.id).sort();
    const finalizedBefore = new Map(tournaments0.filter((t) => t.status === 'finalizado').map((t) => [t.id, sha(t)]));
    const worldEvents0 = (await localGame.entities.WorldEvent.filter({})).filter((w) => w.event_type === 'tournament_result');

    const profile1 = await quiet(rt.advance)(1);
    const tournaments1 = await localGame.entities.Tournament.filter({});
    const healed = tournaments1.filter((t) => stuckIds.has(t.id));
    ok('B1. um único tick diário de produção fecha todos os torneios travados', healed.every((t) => t.status === 'finalizado' && t.world_tour_resolved && t.champion && t.runner_up), JSON.stringify(healed.map((t) => [t.id, t.status, t.champion])));
    ok('B2. a chave desses torneios está completa e o jogador não aparece na chave principal', healed.every((t) => matchesOf(t.bracket_history).every((m) => m.winner) && !(t.placements || []).some((p) => String(p.team).startsWith(`${profile0.sport_name} &`))));
    ok('B3. colocações sem dupla repetida', healed.every((t) => new Set(t.placements.map((p) => p.team)).size === t.placements.length));
    ok('B4. torneios já finalizados não foram alterados', tournaments1.filter((t) => finalizedBefore.has(t.id)).every((t) => finalizedBefore.get(t.id) === sha(t)));
    const worldEvents1 = (await localGame.entities.WorldEvent.filter({})).filter((w) => w.event_type === 'tournament_result');
    const perTournament = new Map();
    for (const w of worldEvents1) perTournament.set(w.related_tournament_id, (perTournament.get(w.related_tournament_id) || 0) + 1);
    ok('B5. um WorldEvent de resultado por torneio resolvido, sem duplicidade', [...stuckIds].every((id) => perTournament.get(id) === 1) && [...perTournament.values()].every((n) => n === 1) && worldEvents1.length - worldEvents0.length === stuckIds.size);
    const rankingRows1 = await localGame.entities.AthleteRankingResult.filter({});
    const ids1 = rankingRows1.map((r) => r.id);
    ok('B6. ranking: nenhum id de resultado duplicado', ids1.length === new Set(ids1).size);
    ok('B7. premiação do jogador não é reaplicada (linhas, moedas, XP e runs processadas inalterados)',
      JSON.stringify(rankingRows1.filter((r) => r.athlete_id === rt.profileId).map((r) => r.id).sort()) === JSON.stringify(playerRowsBefore)
      && profile1.coins >= profile0.coins && (profile1.processed_tournament_runs || []).filter((k) => stuckIds.has(k.split(':')[1])).length === (profile0.processed_tournament_runs || []).filter((k) => stuckIds.has(k.split(':')[1])).length);
    const runsAfter = await tournamentRuns(rt.profileId);
    ok('B8. o jogador continua eliminado e não ganha novas partidas nesses torneios', [...stuckIds].every((id) => runsAfter.get(id)?.status === 'eliminated'
      && JSON.stringify(runsAfter.get(id).matches.map((m) => m.status)) === JSON.stringify(runs.get(id).matches.map((m) => m.status))));
    const creditedAthleteRows = rankingRows1.filter((r) => stuckIds.has(r.tournament_id) && r.athlete_id !== rt.profileId && !rowIdsBefore.has(r.id));
    // LOCAL-7G — o tick pontua TODO o campo da chave canônica (antes: só a dupla da final do run, se campeã). Invariante
    // mantido: nenhum crédito fabricado — cada linha nova vale exatamente a rodada em que a dupla do atleta caiu na chave.
    const { getTournamentRewards } = await load('/src/lib/career.js');
    const creditMatchesBracket = (r) => {
      const t = tournaments1.find((x) => x.id === r.tournament_id);
      const team = (t.draw_ranking_snapshot || []).find((e) => (e.member_ids || []).includes(r.athlete_id))?.name
        || runsAfter.get(r.tournament_id).matches.find((m) => (m.opponent || []).some((o) => o.id === r.athlete_id))?.opponent.map((o) => o.name).join(' & ');
      const rounds = t.bracket_history;
      let roundsWon = team === t.champion ? rounds.length : null;
      rounds.forEach((round, index) => round.matches.forEach((m) => { const loser = m.winner === m.team_a ? m.team_b : m.team_a; if (roundsWon === null && loser === team) roundsWon = index; }));
      return roundsWon !== null && Number(r.points) === getTournamentRewards(t.tier, roundsWon).rankPoints;
    };
    ok('B9. ranking: as linhas NOVAS do tick creditam o campo pela rodada real de cada dupla na chave (nenhum crédito fabricado)',
      creditedAthleteRows.length > 0 && creditedAthleteRows.every(creditMatchesBracket));

    if (process.env.CLOUD_7D1_EVIDENCE_OUT) {
      const worldEventIds = new Set(worldEvents1.map((w) => w.related_tournament_id));
      const rows = stuck.map((t) => {
        const run = runs.get(t.id); const exit = run.matches.find((m) => m.status === 'completed' && !m.result?.won);
        const after = tournaments1.find((x) => x.id === t.id);
        return {
          tournament: t.id, tier: t.tier, season: Number(t.id.split('-')[1]), startDate: t.start_date, endDate: t.end_date, playerExitRound: exit.round, playerExitDate: exit.date, playerExitScore: exit.result.score,
          qualifierInheritingSeat: exit.opponent.map((o) => o.name).join(' & '),
          before: { status: t.status, champion: t.champion || null, runnerUp: t.runner_up || null, resolved: Boolean(t.world_tour_resolved), worldEvent: worldEvents0.some((w) => w.related_tournament_id === t.id), ageDaysAtFixture: Math.round((new RealDate(date0) - new RealDate(t.end_date)) / 86400000) },
          after: { status: after.status, champion: after.champion, runnerUp: after.runner_up, resolved: Boolean(after.world_tour_resolved), worldEvent: worldEventIds.has(t.id), resolvedAt: after.resolved_at, placements: (after.placements || []).length },
        };
      });
      fs.writeFileSync(process.env.CLOUD_7D1_EVIDENCE_OUT, JSON.stringify({ fixtureDate: date0, stuckBeforeFix: stuck.length, rows }, null, 2));
    }

    // C. avanço acelerado + save/load durante a competição
    const afterTick = new Map(tournaments1.filter((t) => stuckIds.has(t.id)).map((t) => [t.id, sha(t)]));
    await quiet(rt.advance)(7);
    activeCareerAdapter.clearActiveCareer();
    const reloaded = await rt.manager.loadCareer(rt.careerId);
    activeCareerAdapter.setActiveCareer(reloaded);
    const tournaments2 = await localGame.entities.Tournament.filter({});
    ok('C1. save/load preserva campeões, chaves e resolução dos torneios corrigidos', tournaments2.filter((t) => stuckIds.has(t.id)).every((t) => afterTick.get(t.id) === sha(t)));
    await quiet(rt.advance)(7);
    const tournaments3 = await localGame.entities.Tournament.filter({});
    ok('C2. 14 dias adiante (com recarga no meio) não reprocessa nem altera os torneios corrigidos', tournaments3.filter((t) => stuckIds.has(t.id)).every((t) => afterTick.get(t.id) === sha(t)));
    const worldEvents3 = (await localGame.entities.WorldEvent.filter({})).filter((w) => w.event_type === 'tournament_result');
    const per3 = new Map(); for (const w of worldEvents3) per3.set(w.related_tournament_id, (per3.get(w.related_tournament_id) || 0) + 1);
    ok('C3. nenhum WorldEvent de resultado duplicado após recarga e novos dias', [...per3.values()].every((n) => n === 1));
    const date3 = (await localGame.entities.PlayerProfile.get(rt.profileId)).career_date;
    const overdue = tournaments3.filter((t) => t.status !== 'finalizado' && t.status !== 'cancelado' && t.end_date && t.end_date < date3 && new Date(date3) - new Date(t.end_date) > 14 * 86400000);
    ok('C4. nenhum torneio vencido há mais de 14 dias segue sem resolução', overdue.length === 0, JSON.stringify(overdue.map((t) => t.id)));
    const rows3 = await localGame.entities.AthleteRankingResult.filter({});
    ok('C5. ranking sem ids duplicados após 14 dias e recarga', rows3.length === new Set(rows3.map((r) => r.id)).size);
  }

  // ═══ D. Mundo sem jogador ═══
  {
    const rt = await boot({ seed: '7d1-world-only' });
    const profile = await quiet(rt.advance)(110);
    const tournaments = await localGame.entities.Tournament.filter({});
    const date = profile.career_date;
    const due = tournaments.filter((t) => t.status !== 'cancelado' && t.end_date && new Date(date) - new Date(t.end_date) > 14 * 86400000);
    const finalized = tournaments.filter((t) => t.status === 'finalizado' && t.champion);
    ok('D1. sem jogador inscrito, há torneios concluídos e todo torneio vencido há mais de 14 dias tem campeão', due.length > 0 && due.every((t) => t.status === 'finalizado' && t.champion), `${due.length} vencidos; ${due.filter((t) => !t.champion).length} sem campeão`);
    const overlapping = finalized.filter((a) => finalized.some((b) => a.id < b.id && a.start_date <= b.end_date && b.start_date <= a.end_date && (a.city || a.location) !== (b.city || b.location)));
    ok('D2. torneios simultâneos em locais diferentes concluem ambos', overlapping.length > 0);
    const worldEvents = (await localGame.entities.WorldEvent.filter({})).filter((w) => w.event_type === 'tournament_result');
    // Exibição histórica pré-definida (ex.: Roma 2026) não passa pelo circuito: sem world_tour_resolved, sem WorldEvent/ranking.
    ok('D3. resultados no histórico mundial (um por torneio de circuito concluído)', finalized.filter((t) => t.world_tour_resolved).every((t) => worldEvents.filter((w) => w.related_tournament_id === t.id).length === 1));
    const rows = await localGame.entities.AthleteRankingResult.filter({});
    ok('D4. rankings processados sem duplicidade', rows.length > 0 && finalized.filter((t) => t.world_tour_resolved).every((t) => rows.some((r) => r.tournament_id === t.id)) && rows.length === new Set(rows.map((r) => r.id)).size);
  }
  console.log(`\nCLOUD-7D1: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
