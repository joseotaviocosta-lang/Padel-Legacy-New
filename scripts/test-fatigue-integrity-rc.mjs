import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

function assertCanonical(value, label) {
  assert.equal(Number.isFinite(value), true, `${label}: fadiga deve ser finita`);
  assert.equal(Number.isInteger(value), true, `${label}: fadiga deve ser inteira`);
  assert(value >= 0 && value <= 100, `${label}: fadiga deve ficar entre 0 e 100`);
}

try {
  const physical = await server.ssrLoadModule('/src/game-core/physicalStats.js');
  const training = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const catalog = await server.ssrLoadModule('/src/lib/trainingCatalog.js');
  const condition = await server.ssrLoadModule('/src/game-core/condition.js');
  const tournamentPhysical = await server.ssrLoadModule('/src/gameplay/worldTour/PhysicalConditionManager.js');
  const medical = await server.ssrLoadModule('/src/gameplay/worldTour/MedicalCenterManager.js');
  const migration = await server.ssrLoadModule('/src/careers/CareerMigration.js');
  const defaults = await server.ssrLoadModule('/src/careers/careerDefaults.js');
  const validator = await server.ssrLoadModule('/src/careers/CareerValidator.js');
  const adapterModule = await server.ssrLoadModule('/src/gameplay/adapters/ActiveCareerAdapter.js');
  const repositoryModule = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');

  const { normalizeFatigue } = physical;
  assert.equal(normalizeFatigue(6.200000000000001), 6);
  assert.equal(normalizeFatigue(-10), 0);
  assert.equal(normalizeFatigue(110), 100);
  assert.equal(normalizeFatigue(Number.NaN), 0);
  assert.equal(normalizeFatigue(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeFatigue(Symbol('invalid')), 0);

  const baseProfile = {
    id: 'fatigue-test-player', career_date: '2026-08-11', birth_date: '2002-01-01',
    career_difficulty: 'normal', energy: 100, fatigue: 0, potential: 72,
    forehand: 40, backhand: 40, volley: 40, bandeja: 40, smash: 40,
    defense: 40, serve: 40, agility: 40, strategy: 40, emotional_control: 40,
    play_style: 'controle', condition: 70, coins: 10000,
  };
  const activity = catalog.getTrainingFocus('court-groundstrokes');
  const firstTraining = training.previewTraining(baseProfile, activity, 'moderado', 0);
  assert.equal(firstTraining.fatigueCost, 6, 'multiplicador decimal de dificuldade deve produzir custo canônico');

  const cycle = [
    normalizeFatigue(firstTraining.fatigueCost),
  ];
  cycle.push(normalizeFatigue(cycle.at(-1) - 4));
  const secondTraining = training.previewTraining({ ...baseProfile, fatigue: cycle.at(-1) }, activity, 'leve', 1);
  cycle.push(normalizeFatigue(cycle.at(-1) + secondTraining.fatigueCost));
  cycle.push(normalizeFatigue(cycle.at(-1) - 10));
  cycle.forEach((value, index) => assertCanonical(value, `ciclo treino/avanço/treino/descanso ${index + 1}`));

  const practiceCondition = condition.calculatePostMatchCondition(
    { ...baseProfile, fatigue: 6.200000000000001 },
    true,
    { energyCost: 10, fatigueGain: 7, chemistryWin: 2, chemistryLoss: -1 },
  );
  assertCanonical(practiceCondition.fatigue, 'partida de treino');

  const tournament = { id: 't1', name: 'Teste', region: 'Brasil' };
  const tournamentResult = tournamentPhysical.buildPhysicalPatch({
    profile: { ...baseProfile, fatigue: 6.200000000000001, current_region: 'Brasil' },
    tournament, roundLabel: 'Quartas de final', won: true, matchesThisWeek: 1, date: '2026-08-11',
  });
  assertCanonical(tournamentResult.patch.fatigue, 'partida de torneio');

  const treatment = medical.buildTreatmentPatch(
    { ...baseProfile, fatigue: 14.799999999999997, last_medical_treatment_date: null },
    'basic_physio',
  );
  assertCanonical(treatment.fatigue, 'tratamento médico');

  const legacy = defaults.createDefaultCareerData({ saveName: 'Legacy decimal', playerName: 'Teste' });
  legacy.player = { ...baseProfile, fatigue: 6.200000000000001 };
  legacy.entities.AthleteProfile = [{ id: 'legacy-athlete', fatigue: 14.799999999999997 }];
  const repaired = migration.migrateCareer(legacy);
  assert.equal(repaired.migrated, true, 'save decimal deve ser marcado para uma única gravação reparadora');
  assert.equal(repaired.data.player.fatigue, 6);
  assert.equal(repaired.data.entities.AthleteProfile[0].fatigue, 15);
  const validated = validator.validateCareerData(repaired.data);
  const reloaded = validator.validateCareerData(JSON.parse(JSON.stringify(validated)));
  assert.equal(reloaded.player.fatigue, 6, 'save/reload deve preservar o inteiro');
  assert.equal(migration.migrateCareer(reloaded).migrated, false, 'reload canônico não deve provocar nova gravação');

  const minimalCareer = { ...reloaded, player: { ...reloaded.player, id: baseProfile.id, fatigue: 0 } };
  const fakeManager = {
    async saveCareer(_id, career) { return career; },
    async getLastCareer() { return minimalCareer.career_id; },
  };
  const activeAdapter = new adapterModule.ActiveCareerAdapter(fakeManager);
  activeAdapter.setActiveCareer(minimalCareer);
  const updatedPlayer = await activeAdapter.updatePlayerProfile(baseProfile.id, { fatigue: 14.799999999999997 });
  assert.equal(updatedPlayer.fatigue, 15, 'fronteira PlayerProfile.update deve normalizar');

  let batchCareer = structuredClone(minimalCareer);
  const fakeRepository = {
    async mutateActiveCareer(mutator) {
      const result = await mutator(batchCareer);
      return { result, career: batchCareer };
    },
    async ensureActiveCareer() { return batchCareer; },
  };
  const entityRepository = new repositoryModule.CareerEntityRepository(fakeRepository);
  const batch = await entityRepository.batch([{ type: 'playerUpdate', id: baseProfile.id, data: { fatigue: 6.200000000000001 } }]);
  assert.equal(batch.player.fatigue, 6, 'fronteira batch de finalização deve normalizar');

  const trainingPage = fs.readFileSync('src/pages/Training.jsx', 'utf8');
  assert.match(trainingPage, /Fadiga: \$\{normalizeFatigue\(updated\.fatigue\)\}\/100/, 'toast deve usar valor canônico');
  assert.match(trainingPage, /value=\{`\$\{normalizeFatigue\(profile\.fatigue\)\}%`\}/, 'card Training deve usar valor canônico');

  const dataStore = fs.readFileSync('src/local/careerDataStore.js', 'utf8');
  const saveFoundation = fs.readFileSync('src/lib/saveFoundation.js', 'utf8');
  assert(dataStore.includes("careerExists(career.career_id)"), 'checkpoint deve verificar o primeiro save');
  assert(dataStore.includes("skipped: true, reason: 'first-save-not-persisted'"), 'primeiro backup deve ser ignorado sem erro');
  assert(saveFoundation.includes('if (checkpoint?.skipped) return null'), 'foundation não deve exportar backup inexistente');

  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(app.includes('v7_startTransition: true') && app.includes('v7_relativeSplatPath: true'), 'future flags do React Router devem estar habilitadas');

  console.log(JSON.stringify({
    ok: true,
    normalizedExamples: [6, 0, 100, 0],
    cycle,
    saveReloadFatigue: reloaded.player.fatigue,
    updateBoundaryFatigue: updatedPlayer.fatigue,
    batchBoundaryFatigue: batch.player.fatigue,
    firstSaveBackupSkippedSafely: true,
  }, null, 2));
} finally {
  await server.close();
}
