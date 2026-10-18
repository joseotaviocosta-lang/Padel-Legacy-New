// CLOUD-7C — carreira longa DETERMINÍSTICA com jogador ATIVO, pelo pipeline real de produção.
//
// Base: harness de pace da Fase 13.1 (scripts/test-career-pace-production.mjs): CareerManager/GameStorage reais, botão
// "Avançar" real (advanceCareerDayOnce, transação única), inscrição real (registerTournament), partida de torneio com o
// motor real (createMatch/playPoint) e as mesmas funções puras de TournamentModal (createTournamentRun,
// recordTournamentMatchResult, prepareTournamentFinalization), partida de treino real (finalizePracticeMatch), treino
// real (executeTraining), troca de parceiro com as APIs reais (releasePartner/formPartnerContract).
// SIMPLIFICAÇÕES DOCUMENTADAS (adaptador de teste; nenhum código de produção alterado): sem UI/checkpoint de partida;
// o resultado da partida do jogador não passa por applyPlayerMatchToCanonicalBracket/buildTournamentRoundCoreOperations
// (a chave canônica do mundo é resolvida pelo próprio motor nos dias seguintes); nenhum estado é alterado à mão.
//
// Uso: node --expose-gc scripts/cloud-7c-long-career.mjs --strategy=off|incremental --seasons=10 --seed=7c
//        --out=<dir> [--reloadSeasons=1,3,5,7,10] [--dumpSeasons=1,5,10] [--hashEvery=7] [--decisionPlayChance=0.95]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const STRATEGY = args.strategy || 'off';
const SEASONS = Number(args.seasons || 1);
const SEED = String(args.seed || '7c');
const OUT = path.resolve(String(args.out || `/tmp/cloud7c-${STRATEGY}`));
const RELOAD = new Set(String(args.reloadSeasons || '').split(',').filter(Boolean).map(Number));
const DUMP = new Set(String(args.dumpSeasons || '').split(',').filter(Boolean).map(Number));
const HASH_EVERY = Number(args.hashEvery ?? 7);
const DECISION_PLAY = Number(args.decisionPlayChance ?? 0.95);
const TRAIN_CHANCE = 0.4;
const PRACTICE_CHANCE = 0.1;
const SEASON_DAYS = 365;
const START = '2026-01-05';
fs.mkdirSync(OUT, { recursive: true });
if (STRATEGY === 'incremental') globalThis.__PADEL_INCREMENTAL_COMPACTION__ = true;
if (STRATEGY === 'repeated') globalThis.__PADEL_HISTORICAL_COMPACTION__ = true;

// ── determinismo: seed, relógio e UUID controlados ──
globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let worldRng = mulberry32(hashSeed(`${SEED}-world`));
Math.random = () => worldRng();
const RealDate = Date;
let fakeNow = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(SEED) % 100000);
globalThis.Date = class DeterministicDate extends RealDate {
  constructor(...a) { if (a.length === 0) super((fakeNow += 1000)); else super(...a); }
  static now() { return (fakeNow += 1000); }
};
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
const decisionRng = mulberry32(hashSeed(`${SEED}-decisions`));
const sha = (v) => createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r1 = (n) => Number(Number(n).toFixed(1));

function memoryBackend() {
  const files = new Map();
  return {
    files,
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`)); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list(dir) { const prefix = `${String(dir).replace(/\/$/, '')}/`; return [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => ({ name: k.slice(prefix.length), isDirectory: false })); },
    async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória',
  };
}

const log = (name, obj) => fs.appendFileSync(path.join(OUT, name), `${JSON.stringify(obj)}\n`);
const quiet = async (fn) => { const w = console.warn; const d = console.debug; const e = console.error; const l = console.log; console.warn = () => {}; console.debug = () => {}; console.error = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.debug = d; console.error = e; console.log = l; } };

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
const startedAt = RealDate.now();
let progress = { strategy: STRATEGY, seed: SEED, seasonsTarget: SEASONS, seasonsDone: 0, status: 'running' };
const saveProgress = () => fs.writeFileSync(path.join(OUT, 'progress.json'), JSON.stringify({ ...progress, elapsedMs: RealDate.now() - startedAt }, null, 1));
try {
  const load = (p) => server.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { unpackCareerFromStorage } = await load('/src/careers/tournamentHistoryCodec.js');
  const inc = await load('/src/careers/incrementalHistory.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resolveDecision } = await load('/src/lib/calendarSystem.js');
  const { registerTournament, getTournamentRegistrationWindow } = await load('/src/lib/tournamentRegistration.js');
  const { finalizePracticeMatch } = await load('/src/game-core/matchLifecycle.js');
  const { createMatch, playPoint, getSetScoreString } = await load('/src/lib/matchEngine.js');
  const { applyPlayerMatchToCanonicalBracket } = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const { getRandomBots, getDifficultyForPlayer, BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const { isInjured, canPlayMatchToday, getChemistryBonus, getEnergyPenalty, getWorldRank, buildMatchRewardsPatch } = await load('/src/lib/padel.js');
  const { createTournamentRun, getCurrentTournamentMatch, recordTournamentMatchResult } = await load('/src/gameplay/worldTour/TournamentRunManager.js');
  const { prepareTournamentFinalization } = await load('/src/game-core/tournamentLifecycle.js');
  const { getTournamentRounds, generateTournamentOpponent } = await load('/src/lib/career.js');
  const { getQualifyingRoundLabels } = await load('/src/gameplay/worldTour/QualifyingManager.js');
  const { getTrainingCost } = await load('/src/lib/trainingEconomy.js');
  const { executeTraining, TRAINING_ACTIVITIES } = await load('/src/lib/trainingSystemV2.js');
  const partnerLifecycle = await load('/src/game-core/partnerLifecycle.js');

  const trainingActivity = TRAINING_ACTIVITIES.find((a) => a.id === 'court-groundstrokes');
  const allBots = Object.values(BOTS_BY_DIFFICULTY).flat();
  const initialPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  const backend = memoryBackend();
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_name: `CLOUD-7C ${STRATEGY} ${SEED}` });
  const careerId = career.career_id;
  activeCareerAdapter.setActiveCareer(career);
  const profileId = `${careerId}-player`;
  await activeCareerAdapter.createPlayerProfile({
    id: profileId, sport_name: 'Atleta 7C', career_date: START, birth_date: '2009-06-15',
    energy: 100, fatigue: 0, morale: 70, form: 55, confidence: 60, coins: 5000, xp: 0, level: 'Iniciante',
    court_side: 'direita', play_style: 'equilibrado', career_difficulty: 'normal', partner_id: initialPartner.id, career_level: 3,
    trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    serve: 32, forehand: 32, backhand: 32, volley: 30, bandeja: 30, smash: 30, defense: 30, agility: 32, strategy: 28, emotional_control: 28,
    potential: 82, partner_chemistry: 50,
  });
  let profile = await localGame.entities.PlayerProfile.get(profileId);
  const file = () => backend.files.get(`careers/${careerId}.json`);
  const partnerFor = (p) => allBots.find((b) => b.id === p.partner_id) || initialPartner;

  // ── ações do jogador (APIs reais) ──
  async function ensureTournamentRun(event, tournament, p) {
    if (event.metadata?.tournament_run) return event.metadata.tournament_run;
    const registration = ((await localGame.entities.TournamentRegistration.filter({ profile_id: p.id, tournament_id: tournament.id })) || [])[0];
    const qualifyingRequired = Boolean(event.metadata?.qualifying_required || registration?.entry_path === 'qualifying');
    const mainRounds = getTournamentRounds(tournament);
    const qualifyingRounds = qualifyingRequired ? getQualifyingRoundLabels(tournament).map((label) => ({ label, short: 'Q' })) : [];
    const stageRounds = [...qualifyingRounds.map((r, i) => ({ ...r, stage: 'qualifying', stageRoundIndex: i })), ...mainRounds.map((r, i) => ({ ...r, stage: 'main', stageRoundIndex: i }))];
    const rank = await getWorldRank(p).catch(() => ({ rank: 900 }));
    const partner = partnerFor(p);
    const usedIds = [partner.id];
    const opponents = stageRounds.map((round) => {
      let members = generateTournamentOpponent(tournament, p, round.stageRoundIndex, usedIds, rank.rank, round.stage);
      if (members.length < 2) members = generateTournamentOpponent(tournament, p, round.stageRoundIndex, [partner.id], rank.rank, round.stage);
      usedIds.push(...members.map((m) => m.id));
      return { members, rank: Math.max(1, Number(rank.rank || 240) - (round.stageRoundIndex + 1) * (round.stage === 'main' ? 8 : 3)) };
    });
    const run = createTournamentRun({ tournament, profileId: p.id, startDate: event.metadata?.original_start_date || event.start_date || tournament.start_date, qualifyingRounds, mainRounds, qualifyingRequired, opponents });
    await localGame.entities.CalendarEvent.update(event.id, { metadata: { ...event.metadata, tournament_run: run } });
    return run;
  }
  const registeredTournaments = new Set();
  const counters = { tournamentMatches: 0, practiceMatches: 0, wins: 0, losses: 0, tournamentsPlayed: 0, titles: 0, registrations: 0, registrationRefused: 0, trainings: 0, partnerChanges: 0, partnerChangeFailures: 0, decisionsPlayed: 0, decisionsSkipped: 0, blockedUnresolved: 0 };
  let matchCounter = 0;
  async function playTournamentRound(eventId, tournament, p) {
    const event = await localGame.entities.CalendarEvent.get(eventId);
    let run = await ensureTournamentRun(event, tournament, p);
    const match = getCurrentTournamentMatch(run);
    const partner = partnerFor(p);
    if (!match || match.status === 'completed') { await resolveDecision(eventId, 'play'); return p; }
    const opponents = (match.opponent || []).length >= 2 ? match.opponent : [partner, partner];
    const forMatch = { ...p, _chemistryBonus: getChemistryBonus(p.partner_chemistry || 50), _energyPenalty: getEnergyPenalty(p.energy || 100) };
    matchCounter += 1;
    let state = createMatch([forMatch, partner], opponents, { seed: `${SEED}-t-${matchCounter}` });
    let guard = 0;
    while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
    if (!state.finished) { await resolveDecision(eventId, 'skip'); return p; }
    const won = state.winner === 'A';
    counters.tournamentMatches += 1; if (won) counters.wins += 1; else counters.losses += 1;
    const score = getSetScoreString(state);
    const transition = recordTournamentMatchResult(run, { matchId: match.id, won, score, tournament, upset: won && Number(match.opponentRank || 9999) < 100 });
    run = transition.run;
    const completedMatch = run.matches.find((m) => m.id === match.id);
    // Mesmos passos do TournamentModal (sem UI/mídia/checkpoint): recompensa real da partida e aplicação do resultado na
    // chave CANÔNICA do torneio (sem isso a chave do mundo nunca fecha o confronto do jogador).
    const reward = buildMatchRewardsPatch(await localGame.entities.PlayerProfile.get(p.id), won, { skipPhysical: true, idempotencyKey: match.id, officialTournament: true });
    await localGame.entities.PlayerProfile.update(p.id, reward.updates);
    const freshTournament = await localGame.entities.Tournament.get(tournament.id);
    if (Number(freshTournament?.bracket_schema_version) >= 2 && Array.isArray(freshTournament.bracket_history) && freshTournament.bracket_history.length && completedMatch?.stage === 'main') {
      const rounds = applyPlayerMatchToCanonicalBracket(freshTournament.bracket_history, {
        roundIndex: completedMatch.stageRoundIndex,
        playerTeamName: `${p.sport_name || 'Jogador'} & ${partner.name || 'Parceiro'}`,
        opponentTeamName: Array.isArray(completedMatch.opponent) && completedMatch.opponent.length ? completedMatch.opponent.map((i) => i.name).filter(Boolean).join(' & ') : null,
        won, score: completedMatch.result?.score || null, date: completedMatch.date,
      }).rounds;
      await localGame.entities.Tournament.update(tournament.id, { bracket_history: rounds, current_phase: run.status === 'champion' ? 'concluido' : run.status });
    }
    await localGame.entities.Match.create({
      id: `${match.id}-play`, profile_id: p.id, career_date: p.career_date, date: p.career_date, tournament_id: tournament.id, tournament_name: tournament.name,
      tournament_round: match.round, competition_type: 'tournament', is_official: true, is_tournament: true, result: won ? 'vitória' : 'derrota', winner: state.winner, opponent_rank: match.opponentRank || null,
      score, status: 'completed', match_type: 'tournament', tournament_outcome: run.status === 'champion' ? 'champion' : run.status === 'eliminated' ? 'eliminated' : 'advanced',
    }).catch(() => {});
    const terminal = ['eliminated', 'champion', 'finished'].includes(run.status);
    await localGame.entities.CalendarEvent.update(eventId, { metadata: { ...event.metadata, tournament_run: run }, requires_decision: false, status: terminal ? 'completed' : 'scheduled' });
    if (!terminal) return p;
    counters.tournamentsPlayed += 1; if (run.status === 'champion') counters.titles += 1;
    const roundsWon = run.matches.filter((m) => m.stage === 'main' && m.result?.won).length;
    const totalRounds = run.matches.filter((m) => m.stage === 'main').length;
    const completion = await prepareTournamentFinalization({ profile: p, tournament, partner, roundsWon, totalRounds, runId: `${p.id}:${tournament.id}:${tournament.start_date || 'edition'}` });
    if (completion.operations?.length) await localGame.batch(completion.operations).catch(async () => {
      for (const op of completion.operations) {
        if (op.type === 'upsert') await localGame.entities[op.entityName].upsert?.(op.id, op.data).catch(() => {});
        else if (op.type === 'update') await localGame.entities[op.entityName].update(op.id, op.data).catch(() => {});
      }
    });
    return localGame.entities.PlayerProfile.update(p.id, completion.playerPatch);
  }
  async function playPractice(p) {
    const partner = partnerFor(p);
    const opponents = getRandomBots(getDifficultyForPlayer(p), 2, [partner.id]);
    const forMatch = { ...p, _chemistryBonus: getChemistryBonus(p.partner_chemistry || 50), _energyPenalty: getEnergyPenalty(p.energy || 100) };
    matchCounter += 1;
    let state = createMatch([forMatch, partner], opponents, { seed: `${SEED}-p-${matchCounter}` });
    let guard = 0;
    while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
    if (!state.finished) return;
    counters.practiceMatches += 1;
    const result = await finalizePracticeMatch({ profile: p, matchState: state, partnerName: partner.name, opponents: opponents.map((o) => o.name) });
    await result.secondary;
  }
  async function maybeRegister(p) {
    const tournaments = (await localGame.entities.Tournament.list('start_date', 2000)) || [];
    const candidate = tournaments.find((t) => {
      if (t.status === 'finalizado' || t.status === 'cancelado') return false;
      const w = getTournamentRegistrationWindow(t);
      return w.opensAt && w.closesAt && p.career_date >= w.opensAt && p.career_date <= w.closesAt;
    });
    if (!candidate) return p;
    try {
      const res = await registerTournament({ player: p, partner: { id: partnerFor(p).id, status: 'active', name: partnerFor(p).name }, tournament: candidate });
      if (res?.success === false) counters.registrationRefused += 1; else if (!registeredTournaments.has(candidate.id)) { registeredTournaments.add(candidate.id); counters.registrations += 1; }
    } catch { counters.registrationRefused += 1; }
    return localGame.entities.PlayerProfile.get(p.id);
  }
  async function rotatePartner(p, season) {
    const current = partnerFor(p);
    const next = allBots.filter((b) => b.id !== current.id)[Math.floor(decisionRng() * (allBots.length - 1))];
    const record = { season, from: current.id, to: next?.id, ok: false, error: null };
    try {
      if (typeof partnerLifecycle.releasePartner === 'function') await partnerLifecycle.releasePartner(p, 'Troca planejada (CLOUD-7C)');
      const refreshed = await localGame.entities.PlayerProfile.get(p.id);
      await partnerLifecycle.formPartnerContract(refreshed, next, {});
      record.ok = true; counters.partnerChanges += 1;
    } catch (error) { record.error = String(error?.message || error).slice(0, 160); counters.partnerChangeFailures += 1; }
    log('partner-changes.jsonl', record);
    return localGame.entities.PlayerProfile.get(p.id);
  }

  // ── instrumentação ──
  const logicalState = () => {
    const raw = file();
    return unpackCareerFromStorage(JSON.parse(raw));
  };
  async function integrityReport(careerDate) {
    const snapshotCareer = unpackCareerFromStorage(await activeCareerAdapter.getActiveCareer({ cloneResult: false }));
    const E = snapshotCareer.entities;
    const T = E.Tournament || [];
    const problems = [];
    const dup = (xs) => xs.length - new Set(xs).size;
    if (dup(T.map((t) => t.id))) problems.push(`ids de torneio duplicados: ${dup(T.map((t) => t.id))}`);
    let finishedChecked = 0; let stalePending = 0; let prematurePacked = 0;
    for (const t of T) {
      if (t.status === 'finalizado') {
        finishedChecked += 1;
        if (t.world_tour_resolved === true) {
          if (!t.canonical_settlement_id) problems.push(`${t.id}: sem canonical_settlement_id`);
          const rounds = t.bracket_history || [];
          const ids = rounds.flatMap((r) => (r.matches || []).map((m) => m.match_id));
          if (dup(ids)) problems.push(`${t.id}: match_id duplicado`);
          for (const r of rounds) for (const m of r.matches || []) {
            if (!m.winner || (m.winner !== m.team_a && m.winner !== m.team_b)) problems.push(`${t.id}: vencedor inválido em ${m.match_id}`);
            if (m.status && m.status !== 'completed') problems.push(`${t.id}: partida não concluída ${m.match_id}`);
          }
          const finalMatch = rounds.at(-1)?.matches?.[0];
          if (finalMatch && finalMatch.winner !== t.champion) problems.push(`${t.id}: campeão difere do vencedor da final`);
          const pl = t.placements || [];
          if (pl.length) {
            if (pl[0].team !== t.champion) problems.push(`${t.id}: placements[0] != campeão`);
            if (pl[1] && pl[1].team !== t.runner_up) problems.push(`${t.id}: placements[1] != vice`);
            if (dup(pl.map((x) => x.position))) problems.push(`${t.id}: posições duplicadas`);
            if (dup(pl.map((x) => x.team))) problems.push(`${t.id}: times duplicados nas colocações`);
          }
        }
      } else if (t.status !== 'cancelado' && t.end_date && t.end_date < careerDate) {
        const days = (new Date(careerDate) - new Date(t.end_date)) / 86400000;
        if (days > 14) stalePending += 1;
      }
    }
    if (stalePending) problems.push(`torneios pendentes indevidamente (>14 dias após o fim): ${stalePending}`);
    const raw = JSON.parse(file());
    for (const t of raw.entities.Tournament || []) if (t.history_pack && t.status !== 'finalizado') prematurePacked += 1;
    if (prematurePacked) problems.push(`compactação prematura: ${prematurePacked}`);
    const regs = (E.TournamentRegistration || []).filter((r) => r.profile_id === profileId);
    if (dup(regs.map((r) => `${r.tournament_id}`))) problems.push('inscrições duplicadas do jogador');
    const events = (E.CalendarEvent || []).filter((e) => e.profile_id === profileId && e.event_type === 'tournament');
    if (dup(events.map((e) => e.related_id))) problems.push('eventos de torneio duplicados para o mesmo related_id');
    const matches = E.Match || [];
    if (dup(matches.map((m) => m.id))) problems.push(`partidas com id duplicado: ${dup(matches.map((m) => m.id))}`);
    const arr = E.AthleteRankingResult || [];
    const arrDup = dup(arr.map((r) => `${r.athlete_id}|${r.tournament_id}`));
    if (arrDup) problems.push(`pontos de ranking duplicados (atleta+torneio): ${arrDup}`);
    const processed = snapshotCareer.player?.processed_match_keys || [];
    if (dup(processed)) problems.push('processed_match_keys duplicadas');
    const partnerships = E.Partnership || [];
    if (dup(partnerships.map((x) => x.id))) problems.push('duplas com id duplicado');
    const entityCounts = Object.fromEntries(Object.entries(E).map(([k, v]) => [k, Array.isArray(v) ? v.length : null]));
    return { ok: problems.length === 0, problems: problems.slice(0, 20), problemCount: problems.length, finishedChecked, entityRows: Object.values(entityCounts).reduce((a, b) => a + (b || 0), 0), tournaments: T.length, finished: finishedChecked, playerTournamentEvents: events.length, matchRows: matches.length, playerMatchRows: matches.filter((m) => m.profile_id === profileId).length, rankingResultDupes: arrDup, entityCounts };
  }
  const checkpoint = async (day) => {
    const L = logicalState();
    const parts = {};
    for (const [k, v] of Object.entries(L.entities)) parts[k] = sha(v);
    parts.player = sha(L.player);
    log('hashes.jsonl', { day, date: profile.career_date, whole: sha({ ...parts }), parts });
  };

  // ── loop principal ──
  const totalDays = SEASONS * SEASON_DAYS;
  let seasonDayMs = [];
  let seasonStartCounters = { ...counters };
  const sizeOf = () => file()?.length || 0;
  for (let day = 0; day < totalDays; day += 1) {
    const season = Math.floor(day / SEASON_DAYS) + 1;
    if (day % 3 === 0) profile = await maybeRegister(profile);

    // dia (botão real); se o motor bloquear por decisão/torneio, resolve com as APIs reais e tenta de novo
    let advanced = false;
    for (let attempt = 0; attempt < 8 && !advanced; attempt += 1) {
      const t0 = performance.now();
      try {
        profile = await quiet(async () => { const next = await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); return next; });
        seasonDayMs.push(performance.now() - t0);
        advanced = true;
      } catch (error) {
        const fresh = await localGame.entities.PlayerProfile.get(profileId);
        const pending = ((await localGame.entities.CalendarEvent.filter({ profile_id: profileId })) || [])
          .filter((e) => e.status !== 'completed' && e.status !== 'cancelled' && (e.requires_decision || e.event_type === 'tournament') && e.start_date <= fresh.career_date)
          .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0];
        if (!pending) { counters.blockedUnresolved += 1; log('blocked.jsonl', { day, date: fresh.career_date, error: String(error?.message || error).slice(0, 200), code: error?.code || null }); break; }
        const play = decisionRng() < DECISION_PLAY;
        if (play && pending.event_type === 'tournament' && pending.related_id) {
          const tournament = await localGame.entities.Tournament.get(pending.related_id).catch(() => null);
          if (tournament) { counters.decisionsPlayed += 1; profile = await quiet(() => playTournamentRound(pending.id, tournament, fresh).catch(() => fresh)); }
          else { await resolveDecision(pending.id, 'skip'); counters.decisionsSkipped += 1; profile = await localGame.entities.PlayerProfile.get(profileId); }
        } else {
          await quiet(() => resolveDecision(pending.id, play ? 'play' : 'skip')); if (play) counters.decisionsPlayed += 1; else counters.decisionsSkipped += 1;
          profile = await localGame.entities.PlayerProfile.get(profileId);
        }
      }
    }
    if (!advanced) { progress.status = 'stuck'; progress.stuckAtDay = day; saveProgress(); break; }

    if (decisionRng() < TRAIN_CHANCE && Number(profile.trainings_today || 0) < 3) {
      const cost = getTrainingCost(profile, 'moderado');
      if (Number(profile.coins || 0) >= cost) { const res = await quiet(() => executeTraining(profile, trainingActivity, 'moderado', {}).catch(() => null)); if (res?.profile) { profile = res.profile; counters.trainings += 1; } }
    }
    if (!isInjured(profile) && (await canPlayMatchToday(profile)).allowed && decisionRng() < PRACTICE_CHANCE) {
      await quiet(() => playPractice(profile).catch(() => {}));
      profile = await localGame.entities.PlayerProfile.get(profileId);
    }
    if (HASH_EVERY > 0 && (day + 1) % HASH_EVERY === 0) await checkpoint(day + 1);

    // fim de temporada
    if ((day + 1) % SEASON_DAYS === 0) {
      const t0 = performance.now();
      const integrity = await integrityReport(profile.career_date);
      const integrityMs = performance.now() - t0;
      // tempo de carregamento (abrir o save do disco) e de gravação lógica isolada
      const tl = performance.now();
      const loadedCopy = await quiet(() => manager.loadCareer(careerId));
      const loadMs = performance.now() - tl;
      void loadedCopy;
      const tw = performance.now();
      await quiet(() => localGame.entities.Post.create({ author_name: '7c', content: `marco-temporada-${season}` }));
      const writeMs = performance.now() - tw;
      let clonedMs = null;
      { const snap = await activeCareerAdapter.getActiveCareer({ cloneResult: false }); const tc = performance.now(); structuredClone(snap); clonedMs = performance.now() - tc; }
      if (typeof globalThis.gc === 'function') globalThis.gc();
      const mem = process.memoryUsage();
      const age = Math.floor((new RealDate(profile.career_date) - new RealDate(profile.birth_date)) / 31557600000);
      const rank = await getWorldRank(profile).catch(() => null);
      const d = { ...counters };
      const stats = inc.getIncrementalStats();
      const row = {
        season, date: profile.career_date, age, worldRank: rank?.rank ?? null, coins: profile.coins, xp: profile.xp, level: profile.level,
        overall: Math.round(['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'].reduce((s, k) => s + (Number(profile[k]) || 0), 0) / 10),
        partnerId: profile.partner_id,
        seasonCounters: Object.fromEntries(Object.keys(d).map((k) => [k, d[k] - seasonStartCounters[k]])), totalCounters: d,
        entityRows: integrity.entityRows, tournaments: integrity.tournaments, finishedTournaments: integrity.finished, matchRows: integrity.matchRows, playerMatchRows: integrity.playerMatchRows,
        saveBytes: sizeOf(), dayMs: { n: seasonDayMs.length, median: r1(pct(seasonDayMs, 0.5)), p95: r1(pct(seasonDayMs, 0.95)), max: r1(Math.max(...seasonDayMs)), mean: r1(seasonDayMs.reduce((a, b) => a + b, 0) / seasonDayMs.length) },
        loadMs: r1(loadMs), writeMs: r1(writeMs), cloneMs: r1(clonedMs), heapMB: r1(mem.heapUsed / 1048576), rssMB: r1(mem.rss / 1048576),
        packedRowsInFile: (file().match(/"history_pack"/g) || []).length, incrementalStats: stats, integrity: { ok: integrity.ok, problemCount: integrity.problemCount, problems: integrity.problems, integrityMs: r1(integrityMs) },
        elapsedMs: RealDate.now() - startedAt,
      };
      log('seasons.jsonl', row);
      console.log(`[${STRATEGY}] T${season} ${row.date} idade=${age} rank=${row.worldRank} torneios=${row.seasonCounters.tournamentsPlayed} partidas=${row.seasonCounters.tournamentMatches}+${row.seasonCounters.practiceMatches} save=${(row.saveBytes / 1048576).toFixed(1)}MB dia med=${row.dayMs.median}ms p95=${row.dayMs.p95}ms integridade=${integrity.ok ? 'ok' : `FALHAS(${integrity.problemCount})`}`);
      if (DUMP.has(season)) fs.writeFileSync(path.join(OUT, `save-season-${season}.json`), file());
      seasonDayMs = []; seasonStartCounters = { ...counters };
      if (season < SEASONS) profile = await rotatePartner(profile, season);
      if (RELOAD.has(season)) {
        activeCareerAdapter.clearActiveCareer();
        const loaded = await quiet(() => manager.loadCareer(careerId));
        activeCareerAdapter.setActiveCareer(loaded);
        profile = await localGame.entities.PlayerProfile.get(profileId);
        log('reloads.jsonl', { season, date: profile.career_date });
      }
      progress.seasonsDone = season; saveProgress();
    }
  }
  const final = logicalState();
  const parts = {}; for (const [k, v] of Object.entries(final.entities)) parts[k] = sha(v); parts.player = sha(final.player);
  const summary = { strategy: STRATEGY, seed: SEED, seasons: progress.seasonsDone, finalDate: profile.career_date, counters, whole: sha(parts), parts, saveBytes: sizeOf(), totalMs: RealDate.now() - startedAt, node: process.version, status: progress.status === 'stuck' ? 'stuck' : 'completed' };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  progress.status = summary.status; saveProgress();
  console.log(`CONCLUÍDO ${STRATEGY}: ${summary.seasons} temporadas, ${(summary.totalMs / 60000).toFixed(1)} min, hash=${summary.whole}`);
} catch (error) {
  progress.status = 'failed'; progress.error = String(error?.stack || error).slice(0, 2000); saveProgress();
  console.error('FALHOU', error);
  process.exitCode = 1;
} finally {
  await server.close();
}
