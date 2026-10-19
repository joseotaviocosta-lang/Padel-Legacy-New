// LOCAL-7H — ledger de partidas (V/D/títulos) das duplas de IA, com e sem o jogador.
//   Defeito: num torneio com o jogador, nenhuma dupla de IA da chave principal ganhava registro no ledger da parceria
//   (TeamRanking.wins/losses/ledger_titles/ledger_events) — só o settlement AI-only escrevia o ledger. Correção: no
//   settlement canônico, cada partida REAL da chave dá V ao vencedor e D ao perdedor (BYE não há; W.O./abandono do
//   jogador não é partida disputada; qualifying não entra), pelo mesmo writer do AI-only, uma única vez.
//   Cenários A–L com o pipeline real + save antigo da CLOUD-7C.
// Uso: node scripts/test-local-7h-pair-match-ledger.mjs
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


  // Registro REAL de cada equipe na chave: partidas disputadas (dois lados e vencedor), sem a partida do jogador
  // sem placar (W.O./abandono). Mesma política do writer.
  const realRecord = (rounds, { countWalkover = false } = {}) => {
    const rec = new Map();
    const add = (name, field) => { const r = rec.get(name) || { w: 0, l: 0 }; r[field] += 1; rec.set(name, r); };
    for (const round of rounds) {
      for (const m of round.matches) {
        if (!m.team_a || !m.team_b || !m.winner) continue;
        if (!countWalkover && m.player_match && !m.score) continue;
        add(m.winner, 'w');
        add(m.winner === m.team_a ? m.team_b : m.team_a, 'l');
      }
    }
    return rec;
  };
  const key = (ids) => [...ids].sort().join('_');
  const ledgerSnapshot = async () => new Map((await E.TeamRanking.filter({})).map((r) => [key([r.player1_id, r.player2_id]), {
    w: Number(r.wins) || 0, l: Number(r.losses) || 0, t: Number(r.ledger_titles) || 0, ev: Number(r.ledger_events) || 0, mp: Number(r.matches_played) || 0, src: r.stats_source, id: r.id,
  }]));
  const delta = (before, after, k) => {
    const b = before.get(k); const a = after.get(k);
    if (!a) return null;
    const base = b?.src === 'ledger' ? b : { w: 0, l: 0, t: 0, ev: 0 };
    return { w: a.w - base.w, l: a.l - base.l, t: a.t - base.t, ev: a.ev - base.ev, mp: a.mp, sum: a.w + a.l, src: a.src };
  };
  // Confere o ledger de toda dupla real da chave principal de um torneio do jogador contra as partidas reais.
  // `sinceResults`: ids de resultados existentes no início da janela — duplas cujos membros pontuaram em OUTRO torneio
  // na janela (o ledger delas soma os dois) ficam fora da conferência deste torneio.
  async function auditLedger(id, before, after, sinceResults = null) {
    const t = await E.Tournament.get(id);
    const rec = realRecord(t.bracket_history);
    const issues = [];
    let pairs = 0;
    const windowRows = sinceResults ? (await E.AthleteRankingResult.filter({})).filter((r) => !sinceResults.has(r.id) && r.tournament_id && r.tournament_id !== id) : [];
    const busy = new Set(windowRows.map((r) => r.athlete_id));
    for (const entry of t.draw_ranking_snapshot || []) {
      if (!rec.has(entry.name)) continue; // ficou no qualifying
      if ((entry.member_ids || []).some((m) => busy.has(m))) continue; // jogou outro torneio na janela
      pairs += 1;
      const d = delta(before, after, key(entry.member_ids || []));
      if (!d) { issues.push(`${entry.name}: sem linha`); continue; }
      const real = rec.get(entry.name);
      const title = entry.name === t.champion ? 1 : 0;
      if (d.src !== 'ledger' || d.w !== real.w || d.l !== real.l || d.t !== title || d.ev !== 1 || d.mp !== d.sum) issues.push(`${entry.name}: ledger ${d.w}V/${d.l}D t${d.t} ev${d.ev} != real ${real.w}V/${real.l}D t${title}`);
    }
    return { t, rec, issues, pairs };
  }

  const rt = await boot('local-7h');
  await rt.advance(8);
  const partner = (await E.AthleteProfile.list('-world_ranking_points', 5000)).find((a) => a.career_status !== 'aposentado');
  await E.PlayerProfile.update(rt.profileId, { partner_id: partner.id });
  const before = await ledgerSnapshot();
  const resultsBefore = new Set((await E.AthleteRankingResult.filter({})).map((r) => r.id));
  const athletesBefore = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, { w: Number(a.career_wins || 0), l: Number(a.career_losses || 0) }]));

  // B/F (campeão), C (cai na R1), D (cai na semifinal), E (cai no qualifying), G (W.O. na 2ª rodada principal).
  const plan = [
    ['B', 'l7h-b', 'Platinum', false, [true, true, true, true, true]],
    ['C', 'l7h-c', 'Platinum', false, [false]],
    ['D', 'l7h-d', 'Platinum', false, [true, true, true, false]],
    ['E', 'l7h-e', 'Gold', true, [false]],
  ];
  const draws = {};
  for (const [k, id, tier, qualifying, results] of plan) {
    draws[k] = await drawQualifying(rt, id, { tier, partner, qualifying });
    await playQualifying(rt, draws[k], results, partner);
  }
  draws.G = await drawQualifying(rt, 'l7h-g', { tier: 'Platinum', partner, qualifying: false });
  await playQualifying(rt, draws.G, [true], partner);
  await quiet(resolveUnavailablePlayerMatch)({ profile: await E.PlayerProfile.get(rt.profileId), tournament: await E.Tournament.get('l7h-g'), calendarEvent: await E.CalendarEvent.get(draws.G.eventId), reason: 'Lesão' });

  // I (aposentadoria após o sorteio, torneio com jogador): um membro de uma dupla da chave do D se aposenta antes do settlement.
  const tD = await E.Tournament.get('l7h-d');
  const retiredEntry = (tD.draw_ranking_snapshot || []).find((e) => e.name !== tD.champion && (e.member_ids || []).length === 2);
  await E.AthleteProfile.update(retiredEntry.member_ids[0], { retired: true, career_status: 'aposentado', market_status: 'aposentado', ai_partner_id: null });

  // J: save/load com o jogador eliminado e a final ainda por chegar.
  const midLedger = await ledgerSnapshot();
  await rt.reload();
  ok('J1. save/load antes do settlement: nenhum registro antecipado nem perdido', sha([...(await ledgerSnapshot()).entries()].sort()) === sha([...midLedger.entries()].sort()));
  await rt.advance(16);
  const after = await ledgerSnapshot();

  const label = { B: 'jogador campeão', C: 'jogador eliminado na 1ª rodada', D: 'jogador eliminado na semifinal', E: 'jogador eliminado no qualifying', G: 'W.O. do jogador na 2ª rodada' };
  const audits = {};
  for (const k of ['B', 'C', 'D', 'E', 'G']) {
    audits[k] = await auditLedger(draws[k].id, before, after, resultsBefore);
    ok(`${k}1. ${label[k]}: toda dupla de IA da chave principal registra exatamente suas partidas reais (V/D/título, 1 evento)`,
      audits[k].t.status === 'finalizado' && audits[k].pairs >= 20 && audits[k].issues.length === 0, `${audits[k].pairs} duplas; ${audits[k].issues.slice(0, 3).join(' | ')}`);
  }
  // F: adversários enfrentados pelo jogador campeão — uma derrota cada (a partida contra ele), nunca em dobro.
  const runB = await getRun(draws.B.eventId);
  const beaten = runB.matches.filter((m) => m.stage === 'main').map((m) => m.opponent.map((o) => o.id));
  ok('F1. jogador campeão: cada adversário que ele venceu tem exatamente 1 derrota neste torneio (sem duplicação)',
    beaten.length === 5 && beaten.every((ids) => delta(before, after, key(ids))?.l === 1));
  const playerRow = after.get(key([rt.profileId, partner.id]));
  ok('F2. a dupla do jogador não é tratada como dupla de IA (sem marca de ledger; registrada pela própria finalização)', playerRow && playerRow.src !== 'ledger');
  // E: duplas eliminadas no qualifying não ganham registro; o classificado registra só a chave principal.
  const tE = audits.E.t;
  const qualifyingOnly = (tE.draw_ranking_snapshot || []).filter((e) => !audits.E.rec.has(e.name));
  ok('E2. qualifying não entra no ledger: duplas que ficaram no qualifying sem registro deste torneio', qualifyingOnly.length >= 1
    && qualifyingOnly.every((e) => { const d = delta(before, after, key(e.member_ids)); return !d || d.ev === 0; }));
  const seat = tE.bracket_history[0].matches.find((m) => m.player_match);
  const seatEntry = tE.draw_ranking_snapshot.find((e) => e.name === seat.team_a);
  ok('E3. o classificado pelo caminho do qualifying registra só as partidas da chave principal', seatEntry
    && delta(before, after, key(seatEntry.member_ids)).w === audits.E.rec.get(seat.team_a).w && delta(before, after, key(seatEntry.member_ids)).l === audits.E.rec.get(seat.team_a).l);
  // G: W.O. — o adversário avança sem vitória registrada pela partida não disputada.
  const tG = audits.G.t;
  const woMatch = tG.bracket_history[1].matches.find((m) => m.player_match);
  const woEntry = tG.draw_ranking_snapshot.find((e) => e.name === woMatch.winner);
  const withWo = realRecord(tG.bracket_history, { countWalkover: true }).get(woMatch.winner);
  ok('G2. W.O.: a partida não disputada não vira vitória do adversário (V = partidas que ele de fato jogou e venceu)',
    !woMatch.score && woEntry && delta(before, after, key(woEntry.member_ids)).w === withWo.w - 1);
  // I: dupla com membro aposentado após o sorteio mantém o registro das partidas que disputou.
  const dRetired = delta(before, after, key(retiredEntry.member_ids));
  ok('I1. aposentadoria após o sorteio: a dupla mantém o registro legítimo das partidas disputadas', dRetired && dRetired.ev === 1
    && dRetired.w === audits.D.rec.get(retiredEntry.name).w && dRetired.l === audits.D.rec.get(retiredEntry.name).l);

  // Integridade: ledger não mexe em pontos, Race, campeão/vice; individual coerente; aproveitamento derivado.
  const newResults = (await E.AthleteRankingResult.filter({})).filter((r) => !resultsBefore.has(r.id) && String(r.tournament_id).startsWith('l7h-'));
  ok('R1. ranking/Race intactos: um resultado por atleta e torneio (o ledger não cria resultados)', newResults.length === new Set(newResults.map((r) => `${r.athlete_id}|${r.tournament_id}`)).size && newResults.length > 200);
  ok('R2. campeão e vice gravados = finalistas da chave', Object.values(audits).every((a) => { const f = s.deriveTournamentFactsFromFullBracket(a.t.bracket_history); return a.t.champion === f.champion && a.t.runner_up === f.runner_up; }));
  const ledgerRows = [...after.values()].filter((r) => r.src === 'ledger');
  ok('R3. coerência do ledger: partidas = V + D em toda linha; aproveitamento calculável (0–100%)', ledgerRows.length > 100 && ledgerRows.every((r) => r.mp === r.w + r.l && (r.mp === 0 || (r.w / r.mp >= 0 && r.w / r.mp <= 1))));
  const athletesNow = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
  // Individual: só atletas que jogaram APENAS o torneio C entre os torneios do jogador e nenhum do mundo neste intervalo.
  const allNewRows = (await E.AthleteRankingResult.filter({})).filter((r) => !resultsBefore.has(r.id) && r.tournament_id);
  const onlyC = audits.C.t.draw_ranking_snapshot.filter((e) => audits.C.rec.has(e.name)).flatMap((e) => e.member_ids.map((id) => [id, e.name]))
    .filter(([id]) => athletesNow.get(id) && !athletesNow.get(id).retired && allNewRows.filter((r) => r.athlete_id === id).every((r) => r.tournament_id === 'l7h-c'));
  const indivIssues = onlyC.filter(([id, name]) => {
    const a = athletesNow.get(id); const b = athletesBefore.get(id); const real = audits.C.rec.get(name);
    return Number(a.career_wins || 0) - b.w !== real.w || Number(a.career_losses || 0) - b.l !== real.l;
  });
  ok('R4. individual: career_wins/losses de cada atleta crescem exatamente pelas partidas reais do torneio (sem W.O. no C)',
    onlyC.length >= 20 && indivIssues.length === 0, `${onlyC.length} atletas; ${indivIssues.length} divergências`);

  // K: settlement repetido, reload e novos dias não duplicam nada.
  {
    const digest = sha([...(await ledgerSnapshot()).entries()].filter(([, v]) => v.src === 'ledger').sort());
    const ledgerPlayerTournaments = sha([...after.entries()].sort());
    const date = (await E.PlayerProfile.get(rt.profileId)).career_date;
    const again = await quiet(resolvePending)(date, await E.PlayerProfile.get(rt.profileId));
    await rt.reload();
    const reloaded = sha([...(await ledgerSnapshot()).entries()].filter(([, v]) => v.src === 'ledger').sort());
    ok('K1. settlement repetido e reload não duplicam vitórias/derrotas', again.resolved === 0 && reloaded === digest && ledgerPlayerTournaments === sha([...after.entries()].sort()));
    ok('J2. save/load depois do settlement: ledger persistido', reloaded === digest);
  }

  // A: torneios só de IA — mesmo writer; regra existente: V = rodadas avançadas (BYE conta como rodada avançada).
  {
    await rt.advance(12);
    const ledger = await ledgerSnapshot();
    const parts = new Map((await E.Partnership.filter({})).map((p) => [p.id, p]));
    const ai = (await E.Tournament.filter({})).filter((t) => t.world_tour_resolved && t.status === 'finalizado' && !String(t.id).startsWith('l7h-'));
    let checked = 0;
    const issues = [];
    let profilePairsSkipped = 0;
    for (const t of ai) {
      const rec = realRecord(t.bracket_history);
      const byes = new Set(t.bracket_history[0].byes || []);
      for (const e of t.draw_ranking_snapshot || []) {
        // LOCAL-7H.1 — `profile-pair` incluídas (a inversão de nome no settlement foi corrigida).
        const memberIds = String(e.pair_id).startsWith('profile-pair:') ? String(e.pair_id).slice('profile-pair:'.length).split(':') : [parts.get(e.pair_id)?.athlete_a_id, parts.get(e.pair_id)?.athlete_b_id];
        if (String(e.pair_id).startsWith('profile-pair:')) profilePairsSkipped += 1;
        const row = memberIds.every(Boolean) && ledger.get(key(memberIds));
        if (!row || row.src !== 'ledger' || row.ev !== 1) continue;
        checked += 1;
        const real = rec.get(e.name) || { w: 0, l: 0 };
        if (row.w !== real.w + (byes.has(e.name) ? 1 : 0) || row.l !== real.l) issues.push(`${t.id} ${e.name}: ${row.w}V/${row.l}D real ${real.w}V/${real.l}D bye=${byes.has(e.name)}`);
      }
    }
    ok('A1. só IA: ledger = partidas reais + BYE como rodada avançada (regra existente), por ids dos membros (inclui profile-pair)', ai.length >= 3 && checked >= 15 && issues.length === 0,
      `${ai.length} torneios, ${checked} duplas (${profilePairsSkipped} profile-pair incluídas); ${issues.slice(0, 3).join(' | ')}`);
  }

  // H: homônimas — ledger por ids (LOCAL-7E): duplas renomeadas com nomes iguais mantêm registros independentes.
  {
    const athletes = await E.AthleteProfile.filter({});
    const byId = new Map(athletes.map((a) => [a.id, a]));
    const updates = [];
    const seen = new Set();
    let count = 0;
    for (const a of athletes) {
      const b = byId.get(a.ai_partner_id);
      if (!b || b.ai_partner_id !== a.id || seen.has(a.id) || seen.has(b.id) || realBotIds.has(a.bot_id) || realBotIds.has(b.bot_id) || a.id === partner.id || b.id === partner.id || a.retired || b.retired) continue;
      seen.add(a.id); seen.add(b.id);
      if (count % 2 === 0) updates.push({ id: a.id, name: 'Hugo López', sport_name: 'Hugo López' }, { id: b.id, name: 'Rafael López', sport_name: 'Rafael López' });
      count += 1;
    }
    await E.AthleteProfile.bulkUpdate(updates);
    const renamed = new Set(updates.map((u) => u.id));
    const hBefore = await ledgerSnapshot();
    const hResultsBefore = new Set((await E.AthleteRankingResult.filter({})).map((r) => r.id));
    const draw = await drawQualifying(rt, 'l7h-h', { tier: 'Platinum', partner, qualifying: false });
    await playQualifying(rt, draw, [false], partner);
    await rt.advance(10);
    const hAfter = await ledgerSnapshot();
    const a = await auditLedger('l7h-h', hBefore, hAfter, hResultsBefore);
    ok('H1. homônimas: cada dupla registra as SUAS partidas, pelos ids dos membros', a.t.status === 'finalizado' && a.pairs >= 10 && a.issues.length === 0
      && (a.t.draw_ranking_snapshot || []).some((e) => (e.member_ids || []).every((id) => renamed.has(id))), a.issues.slice(0, 3).join(' | '));
  }

  // L: mudança de parceiro — o histórico da parceria anterior fica na linha dela; a dupla nova começa sem histórico.
  {
    const tC = audits.C.t;
    const entries = tC.draw_ranking_snapshot.filter((e) => audits.C.rec.has(e.name) && e.name !== tC.champion);
    const [first, second] = entries.slice(0, 2).map((e) => e.member_ids);
    const oldRow = (await ledgerSnapshot()).get(key(first));
    // A1 de `first` forma dupla com A1 de `second` (ambas as parcerias antigas se desfazem).
    await E.AthleteProfile.update(first[0], { ai_partner_id: second[0] });
    await E.AthleteProfile.update(second[0], { ai_partner_id: first[0] });
    await E.AthleteProfile.update(first[1], { ai_partner_id: null });
    await E.AthleteProfile.update(second[1], { ai_partner_id: null });
    await rt.advance(7);
    const ledger = await ledgerSnapshot();
    const newRow = ledger.get(key([first[0], second[0]]));
    ok('L1. mudança de parceiro: a linha da parceria anterior mantém o histórico dela; a dupla nova não herda V/D',
      ledger.get(key(first))?.w === oldRow.w && ledger.get(key(first))?.l === oldRow.l && (!newRow || newRow.src !== 'ledger' || (newRow.w + newRow.l) <= 6), JSON.stringify({ old: oldRow, nova: newRow }));
  }

  // Determinismo: o ledger é função das partidas da chave (auditoria repetida idêntica).
  ok('K2. determinismo: registro esperado recalculado da chave = registro gravado', (await auditLedger(draws.C.id, before, after, resultsBefore)).issues.length === 0);

  // Save antigo (CLOUD-7C): torneios do jogador pendentes registram o ledger uma vez; concluídos não mudam.
  {
    const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE_FILE)).toString('utf8');
    const old = await boot('local-7h-fixture', { loadText: fixtureText });
    const pending = (await E.Tournament.filter({})).filter((t) => !t.world_tour_resolved && Number(t.bracket_schema_version) >= 2 && t.bracket_history?.some((r) => r.matches.some((m) => m.player_match)));
    const ledger0 = await ledgerSnapshot();
    await old.advance(1);
    const ledger1 = await ledgerSnapshot();
    const settled = (await E.Tournament.filter({})).filter((t) => pending.some((p) => p.id === t.id) && t.world_tour_resolved);
    // Cada dupla ganha no máximo 1 evento por torneio liquidado neste tick (sem duplicação).
    const perPairEvents = new Map();
    for (const t of settled) for (const e of t.draw_ranking_snapshot || []) { if (!realRecord(t.bracket_history).has(e.name)) continue; const k = key(e.member_ids || []); perPairEvents.set(k, (perPairEvents.get(k) || 0) + 1); }
    const overflow = [...ledger1.entries()].filter(([k, v]) => v.src === 'ledger' && (v.ev - ((ledger0.get(k)?.src === 'ledger') ? ledger0.get(k).ev : 0)) > (perPairEvents.get(k) || 0) + 1);
    ok('O1. save antigo: torneios pendentes liquidam e registram o ledger, sem duplicar eventos', settled.length >= 6 && overflow.length === 0, `${settled.length} liquidados; ${overflow.length} excedentes`);
  }
  console.log(`\nLOCAL-7H: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
