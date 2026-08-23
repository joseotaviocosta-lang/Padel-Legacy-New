import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

let gates = 0;
const failures = [];
function gate(label, condition) {
  gates += 1;
  if (!condition) failures.push(`${gates}. ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(path, content) { files.set(path, String(content)); },
    async readText(path) {
      if (!files.has(path)) {
        const error = new Error('Arquivo ausente.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(path);
    },
    async exists(path) { return files.has(path); },
    async remove(path) { return files.delete(path); },
    async copy(from, to) { files.set(to, files.get(from)); return to; },
    async rename(from, to) { files.set(to, files.get(from)); files.delete(from); return to; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const source = {
  coaches: readFileSync('src/pages/Coaches.jsx', 'utf8'),
  coachLifecycle: readFileSync('src/game-core/coachLifecycle.js', 'utf8'),
  hub: readFileSync('src/pages/TrainingCenter.jsx', 'utf8'),
  training: readFileSync('src/components/training-center/TrainingView.jsx', 'utf8'),
  timer: readFileSync('src/components/training/TrainingTimerModal.jsx', 'utf8'),
  practice: readFileSync('src/components/training-center/PracticeMatchView.jsx', 'utf8'),
  simulation: readFileSync('src/components/matches/SimulationModal.jsx', 'utf8'),
  trainingSystem: readFileSync('src/lib/trainingSystemV2.js', 'utf8'),
  matchLifecycle: readFileSync('src/game-core/matchLifecycle.js', 'utf8'),
  app: readFileSync('src/App.jsx', 'utf8'),
  trainingAdapter: readFileSync('src/pages/Training.jsx', 'utf8'),
  matchesAdapter: readFileSync('src/pages/Matches.jsx', 'utf8'),
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const originalRandom = Math.random;
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureCoachMarketInitialized } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');
  const coachesModule = await server.ssrLoadModule('/src/lib/coaches.js');
  const trainingModule = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { getTrainingCost } = await server.ssrLoadModule('/src/lib/trainingEconomy.js');
  const { CareerEntityRepository } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { preparePracticeMatchSession } = await server.ssrLoadModule('/src/game-core/practiceMatchSession.js');
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/lib/matchEngine.js');
  const { finalizePracticeMatch } = await server.ssrLoadModule('/src/game-core/matchLifecycle.js');
  const { canPlayMatchToday, canTrainToday } = await server.ssrLoadModule('/src/lib/padel.js');
  const { advanceCareerDay } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await server.ssrLoadModule('/src/lib/bots.js');
  const { isOfficialTournamentMatch } = await server.ssrLoadModule('/src/lib/postMatchInterview.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];

  async function createCareer(label, overrides = {}) {
    const { career } = await manager.createCareer({ career_name: label });
    activeCareerAdapter.setActiveCareer(career);
    const id = `${career.career_id}-player`;
    await activeCareerAdapter.createPlayerProfile({
      id, sport_name: label, career_date: '2026-01-05', birth_date: '2002-01-01',
      level: 'Iniciante', play_style: 'Equilibrado', position: 'direita',
      energy: 100, fatigue: 0, coins: 10000, xp: 0, rank_points: 85,
      morale: 70, confidence: 65, form: 60, potential: 85,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
      partner_id: partner.id, partner_chemistry: 55,
      serve: 40, forehand: 40, backhand: 40, volley: 40, bandeja: 40,
      smash: 40, defense: 40, agility: 40, strategy: 40, emotional_control: 40,
      ...overrides,
    });
    return { career, profile: await localGame.entities.PlayerProfile.get(id) };
  }

  // COACHES â€” 20 cold starts reais em storage lÃ³gico isolado.
  const coldMetrics = [];
  let canonicalCoachIds = null;
  for (let index = 0; index < 20; index += 1) {
    const { career } = await createCareer(`Cold Coach ${index + 1}`);
    const before = await localGame.entities.Coach.list('-reputation', 500);
    gate(`cold start ${index + 1}: catÃ¡logo comeÃ§a vazio`, before.length === 0);
    const startedAt = performance.now();
    const [left, right] = await Promise.all([
      ensureCoachMarketInitialized(career.career_id),
      ensureCoachMarketInitialized(career.career_id),
    ]);
    const rows = await localGame.entities.Coach.list('-reputation', 500);
    const ids = rows.map((coach) => coach.id).sort();
    coldMetrics.push({ bootstrapMs: left.bootstrapMs, queryMs: left.queryMs, readyMs: performance.now() - startedAt });
    gate(`cold start ${index + 1}: bootstrap conclui`, left.initialized && right.initialized);
    gate(`cold start ${index + 1}: mercado aparece na primeira abertura`, rows.length === coachesModule.COACHES_DATA.length);
    gate(`cold start ${index + 1}: chamadas concorrentes compartilham resultado`, left.careerId === right.careerId && left.coaches.length === right.coaches.length);
    gate(`cold start ${index + 1}: nenhum ID duplicado`, new Set(ids).size === ids.length);
    if (!canonicalCoachIds) canonicalCoachIds = ids;
    gate(`cold start ${index + 1}: IDs canÃ´nicos estÃ¡veis`, JSON.stringify(ids) === JSON.stringify(canonicalCoachIds));
  }
  gate('20/20 cold starts concluÃ­dos', coldMetrics.length === 20);
  gate('0/20 mercados falsamente vazios', coldMetrics.every((_, index) => index < 20));
  gate('catÃ¡logo possui 118 coaches', canonicalCoachIds.length === 118);
  gate('bootstrap usa Promise por carreira', source.coachLifecycle.includes('coachMarketInitializations'));
  gate('Coaches aguarda bootstrap explicitamente', source.coaches.includes('await ensureCoachMarketInitialized'));
  gate('loading explÃ­cito existe', source.coaches.includes("setMarketState('loading')"));
  gate('READY_WITH_RESULTS explÃ­cito existe', source.coaches.includes("'ready-with-results'"));
  gate('READY_EMPTY real existe', source.coaches.includes("'ready-empty'"));
  gate('EmptyState depende de READY_EMPTY', source.coaches.includes("marketState === 'ready-empty'"));
  gate('filtros continuam presentes', /Todos/.test(source.coaches) && /Dispon/.test(source.coaches) && /Recomendados/.test(source.coaches));
  gate('seed nÃ£o usa reload ou timer', !/location\.reload|setTimeout|setInterval/.test(source.coachLifecycle));

  // TREINO â€” pipeline real, single-flight, 3/3 e rollback.
  Math.random = () => 0.99;
  const trainingActivity = trainingModule.TRAINING_ACTIVITIES.find((item) => item.id === 'court-groundstrokes');
  const trainingCareer = await createCareer('Training Pipeline');
  let trainingProfile = trainingCareer.profile;
  const initialTraining = { ...trainingProfile };
  const firstCost = getTrainingCost(trainingProfile, 'moderado');
  const firstCall = trainingModule.executeTraining(trainingProfile, trainingActivity, 'moderado');
  const duplicateCall = trainingModule.executeTraining(trainingProfile, trainingActivity, 'moderado');
  gate('double action retorna a mesma Promise', firstCall === duplicateCall);
  const firstTraining = await firstCall;
  trainingProfile = await localGame.entities.PlayerProfile.get(trainingProfile.id);
  gate('executeTraining conclui sem erro', !firstTraining.error);
  gate('contador 0/3 -> 1/3', trainingProfile.trainings_today === 1);
  gate('moedas debitadas uma vez', trainingProfile.coins === initialTraining.coins - firstCost);
  gate('XP aplicado uma vez', trainingProfile.xp === initialTraining.xp + firstTraining.activity.xp);
  gate('energia atualizada', trainingProfile.energy < initialTraining.energy);
  gate('fadiga atualizada', trainingProfile.fatigue > initialTraining.fatigue);
  gate('atributos/progresso atualizados', JSON.stringify(trainingProfile.attribute_progress || {}) !== JSON.stringify(initialTraining.attribute_progress || {}));
  gate('transaction wall time medido', firstTraining.timings.wallMs >= 0);
  gate('limite ainda permite segundo treino', canTrainToday(trainingProfile).allowed);
  const secondTraining = await trainingModule.executeTraining(trainingProfile, trainingActivity, 'moderado');
  trainingProfile = secondTraining.profile;
  gate('segundo treino funciona', trainingProfile.trainings_today === 2);
  const thirdTraining = await trainingModule.executeTraining(trainingProfile, trainingActivity, 'leve');
  trainingProfile = thirdTraining.profile;
  gate('terceiro treino funciona', trainingProfile.trainings_today === 3);
  gate('3/3 fica bloqueado', !canTrainToday(trainingProfile).allowed);
  const fourthTraining = await trainingModule.executeTraining(trainingProfile, trainingActivity, 'leve');
  gate('quarto treino retorna bloqueio', Boolean(fourthTraining.error));
  const persistedTraining = await localGame.entities.PlayerProfile.get(trainingProfile.id);
  gate('quarto treino nÃ£o altera contador', persistedTraining.trainings_today === 3);
  const sessions = await localGame.entities.TrainingSession.filter({ profile_id: trainingProfile.id });
  gate('trÃªs sessÃµes persistidas', sessions.length === 3);
  gate('uma sessÃ£o por execuÃ§Ã£o', new Set(sessions.map((session) => session.id)).size === 3);
  gate('view possui handler de click', source.training.includes('function handleExecute'));
  gate('view chama executeTraining', source.training.includes('await executeTraining'));
  gate('pending usa finally', /finally\s*\{[\s\S]*trainingFlightRef\.current = null/.test(source.training));
  gate('timer conclui sem espera arbitrÃ¡ria', !source.timer.includes('setTimeout'));
  gate('timer protege conclusÃ£o duplicada', source.timer.includes('completedRef.current'));
  gate('HUD recebe profile atualizado', source.hub.includes("CustomEvent('padel:profile-updated'"));
  gate('perfil Ã© compartilhado entre views', source.hub.includes('const shared = { profile, careerId'));
  gate('efeito de Coach nÃ£o depende do adapter instÃ¡vel', !source.training.includes('[entities.Coach'));

  const rollbackCareer = await createCareer('Training Rollback');
  const rollbackBefore = rollbackCareer.profile;
  const originalCreate = CareerEntityRepository.prototype.create;
  CareerEntityRepository.prototype.create = async function failTrainingSession(name, data) {
    if (name === 'TrainingSession') throw new Error('[fault] training session');
    return originalCreate.call(this, name, data);
  };
  let rollbackThrew = false;
  try {
    await trainingModule.executeTraining(rollbackBefore, trainingActivity, 'moderado');
  } catch (error) {
    rollbackThrew = /fault/.test(error.message);
  } finally {
    CareerEntityRepository.prototype.create = originalCreate;
  }
  const rollbackAfter = await localGame.entities.PlayerProfile.get(rollbackBefore.id);
  gate('erro simulado Ã© propagado', rollbackThrew);
  gate('erro faz rollback do contador', rollbackAfter.trainings_today === rollbackBefore.trainings_today);
  gate('erro faz rollback de moedas', rollbackAfter.coins === rollbackBefore.coins);
  gate('erro faz rollback de energia', rollbackAfter.energy === rollbackBefore.energy);
  gate('erro nÃ£o cria sessÃ£o parcial', (await localGame.entities.TrainingSession.filter({ profile_id: rollbackBefore.id })).length === 0);
  const noCoins = await trainingModule.executeTraining({ ...rollbackAfter, coins: 0 }, trainingActivity, 'moderado');
  gate('saldo insuficiente bloqueia', /Moedas insuficientes/.test(noCoins.error || ''));
  const noEnergy = await trainingModule.executeTraining({ ...rollbackAfter, energy: 0 }, trainingActivity, 'moderado');
  gate('energia insuficiente bloqueia', /Energia insuficiente/.test(noEnergy.error || ''));

  // PARTIDA TREINO â€” prepara, joga, finaliza e preserva escopo nÃ£o oficial.
  const practiceCareer = await createCareer('Practice Pipeline');
  const practiceBefore = practiceCareer.profile;
  const tournamentBefore = JSON.stringify(await localGame.entities.Tournament.list('-start_date', 500));
  const bracketBefore = JSON.stringify(practiceCareer.career.tournaments || {});
  const teamRankingBefore = JSON.stringify(await localGame.entities.TeamRanking.list('-ranking_points', 500));
  const messagesBefore = await localGame.entities.CareerMessage.list('-created_date', 500);
  const launchStarted = performance.now();
  const session = preparePracticeMatchSession(practiceBefore, null);
  const launchWallMs = performance.now() - launchStarted;
  gate('partner resolvido', session.partner.id === partner.id);
  gate('dois opponents resolvidos', session.opponents.length === 2);
  gate('match config possui duas duplas', session.teamA.length === 2 && session.teamB.length === 2);
  gate('preparation time medido', session.timings.preparationMs >= 0 && launchWallMs >= 0);
  let matchState = createMatch(session.teamA, session.teamB, { seed: 1551 });
  let points = 0;
  while (!matchState.finished && points < 2500) { matchState = playPoint(matchState); points += 1; }
  gate('Live Match termina', matchState.finished && points < 2500);
  const finalization = await finalizePracticeMatch({
    profile: practiceBefore,
    matchState,
    partnerName: session.partner.name,
    opponents: session.opponents.map((opponent) => opponent.name),
  });
  await finalization.secondary;
  const practiceAfter = await localGame.entities.PlayerProfile.get(practiceBefore.id);
  gate('resultado processa sem skip na primeira vez', !finalization.skipped);
  gate('contador 0/1 -> 1/1', practiceAfter.practice_matches_today === 1);
  gate('segunda partida fica bloqueada', !canPlayMatchToday(practiceAfter).allowed);
  gate('energia/fadiga atualizam', practiceAfter.energy !== practiceBefore.energy || practiceAfter.fatigue !== practiceBefore.fatigue);
  gate('ranking individual nÃ£o muda', practiceAfter.rank_points === practiceBefore.rank_points);
  gate('ranking de duplas nÃ£o muda', JSON.stringify(await localGame.entities.TeamRanking.list('-ranking_points', 500)) === teamRankingBefore);
  gate('torneios nÃ£o mudam', JSON.stringify(await localGame.entities.Tournament.list('-start_date', 500)) === tournamentBefore);
  const activeAfterPractice = await manager.readCareer(practiceCareer.career.career_id);
  gate('bracket nÃ£o muda', JSON.stringify(activeAfterPractice.tournaments || {}) === bracketBefore);
  const matchesAfter = await localGame.entities.Match.filter({ profile_id: practiceBefore.id });
  gate('uma partida foi persistida', matchesAfter.length === 1);
  gate('partida Ã© marcada practice', matchesAfter[0].competition_type === 'practice');
  gate('partida nÃ£o Ã© oficial', matchesAfter[0].is_official === false);
  gate('partida nÃ£o Ã© elegÃ­vel para entrevista', !isOfficialTournamentMatch(matchesAfter[0]));
  gate('nenhuma notificaÃ§Ã£o de entrevista criada', (await localGame.entities.CareerMessage.list('-created_date', 500)).length === messagesBefore.length);
  const duplicateFinalization = await finalizePracticeMatch({
    profile: practiceBefore,
    matchState,
    partnerName: session.partner.name,
    opponents: session.opponents.map((opponent) => opponent.name),
  });
  gate('finalizaÃ§Ã£o duplicada Ã© ignorada', duplicateFinalization.skipped);
  gate('resultado permanece Ãºnico', (await localGame.entities.Match.filter({ profile_id: practiceBefore.id })).length === 1);
  const nextDay = await advanceCareerDay(practiceAfter, { deferGlobalProcessing: true });
  gate('prÃ³ximo dia restaura 0/1', nextDay.practice_matches_today === 0 && canPlayMatchToday(nextDay).allowed);
  gate('PracticeMatchView monta SimulationModal', source.practice.includes('<SimulationModal'));
  gate('SimulationModal monta LiveMatch', source.simulation.includes('<LiveMatch'));
  gate('checkpoint recebe careerId canÃ´nico', source.practice.includes('careerId={careerId}'));
  gate('launch possui single-flight', source.simulation.includes('launchFlightRef.current'));
  gate('efeito de Match nÃ£o depende do adapter instÃ¡vel', !source.practice.includes('[entities.Match'));
  gate('retorno aponta ao Training Center', source.practice.includes('onReturnToTrainingCenter'));
  gate('engine nÃ£o foi reimplementada na view', !/Math\.random|createMatch|playPoint/.test(source.practice));
  gate('helper reutiliza getRandomBots existente', readFileSync('src/game-core/practiceMatchSession.js', 'utf8').includes('getRandomBots'));
  gate('finalizador nÃ£o atualiza TeamRanking', !source.matchLifecycle.includes("entityName: 'TeamRanking'"));
  gate('finalizador nÃ£o atualiza rank_points', !/rank_points\s*:/.test(source.matchLifecycle));

  // CRUZADOS E ARQUITETURA.
  const crossA = await createCareer('Cross Training Match');
  const crossATraining = await trainingModule.executeTraining(crossA.profile, trainingActivity, 'leve');
  const crossASession = preparePracticeMatchSession(crossATraining.profile, null);
  gate('treino -> partida prepara com mesmo profile', crossASession.teamA[0].id === crossATraining.profile.id);
  gate('treino nÃ£o consome limite de partida', canPlayMatchToday(crossATraining.profile).allowed);
  const crossB = await createCareer('Cross Match Training');
  const crossBSession = preparePracticeMatchSession(crossB.profile, null);
  let crossBState = createMatch(crossBSession.teamA, crossBSession.teamB, { seed: 551 });
  let crossBPoints = 0;
  while (!crossBState.finished && crossBPoints < 2500) { crossBState = playPoint(crossBState); crossBPoints += 1; }
  const crossBResult = await finalizePracticeMatch({ profile: crossB.profile, matchState: crossBState, partnerName: crossBSession.partner.name, opponents: crossBSession.opponents.map((item) => item.name) });
  await crossBResult.secondary;
  const crossBTraining = await trainingModule.executeTraining(crossBResult.updatedProfile, trainingActivity, 'leve');
  gate('partida -> treino funciona', !crossBTraining.error && crossBTraining.profile.trainings_today === 1);
  gate('partida nÃ£o consome limite de treino', canTrainToday(crossBResult.updatedProfile).allowed);
  gate('3/3 e 1/1 permanecem independentes', crossBTraining.profile.practice_matches_today === 1 && crossBTraining.profile.trainings_today === 1);
  gate('Training Center continua canÃ´nico', source.hub.includes('data-training-center-hub'));
  gate('Training legado continua adapter', source.trainingAdapter.includes('<Navigate') && !source.trainingAdapter.includes('executeTraining'));
  gate('Matches legado continua adapter', source.matchesAdapter.includes('<Navigate') && !source.matchesAdapter.includes('SimulationModal'));
  gate('rotas legadas continuam declaradas', source.app.includes('path="/game/training"') && source.app.includes('path="/game/matches"'));
  gate('sem polling no novo hub', !/setInterval\s*\(/.test(source.hub + source.training + source.practice + source.coachLifecycle));
  gate('sem retry arbitrÃ¡rio', !/setTimeout\s*\(/.test(source.coachLifecycle + source.training + source.practice));
  gate('sem storage read no render', !/localStorage|sessionStorage|getItem\(/.test(source.hub + source.training + source.practice));
  gate('sem schema de save novo', !/save_schema_version|schemaVersion/.test(source.hub + source.training + source.practice + source.coachLifecycle));
  gate('suÃ­te possui ao menos 80 gates', gates >= 80);

  const averages = coldMetrics.reduce((acc, item) => ({
    bootstrapMs: acc.bootstrapMs + item.bootstrapMs / coldMetrics.length,
    queryMs: acc.queryMs + item.queryMs / coldMetrics.length,
    readyMs: acc.readyMs + item.readyMs / coldMetrics.length,
  }), { bootstrapMs: 0, queryMs: 0, readyMs: 0 });
  const metrics = {
    coachBootstrapMs: Number(averages.bootstrapMs.toFixed(2)),
    coachQueryMs: Number(averages.queryMs.toFixed(2)),
    coachReadyMs: Number(averages.readyMs.toFixed(2)),
    trainingTransactionMs: Number(firstTraining.timings.wallMs.toFixed(2)),
    practiceLaunchMs: Number(launchWallMs.toFixed(2)),
  };

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL â€” ${failure}`));
    assert.fail(`Fase 15.5.1 critical training center falhou: ${failures.length}/${gates}`);
  }
  console.log(`Phase15.5.1 Critical Training Center: PASS (${gates} gates; 20 cold starts)`);
  console.log(JSON.stringify(metrics));
} finally {
  Math.random = originalRandom;
  await server.close();
}
