import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const catalog = await server.ssrLoadModule('/src/lib/trainingCatalog.js');
  const training = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const migration = await server.ssrLoadModule('/src/careers/CareerMigration.js');
  const schema = await server.ssrLoadModule('/src/careers/careerSchema.js');
  const audit = catalog.validateTrainingCatalog();
  assert.equal(audit.valid, true, audit.errors.join('\n'));
  assert.equal(catalog.TRAINING_FOCUSES.length, 15);
  assert.equal(new Set(catalog.TRAINING_FOCUSES.map(item => item.id)).size, 15);
  assert.equal(catalog.getTrainingFocus('forehand_drill').id, 'court-groundstrokes');

  const player = { id: 'p1', sport_name: 'Teste', career_date: '2026-08-03', birth_date: '2004-01-01', energy: 80, fatigue: 10, potential: 70, forehand: 25, backhand: 20, volley: 25, bandeja: 25, smash: 25, defense: 25, serve: 25, agility: 25, strategy: 25, emotional_control: 25, play_style: 'controle' };
  const ground = catalog.getTrainingFocus('court-groundstrokes');
  const net = catalog.getTrainingFocus('court-net-control');
  const normal = training.previewTraining(player, ground, 'moderado', 0);
  const intense = training.previewTraining(player, ground, 'intenso', 0);
  assert(normal.gains.forehand > 0 && normal.gains.backhand > 0);
  assert(Object.keys(training.previewTraining(player, net).gains).every(key => ['volley', 'bandeja', 'strategy', 'agility'].includes(key)));
  assert(intense.energyCost > normal.energyCost && intense.budget > normal.budget && intense.fatigueCost > normal.fatigueCost);
  assert(training.previewTraining(player, ground, 'moderado', 3).budget < normal.budget);
  assert(training.previewTraining({ ...player, forehand: 85, backhand: 85 }, ground).budget < normal.budget);
  assert.equal(training.previewTraining({ ...player, energy: 5 }, ground).energyAfter, 0);
  assert.equal(training.chooseBotTraining({ ...player, energy: 40 }, { nextTournamentDays: 1 }).intensity, 'leve');

  const oldCareer = { save_schema_version: 11, career_id: 'old', name: 'Old', created_at: '2026-01-01', updated_at: '2026-01-01', metadata: {}, player: { ...player, weekly_training_plan: { seg: { activity_id: 'forehand_drill', intensity: 'moderado' } } }, world: {}, calendar: {}, ranking: {}, market: {}, tournaments: {}, training: {}, economy: {}, inventory: {}, statistics: {}, history: {}, entities: { TrainingSession: [{ id: 's1', profile_id: 'p1', training_type: 'smash_drill', attribute_gain: 2 }], CalendarEvent: [{ id: 'e1', metadata: { training_activity_id: 'meditation' } }] } };
  const once = migration.migrateCareer(oldCareer).data;
  const twice = migration.migrateCareer(once).data;
  assert.equal(once.save_schema_version, schema.CAREER_SAVE_SCHEMA_VERSION);
  assert.equal(once.entities.TrainingSession[0].training_type, 'court-finishing');
  assert.equal(once.player.weekly_training_plan.seg.activity_id, 'court-groundstrokes');
  assert.deepEqual(twice, once);
  assert.equal(once.player.forehand, player.forehand);

  const scenarios = [];
  const soloTrainings = catalog.TRAINING_FOCUSES.filter(item => !item.requiresPartner);
  for (const level of [20, 50, 80]) for (const plan of ['balanced', 'repeated']) {
    let simulated = { ...player, forehand: level, backhand: level, fatigue: 10, energy: 100 };
    let total = 0; let energy = 0;
    for (let week = 0; week < 12; week += 1) for (let session = 0; session < 3; session += 1) {
      const selected = plan === 'repeated' ? ground : soloTrainings[(week * 3 + session) % soloTrainings.length];
      const preview = training.previewTraining(simulated, selected, session === 2 ? 'leve' : 'moderado', plan === 'repeated' ? session : 0);
      total += preview.budget; energy += preview.energyCost;
      simulated = { ...simulated, energy: Math.min(100, preview.energyAfter + 12), fatigue: Math.max(0, simulated.fatigue + preview.fatigueCost - 12) };
    }
    scenarios.push({ level, plan, progress: Number(total.toFixed(2)), energy });
  }
  assert(scenarios.find(x => x.level === 80 && x.plan === 'balanced').progress < scenarios.find(x => x.level === 20 && x.plan === 'balanced').progress);
  assert(scenarios.find(x => x.level === 20 && x.plan === 'repeated').progress < scenarios.find(x => x.level === 20 && x.plan === 'balanced').progress);
  console.log(JSON.stringify({ catalog: audit.count, groups: Object.keys(catalog.TRAINING_GROUPS).length, scenarios }, null, 2));
} finally { await server.close(); }
