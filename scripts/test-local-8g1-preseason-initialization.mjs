// LOCAL-8G.1 — a Pré-Temporada nasce na ATIVAÇÃO da carreira.
//
// Regressão de b270e04 (LOCAL-8G): a tela Torneios deixou de chamar
// ensureFutureTournaments (correto — a tela é só leitura), mas era essa
// chamada que criava a exibição numa carreira nova. Sem ela, a Pré-Temporada
// só nascia na virada de mês (01/02), já vencida e presa em `inscricoes`.
//
//   R  regressão: carreira nova em 02/01/2026, só ativada (nenhuma tela
//      aberta) — a Pré-Temporada existe, com inscrição aberta.
//   1–12 ver docs/LOCAL_8G1_PRESEASON_INITIALIZATION.md.
// Saves em memória; nenhum arquivo do jogador é tocado.
// Uso: node scripts/test-local-8g1-preseason-initialization.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
let quietDepth = 0; let savedConsole = null;
const quiet = async (fn) => { if (process.env.PL8G1_VERBOSE) return fn(); if (quietDepth++ === 0) { savedConsole = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = savedConsole; } };
let passed = 0; const failures = [];
const report = { label: process.env.PL8G1_LABEL || 'working-tree', sections: {} };
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
function memoryBackend() {
  const files = new Map(); const stats = { writes: 0 };
  return { files, stats, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { if (!String(p).includes('careers-index')) stats.writes += 1; files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const OLD_T1 = 'reports/local-8a-career-audit/run10/save-season-1.json';
const NEW_FIXTURE = 'reports/ui-redesign-532/fixtures/carreira-nova.json';
const STATIC_FIELDS = ['id', 'circuit_code', 'name', 'tier', 'start_date', 'end_date', 'registration_open_date', 'registration_deadline', 'season_id', 'city', 'main_draw_size'];
const staticOf = (t) => Object.fromEntries(STATIC_FIELDS.map((k) => [k, t?.[k] ?? null]));
// season_id fica de fora: a Season de um ano ainda não semeado (2027) nasce com
// id aleatório (pré-existente, registrado na LOCAL-8G) — não é calendário.
const regularCalendar = (rows) => JSON.stringify((rows || []).filter((t) => !t.is_exhibition).map((t) => { const { season_id: _s, ...rest } = staticOf(t); return rest; }).sort((a, b) => String(a.id).localeCompare(String(b.id))));
const exhibitionsOf = (rows) => (rows || []).filter((t) => t.is_exhibition || t.tier === 'Exibição');
const withoutTimestamps = (row) => { const { created_date: _c, updated_date: _u, ...rest } = row || {}; return rest; };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const careerLib = await L('/src/lib/career.js');
  const { buildPreSeasonExhibition } = await L('/src/lib/circuitCatalog.js');
  const { ensureCareerSystemsInitialized } = await L('/src/game-core/careerSystemsInitialization.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await L('/src/lib/saveFoundation.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await L('/src/game-core/dayAdvanceCoordinator.js');
  const { resolveDecision } = await L('/src/lib/calendarSystem.js');
  const { registerTournament, getTournamentRegistrationWindow, listTournamentRegistrations } = await L('/src/lib/tournamentRegistration.js');
  const { createMatch, playPoint, getSetScoreString } = await L('/src/lib/matchEngine.js');
  const { applyPlayerMatchToCanonicalBracket } = await L('/src/gameplay/worldTour/tournamentSettlement.js');
  const { BOTS_BY_DIFFICULTY } = await L('/src/lib/bots.js');
  const { getChemistryBonus, getEnergyPenalty, getWorldRank, buildMatchRewardsPatch } = await L('/src/lib/padel.js');
  const { createTournamentRun, getCurrentTournamentMatch, recordTournamentMatchResult, countMainDrawWins } = await L('/src/gameplay/worldTour/TournamentRunManager.js');
  const { prepareTournamentFinalization } = await L('/src/game-core/tournamentLifecycle.js');
  const { getQualifyingRoundLabels } = await L('/src/gameplay/worldTour/QualifyingManager.js');

  let backend = null; let manager = null; let careerId = null;
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  async function freshCareer(careerDate, name = 'Carreira 8G1') {
    resetIdCollisionSequence();
    backend = memoryBackend();
    manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    const { career } = await quiet(() => manager.createCareer({ playerName: name }));
    careerId = career.career_id;
    activeCareerAdapter.setActiveCareer(career);
    await quiet(() => activeCareerAdapter.createPlayerProfile({ id: 'player-8g1', sport_name: 'Atleta8G1', career_date: careerDate, birth_date: '2003-03-03', coins: 5000, xp: 0, energy: 100, fatigue: 0, morale: 70, form: 55, court_side: 'direita', play_style: 'equilibrado', partner_id: partner.id, partner_chemistry: 50, weekly_training_enabled: false, achievements_v2_reconciled: true }));
    await quiet(async () => { const s = await verifySaveFoundation(); if (!s.ok) await ensureWorldSeed2025(); });
  }
  async function loadFixture(file, patchPlayer = null) {
    resetIdCollisionSequence();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (patchPlayer) data.player = { ...data.player, ...patchPlayer };
    backend = memoryBackend();
    manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    careerId = data.career_id;
    return data;
  }
  const activate = () => quiet(() => ensureCareerSystemsInitialized({ careerId: activeCareerAdapter.activeCareerId }));
  const tournaments = async () => (await localGame.entities.Tournament.list('-start_date', 5000)) || [];
  const profileNow = async () => (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
  const snap = async () => {
    const c = await activeCareerAdapter.getActiveCareer({ fresh: false });
    const out = {};
    for (const [n, rows] of Object.entries(c.entities || {})) if (Array.isArray(rows)) out[n] = new Map(rows.map((r, i) => [String(r?.id ?? `#${i}`), JSON.stringify(r)]));
    return { out, player: JSON.stringify({ ...c.player, updated_date: 0 }) };
  };
  const diff = (a, b) => {
    const res = {};
    for (const n of new Set([...Object.keys(a.out), ...Object.keys(b.out)])) {
      const x = a.out[n] || new Map(); const y = b.out[n] || new Map();
      const created = [...y.keys()].filter((id) => !x.has(id)).length;
      const removed = [...x.keys()].filter((id) => !y.has(id)).length;
      const changed = [...y.keys()].filter((id) => x.has(id) && x.get(id) !== y.get(id)).length;
      if (created || removed || changed) res[n] = { created, removed, changed };
    }
    if (a.player !== b.player) res.__player = { changed: 1 };
    return res;
  };
  const count = (d) => Object.values(d).reduce((s, v) => s + (v.created || 0) + (v.removed || 0) + (v.changed || 0), 0);
  // Abertura de Torneios exatamente como a página faz hoje (só leituras).
  async function openTournamentsPage(profile) {
    await localGame.entities.Tournament.list('-start_date', 2000);
    await localGame.entities.Season.list('-start_date', 50);
    await localGame.entities.Match.list('-created_date', 100);
    await listTournamentRegistrations(profile.id);
    await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled', event_type: 'tournament' }).catch(() => []);
  }

  // Mesmos passos do TournamentModal (ver scripts/cloud-7c-long-career.mjs), sem UI.
  let matchCounter = 0;
  async function ensureRun(event, tournament, p) {
    if (event.metadata?.tournament_run) return event.metadata.tournament_run;
    const registration = ((await localGame.entities.TournamentRegistration.filter({ profile_id: p.id, tournament_id: tournament.id })) || [])[0];
    const qualifyingRequired = Boolean(event.metadata?.qualifying_required || registration?.entry_path === 'qualifying');
    const mainRounds = careerLib.getTournamentRounds(tournament);
    const qualifyingRounds = qualifyingRequired ? getQualifyingRoundLabels(tournament).map((label) => ({ label, short: 'Q' })) : [];
    const stageRounds = [...qualifyingRounds.map((r, i) => ({ ...r, stage: 'qualifying', stageRoundIndex: i })), ...mainRounds.map((r, i) => ({ ...r, stage: 'main', stageRoundIndex: i }))];
    const rank = await getWorldRank(p).catch(() => ({ rank: 900 }));
    const usedIds = [partner.id];
    const opponents = stageRounds.map((round) => {
      let members = careerLib.generateTournamentOpponent(tournament, p, round.stageRoundIndex, usedIds, rank.rank, round.stage);
      if (members.length < 2) members = careerLib.generateTournamentOpponent(tournament, p, round.stageRoundIndex, [partner.id], rank.rank, round.stage);
      usedIds.push(...members.map((m) => m.id));
      return { members, rank: Math.max(1, Number(rank.rank || 240) - (round.stageRoundIndex + 1) * 8) };
    });
    const run = createTournamentRun({ tournament, profileId: p.id, startDate: event.metadata?.original_start_date || event.start_date || tournament.start_date, qualifyingRounds, mainRounds, qualifyingRequired, opponents });
    await localGame.entities.CalendarEvent.update(event.id, { metadata: { ...event.metadata, tournament_run: run } });
    return run;
  }
  const played = [];
  async function playRound(eventId, tournament, p) {
    const event = await localGame.entities.CalendarEvent.get(eventId);
    let run = await ensureRun(event, tournament, p);
    const match = getCurrentTournamentMatch(run);
    if (!match || match.status === 'completed') { await resolveDecision(eventId, 'play'); return p; }
    const opponents = (match.opponent || []).length >= 2 ? match.opponent : [partner, partner];
    matchCounter += 1;
    let state = createMatch([{ ...p, _chemistryBonus: getChemistryBonus(p.partner_chemistry || 50), _energyPenalty: getEnergyPenalty(p.energy || 100) }, partner], opponents, { seed: `8g1-${matchCounter}` });
    let guard = 0;
    while (!state.finished && guard < 2000) { state = playPoint(state); guard += 1; }
    const won = state.winner === 'A';
    const score = getSetScoreString(state);
    run = recordTournamentMatchResult(run, { matchId: match.id, won, score, tournament }).run;
    const completedMatch = run.matches.find((m) => m.id === match.id);
    played.push({ date: p.career_date, round: match.round, won, score });
    const reward = buildMatchRewardsPatch(await localGame.entities.PlayerProfile.get(p.id), won, { skipPhysical: true, idempotencyKey: match.id, officialTournament: true });
    await localGame.entities.PlayerProfile.update(p.id, reward.updates);
    const fresh = await localGame.entities.Tournament.get(tournament.id);
    let bracketForFinal = Array.isArray(fresh?.bracket_history) ? fresh.bracket_history : null;
    if (Number(fresh?.bracket_schema_version) >= 2 && bracketForFinal?.length && completedMatch?.stage === 'main') {
      const rounds = applyPlayerMatchToCanonicalBracket(bracketForFinal, {
        roundIndex: completedMatch.stageRoundIndex, playerTeamName: `${p.sport_name} & ${partner.name}`,
        opponentTeamName: (completedMatch.opponent || []).map((i) => i.name).filter(Boolean).join(' & ') || null,
        won, score: completedMatch.result?.score || null, date: completedMatch.date,
      }).rounds;
      bracketForFinal = rounds;
      await localGame.entities.Tournament.update(tournament.id, { bracket_history: rounds, current_phase: run.status === 'champion' ? 'concluido' : run.status });
    }
    await localGame.entities.Match.create({ id: `${match.id}-play`, profile_id: p.id, career_date: p.career_date, date: p.career_date, tournament_id: tournament.id, tournament_name: tournament.name, tournament_round: match.round, competition_type: 'tournament', is_official: true, is_tournament: true, result: won ? 'vitória' : 'derrota', winner: state.winner, score, status: 'completed', match_type: 'tournament' }).catch(() => {});
    const terminal = ['eliminated', 'champion', 'finished'].includes(run.status);
    const nextMatch = getCurrentTournamentMatch(run);
    await localGame.entities.CalendarEvent.update(eventId, { title: terminal ? tournament.name : `${tournament.name} — ${nextMatch?.round || 'Torneio'}`, start_date: nextMatch?.date || event.start_date, end_date: nextMatch?.date || event.end_date, status: terminal ? 'completed' : 'scheduled', requires_decision: !terminal, metadata: { ...(event.metadata || {}), tournament_run: run, tournament_run_schema_version: 2, last_completed_match_id: match.id } });
    if (!terminal) return localGame.entities.PlayerProfile.get(p.id);
    const live = await localGame.entities.PlayerProfile.get(p.id);
    const completion = await prepareTournamentFinalization({ profile: live, tournament, partner, roundsWon: countMainDrawWins(run), totalRounds: careerLib.getTournamentRounds(tournament).length, runId: `${tournament.id}:${run.createdAt}`, bracketHistory: bracketForFinal, runnerUp: won ? (completedMatch.opponent || []).map((i) => i.name).join(' & ') : `${p.sport_name} & ${partner.name}`, run });
    if (completion.operations?.length) await localGame.batch(completion.operations);
    return localGame.entities.PlayerProfile.update(p.id, completion.playerPatch);
  }
  async function advanceUntil(target, p) {
    let errors = 0;
    while (p.career_date < target) {
      let advanced = false;
      for (let attempt = 0; attempt < 8 && !advanced; attempt += 1) {
        try { p = await quiet(async () => { const next = await advanceCareerDayOnce(p); await waitForCareerDaySecondaryWork(); return next; }); advanced = true; }
        catch {
          const fresh = await localGame.entities.PlayerProfile.get(p.id);
          const pending = ((await localGame.entities.CalendarEvent.filter({ profile_id: p.id })) || [])
            .filter((e) => e.status !== 'completed' && e.status !== 'cancelled' && (e.requires_decision || e.event_type === 'tournament') && e.start_date <= fresh.career_date)
            .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0];
          if (!pending) { errors += 1; break; }
          const t = pending.event_type === 'tournament' && pending.related_id ? await localGame.entities.Tournament.get(pending.related_id).catch(() => null) : null;
          if (t) p = await quiet(() => playRound(pending.id, t, fresh));
          else { await quiet(() => resolveDecision(pending.id, 'play')); p = await localGame.entities.PlayerProfile.get(p.id); }
        }
      }
      if (!advanced) { errors += 1; break; }
    }
    return { profile: p, errors };
  }

  // ── R/1/2 — carreira nova em 02/01/2026, só ativada ─────────────────────
  const expected2026 = buildPreSeasonExhibition(2026, 'season-2026');
  let exhibitionA = null;
  {
    const S = report.sections.newCareer = {};
    await freshCareer('2026-01-02');
    const before = await tournaments();
    S.exhibitionsBeforeActivation = exhibitionsOf(before).length;
    const regularBefore = regularCalendar(before);
    S.activation = await activate();
    const after = await tournaments();
    const ex = exhibitionsOf(after);
    exhibitionA = ex[0] || null;
    S.exhibition = exhibitionA ? staticOf(exhibitionA) : null;
    ok('R: carreira nova (02/01/2026) — Pré-Temporada criada na ATIVAÇÃO, sem abrir Torneios', S.exhibitionsBeforeActivation === 0 && ex.length === 1, JSON.stringify(S));
    ok(`1: mesmas regras do catálogo (cidade/datas/id/inscrição) — ${exhibitionA?.name} ${exhibitionA?.start_date}→${exhibitionA?.end_date}`,
      exhibitionA && JSON.stringify(withoutTimestamps(exhibitionA)) === JSON.stringify(withoutTimestamps(expected2026)) && exhibitionA.name === 'Roma Pré-Temporada' && exhibitionA.start_date === '2026-01-12' && exhibitionA.end_date === '2026-01-14');
    ok('1: criada em `inscricoes`, sem resultado', exhibitionA?.status === 'inscricoes' && !exhibitionA?.champion);
    const window = getTournamentRegistrationWindow(exhibitionA);
    S.registrationWindow = window;
    ok(`2: inscrição aberta em 02/01 (janela ${window.opensAt}→${window.closesAt})`, window.opensAt <= '2026-01-02' && window.closesAt >= '2026-01-02');
    ok('11: calendário regular idêntico ao de antes da ativação', regularCalendar(after) === regularBefore);
    const firstRegular = after.filter((t) => !t.is_exhibition).map((t) => t.start_date).sort()[0];
    S.firstRegular = firstRegular;
    ok(`11: temporada regular continua começando em 29/01 (${firstRegular})`, firstRegular === '2026-01-29');

    // 4 — reativação repetida
    const s0 = await snap(); const w0 = backend.stats.writes;
    for (let i = 0; i < 3; i += 1) await activate();
    const s1 = await snap();
    S.reactivation = { records: count(diff(s0, s1)), diff: diff(s0, s1), writes: backend.stats.writes - w0, exhibitions: exhibitionsOf(await tournaments()).length };
    ok(`4: 3 reativações — sem duplicação (${S.reactivation.exhibitions}), ${S.reactivation.records} registro(s) e ${S.reactivation.writes} gravação(ões)`, S.reactivation.exhibitions === 1 && S.reactivation.records === 0 && S.reactivation.writes === 0, JSON.stringify(S.reactivation));

    // 5 — abrir Torneios
    const pageSrc = readFileSync('src/pages/Tournaments.jsx', 'utf8');
    ok('5: Tournaments.jsx não chama ensureFutureTournaments (LOCAL-8G preservada)', !/ensureFutureTournaments\s*\(/.test(pageSrc));
    let profile = await profileNow();
    const s2 = await snap(); const w2 = backend.stats.writes;
    await quiet(() => openTournamentsPage(profile)); await quiet(() => openTournamentsPage(profile));
    const s3 = await snap();
    S.openTournaments = { records: count(diff(s2, s3)), writes: backend.stats.writes - w2 };
    ok(`5: abrir Torneios 2x — ${S.openTournaments.records} registro(s), ${S.openTournaments.writes} gravação(ões)`, S.openTournaments.records === 0 && S.openTournaments.writes === 0);

    // 3 — inscrição com dupla válida
    const reg = await quiet(() => registerTournament({ player: profile, partner: { id: partner.id, status: 'active', name: partner.name }, tournament: exhibitionA })).catch((e) => ({ success: false, error: e.message }));
    S.registration = { success: reg?.success !== false, error: reg?.error || reg?.reason || null };
    const regs = (await listTournamentRegistrations(profile.id)).filter((r) => r.tournament_id === exhibitionA.id && r.status === 'confirmed');
    ok(`3: inscrição na Pré-Temporada com dupla válida (${partner.name})`, S.registration.success && regs.length === 1, JSON.stringify(S.registration));

    // 6 — save/load
    const exported = await manager.exportCareer(careerId);
    resetIdCollisionSequence();
    const b2 = memoryBackend(); const m2 = new CareerManager(new CareerRepository(new GameStorage(b2)));
    activeCareerAdapter.careerManager = m2; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await m2.importCareer(JSON.parse(JSON.stringify(exported))); activeCareerAdapter.setActiveCareer(await m2.loadCareer(careerId)); });
    backend = b2; manager = m2;
    const l0 = await snap(); const lw0 = backend.stats.writes;
    await activate();
    const l1 = await snap();
    const reloadedEx = exhibitionsOf(await tournaments());
    S.saveLoad = { records: count(diff(l0, l1)), writes: backend.stats.writes - lw0, exhibitions: reloadedEx.length, registrations: (await listTournamentRegistrations(profile.id)).filter((r) => r.tournament_id === exhibitionA.id).length };
    ok(`6: save/load + ativação — sem alterações (${S.saveLoad.records} registro(s), ${S.saveLoad.writes} gravação(ões)), exibição e inscrição preservadas`, S.saveLoad.records === 0 && S.saveLoad.writes === 0 && S.saveLoad.exhibitions === 1 && S.saveLoad.registrations === 1 && JSON.stringify(reloadedEx[0]) === JSON.stringify(exhibitionsOf(await tournaments())[0]), JSON.stringify(S.saveLoad));

    // 7 — jogar 12–14/01 e conclusão
    profile = await profileNow();
    const adv = await advanceUntil('2026-01-16', profile);
    profile = adv.profile;
    const exAfter = exhibitionsOf(await tournaments())[0];
    const event = ((await localGame.entities.CalendarEvent.filter({ profile_id: profile.id })) || []).find((e) => e.related_id === exhibitionA.id && e.event_type === 'tournament');
    S.play = { date: profile.career_date, errors: adv.errors, matches: played, run: event?.metadata?.tournament_run?.status || null, eventStatus: event?.status || null, status: exAfter?.status, champion: exAfter?.champion || null, runner_up: exAfter?.runner_up || null };
    ok(`7: avanço até ${profile.career_date} sem erro, ${played.length} partida(s) disputada(s) entre 12 e 14/01`, adv.errors === 0 && profile.career_date === '2026-01-16' && played.length >= 1 && played.every((m) => m.date >= '2026-01-12' && m.date <= '2026-01-14'), JSON.stringify(S.play));
    ok(`7: campanha encerrada (${S.play.run}) e torneio concluído (${S.play.status}, campeão ${S.play.champion})`, ['eliminated', 'champion', 'finished'].includes(S.play.run) && S.play.eventStatus === 'completed' && S.play.status === 'finalizado' && Boolean(S.play.champion), JSON.stringify(S.play));
    const adv2 = await advanceUntil('2026-02-02', profile);
    const finalTs = await tournaments();
    S.february = { date: adv2.profile.career_date, errors: adv2.errors, exhibitions: exhibitionsOf(finalTs).map(staticOf), status: exhibitionsOf(finalTs)[0]?.status };
    ok('9: após a virada de mês (02/02) continua existindo UMA exibição, concluída', adv2.errors === 0 && exhibitionsOf(finalTs).length === 1 && S.february.status === 'finalizado', JSON.stringify(S.february));
    report.calendarA = regularCalendar(finalTs);
  }

  // ── 11 — gêmea sem a correção (só a regra do calendário regular) ───────
  {
    const S = report.sections.regularCalendarTwin = {};
    await freshCareer('2026-01-02', 'Gêmea 8G1');
    await quiet(() => careerLib.ensureFutureTournaments('2026-02-01'));
    const twin = await tournaments();
    S.twinExhibitions = exhibitionsOf(twin).length;
    ok('9: reconciliação na virada de mês (01/02) numa carreira sem exibição NÃO cria torneio fantasma', S.twinExhibitions === 0);
    ok('11: calendário regular igual ao da carreira com Pré-Temporada jogada (mesma regra, mesmos ids/datas)', regularCalendar(twin) === report.calendarA);
    delete report.calendarA;
  }

  // ── 8 — carreira nova ativada depois de 14/01 ─────────────────────────────
  {
    const S = report.sections.lateNewCareer = {};
    await freshCareer('2026-01-20', 'Tardia 8G1');
    await activate();
    S.afterActivation = exhibitionsOf(await tournaments()).length;
    await quiet(() => careerLib.ensureFutureTournaments('2026-01-20'));
    S.afterReconcile = exhibitionsOf(await tournaments()).length;
    ok(`8: carreira nova ativada em 20/01 — nenhuma exibição vencida (ativação ${S.afterActivation}, reconciliação ${S.afterReconcile})`, S.afterActivation === 0 && S.afterReconcile === 0);
    await freshCareer('2026-01-14', 'Último dia 8G1');
    await activate();
    S.lastDay = exhibitionsOf(await tournaments()).map((t) => t.status);
    ok('8: no último dia (14/01) ainda cria (o evento está em andamento, não encerrado)', S.lastDay.length === 1);
    await freshCareer('2026-01-15', 'Dia seguinte 8G1');
    await activate();
    S.dayAfter = exhibitionsOf(await tournaments()).length;
    ok('8: em 15/01 (dia seguinte ao encerramento) não cria', S.dayAfter === 0);
  }

  // ── 9 — carreira antiga sem exibição ──────────────────────────────────────
  {
    const S = report.sections.oldCareerWithout = {};
    await loadFixture(NEW_FIXTURE, { career_date: '2026-02-05' });
    S.before = exhibitionsOf(await tournaments()).length;
    const s0 = await snap();
    await activate();
    await quiet(() => careerLib.ensureFutureTournaments('2026-03-01'));
    S.after = exhibitionsOf(await tournaments()).length;
    const d = diff(s0, await snap());
    S.tournamentChanges = d.Tournament || null;
    ok(`9: carreira antiga sem exibição já em fevereiro — nenhuma criada (${S.before}→${S.after})`, S.before === 0 && S.after === 0);
    // Carreira criada na janela do bug, ainda em 01/01: ganha a exibição na próxima ativação.
    await loadFixture(NEW_FIXTURE);
    await activate();
    S.bugWindowCareer = exhibitionsOf(await tournaments()).map(staticOf);
    ok('9: carreira afetada pela regressão e ainda em 01/01 recebe a Pré-Temporada na próxima ativação', S.bugWindowCareer.length === 1 && S.bugWindowCareer[0].start_date === '2026-01-12');
    // 2ª temporada sem exibição (fora da 1ª temporada): não cria.
    const data = JSON.parse(readFileSync(OLD_T1, 'utf8'));
    data.entities.Tournament = data.entities.Tournament.filter((t) => !t.is_exhibition);
    const tmp = 'reports/local-8g1-preseason-initialization/.tmp-t1-sem-exibicao.json';
    mkdirSync('reports/local-8g1-preseason-initialization', { recursive: true });
    writeFileSync(tmp, JSON.stringify(data));
    await loadFixture(tmp, { career_date: '2027-01-02' });
    rmSync(tmp, { force: true });
    await activate();
    await quiet(() => careerLib.ensureFutureTournaments('2027-01-02'));
    S.secondSeason = exhibitionsOf(await tournaments()).length;
    ok('9: carreira na 2ª temporada (02/01/2027) sem exibição — não cria (única, 1ª temporada)', S.secondSeason === 0);
  }

  // ── 10 — carreira com Pré-Temporada histórica ────────────────────────────
  {
    const S = report.sections.historical = {};
    const data = await loadFixture(OLD_T1);
    const original = exhibitionsOf(data.entities.Tournament)[0];
    const s0 = await snap(); const w0 = backend.stats.writes;
    await activate();
    const historicalDate = (await profileNow()).career_date;
    await quiet(() => careerLib.ensureFutureTournaments(historicalDate));
    const now = exhibitionsOf(await tournaments());
    S.exhibitions = now.map((t) => ({ ...staticOf(t), status: t.status, champion: t.champion }));
    S.tournamentDiff = diff(s0, await snap()).Tournament || null;
    S.activationWrites = backend.stats.writes - w0;
    ok(`10: Pré-Temporada histórica preservada byte a byte (${original?.name}, ${original?.status}, campeão ${original?.champion})`, now.length === 1 && JSON.stringify(now[0]) === JSON.stringify(original));
  }

  // ── 12 — determinismo ─────────────────────────────────────────────────────
  {
    const S = report.sections.determinism = {};
    const runs = [];
    for (let i = 0; i < 2; i += 1) {
      await freshCareer('2026-01-02', 'Determinismo 8G1');
      await activate();
      const ts = await tournaments();
      runs.push({ exhibition: JSON.stringify(withoutTimestamps(exhibitionsOf(ts)[0])), calendar: regularCalendar(ts), ids: ts.map((t) => t.id).sort().join(',') });
    }
    S.equal = { exhibition: runs[0].exhibition === runs[1].exhibition, calendar: runs[0].calendar === runs[1].calendar, ids: runs[0].ids === runs[1].ids };
    ok('12: duas carreiras novas idênticas produzem a mesma exibição, o mesmo calendário e os mesmos ids', S.equal.exhibition && S.equal.calendar && S.equal.ids, JSON.stringify(S.equal));
  }
} finally { await vite.close(); }

report.passed = passed; report.failed = failures.length; report.failures = failures;
mkdirSync('reports/local-8g1-preseason-initialization', { recursive: true });
writeFileSync(`reports/local-8g1-preseason-initialization/${report.label}.json`, JSON.stringify(report, null, 2));
console.log(`\n${passed} PASS, ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
