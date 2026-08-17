// Fase 11 — Integridade de escrita (docs/RANKING_INTEGRITY_PHASE11.md,
// achados P1 da Fase 10: docs/BETA_READINESS_PHASE10.md §6).
//
// Dois riscos de escrita não-atômica documentados na Fase 10:
//   A) advanceDay() persiste data/calendário/recompensas ANTES do estágio de
//      treino automático rodar — uma exceção ali podia deixar o dia "meio
//      aplicado".
//   B) executeTraining() cria TrainingSession e SÓ DEPOIS atualizava
//      PlayerProfile — uma falha entre as duas escritas deixava uma sessão
//      órfã (que por si só bloqueia reaplicar o treino daquele dia) sem que
//      os ganhos tivessem sido aplicados.
//
// Este teste usa fault injection real (monkey-patch dos métodos singleton que
// TODA escrita de entidade realmente atravessa — CareerEntityRepository.
// prototype.create/update e PlayerAdapter.update; localGame.entities.<Nome>
// devolve um adaptador NOVO a cada acesso via Proxy, então sobrescrever esse
// objeto retornado não intercepta nada) contra o pipeline de produção
// (GameStorage -> CareerRepository -> CareerManager -> advanceCareerDay
// reais), não um mock do motor de carreira.
//
// Contagem por instrumentação (não por comparar o tamanho do array de
// entidades antes/depois): a carreira nova já semeia dados padrão
// (CalendarEvent, TrainingSession, AthleteProfile) cujo timing de
// materialização não é o objeto deste teste — contar quantas vezes a escrita
// realmente foi CHAMADA é o sinal direto e inequívoco do que importa aqui.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(relativePath, content) { files.set(relativePath, String(content)); },
    async readText(relativePath) {
      if (!files.has(relativePath)) {
        const error = new Error('O arquivo não existe no armazenamento local.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(relativePath);
    },
    async exists(relativePath) { return files.has(relativePath); },
    async remove(relativePath) { return files.delete(relativePath); },
    async copy(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); return destinationPath; },
    async rename(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); files.delete(sourcePath); return destinationPath; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { executeTraining } = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { CareerEntityRepository } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { PlayerAdapter } = await server.ssrLoadModule('/src/gameplay/adapters/PlayerAdapter.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  // Instrumentação sempre ativa: conta chamadas reais de escrita por tipo de
  // entidade, sem alterar o comportamento (a menos que uma falha tenha sido
  // armada para essa entidade/chamada específica).
  let entityCreateCalls;
  const originalRepositoryCreate = CareerEntityRepository.prototype.create;
  let armedCreateFailure = null; // { entityName, message } | null
  CareerEntityRepository.prototype.create = async function instrumented(name, data) {
    entityCreateCalls[name] = (entityCreateCalls[name] || 0) + 1;
    if (armedCreateFailure && armedCreateFailure.entityName === name) throw new Error(armedCreateFailure.message);
    return originalRepositoryCreate.call(this, name, data);
  };

  let playerProfileUpdateCalls;
  const originalPlayerUpdate = PlayerAdapter.update;
  let armedPlayerUpdateFailure = null; // message | null
  PlayerAdapter.update = async function instrumented(id, updates) {
    playerProfileUpdateCalls += 1;
    if (armedPlayerUpdateFailure) throw new Error(armedPlayerUpdateFailure);
    return originalPlayerUpdate.call(this, id, updates);
  };

  function resetCounters() { entityCreateCalls = {}; playerProfileUpdateCalls = 0; }

  async function freshCareerWithPlayer(overrides = {}) {
    resetCounters();
    const { career } = await careerManager.createCareer({ career_name: 'Atomicity Phase11' });
    activeCareerAdapter.setActiveCareer(career);
    const id = `${career.career_id}-player`;
    await activeCareerAdapter.createPlayerProfile({
      id, sport_name: 'Jogador Atomicidade', career_date: '2026-01-05', birth_date: '2000-01-01',
      energy: 80, fatigue: 20, coins: 1000, xp: 0, morale: 70, form: 55,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
      serve: 40, forehand: 40, backhand: 40, volley: 40, bandeja: 40, smash: 40, defense: 40, agility: 40, strategy: 40, emotional_control: 40,
      ...overrides,
    });
    const profile = await localGame.entities.PlayerProfile.get(id);
    resetCounters();
    return { career, careerId: career.career_id, profile };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RISCO A — advanceDay(): dia "meio aplicado" se o estágio de treino falha
  // depois que data/calendário/recuperação já persistiram.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Risco A: advanceDay() com falha no estágio de treino ---');
  {
    const { careerId, profile } = await freshCareerWithPlayer();
    // Evento planejado de treino automático para o PRÓXIMO dia — é isso que
    // faz advanceDay() invocar executeTraining() dentro do estágio 'training'.
    await localGame.entities.CalendarEvent.create({
      profile_id: profile.id, title: 'Treino planejado', event_type: 'training',
      status: 'scheduled', start_date: '2026-01-06', end_date: '2026-01-06',
      metadata: { planner_created: true, planned_activity_kind: 'training', training_activity_id: 'court-groundstrokes', training_intensity_id: 'moderado' },
    });

    const beforeSnapshot = await careerManager.readCareer(careerId);
    const beforeDate = beforeSnapshot.player.career_date;
    const beforeEnergy = beforeSnapshot.player.energy;
    const beforeTrainingsToday = beforeSnapshot.player.trainings_today;

    // Fault injection: força a criação de TrainingSession (chamada de dentro
    // do estágio de treino, depois que data/calendário/recuperação já foram
    // persistidos via PlayerProfile.update em advanceDay) a explodir.
    resetCounters();
    armedCreateFailure = { entityName: 'TrainingSession', message: '[fault-injection] TrainingSession.create falhou de propósito' };
    let threw = false;
    try {
      await advanceCareerDay(profile);
    } catch (error) {
      threw = true;
      gate('advanceCareerDay propaga a exceção do estágio de treino (não a engole silenciosamente)', /fault-injection/.test(error.message));
    } finally {
      armedCreateFailure = null;
    }
    gate('advanceCareerDay realmente lançou com a falha injetada', threw);
    gate('a falha foi injetada exatamente na tentativa de criar a TrainingSession (comprova o ponto exato do risco A)', entityCreateCalls.TrainingSession === 1);

    const afterFailure = await careerManager.readCareer(careerId);
    gate('rollback: career_date volta ao valor de antes do advance (dia não fica "meio aplicado")', afterFailure.player.career_date === beforeDate);
    gate('rollback: energy volta ao valor de antes do advance', afterFailure.player.energy === beforeEnergy);
    gate('rollback: trainings_today volta ao valor de antes do advance', afterFailure.player.trainings_today === beforeTrainingsToday);
    const plantedEventAfterFailure = (afterFailure.entities?.CalendarEvent || []).find((e) => e.metadata?.training_activity_id === 'court-groundstrokes');
    gate('rollback: o CalendarEvent planejado continua "scheduled" (não foi consumido por um dia que não completou)', plantedEventAfterFailure?.status === 'scheduled');

    // Retry limpo: sem a falha injetada, o mesmo avanço deve funcionar
    // normalmente — e o treino deve ser aplicado exatamente UMA vez.
    resetCounters();
    const recoveredProfile = await localGame.entities.PlayerProfile.get(profile.id);
    const retried = await advanceCareerDay(recoveredProfile);
    gate('retry sem a falha injetada avança o dia normalmente depois do rollback', retried.career_date === '2026-01-06');
    gate('retry aplica o treino planejado exatamente uma vez (uma nova TrainingSession)', entityCreateCalls.TrainingSession === 1);
    gate('retry: trainings_today reflete exatamente uma sessão aplicada', retried.trainings_today === beforeTrainingsToday + 1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RISCO B — executeTraining(): TrainingSession órfã sem os ganhos aplicados
  // se a escrita do PlayerProfile falhar depois da sessão já ter sido criada.
  // Fixado invertendo a ordem: PlayerProfile.update primeiro.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Risco B: executeTraining() com falha entre as duas escritas ---');
  {
    const { profile } = await freshCareerWithPlayer();
    const fullActivity = (await server.ssrLoadModule('/src/lib/trainingSystemV2.js')).TRAINING_ACTIVITIES.find((item) => item.id === 'court-groundstrokes');

    // Cenário B1: PlayerProfile.update falha (agora é a PRIMEIRA escrita).
    // Nada deve persistir — nem sessão órfã, nem ganho parcial.
    resetCounters();
    armedPlayerUpdateFailure = '[fault-injection] PlayerProfile.update falhou de propósito';
    let b1Threw = false;
    try {
      await executeTraining(profile, fullActivity, 'moderado');
    } catch (error) {
      b1Threw = true;
    } finally {
      armedPlayerUpdateFailure = null;
    }
    gate('B1: executeTraining propaga a falha do PlayerProfile.update', b1Threw);
    gate('B1: PlayerProfile.update foi a PRIMEIRA escrita tentada (antes da TrainingSession)', playerProfileUpdateCalls === 1 && !entityCreateCalls.TrainingSession);
    gate('B1: nenhuma TrainingSession órfã foi criada (a escrita que define o estado vem primeiro)', !entityCreateCalls.TrainingSession);
    const profileAfterB1 = await localGame.entities.PlayerProfile.get(profile.id);
    gate('B1: trainings_today não mudou (nenhum ganho parcial aplicado)', profileAfterB1.trainings_today === 0);

    // Cenário B2: TrainingSession.create falha (agora é a SEGUNDA escrita,
    // só o registro de auditoria). Os ganhos já devem estar aplicados.
    resetCounters();
    armedCreateFailure = { entityName: 'TrainingSession', message: '[fault-injection] TrainingSession.create falhou de propósito' };
    let b2Threw = false;
    try {
      await executeTraining(profileAfterB1, fullActivity, 'moderado');
    } catch (error) {
      b2Threw = true;
    } finally {
      armedCreateFailure = null;
    }
    gate('B2: executeTraining propaga a falha do TrainingSession.create', b2Threw);
    gate('B2: PlayerProfile.update JÁ tinha sido chamado com sucesso quando a auditoria falhou', playerProfileUpdateCalls === 1);
    const profileAfterB2 = await localGame.entities.PlayerProfile.get(profile.id);
    gate('B2: os ganhos JÁ foram aplicados ao perfil mesmo com o registro de auditoria falhando (degradação mínima, não perda de progresso)', profileAfterB2.trainings_today === 1);

    // Cenário B3 (caminho feliz): sem falhas, os dois escrevem normalmente.
    resetCounters();
    const result = await executeTraining(profileAfterB2, fullActivity, 'moderado');
    gate('B3: caminho feliz continua funcionando (sem regressão de comportamento)', !result.error && result.profile.trainings_today === 2);
    gate('B3: exatamente uma escrita de cada tipo no caminho feliz', playerProfileUpdateCalls === 1 && entityCreateCalls.TrainingSession === 1);
  }

  CareerEntityRepository.prototype.create = originalRepositoryCreate;
  PlayerAdapter.update = originalPlayerUpdate;
} finally {
  await server.close();
}

console.log(`\ntest:career-atomicity OK — ${gates} gates (fault injection real nos dois riscos P1 da Fase 10).`);
