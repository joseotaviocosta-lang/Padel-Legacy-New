// LOCAL-7F — qualifying completo, classificação correta e continuidade independente do jogador.
//   Defeito 1: na saída do jogador no qualifying, a dupla que o eliminou herdava DIRETO a vaga da chave principal,
//     pulando as rodadas de qualifying que ainda faltavam (CLOUD-7D1, applyQualifyingExitToCanonicalBracket).
//   Defeito 2: placementRoundsWonForOpponent indexava `run.matches` (que começa pelo qualifying) com contagens da chave
//     principal — adversários do qualifying recebiam pontos de "rodada da chave principal" que nunca disputaram.
//   Cenários A–J com o pipeline real (carreira em memória, sorteio real ensureTournamentDraw, mesmo caminho do
//   TournamentModal sem React, W.O. real, tick diário real) + save antigo da CLOUD-7C (anterior à CLOUD-7D1).
// Uso: node scripts/test-local-7f-qualifying-continuity.mjs
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
  const { getTournamentRounds } = await load('/src/lib/career.js');
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
  async function drawQualifying(rt, id, { tier = 'Gold', partner }) {
    const profile = await E.PlayerProfile.get(rt.profileId);
    const anchor = profile.career_date;
    const tournament = await E.Tournament.create({ id, name: `${tier} ${id}`, tier, start_date: anchor, end_date: anchor, status: 'inscricoes', world_tour_event: false, qualifying_size: 16 });
    const event = await E.CalendarEvent.create({
      id: `${id}-cal`, profile_id: profile.id, event_type: 'tournament', title: tournament.name, start_date: anchor, end_date: anchor,
      related_id: id, related_name: tournament.name, status: 'scheduled', is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
      metadata: { registration_id: `${id}-reg`, partner_id: partner.id, entry_path: 'qualifying', qualifying_required: true, team_rank: 0, original_start_date: anchor },
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

  // ═══ Mundo + jogador ═══
  const rt = await boot('local-7f');
  await rt.advance(8);
  const partner = (await E.AthleteProfile.list('-world_ranking_points', 5000)).find((a) => a.career_status !== 'aposentado');
  await E.PlayerProfile.update(rt.profileId, { partner_id: partner.id });

  // ═══ B. Perde na 1ª rodada do qualifying (de 3) ═══
  {
    const draw = await drawQualifying(rt, 'l7f-b', { partner });
    const initial = await getRun(draw.eventId);
    const qual = initial.matches.filter((m) => m.stage === 'qualifying');
    ok('B0. estrutura real: Gold com qualifying de 16 = 3 rodadas, cada uma com adversário próprio, e 1 vaga reservada na chave principal',
      qual.length === 3 && new Set(qual.map(opp)).size === 3 && (await E.Tournament.get(draw.id)).bracket_history[0].matches.filter((m) => m.player_match).length === 1);
    const drawnBracket = (await E.Tournament.get(draw.id)).bracket_history;
    const { run, tournament } = await playQualifying(rt, draw, [false], partner);
    const seat = seatOf(tournament);
    ok('B1. a dupla que eliminou o jogador NÃO recebe a vaga direto: segue para a Q2 e a Q3', seat.qualifying_path?.length === 2
      && seat.qualifying_path[0].team_a === opp(qual[0]) && seat.qualifying_path[0].team_b === opp(qual[1]) && seat.qualifying_path[1].team_b === opp(qual[2]));
    ok('B2. só quem vence a última rodada do qualifying ocupa a vaga, e a disputa', seat.team_a === seat.qualifying_path[1].winner && seat.status === 'completed' && Boolean(seat.winner));
    ok('B3. a eliminação do jogador permanece registrada (Q1 perdida, campanha encerrada)', run.status === 'eliminated' && run.matches[0].result?.won === false);
    const rows = await resultRowsFor(draw.id);
    const qIds = qualifyingMemberIds(run);
    ok('B4. adversários do qualifying não recebem pontos de chave principal; jogador e parceiro, sim (uma vez)',
      rows.every((r) => !qIds.has(r.athlete_id)) && rows.filter((r) => r.athlete_id === rt.profileId).length === 1 && rows.filter((r) => r.athlete_id === partner.id).length === 1, JSON.stringify(rows.map((r) => [r.athlete_id, r.points])));
    const shape = (rounds) => rounds.map((r) => [r.round, r.matches.length, r.matches.map((m) => m.match_id)]);
    ok('B5. nenhuma vaga extra nem removida: mesma estrutura de rodadas/partidas do sorteio; só a vaga reservada mudou',
      sha(shape(tournament.bracket_history)) === sha(shape(drawnBracket))
      && tournament.bracket_history[0].matches.slice(1).every((m, i) => m.team_a === drawnBracket[0].matches[i + 1].team_a && m.team_b === drawnBracket[0].matches[i + 1].team_b && m.winner === drawnBracket[0].matches[i + 1].winner));
  }

  // ═══ C. Perde na última rodada do qualifying ═══
  {
    const draw = await drawQualifying(rt, 'l7f-c', { partner });
    const qual = (await getRun(draw.eventId)).matches.filter((m) => m.stage === 'qualifying');
    const before = (await E.Tournament.get(draw.id)).bracket_history;
    const { run, tournament } = await playQualifying(rt, draw, [true, true, false], partner);
    const seat = seatOf(tournament);
    const legacyShape = s.applyQualifyingExitToCanonicalBracket(before, { qualifierTeamName: opp(qual[2]), date: run.matches[2].date }).rounds;
    ok('C1. eliminado na Q3: quem venceu a última rodada recebe a vaga (classificação legítima), sem caminho extra', seat.team_a === opp(qual[2]) && !seat.qualifying_path);
    ok('C2. idêntico ao comportamento da CLOUD-7D1 nesse caso (nenhum resultado muda)', sha(tournament.bracket_history) === sha(legacyShape));
    ok('C3. progresso preservado: Q1 e Q2 vencidas pelo jogador continuam registradas', run.matches.slice(0, 2).every((m) => m.status === 'completed' && m.result.won));
    const rows = await resultRowsFor(draw.id);
    ok('C4. nenhum adversário do qualifying pontua', rows.every((r) => !qualifyingMemberIds(run).has(r.athlete_id)));
  }

  // ═══ D. Vence a Q1 e perde a Q2 ═══
  {
    const draw = await drawQualifying(rt, 'l7f-d', { partner });
    const qual = (await getRun(draw.eventId)).matches.filter((m) => m.stage === 'qualifying');
    const { run, tournament } = await playQualifying(rt, draw, [true, false], partner);
    const seat = seatOf(tournament);
    ok('D1. a dupla da Q2 disputa a Q3 (uma partida restante) e só então a vaga é ocupada', seat.qualifying_path?.length === 1
      && seat.qualifying_path[0].team_a === opp(qual[1]) && seat.qualifying_path[0].team_b === opp(qual[2]) && seat.team_a === seat.qualifying_path[0].winner);
    ok('D2. a Q1 vencida segue registrada e não é simulada de novo', run.matches[0].result.won === true && !seat.qualifying_path.some((m) => m.team_a === opp(qual[0]) || m.team_b === opp(qual[0])));
  }

  // ═══ E. Vence todo o qualifying e entra na chave principal ═══
  {
    const draw = await drawQualifying(rt, 'l7f-e', { partner });
    const initial = await getRun(draw.eventId);
    const { run, tournament } = await playQualifying(rt, draw, [true, true, true], partner);
    const current = runs.getCurrentTournamentMatch(run);
    ok('E1. classificado: campanha continua na rodada 0 da chave principal e a vaga segue reservada ao jogador',
      run.status === 'between_rounds' && current.stage === 'main' && current.stageRoundIndex === 0 && !seatOf(tournament).winner && !seatOf(tournament).qualifying_path);
    const main = await playQualifying(rt, draw, [false], partner);
    const rows = await resultRowsFor(draw.id);
    const mainOpponentIds = new Set((initial.matches.find((m) => m.stage === 'main').opponent || []).map((o) => o.id));
    ok('E2. eliminado na 1ª rodada principal: crédito vai para o adversário da CHAVE PRINCIPAL, nunca para os do qualifying',
      rows.some((r) => mainOpponentIds.has(r.athlete_id)) && rows.every((r) => !qualifyingMemberIds(main.run).has(r.athlete_id)), JSON.stringify(rows.map((r) => r.athlete_id)));
    const seat = seatOf(main.tournament);
    ok('E3. a vaga do jogador é disputada pelo próprio jogador (não por um classificado simulado)', seat.team_a?.startsWith('Local 7F') && !seat.qualifying_path);
  }

  // ═══ F. Abandono no qualifying (caminho do TournamentModal: withdrawTournamentRun) ═══
  {
    const draw = await drawQualifying(rt, 'l7f-f', { partner });
    let run = await getRun(draw.eventId);
    const qual = run.matches.filter((m) => m.stage === 'qualifying');
    run = runs.recordTournamentMatchResult(run, { matchId: qual[0].id, won: true, score: '6-3 6-4' }).run;
    const abandoned = runs.getCurrentTournamentMatch(run);
    const withdrawn = runs.withdrawTournamentRun(run, 'Abandono').run;
    const tournament = await E.Tournament.get(draw.id);
    const bracket = s.applyQualifyingExitToCanonicalBracket(tournament.bracket_history, {
      qualifierTeamName: opp(abandoned), remainingOpponents: s.remainingQualifyingOpponentNames(withdrawn, abandoned), date: abandoned.date,
    }).rounds;
    const seat = bracket[0].matches.find((m) => m.player_match);
    ok('F1. abandono na Q2: a dupla adversária avança e disputa a Q3 antes de ocupar a vaga', seat.qualifying_path?.length === 1 && seat.qualifying_path[0].team_a === opp(qual[1]) && seat.qualifying_path[0].team_b === opp(qual[2]));
    ok('F2. abandono registrado como W.O. do jogador, sem resultado inventado', withdrawn.matches[1].status === 'cancelled' && withdrawn.matches[1].result.withdrawn === true && withdrawn.status === 'eliminated');
    // Persistência como no TournamentModal (abandono): chave + run + finalização.
    await E.Tournament.update(draw.id, { bracket_history: bracket });
    const event = await E.CalendarEvent.get(draw.eventId);
    await E.CalendarEvent.update(draw.eventId, { status: 'completed', requires_decision: false, metadata: { ...event.metadata, tournament_run: withdrawn, withdrawal_reason: 'Abandono' } });
    await quiet(finalizeTournamentRun)({
      profile: await E.PlayerProfile.get(rt.profileId), tournament: await E.Tournament.get(draw.id), partner, roundsWon: runs.countMainDrawWins(withdrawn),
      totalRounds: getTournamentRounds(tournament).length, runId: `${draw.id}:${withdrawn.createdAt}`, bracketHistory: bracket, run: withdrawn,
    });
    ok('F3. abandono: nenhum adversário do qualifying pontua', (await resultRowsFor(draw.id)).every((r) => !qualifyingMemberIds(withdrawn).has(r.athlete_id)));
  }

  // ═══ G + H. W.O. automático (resolveUnavailablePlayerMatch real) após save/load no meio do qualifying ═══
  {
    const draw = await drawQualifying(rt, 'l7f-g', { partner });
    await playQualifying(rt, draw, [true], partner);
    const beforeReload = await getRun(draw.eventId);
    await rt.reload();
    const afterReload = await getRun(draw.eventId);
    ok('H1. save/load no meio do qualifying: run e chave idênticos, Q1 vencida preservada', sha(afterReload) === sha(beforeReload) && afterReload.matches[0].result.won === true);
    await quiet(resolveUnavailablePlayerMatch)({ profile: await E.PlayerProfile.get(rt.profileId), tournament: await E.Tournament.get(draw.id), calendarEvent: await E.CalendarEvent.get(draw.eventId), reason: 'Lesão' });
    const tournament = await E.Tournament.get(draw.id);
    const seat = seatOf(tournament);
    const qual = afterReload.matches.filter((m) => m.stage === 'qualifying');
    ok('G1. W.O. automático na Q2: a dupla da Q2 ainda disputa a Q3; o torneio segue sem ação do jogador',
      seat.qualifying_path?.length === 1 && seat.qualifying_path[0].team_a === opp(qual[1]) && seat.status === 'completed');
    const rowsBefore = (await resultRowsFor(draw.id)).length;
    const again = s.applyQualifyingExitToCanonicalBracket(tournament.bracket_history, { qualifierTeamName: opp(qual[1]), remainingOpponents: [opp(qual[2])] });
    await quiet(resolveUnavailablePlayerMatch)({ profile: await E.PlayerProfile.get(rt.profileId), tournament, calendarEvent: await E.CalendarEvent.get(draw.eventId), reason: 'Lesão' }).catch(() => null);
    ok('H2. idempotência: nova aplicação não re-simula nem duplica resultados', again.idempotent === true && sha((await E.Tournament.get(draw.id)).bracket_history) === sha(tournament.bracket_history)
      && (await resultRowsFor(draw.id)).length === rowsBefore);
  }

  // ═══ I. Avanço acelerado: torneios do jogador terminam até a final sem nenhuma tela aberta ═══
  {
    const profile = await rt.advance(12);
    const playerTournaments = (await E.Tournament.filter({})).filter((t) => String(t.id).startsWith('l7f-'));
    const finished = playerTournaments.filter((t) => t.status === 'finalizado' && t.champion);
    ok('I1. todos os torneios do jogador (B–H) chegam à final com campeão e vice após avançar o calendário',
      finished.length === playerTournaments.length && finished.every((t) => t.runner_up && t.champion !== t.runner_up),
      `${finished.length}/${playerTournaments.length} em ${profile.career_date}; pendentes: ${playerTournaments.filter((t) => !finished.includes(t)).map((t) => `${t.id}:${t.status}`).join(',')}`);
    const facts = finished.map((t) => s.deriveTournamentFactsFromFullBracket(t.bracket_history));
    ok('I2. campeão = vencedor real da final; colocações coerentes (uma por equipe, sem repetição)',
      finished.every((t, i) => facts[i].champion === t.champion && new Set(facts[i].placements.map((p) => p.team)).size === facts[i].placements.length));
    const results = await E.AthleteRankingResult.filter({});
    ok('I3. sem duplicação: no máximo um resultado por atleta e torneio', results.length === new Set(results.map((r) => `${r.athlete_id}|${r.tournament_id || r.id}`)).size);
    const before = sha(finished.map((t) => [t.id, t.bracket_history, t.champion]));
    await rt.advance(2);
    ok('I4. torneios concluídos não são reprocessados', sha((await E.Tournament.filter({})).filter((t) => finished.some((f) => f.id === t.id)).map((t) => [t.id, t.bracket_history, t.champion])) === before);
  }

  // ═══ A. Jogador não inscrito: o mundo segue (qualifying abstrato do AI-only + chave principal) ═══
  {
    await rt.advance(35);
    const tournaments = await E.Tournament.filter({});
    const date = (await E.PlayerProfile.get(rt.profileId)).career_date;
    const due = tournaments.filter((t) => t.world_tour_event !== false && !String(t.id).startsWith('l7f-') && t.status !== 'cancelado' && t.end_date && new Date(date) - new Date(t.end_date) > 14 * 86400000);
    const withQualifying = due.filter((t) => Number(t.qualifying_size) > 0);
    ok('A1. sem o jogador, todo torneio vencido (inclusive os com qualifying) termina com campeão', withQualifying.length > 0 && due.every((t) => t.status === 'finalizado' && t.champion), `${due.length} vencidos, ${withQualifying.length} com qualifying`);
    ok('A2. nenhuma vaga extra: duplas na chave ≤ tamanho da chave principal e uma colocação por dupla sorteada',
      due.filter((t) => t.world_tour_resolved).every((t) => (t.draw_pair_ids || []).length <= Number(t.main_draw_size || 32) && (t.placements || []).length === (t.draw_pair_ids || []).length));
  }

  // ═══ J. Homônimas (LOCAL-7E) no qualifying do jogador ═══
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
    const draw = await drawQualifying(rt, 'l7f-j', { partner });
    const { run, tournament } = await playQualifying(rt, draw, [false], partner);
    const seat = seatOf(tournament);
    const round0Names = tournament.bracket_history[0].matches.flatMap((m) => [m.team_a, m.team_b]).filter(Boolean);
    const pathNames = [seat.qualifying_path?.[0]?.team_a, ...(seat.qualifying_path || []).map((m) => m.team_b)];
    ok('J1. homônimas no mundo: caminho do qualifying e chave do jogador sem nomes repetidos (identidade inequívoca)',
      new Set(round0Names).size === round0Names.length && new Set(pathNames).size === pathNames.length && run.matches.filter((m) => m.stage === 'qualifying').length === 3);
    ok('J2. o classificado ocupa exatamente uma vaga da chave', round0Names.filter((name) => name === seat.team_a).length === 1);
  }

  // ═══ Determinismo: mesma entrada, mesmo caminho e mesma chave ═══
  {
    const bracket = s.buildPlayerTournamentBracket({
      tournamentId: 'l7f-det', date: '2030-03-01', roundDates: ['2030-03-05', '2030-03-06', '2030-03-07'], playerTeamName: 'Jogador & Parceiro',
      mainOpponents: [{ name: 'M0 A & M0 B' }, { name: 'M1 A & M1 B' }, { name: 'M2 A & M2 B' }],
      fillerFactory: (count, k) => Array.from({ length: count }, (_, j) => ({ name: `F${k}-${j} X & F${k}-${j} Y` })),
    });
    const args = { qualifierTeamName: 'Q1 A & Q1 B', remainingOpponents: ['Q2 A & Q2 B', 'Q3 A & Q3 B'], date: '2030-03-04' };
    const first = s.applyQualifyingExitToCanonicalBracket(bracket, args);
    const second = s.applyQualifyingExitToCanonicalBracket(bracket, args);
    ok('K1. determinismo: o mesmo caminho e a mesma chave para a mesma entrada', sha(first.rounds) === sha(second.rounds) && !first.idempotent);
    ok('K2. entrada imutável e chave fechada até a final', sha(bracket) === sha(s.buildPlayerTournamentBracket({
      tournamentId: 'l7f-det', date: '2030-03-01', roundDates: ['2030-03-05', '2030-03-06', '2030-03-07'], playerTeamName: 'Jogador & Parceiro',
      mainOpponents: [{ name: 'M0 A & M0 B' }, { name: 'M1 A & M1 B' }, { name: 'M2 A & M2 B' }],
      fillerFactory: (count, k) => Array.from({ length: count }, (_, j) => ({ name: `F${k}-${j} X & F${k}-${j} Y` })),
    })) && Boolean(s.deriveTournamentFactsFromFullBracket(first.rounds)?.champion));
    const partial = s.applyQualifyingExitToCanonicalBracket(bracket, { qualifierTeamName: 'Q1 A & Q1 B', remainingOpponents: ['Q2 A & Q2 B', null], date: '2030-03-04' });
    ok('K3. run antigo com adversário ausente: caminho jogado só até o último conhecido, sem dupla inventada', partial.rounds[0].matches[0].qualifying_path.length === 1);
  }

  // ═══ Save antigo (CLOUD-7C, anterior à CLOUD-7D1): torneios travados após saída no qualifying ═══
  {
    const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE_FILE)).toString('utf8');
    const old = await boot('local-7f-fixture', { loadText: fixtureText });
    const events = (await E.CalendarEvent.filter({ profile_id: old.profileId, event_type: 'tournament' })) || [];
    const runByTournament = new Map(events.filter((e) => e.metadata?.tournament_run).map((e) => [e.related_id, e.metadata.tournament_run]));
    const before = await E.Tournament.filter({});
    const stuck = before.filter((t) => {
      const run = runByTournament.get(t.id);
      const exit = run?.matches?.find((m) => (m.status === 'completed' && m.result && !m.result.won) || m.status === 'cancelled');
      return run && exit?.stage === 'qualifying' && !t.champion && Array.isArray(t.bracket_history) && seatOf(t) && !seatOf(t).winner;
    });
    const finishedBefore = sha(before.filter((t) => t.status === 'finalizado').map((t) => [t.id, t.champion, t.bracket_history]));
    await old.advance(1);
    const after = await E.Tournament.filter({});
    const repaired = after.filter((t) => stuck.some((x) => x.id === t.id));
    const expected = (t) => {
      const run = runByTournament.get(t.id);
      const exit = run.matches.find((m) => (m.status === 'completed' && m.result && !m.result.won) || m.status === 'cancelled');
      return s.applyQualifyingExitToCanonicalBracket(stuck.find((x) => x.id === t.id).bracket_history, {
        qualifierTeamName: opp(exit), remainingOpponents: s.remainingQualifyingOpponentNames(run, exit), date: exit.date,
      }).rounds[0].matches.find((m) => m.player_match);
    };
    ok('O1. save antigo: os torneios travados fecham com campeão no tick diário', stuck.length >= 6 && repaired.every((t) => t.status === 'finalizado' && t.champion), `${stuck.length}`);
    ok('O2. save antigo: a vaga é ocupada por quem venceu o caminho restante do qualifying (não pelo algoz direto)',
      repaired.every((t) => sha(seatOf(t)) === sha(expected(t))) && repaired.some((t) => seatOf(t).qualifying_path?.length));
    ok('O3. save antigo: torneios já concluídos não mudam', sha(after.filter((t) => before.some((b) => b.id === t.id && b.status === 'finalizado')).map((t) => [t.id, t.champion, t.bracket_history])) === finishedBefore);
    const completedSeat = { ...stuck[0], bracket_history: after.find((t) => t.id === stuck[0].id).bracket_history };
    ok('O4. save posterior à CLOUD-7D1 (vaga já ocupada pelo algoz direto): nada é refeito', s.applyQualifyingExitToCanonicalBracket(completedSeat.bracket_history, { qualifierTeamName: 'X & Y', remainingOpponents: ['Z & W'] }).idempotent === true);
  }
  console.log(`\nLOCAL-7F: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
