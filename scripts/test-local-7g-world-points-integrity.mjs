// LOCAL-7G — pontuação mundial de TODO o campo, com ou sem o jogador.
//   Defeito: num torneio com o jogador, só os adversários do caminho dele (e o campeão, quando ele caía antes da final)
//   recebiam pontos/Race. O resto da chave principal ficava sem crédito — inclusive todo o campo quando ele caía no
//   qualifying. Correção: no settlement canônico, cada dupla real da chave principal pontua pela rodada em que caiu,
//   pela mesma tabela da categoria, uma única vez.
//   Cenários A–H (jogador campeão/vice/R1/qualifying/W.O., sem jogador, homônimas, save/load) com pipeline real +
//   save antigo da CLOUD-7C. Pontos conferidos contra getTournamentRewards/getRoundOutcomeTable (tabelas oficiais).
// Uso: node scripts/test-local-7g-world-points-integrity.mjs
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
  const s = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const runs = await load('/src/gameplay/worldTour/TournamentRunManager.js');
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { ensureTournamentDraw } = await load('/src/lib/tournamentDraw.js');
  const { resolveUnavailablePlayerMatch, finalizeTournamentRun } = await load('/src/game-core/tournamentLifecycle.js');
  const { getTournamentRounds, getTournamentRewards } = await load('/src/lib/career.js');
  const { getRoundOutcomeTable, getTournamentTierConfig } = await load('/src/lib/circuitCatalog.js');
  const { computeRollingPoints } = await load('/src/game-core/rankingWindow.js');
  const { resolvePendingPlayerCanonicalTournaments: resolvePending } = await load('/src/game-core/tournamentLifecycle.js');
  const { getRealAthleteRegistry } = await load('/src/players/realAthleteRegistry.js');
  const realBotIds = new Set(getRealAthleteRegistry().map((entry) => entry?.id).filter(Boolean));
  const quiet = (fn) => async (...a) => { const w = console.warn; const l = console.log; const d = console.debug; const e = console.error; console.warn = () => {}; console.log = () => {}; console.debug = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.warn = w; console.log = l; console.debug = d; console.error = e; } };
  const E = localGame.entities;
  const opp = (match) => s.opponentTeamNameOfRunMatch(match);

  async function boot(seed, { loadText = null } = {}) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Local 7F' });
    let profileId = 'l7f-player';
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
        id: profileId, sport_name: 'Local 7F', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
        court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
      });
      await quiet(async () => { const status = await verifySaveFoundation(); if (!status.ok) await ensureWorldSeed2025(); })();
    }
    const advance = quiet(async (n) => {
      let profile = await E.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); profile = await E.PlayerProfile.get(profileId); }
      return profile;
    });
    const reload = async () => {
      await activeCareerAdapter.writeChain;
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
    };
    return { profileId, advance, reload };
  }

  // Sorteio real (D-3) de um torneio do jogador com qualifying obrigatório.
  async function drawQualifying(rt, id, { tier = 'Gold', partner, qualifying = true }) {
    const profile = await E.PlayerProfile.get(rt.profileId);
    const anchor = profile.career_date;
    const tournament = await E.Tournament.create({ id, name: `${tier} ${id}`, tier, start_date: anchor, end_date: anchor, status: 'inscricoes', world_tour_event: false, ...(qualifying ? { qualifying_size: 16 } : {}) });
    const event = await E.CalendarEvent.create({
      id: `${id}-cal`, profile_id: profile.id, event_type: 'tournament', title: tournament.name, start_date: anchor, end_date: anchor,
      related_id: id, related_name: tournament.name, status: 'scheduled', is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
      metadata: { registration_id: `${id}-reg`, partner_id: partner.id, entry_path: qualifying ? 'qualifying' : 'direct', qualifying_required: qualifying, team_rank: 0, original_start_date: anchor },
    });
    await quiet(ensureTournamentDraw)({ profile: { ...profile, career_date: anchor }, tournament, calendarEvent: event });
    return { id, eventId: event.id };
  }
  const getRun = async (eventId) => (await E.CalendarEvent.get(eventId)).metadata.tournament_run;
  const seatOf = (t) => t.bracket_history[0].matches.find((m) => m.player_match);

  // Mesmo caminho do TournamentModal (resultado da partida → chave canônica → finalização), sem React.
  async function playQualifying(rt, draw, results, partner) {
    let run = await getRun(draw.eventId);
    let tournament = await E.Tournament.get(draw.id);
    for (const won of results) {
      const current = runs.getCurrentTournamentMatch(run);
      const transition = runs.recordTournamentMatchResult(run, { matchId: current.id, won, score: won ? '6-3 6-4' : '3-6 4-6', tournament });
      run = transition.run;
      const completed = run.matches.find((m) => m.id === current.id);
      let bracket = tournament.bracket_history;
      if (completed.stage === 'main') {
        const profile = await E.PlayerProfile.get(rt.profileId);
        bracket = s.applyPlayerMatchToCanonicalBracket(tournament.bracket_history, {
          roundIndex: completed.stageRoundIndex, playerTeamName: `${profile.sport_name} & ${partner.name}`,
          opponentTeamName: opp(completed), won, score: completed.result?.score || null, date: completed.date,
        }).rounds;
      } else if (completed.stage === 'qualifying' && !won) {
        bracket = s.applyQualifyingExitToCanonicalBracket(tournament.bracket_history, {
          qualifierTeamName: opp(completed), remainingOpponents: s.remainingQualifyingOpponentNames(run, completed), date: completed.date,
        }).rounds;
      }
      await E.Tournament.update(draw.id, { bracket_history: bracket });
      const event = await E.CalendarEvent.get(draw.eventId);
      await E.CalendarEvent.update(draw.eventId, {
        metadata: { ...event.metadata, tournament_run: run },
        ...(transition.terminal ? { status: 'completed', requires_decision: false } : {}),
      });
      tournament = await E.Tournament.get(draw.id);
      if (transition.terminal) {
        const profile = await E.PlayerProfile.get(rt.profileId);
        await quiet(finalizeTournamentRun)({
          profile, tournament, partner, roundsWon: runs.countMainDrawWins(run), totalRounds: getTournamentRounds(tournament).length,
          runId: `${draw.id}:${run.createdAt}`, bracketHistory: bracket, run,
        });
        break;
      }
    }
    return { run, tournament: await E.Tournament.get(draw.id) };
  }
  const resultRowsFor = async (tid) => (await E.AthleteRankingResult.filter({})).filter((r) => r.tournament_id === tid);
  const qualifyingMemberIds = (run) => new Set(run.matches.filter((m) => m.stage === 'qualifying').flatMap((m) => (m.opponent || []).map((o) => o.id)));

  // Pontos esperados de uma dupla que caiu após vencer `roundsWon` rodadas da chave principal (tabela oficial).
  const expectedPoints = (tier, roundsWon) => getTournamentRewards(tier, roundsWon).rankPoints;
  // Rodadas vencidas de cada equipe na chave canônica (campeão = total de rodadas).
  const roundsWonByTeam = (rounds) => {
    const facts = s.deriveTournamentFactsFromFullBracket(rounds);
    const map = new Map([[facts.champion, rounds.length]]);
    rounds.forEach((round, r) => round.matches.forEach((m) => { const loser = m.winner === m.team_a ? m.team_b : m.team_a; if (!map.has(loser)) map.set(loser, r); }));
    return map;
  };
  // Confere TODA dupla real da chave principal contra a tabela.
  async function auditTournament(id, { playerIds = [] } = {}) {
    const t = await E.Tournament.get(id);
    const won = roundsWonByTeam(t.bracket_history);
    const rows = await resultRowsFor(id);
    const rowByAthlete = new Map(rows.map((r) => [r.athlete_id, r]));
    const issues = [];
    let pairs = 0;
    for (const entry of t.draw_ranking_snapshot || []) {
      if (!won.has(entry.name)) continue; // ficou no qualifying (não pontua)
      pairs += 1;
      const expected = expectedPoints(t.tier, won.get(entry.name));
      for (const athleteId of entry.member_ids || []) {
        const row = rowByAthlete.get(athleteId);
        if (!row) issues.push(`${entry.name}: sem resultado`);
        else if (Number(row.points) !== expected) issues.push(`${entry.name}: ${row.points} != ${expected}`);
      }
    }
    const perAthlete = rows.length === new Set(rows.map((r) => r.athlete_id)).size;
    const qualifyingOnly = (t.draw_ranking_snapshot || []).filter((entry) => !won.has(entry.name)).flatMap((entry) => entry.member_ids || []);
    return { t, rows, issues, pairs, perAthlete, qualifyingCredited: qualifyingOnly.filter((athleteId) => rowByAthlete.has(athleteId) && !playerIds.includes(athleteId)) };
  }

  const rt = await boot('local-7g');
  await rt.advance(8);
  const partner = (await E.AthleteProfile.list('-world_ranking_points', 5000)).find((a) => a.career_status !== 'aposentado');
  await E.PlayerProfile.update(rt.profileId, { partner_id: partner.id });
  const raceBefore = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, Number(a.race_points) || 0]));

  // A–D: torneios do jogador (Gold 32 com qualifying; Platinum 32 com entrada direta, outra categoria).
  const plan = [
    ['A', 'l7g-a', 'Gold', true, [true, true, true, true, true, true, true, true]],
    ['B', 'l7g-b', 'Gold', true, [true, true, true, true, true, true, true, false]],
    ['C', 'l7g-c', 'Platinum', false, [false]],
    ['D', 'l7g-d', 'Gold', true, [false]],
  ];
  const draws = {};
  for (const [key, id, tier, qualifying, results] of plan) {
    draws[key] = await drawQualifying(rt, id, { tier, partner, qualifying });
    await playQualifying(rt, draws[key], results, partner);
  }
  // F: W.O. automático na 2ª rodada principal (resolveUnavailablePlayerMatch real), depois de vencer a 1ª.
  draws.F = await drawQualifying(rt, 'l7g-f', { tier: 'Platinum', partner, qualifying: false });
  await playQualifying(rt, draws.F, [true], partner);
  await quiet(resolveUnavailablePlayerMatch)({ profile: await E.PlayerProfile.get(rt.profileId), tournament: await E.Tournament.get('l7g-f'), calendarEvent: await E.CalendarEvent.get(draws.F.eventId), reason: 'Lesão' });

  // H: save/load com o jogador já eliminado e a final ainda por chegar.
  const pendingBefore = (await resultRowsFor('l7g-c')).length;
  await rt.reload();
  ok('H1. save/load antes da final: nada creditado em dobro nem perdido', (await resultRowsFor('l7g-c')).length === pendingBefore);
  await rt.advance(16);

  const playerIds = [rt.profileId, partner.id];
  const audits = {};
  for (const key of ['A', 'B', 'C', 'D', 'F']) audits[key] = await auditTournament(draws[key].id, { playerIds });
  const label = { A: 'jogador campeão', B: 'jogador vice', C: 'jogador eliminado na 1ª rodada (Platinum)', D: 'jogador eliminado no qualifying', F: 'W.O. do jogador na 2ª rodada' };
  for (const key of ['A', 'B', 'C', 'D', 'F']) {
    const a = audits[key];
    ok(`${key}1. ${label[key]}: torneio liquidado e TODA dupla real da chave principal pontuada pela tabela da categoria`,
      a.t.status === 'finalizado' && Boolean(a.t.champion) && a.pairs >= 30 && a.issues.length === 0, `${a.pairs} duplas; ${a.issues.slice(0, 3).join(' | ')}`);
    ok(`${key}2. ${label[key]}: um resultado por atleta; qualifying não pontua`, a.perAthlete && a.qualifyingCredited.length === 0);
  }
  const membersOfTeam = (a, team) => a.t.draw_ranking_snapshot.find((e) => e.name === team)?.member_ids || [];
  const pointsOfTeam = (a, team) => membersOfTeam(a, team).map((id) => Number(a.rows.find((r) => r.athlete_id === id)?.points));
  ok('B3. jogador vice: o campeão (IA) recebe os pontos de campeão', pointsOfTeam(audits.B, audits.B.t.champion).every((p) => p === expectedPoints('Gold', 5)) && membersOfTeam(audits.B, audits.B.t.champion).length === 2);
  const placementsC = s.deriveTournamentFactsFromFullBracket(audits.C.t.bracket_history).placements;
  ok('C3. eliminado cedo: campeão, vice e semifinalistas da IA pontuam (antes só 1 dupla pontuava)',
    placementsC.slice(0, 4).every((p) => pointsOfTeam(audits.C, p.team).length === 2 && pointsOfTeam(audits.C, p.team).every((pts) => pts > 0))
    && pointsOfTeam(audits.C, placementsC[0].team)[0] > pointsOfTeam(audits.C, placementsC[1].team)[0]
    && pointsOfTeam(audits.C, placementsC[1].team)[0] > pointsOfTeam(audits.C, placementsC[2].team)[0]);
  const seatD = audits.D.t.bracket_history[0].matches.find((m) => m.player_match);
  ok('D3. eliminado no qualifying: o classificado pelo caminho do qualifying disputa e pontua pela chave principal',
    pointsOfTeam(audits.D, seatD.team_a).length === 2 && pointsOfTeam(audits.D, seatD.team_a).every((p) => p > 0));
  const playerRows = (key) => audits[key].rows.filter((r) => playerIds.includes(r.athlete_id));
  ok('A3. jogador e parceiro pontuam uma vez cada (campeões: pontos de campeão)', playerRows('A').length === 2 && playerRows('A').every((r) => Number(r.points) === expectedPoints('Gold', 5)));

  // Race: os pontos destes torneios entram na Race de cada atleta creditado (acumulador do ano, nunca perdido).
  const athletesNow = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
  const allRows = await E.AthleteRankingResult.filter({});
  const credited = [...new Set(Object.values(audits).flatMap((a) => a.rows.map((r) => r.athlete_id)))].filter((id) => !playerIds.includes(id) && athletesNow.has(id));
  const raceIssues = credited.filter((id) => {
    const fromPlayerEvents = allRows.filter((r) => r.athlete_id === id && String(r.tournament_id).startsWith('l7g-')).reduce((sum, r) => sum + Number(r.points), 0);
    return Number(athletesNow.get(id).race_points) < raceBefore.get(id) + fromPlayerEvents;
  });
  ok('R1. Race: os pontos dos torneios com jogador entram na Race de todos os atletas creditados', credited.length >= 120 && raceIssues.length === 0, `${credited.length} atletas; ${raceIssues.length} divergências`);
  // Ranking individual: total rolling = 22 melhores da janela, nunca a soma direta. Conferido para quem não teve
  // resultado depois da última passada semanal (os demais só convergem na próxima passada — regra de produto).
  const lastCircuit = [...athletesNow.values()].map((a) => a.last_circuit_update || '').sort().pop();
  const settled = credited.filter((id) => allRows.filter((r) => r.athlete_id === id).every((r) => (r.date || '') < lastCircuit));
  const rollingIssues = settled.filter((id) => Number(athletesNow.get(id).world_ranking_points) !== computeRollingPoints(allRows.filter((r) => r.athlete_id === id), [], lastCircuit));
  ok('R2. ranking individual: total = janela rolling dos resultados (inclui os novos créditos, sem soma direta)', settled.length >= 20 && rollingIssues.length === 0, `${settled.length} conferidos; ${rollingIssues.length} divergências`);

  // E: sem o jogador — o AI-only pontua todo o campo; mesma tabela por rodada que o fluxo do jogador.
  {
    await rt.advance(14);
    const allRows = await E.AthleteRankingResult.filter({});
    const ai = (await E.Tournament.filter({})).filter((t) => t.world_tour_resolved && t.world_tour_event !== false && !String(t.id).startsWith('l7g-') && t.placements?.length && t.status === 'finalizado');
    // Membros de cada dupla sorteada pelo id da dupla (Partnership ou `profile-pair:`), inclusive parceria já encerrada.
    const partnerships = new Map((await E.Partnership.filter({})).map((p) => [p.id, p]));
    const athletesAll = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
    const membersOfPair = (pairId) => (String(pairId).startsWith('profile-pair:')
      ? String(pairId).slice('profile-pair:'.length).split(':')
      : [partnerships.get(pairId)?.athlete_a_id, partnerships.get(pairId)?.athlete_b_id]).filter(Boolean);
    const isActive = (id) => athletesAll.get(id) && !athletesAll.get(id).retired && athletesAll.get(id).career_status !== 'aposentado';
    const aiIssues = [];
    const retiredGap = [];
    for (const t of ai) {
      const credited = new Set(allRows.filter((r) => r.tournament_id === t.id).map((r) => r.athlete_id));
      for (const pairId of t.draw_pair_ids || []) {
        const ids = membersOfPair(pairId);
        if (ids.every((id) => credited.has(id))) continue;
        // Defeito 2 (documentado, correção pendente de decisão — ver docs/LOCAL_7G_WORLD_POINTS_INTEGRITY.md §2/§7):
        // dupla sorteada cujo membro se aposentou antes do settlement sai do campo e não pontua.
        if (ids.some((id) => !isActive(id))) { retiredGap.push(`${t.id}:${pairId}`); continue; }
        aiIssues.push(`${t.id}: ${pairId} sem resultado`);
      }
    }
    if (retiredGap.length) console.log(`INFO — defeito 2 (AI-only, pendente): ${retiredGap.length} dupla(s) desfeita(s) por aposentadoria após o sorteio sem pontos: ${retiredGap.join(', ')}`);
    ok('E1. sem o jogador: todo torneio liquidado credita todas as duplas sorteadas com membros ativos',
      ai.length >= 3 && aiIssues.length === 0, `${ai.length} torneios; ${aiIssues.slice(0, 3).join(' | ')}`);
    const sameScale = ['Gold', 'Platinum', 'Silver', 'Masters'].every((tier) => {
      const table = getRoundOutcomeTable(tier, getTournamentTierConfig(tier).mainDrawSize);
      return table.roundPoints.every((points, roundsWon) => points === expectedPoints(tier, roundsWon));
    });
    ok('E2. mesma tabela nos dois fluxos: pontos por rodada do AI-only = pontos por rodada do torneio com jogador', sameScale);
  }

  // Idempotência / H: settlement repetido, reload e novos dias não duplicam nada.
  {
    const digest = sha((await E.AthleteRankingResult.filter({})).filter((r) => String(r.tournament_id).startsWith('l7g-')).map((r) => [r.id, r.points]).sort());
    const date = (await E.PlayerProfile.get(rt.profileId)).career_date;
    const again = await quiet(resolvePending)(date, await E.PlayerProfile.get(rt.profileId));
    await rt.reload();
    await rt.advance(2);
    ok('H2. idempotência: settlement repetido, reload e novos dias não criam nem alteram resultados', again.resolved === 0
      && sha((await E.AthleteRankingResult.filter({})).filter((r) => String(r.tournament_id).startsWith('l7g-')).map((r) => [r.id, r.points]).sort()) === digest);
  }

  // G: homônimas no mundo — a pontuação segue os ids (LOCAL-7E).
  {
    const athletes = await E.AthleteProfile.filter({});
    const byId = new Map(athletes.map((a) => [a.id, a]));
    const updates = [];
    const seen = new Set();
    let count = 0;
    for (const a of athletes) {
      const b = byId.get(a.ai_partner_id);
      if (!b || b.ai_partner_id !== a.id || seen.has(a.id) || seen.has(b.id) || realBotIds.has(a.bot_id) || realBotIds.has(b.bot_id) || a.id === partner.id || b.id === partner.id) continue;
      seen.add(a.id); seen.add(b.id);
      if (count % 2 === 0) updates.push({ id: a.id, name: 'Hugo López', sport_name: 'Hugo López' }, { id: b.id, name: 'Rafael López', sport_name: 'Rafael López' });
      count += 1;
    }
    await E.AthleteProfile.bulkUpdate(updates);
    const renamed = new Set(updates.map((u) => u.id));
    const draw = await drawQualifying(rt, 'l7g-g', { tier: 'Gold', partner, qualifying: false });
    await playQualifying(rt, draw, [false], partner);
    await rt.advance(10);
    const a = await auditTournament('l7g-g', { playerIds });
    ok('G1. homônimas: cada dupla pontua pelos SEUS atletas (ids), pela própria colocação', a.t.status === 'finalizado' && a.issues.length === 0 && a.perAthlete && a.pairs >= 10
      && (a.t.draw_ranking_snapshot || []).some((e) => (e.member_ids || []).every((id) => renamed.has(id)) && e.member_ids.every((id) => a.rows.some((r) => r.athlete_id === id))),
      `${a.t.status} ${a.t.end_date} pairs=${a.pairs} perAthlete=${a.perAthlete} ${a.issues.slice(0, 3).join(' | ')}`);
  }

  // Determinismo: o crédito é função da chave e da tabela; a auditoria repetida é idêntica.
  ok('K1. determinismo: pontos por dupla = função da chave e da tabela (auditoria repetida idêntica)',
    sha((await auditTournament('l7g-c')).rows.map((r) => [r.id, r.points]).sort()) === sha(audits.C.rows.map((r) => [r.id, r.points]).sort()));

  // Save antigo (CLOUD-7C): torneios do jogador pendentes recebem o campo; concluídos não mudam; ninguém em dobro.
  {
    const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE_FILE)).toString('utf8');
    const old = await boot('local-7g-fixture', { loadText: fixtureText });
    const before = await E.Tournament.filter({});
    const rowsBefore = await E.AthleteRankingResult.filter({});
    const finishedIds = new Set(before.filter((t) => t.status === 'finalizado').map((t) => t.id));
    const pendingPlayer = before.filter((t) => !t.world_tour_resolved && Number(t.bracket_schema_version) >= 2 && t.bracket_history?.some((r) => r.matches.some((m) => m.player_match)));
    await old.advance(2);
    const rowsAfter = await E.AthleteRankingResult.filter({});
    const finishedDigest = (rows) => sha(rows.filter((r) => finishedIds.has(r.tournament_id)).map((r) => [r.id, r.points]).sort());
    ok('O1. save antigo: torneios já concluídos não são reprocessados (resultados idênticos)', finishedDigest(rowsBefore) === finishedDigest(rowsAfter));
    const settledNow = (await E.Tournament.filter({})).filter((t) => pendingPlayer.some((p) => p.id === t.id) && t.world_tour_resolved);
    const seenKeys = new Set();
    let duplicates = 0;
    for (const r of rowsAfter) { if (!r.tournament_id) continue; const key = `${r.athlete_id}|${r.tournament_id}`; if (seenKeys.has(key)) duplicates += 1; seenKeys.add(key); }
    const keptOld = rowsBefore.filter((r) => settledNow.some((t) => t.id === r.tournament_id)).every((r) => rowsAfter.some((q) => q.id === r.id && q.points === r.points));
    ok('O2. save antigo: torneios do jogador pendentes liquidam com o campo pontuado; créditos antigos preservados, ninguém em dobro',
      settledNow.length >= 6 && duplicates === 0 && keptOld
      && settledNow.every((t) => rowsAfter.filter((r) => r.tournament_id === t.id).length > rowsBefore.filter((r) => r.tournament_id === t.id).length), `${settledNow.length} liquidados; ${duplicates} duplicados`);
  }
  console.log(`\nLOCAL-7G: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
