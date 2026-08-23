import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';

const clone = (value) => JSON.parse(JSON.stringify(value));
const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

class FakeStorage {
  constructor() { this.files = new Map(); }
  async initialize() {}
  async ensureDirectory() {}
  async readJsonIfExists(path, fallback = null) { return this.files.has(path) ? clone(this.files.get(path)) : fallback; }
  async writeJson(path, value) { this.files.set(path, clone(value)); return clone(value); }
  async remove(path) { return this.files.delete(path); }
  async exists(path) { return this.files.has(path); }
}

const athlete = (id, name) => ({
  id, name, sport_name: name, energy: 90, morale: 75, confidence: 75,
  serve: 70, forehand: 70, backhand: 70, volley: 70, bandeja: 70,
  smash: 70, defense: 70, agility: 70, strategy: 70, emotional_control: 70,
});

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const runModule = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const checkpointModule = await server.ssrLoadModule('/src/careers/MatchCheckpointRepository.js');
  const recoveryModule = await server.ssrLoadModule('/src/game-core/tournamentMatchLifecycle.js');
  const recoveryEngineModule = await server.ssrLoadModule('/src/game-core/tournamentMatchRecoveryEngine.js');
  const matchModule = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const pressModule = await server.ssrLoadModule('/src/lib/pressData.js');

  const {
    completePreTournamentMeeting, completeRoundPreparation, createTournamentRun,
    getCurrentTournamentMatch, getTournamentRunPhase, recordTournamentMatchResult, startTournamentMatch,
  } = runModule;
  const { MatchCheckpointRepository, isValidCheckpointShape } = checkpointModule;
  const {
    buildTournamentMatchCheckpoint, buildTournamentRecoverySession, shouldBlockCareerAdvanceForMatchRecovery,
  } = recoveryModule;
  const { buildFreshTournamentRoundRecovery, probeTournamentRecoverySession } = recoveryEngineModule;
  const { createMatch, playPoint } = matchModule;
  const { getPendingInterviews } = pressModule;

  const tournament = { id: 'los-angeles-cup', name: 'Los Angeles Cup', tier: 'Silver', start_date: '2026-02-05' };
  const profile = { ...athlete('zeh', 'zeh'), career_date: '2026-02-05', partner_id: 'facundo' };
  const partner = athlete('facundo', 'Facundo Benítez');
  const opponents = [
    [athlete('r16-a', 'R16 A'), athlete('r16-b', 'R16 B')],
    [athlete('hugo-navarro', 'Hugo Navarro'), athlete('alessio-romano', 'Alessio Romano')],
    [athlete('sf-a', 'SF A'), athlete('sf-b', 'SF B')],
  ];
  let run = createTournamentRun({
    tournament, profileId: profile.id, startDate: profile.career_date,
    mainRounds: [{ label: 'R16', short: 'R16' }, { label: 'QF', short: 'QF' }, { label: 'SF', short: 'SF' }],
    opponents: opponents.map((members, index) => ({ members, rank: 180 - index * 30 })),
    now: '2026-02-04T10:00:00.000Z',
  });
  run = completePreTournamentMeeting(run, 'balanced').run;
  run = startTournamentMatch(run, profile.career_date);
  const r16 = getCurrentTournamentMatch(run);
  run = recordTournamentMatchResult(run, { matchId: r16.id, won: true, score: '6-4, 6-3', tournament }).run;

  let qf = getCurrentTournamentMatch(run);
  const qfProfile = { ...profile, career_date: qf.date, matches_played: 2, wins: 2, losses: 0 };
  run = completeRoundPreparation(run, { keepPlan: true }).run;
  run = startTournamentMatch(run, qfProfile.career_date);
  qf = getCurrentTournamentMatch(run);
  let partialState = createMatch([qfProfile, partner], qf.opponent, { seed: 'qa-qf-partial' });
  while (partialState.pointNumber < 9 && !partialState.finished) partialState = playPoint(partialState);

  const storage = new FakeStorage();
  const beforeUnload = new MatchCheckpointRepository(storage);
  await beforeUnload.save('career-qa', buildTournamentMatchCheckpoint({ tournament, match: qf, teamA: [qfProfile, partner], teamB: qf.opponent, engineState: partialState }));
  const afterReload = new MatchCheckpointRepository(storage);
  const restored = await afterReload.read('career-qa');
  const validSession = probeTournamentRecoverySession(buildTournamentRecoverySession(restored, { careerId: 'career-qa', careerDate: qfProfile.career_date, tournament, run, match: qf, teamA: [qfProfile, partner], teamB: qf.opponent }));
  assert.equal(validSession.status, 'resumable', 'checkpoint QF válido não ficou resumable');
  assert.equal(validSession.engineState.pointNumber, partialState.pointNumber, 'reload perdeu o placar/progresso do engine');
  assert.equal(playPoint(clone(validSession.engineState)).pointNumber, partialState.pointNumber + 1, 'engine restaurado não consegue abrir/avançar LiveMatch');
  assert.equal(shouldBlockCareerAdvanceForMatchRecovery(validSession), true, 'avanço de dia não bloqueia partida ativa real');

  const corrupted = clone(restored);
  corrupted.engine_state.stats = null;
  assert.equal(isValidCheckpointShape(corrupted, 'career-qa'), true, 'fixture não reproduz o antigo falso positivo superficial');
  const invalidSession = probeTournamentRecoverySession(buildTournamentRecoverySession(corrupted, { careerId: 'career-qa', careerDate: qfProfile.career_date, tournament, run, match: qf, teamA: [qfProfile, partner], teamB: qf.opponent }));
  assert.equal(invalidSession.status, 'restart_required', 'checkpoint semanticamente inválido continuou resumable');
  assert(invalidSession.issues.includes('engine_stats'), 'diagnóstico não identifica engine_state incompleto');

  const fresh = buildFreshTournamentRoundRecovery({ careerId: 'career-qa', tournament, run, teamA: [qfProfile, partner], teamB: qf.opponent, initialTacticId: 'equilibrado', now: new Date('2026-02-07T12:00:00.000Z') });
  assert.equal(fresh.match.id, qf.id, 'restart trocou o matchId estável da QF');
  assert.equal(fresh.checkpoint.engine_state.pointNumber, 0, 'restart não criou engine_state do zero');
  assert.equal(fresh.session.status, 'resumable', 'nova sessão não abriu validada');
  assert.deepEqual(fresh.checkpoint.participant_ids.B, ['hugo-navarro', 'alessio-romano'], 'restart reutilizou participantes de outra rodada');
  await afterReload.clearIfMatch('career-qa', corrupted.match_id);
  await afterReload.save('career-qa', fresh.checkpoint);
  assert.equal((await afterReload.read('career-qa')).match_id, qf.id, 'novo checkpoint não persistiu');

  let resumed = clone(validSession.engineState);
  while (!resumed.finished) resumed = playPoint(resumed);
  run = recordTournamentMatchResult(run, { matchId: qf.id, won: true, score: `${resumed.setsA}-${resumed.setsB}`, tournament }).run;
  await afterReload.clearIfMatch('career-qa', qf.id);
  assert.equal(await afterReload.read('career-qa'), null, 'checkpoint concluído não foi removido');
  const matchRecord = { id: qf.id, profile_id: profile.id, status: 'completed', is_official: true, is_tournament: true, match_occurred: true, result: 'vitória', winner: 'A', tournament_round: qf.round, team_a: [profile.sport_name, partner.name], team_b: qf.opponent.map((item) => item.name), date: qf.date };
  assert.equal(getPendingInterviews(qfProfile, [matchRecord], { calendarEvents: [], registrations: [] }).length, 1, 'QF concluída não gerou entrevista única');
  const sf = getCurrentTournamentMatch(run);
  run = completeRoundPreparation(run, { keepPlan: true }).run;
  assert.equal(getTournamentRunPhase(run, sf.date), 'playable', 'após entrevista/avanço, SF não ficou jogável');

  const modal = source('src/components/tournaments/TournamentModal.jsx');
  const home = source('src/pages/CareerHub.jsx');
  const communications = source('src/lib/careerCommunications.js');
  const calendar = source('src/game-core/calendarLifecycle.js');
  assert(modal.includes("setPhase('match_restart_prompt')") && modal.includes('LiveMatchRecoveryBoundary'), 'falha de resume ainda pode derrubar/fechar o modal silenciosamente');
  assert(modal.includes('buildFreshTournamentRoundRecovery') && modal.includes('repository.save(careerId, fresh.checkpoint)'), 'restart não cria/persiste sessão nova antes de abrir');
  assert(home.includes('<ActiveMatchRecoveryBanner') && home.includes("!['tournament', 'injury'].includes(careerMoment.type)"), 'Home ainda oferece dois CTAs concorrentes');
  assert(communications.includes('TOURNAMENT_RESUME') && communications.includes("String(nextTournament.id) !== String(recoveryTournamentId)"), 'notificação de jogar próxima rodada não é suprimida durante recovery');
  assert(calendar.includes('guardActiveMatchBeforeAdvance') && calendar.includes('ACTIVE_MATCH_RECOVERY_REQUIRED'), 'porta global de avanço não protege partida ativa real');

  console.log('TournamentResumeRecovery: PASS');
  console.log('✓ checkpoint válido reabre o engine com placar preservado');
  console.log('✓ checkpoint inválido vira restart_required sem fechar o modal');
  console.log('✓ restart preserva bracket/matchId e cria checkpoint/engine novos');
  console.log('✓ conclusão limpa checkpoint; entrevista e próxima rodada continuam');
  console.log('✓ Home, notificação e avanço de dia respeitam o estado canônico');
} finally {
  await server.close();
}
