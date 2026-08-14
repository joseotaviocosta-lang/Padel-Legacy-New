// Hotfix crítico — Match Launch Pipeline (QA real relatou treino E torneio
// falhando ao abrir/executar). Este teste atravessa o pipeline REAL usado
// pela UI: constrói o mesmo shape de teams que SimulationModal.startMatch()/
// TournamentModal.startMatch() constroem, chama o motor real (createMatch/
// playPoint) e RENDERIZA o componente LiveMatch de verdade via
// react-dom/server — não reimplementa nem mocka a camada crítica (session
// normalization, engine init, LiveMatch launch, checkpoint), como o
// enunciado exige.
//
// Não substitui os testes existentes de engine/checkpoint (test:match-
// integrity, test:tournament-resume-recovery, test:tournament-match-
// lifecycle) — soma a peça que faltava: prova que o componente React que a
// UI realmente monta (LiveMatch, dentro do SimulationModal/TournamentModal)
// não lança exceção com os dados reais que os dois fluxos produzem.
import { createServer } from 'vite';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function fakePlayer(id, name, extra = {}) {
  return {
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, partner_chemistry: 60, partner_trust: 60, partner_morale: 60,
    matches_played: 0, ...extra,
  };
}

class FakeStorage {
  constructor() { this.files = new Map(); }
  async initialize() {}
  async ensureDirectory() {}
  async exists(p) { return this.files.has(p); }
  async readJsonIfExists(p, defaultValue) { return this.files.has(p) ? JSON.parse(this.files.get(p)) : defaultValue; }
  async writeJson(p, data) { this.files.set(p, JSON.stringify(data)); return data; }
  async remove(p) { return this.files.delete(p); }
}

function renderLiveMatch(LiveMatch, props) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(LiveMatch, {
    coach: null,
    liveCoachSettings: { liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false, showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true },
    onFinished: () => {},
    displayMode: 'text',
    onDisplayModeChange: () => {},
    onCheckpoint: null,
    ...props,
  }));
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const matchModule = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { createMatch, playPoint } = matchModule;
  const liveMatchModule = await server.ssrLoadModule('/src/components/matches/LiveMatch.jsx');
  const LiveMatch = liveMatchModule.default;
  const checkpointModule = await server.ssrLoadModule('/src/careers/MatchCheckpointRepository.js');
  const { MatchCheckpointRepository } = checkpointModule;
  const practiceRecoveryModule = await server.ssrLoadModule('/src/game-core/practiceMatchRecoveryEngine.js');
  const { probePracticeRecoverySession } = practiceRecoveryModule;
  const tournamentLifecycleModule = await server.ssrLoadModule('/src/game-core/tournamentMatchLifecycle.js');
  const { buildTournamentMatchCheckpoint, buildTournamentRecoverySession } = tournamentLifecycleModule;
  const tournamentRecoveryModule = await server.ssrLoadModule('/src/game-core/tournamentMatchRecoveryEngine.js');
  const { probeTournamentRecoverySession, buildFreshTournamentRoundRecovery } = tournamentRecoveryModule;
  const runManagerModule = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const {
    createTournamentRun, completePreTournamentMeeting, startTournamentMatch,
    getCurrentTournamentMatch, recordTournamentMatchResult, completeRoundPreparation,
  } = runManagerModule;

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — TREINO: exatamente o shape que SimulationModal.startMatch()
  // constrói (playerForMatch com os bônus mesclados, partner, oponentes).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: Treino ---');
  const trainingProfile = fakePlayer('me', 'Jogador');
  const trainingPartner = fakePlayer('partner-1', 'Parceiro');
  const trainingOpponents = [fakePlayer('bot-1', 'Rival 1'), fakePlayer('bot-2', 'Rival 2')];
  const trainingPlayerForMatch = { ...trainingProfile, _chemistryBonus: 1.5, _energyPenalty: 0, _coachMatchBonus: 0, _partnerBondBonus: 0.4 };
  const trainingTeamA = [trainingPlayerForMatch, trainingPartner];
  const trainingTeamB = trainingOpponents;

  let trainingState = createMatch(trainingTeamA, trainingTeamB, { initialTacticId: 'equilibrado', seed: 'pipeline-training' });
  gate('treino: engine cria estado inicial válido', trainingState && trainingState.pointNumber === 0 && trainingState.finished === false);
  renderLiveMatch(LiveMatch, { teamA: trainingTeamA, teamB: trainingTeamB, initialTacticId: 'equilibrado', initialState: null });
  gate('treino: LiveMatch renderiza sem exceção (fresh mount)', true);
  const trainingBeforePoint = trainingState.pointNumber;
  trainingState = playPoint(trainingState);
  gate('treino: primeiro ponto executa e avança o placar', trainingState.pointNumber === trainingBeforePoint + 1);

  let trainingSafety = 4000;
  while (!trainingState.finished && trainingSafety-- > 0) trainingState = playPoint(trainingState);
  gate('treino: partida termina normalmente jogando pontos', trainingState.finished === true);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — TORNEIO: R16 do zero em campanha nova, depois QF.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: Torneio R16 → QF ---');
  const tournament = { id: 'pipeline-cup', name: 'Pipeline Cup', tier: 'Silver', start_date: '2026-03-01' };
  const tournamentProfile = fakePlayer('me', 'Jogador', { career_date: '2026-03-01', partner_id: 'partner-1' });
  const tournamentPartner = fakePlayer('partner-1', 'Parceiro');
  const opponentsByRound = [
    [fakePlayer('r16-a', 'R16 A'), fakePlayer('r16-b', 'R16 B')],
    [fakePlayer('qf-a', 'QF A'), fakePlayer('qf-b', 'QF B')],
  ];
  let run = createTournamentRun({
    tournament, profileId: tournamentProfile.id, startDate: tournamentProfile.career_date,
    mainRounds: [{ label: 'R16', short: 'R16' }, { label: 'QF', short: 'QF' }],
    opponents: opponentsByRound.map((members, index) => ({ members, rank: 200 - index * 40 })),
    now: '2026-02-28T10:00:00.000Z',
  });
  run = completePreTournamentMeeting(run, 'balanced').run;
  run = startTournamentMatch(run, tournamentProfile.career_date);
  const r16 = getCurrentTournamentMatch(run);
  gate('torneio: R16 fica com status playing após startTournamentMatch', r16.status === 'playing');

  const tournamentPlayerForMatch = { ...tournamentProfile, _chemistryBonus: 1.2, _energyPenalty: 0, _coachMatchBonus: 0, _partnerBondBonus: 0.3 };
  let r16State = createMatch([tournamentPlayerForMatch, tournamentPartner], r16.opponent, { initialTacticId: 'equilibrado', seed: 'pipeline-r16' });
  gate('torneio R16: engine cria estado inicial válido', r16State && r16State.pointNumber === 0);
  renderLiveMatch(LiveMatch, { teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: r16.opponent, initialTacticId: 'equilibrado', initialState: null });
  gate('torneio R16: LiveMatch renderiza sem exceção (fresh mount)', true);
  const r16BeforePoint = r16State.pointNumber;
  r16State = playPoint(r16State);
  gate('torneio R16: primeiro ponto executa e avança o placar', r16State.pointNumber === r16BeforePoint + 1);

  let r16Safety = 4000;
  while (!r16State.finished && r16Safety-- > 0) r16State = playPoint(r16State);
  run = recordTournamentMatchResult(run, { matchId: r16.id, won: true, score: `${r16State.setsA}-${r16State.setsB}`, tournament }).run;
  gate('torneio R16: termina e bracket avança para a próxima rodada', run.currentRound > 0 || run.status !== 'playing');

  run = completeRoundPreparation(run, { keepPlan: true }).run;
  const qfScheduled = getCurrentTournamentMatch(run);
  run = startTournamentMatch(run, qfScheduled.date);
  const qf = getCurrentTournamentMatch(run);
  gate('torneio: QF fica disponível e com status playing', qf?.id && qf.status === 'playing');

  let qfState = createMatch([tournamentPlayerForMatch, tournamentPartner], qf.opponent, { initialTacticId: 'equilibrado', seed: 'pipeline-qf' });
  renderLiveMatch(LiveMatch, { teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: qf.opponent, initialTacticId: 'equilibrado', initialState: null });
  gate('torneio QF: LiveMatch renderiza sem exceção (fresh mount)', true);
  const qfBeforePoint = qfState.pointNumber;
  qfState = playPoint(qfState);
  gate('torneio QF: primeiro ponto executa e avança o placar', qfState.pointNumber === qfBeforePoint + 1);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — RESUME: partida interrompida retoma e avança de verdade.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: Resume (treino + torneio) ---');
  const storage = new FakeStorage();

  // treino
  let resumeTrainingState = createMatch(trainingTeamA, trainingTeamB, { initialTacticId: 'equilibrado', seed: 'pipeline-resume-training' });
  for (let i = 0; i < 6 && !resumeTrainingState.finished; i += 1) resumeTrainingState = playPoint(resumeTrainingState);
  const trainingRepo = new MatchCheckpointRepository(storage);
  await trainingRepo.save('career-pipeline', { match_id: 'match-pipeline-training', type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: resumeTrainingState });
  const restoredTrainingCheckpoint = await trainingRepo.read('career-pipeline');
  const trainingSession = probePracticeRecoverySession(restoredTrainingCheckpoint);
  gate('resume treino: checkpoint válido fica resumable', trainingSession.status === 'resumable');
  renderLiveMatch(LiveMatch, { teamA: trainingSession.engineState.teams.A, teamB: trainingSession.engineState.teams.B, initialTacticId: 'equilibrado', initialState: trainingSession.engineState });
  gate('resume treino: LiveMatch renderiza sem exceção (initialState retomado)', true);
  const resumeTrainingBeforePoint = trainingSession.engineState.pointNumber;
  const resumeTrainingAdvanced = playPoint(trainingSession.engineState);
  gate('resume treino: "Continuar" avança o placar de verdade', resumeTrainingAdvanced.pointNumber === resumeTrainingBeforePoint + 1);
  await trainingRepo.clear('career-pipeline');

  // torneio
  let resumeQfState = createMatch([tournamentPlayerForMatch, tournamentPartner], qf.opponent, { initialTacticId: 'equilibrado', seed: 'pipeline-resume-qf' });
  for (let i = 0; i < 6 && !resumeQfState.finished; i += 1) resumeQfState = playPoint(resumeQfState);
  const tournamentRepo = new MatchCheckpointRepository(storage);
  await tournamentRepo.save('career-pipeline', buildTournamentMatchCheckpoint({ tournament, match: qf, teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: qf.opponent, engineState: resumeQfState }));
  const restoredTournamentCheckpoint = await tournamentRepo.read('career-pipeline');
  const tournamentSession = probeTournamentRecoverySession(buildTournamentRecoverySession(restoredTournamentCheckpoint, {
    careerId: 'career-pipeline', careerDate: tournamentProfile.career_date, tournament, run, match: qf,
    teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: qf.opponent,
  }));
  gate('resume torneio: checkpoint válido fica resumable', tournamentSession.status === 'resumable');
  renderLiveMatch(LiveMatch, { teamA: tournamentSession.engineState.teams.A, teamB: tournamentSession.engineState.teams.B, initialTacticId: 'equilibrado', initialState: tournamentSession.engineState });
  gate('resume torneio: LiveMatch renderiza sem exceção (initialState retomado)', true);
  const resumeQfBeforePoint = tournamentSession.engineState.pointNumber;
  const resumeQfAdvanced = playPoint(tournamentSession.engineState);
  gate('resume torneio: "Continuar" avança o placar de verdade', resumeQfAdvanced.pointNumber === resumeQfBeforePoint + 1);
  await tournamentRepo.clear('career-pipeline');

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — RESTART: checkpoint corrompido não trava, reinício funciona.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: Restart (checkpoint corrompido) ---');
  const corruptedTraining = JSON.parse(JSON.stringify(restoredTrainingCheckpoint || { engine_state: resumeTrainingState, match_id: 'x', type: 'practice', career_id: 'career-pipeline', checkpoint_schema_version: 1 }));
  corruptedTraining.engine_state.stats = null;
  const corruptedTrainingSession = probePracticeRecoverySession(corruptedTraining);
  gate('restart treino: checkpoint corrompido vira restart_required (nunca lança)', corruptedTrainingSession.status === 'restart_required');

  const corruptedTournament = JSON.parse(JSON.stringify(restoredTournamentCheckpoint));
  corruptedTournament.engine_state.stats = null;
  const corruptedTournamentSession = probeTournamentRecoverySession(buildTournamentRecoverySession(corruptedTournament, {
    careerId: 'career-pipeline', careerDate: tournamentProfile.career_date, tournament, run, match: qf,
    teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: qf.opponent,
  }));
  gate('restart torneio: checkpoint corrompido vira restart_required (nunca lança)', corruptedTournamentSession.status === 'restart_required');

  const fresh = buildFreshTournamentRoundRecovery({
    careerId: 'career-pipeline', tournament, run, teamA: [tournamentPlayerForMatch, tournamentPartner], teamB: qf.opponent,
    initialTacticId: 'equilibrado', now: new Date('2026-03-05T12:00:00.000Z'),
  });
  gate('restart torneio: nova sessão fica resumable', fresh.session.status === 'resumable');
  renderLiveMatch(LiveMatch, { teamA: fresh.session.engineState.teams.A, teamB: fresh.session.engineState.teams.B, initialTacticId: 'equilibrado', initialState: fresh.session.engineState });
  gate('restart torneio: LiveMatch renderiza sem exceção (sessão nova)', true);
  const restartBeforePoint = fresh.session.engineState.pointNumber;
  const restartAdvanced = playPoint(fresh.session.engineState);
  gate('restart torneio: primeiro ponto da sessão reiniciada executa', restartAdvanced.pointNumber === restartBeforePoint + 1);
} finally {
  await server.close();
}

console.log(`\ntest:match-launch-pipeline OK — ${gates} gates (treino + R16 + QF + resume + restart, pipeline real: engine + componente React de verdade).`);
