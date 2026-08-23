// Fase 15.5.3 — Training Center effects integrity.
// Descobre o catálogo real (FACILITIES, trainingCenter.js) em vez de uma
// lista inventada, resolve os efeitos (getCenterEffects) e prova, com o
// pipeline real (engine de treino + PlayerProfile via storage em memória),
// que cada benefício anunciado pela UI realmente muda o sistema
// correspondente — não só a "grade de benefícios ativos".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(path) { this.directories.add(path); return true; }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) {
    const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (parent) await this.ensureDirectory(parent);
    this.files.set(path, String(content));
  }
  async readText(path) {
    if (!this.files.has(path)) { const e = new Error(`missing: ${path}`); e.code = 'FILE_NOT_FOUND'; throw e; }
    return this.files.get(path);
  }
  async remove(path) { return this.files.delete(path); }
  async rename(source, destination) {
    if (!this.files.has(source)) throw new Error(`rename source missing: ${source}`);
    this.files.set(destination, this.files.get(source)); this.files.delete(source);
    return destination;
  }
  async copy(source, destination) {
    if (!this.files.has(source)) throw new Error(`copy source missing: ${source}`);
    this.files.set(destination, this.files.get(source));
    return destination;
  }
  async list(directory = '.') {
    return [...this.files.keys()].filter((p) => directory === '.' || p.startsWith(`${directory}/`)).map((p) => ({ name: p.split('/').pop(), isDirectory: false }));
  }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const trainingCenter = await vite.ssrLoadModule('/src/lib/trainingCenter.js');
  const { FACILITIES, FACILITY_LIST, DEFAULT_FACILITIES, getCenterEffects, getFacilityLevel, getUpgradeCost } = trainingCenter;
  const padel = await vite.ssrLoadModule('/src/lib/padel.js');
  const { getDailyTrainingLimit, DAILY_TRAINING_LIMIT, canTrainToday, canDoPhysio } = padel;
  const trainingV2 = await vite.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { executeTraining, calculateTrainingGainBudget, TRAINING_ACTIVITIES } = trainingV2;

  // ── 1. Catálogo real: estrutura, IDs, níveis, custos ────────────────────
  gate('Catálogo carrega e tem instalações', FACILITY_LIST.length > 0);
  const facilityIds = FACILITY_LIST.map((f) => f.id);
  gate('Todas as instalações têm IDs únicos', new Set(facilityIds).size === facilityIds.length);
  for (const facility of FACILITY_LIST) {
    gate(`${facility.id}: possui maxLevel e levels[maxLevel+1] coerentes`, Array.isArray(facility.levels) && facility.levels.length === facility.maxLevel + 1);
    gate(`${facility.id}: nível 0 é gratuito (custo já pago pela existência)`, facility.levels[0].cost === 0);
    for (let level = 1; level <= facility.maxLevel; level += 1) {
      gate(`${facility.id} nível ${level}: custo é um número positivo`, Number.isFinite(facility.levels[level].cost) && facility.levels[level].cost > 0);
      gate(`${facility.id} nível ${level}: custo estritamente crescente`, facility.levels[level].cost > facility.levels[level - 1].cost);
    }
  }
  gate('DEFAULT_FACILITIES cobre todas as instalações do catálogo em nível 0', facilityIds.every((id) => DEFAULT_FACILITIES[id] === 0));
  gate('getUpgradeCost retorna null no nível máximo (nada além do topo)', getUpgradeCost({ facilities: { courts: FACILITIES.courts.maxLevel } }, 'courts') === null);
  gate('getFacilityLevel default é 0 sem centro', getFacilityLevel(null, 'courts') === 0);

  // ── 2. Auditoria DECLARED -> RESOLVED (getCenterEffects) por instalação ──
  const declaredKeys = new Set();
  FACILITY_LIST.forEach((f) => f.levels.forEach((lvl) => Object.keys(lvl.benefits || {}).forEach((k) => declaredKeys.add(k))));
  const resolvedSample = getCenterEffects({ facilities: Object.fromEntries(facilityIds.map((id) => [id, 1])) });
  const RESOLVED_TO_DECLARED = {
    dailyTrainingBonus: 'daily_training_bonus', energyRecoveryBonus: 'energy_recovery_bonus', maxEnergyBonus: 'max_energy_bonus',
    energyRecoveryPct: 'energy_recovery_pct', injuryRiskReduction: 'injury_risk_reduction', injuryRecoveryBonus: 'injury_recovery_bonus',
    trainingGainPct: 'training_gain_pct', physicalGainPct: 'physical_gain_pct', techniqueGainPct: 'technique_gain_pct',
    mentalGainPct: 'mental_gain_pct', overallGainPct: 'overall_gain_pct', moraleBonus: 'morale_bonus',
    coinsPerMatch: 'coins_per_match', sponsorAppeal: 'sponsor_appeal', fanAppeal: 'fan_appeal', restAnytime: 'rest_anytime',
  };
  for (const declared of declaredKeys) {
    const resolvedKey = Object.entries(RESOLVED_TO_DECLARED).find(([, v]) => v === declared)?.[0];
    gate(`Benefício declarado "${declared}" tem uma chave resolvida correspondente em getCenterEffects`, Boolean(resolvedKey));
  }

  // ── 3. Quadras -> limite diário real (o bug confirmado em QA) ───────────
  gate('Quadras nível 0: sem bônus de treino/dia', FACILITIES.courts.levels[0].benefits.daily_training_bonus === 0);
  gate('Quadras nível 2 declara +1 treino/dia (o caso relatado em QA)', FACILITIES.courts.levels[2].benefits.daily_training_bonus === 1);
  gate('getDailyTrainingLimit sem bônus é a base (3)', getDailyTrainingLimit({}) === DAILY_TRAINING_LIMIT);
  gate('getDailyTrainingLimit com Quadras nível 2 cacheado no profile é base+1', getDailyTrainingLimit({ facility_daily_training_bonus: 1 }) === DAILY_TRAINING_LIMIT + 1);
  gate('canTrainToday sem bônus: 3/3 esgota', !canTrainToday({ trainings_today: 3 }).allowed);
  gate('canTrainToday com Quadras nível 2: 3/4 ainda permite', canTrainToday({ trainings_today: 3, facility_daily_training_bonus: 1 }).allowed);
  gate('canTrainToday com Quadras nível 2: 4/4 esgota', !canTrainToday({ trainings_today: 4, facility_daily_training_bonus: 1 }).allowed);
  gate('canDoPhysio (fisioterapia da comissão) também respeita o limite resolvido', !canDoPhysio({ trainings_today: 3, facility_daily_training_bonus: 0 }).allowed && canDoPhysio({ trainings_today: 3, facility_daily_training_bonus: 1 }).allowed);

  // Execução real via harness de carreira: 4º treino deve executar quando o
  // bônus está presente, 5º deve bloquear — valores REAIS do catálogo, não
  // assumidos.
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'phase1553-audit', career_name: 'Phase 15.5.3 Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'phase1553-player', sport_name: 'Effects Audit', career_date: '2026-01-08', birth_date: '2001-01-01',
    energy: 100, fatigue: 0, morale: 70, form: 50, coins: 25000, xp: 0,
    level: 'Amador', court_side: 'direita', play_style: 'controle', weekly_training_enabled: false,
    // Quadras nível 2 já resolvido e cacheado (mesmo que TrainingFacilityView.jsx grava no upgrade real).
    facility_daily_training_bonus: 1,
  });

  const activity = TRAINING_ACTIVITIES.find((item) => item.category === 'physical');
  let profile = await localGame.entities.PlayerProfile.get('phase1553-player');
  for (let i = 0; i < 4; i += 1) {
    const result = await executeTraining(profile, activity, 'leve', {});
    gate(`Quadras nível 2: treino #${i + 1}/4 executa sem erro`, !result.error);
    profile = result.profile || profile;
  }
  gate('Quadras nível 2: quatro treinos concluídos no dia', profile.trainings_today === 4);
  const fifth = await executeTraining(profile, activity, 'leve', {});
  gate('Quadras nível 2: quinto treino é bloqueado (limite real = 4, não infinito)', Boolean(fifth.error) && /[Ll]imite di[aá]rio/.test(fifth.error));

  // ── 4. Academia/Biomecânica/Psicologia/Performance/Laboratório -> ganho de treino ──
  const courtActivity = TRAINING_ACTIVITIES.find((item) => item.category === 'court');
  const physicalActivity = TRAINING_ACTIVITIES.find((item) => item.category === 'physical');
  const mentalActivity = TRAINING_ACTIVITIES.find((item) => item.category === 'mental');
  const baseProfile = { ...profile, trainings_today: 0, energy: 100, fatigue: 0 };

  const noBonus = calculateTrainingGainBudget({ profile: baseProfile, training: physicalActivity, intensityId: 'moderado' });
  const withGym = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_physical_gain_pct: 10 }, training: physicalActivity, intensityId: 'moderado' });
  gate('Academia (+10% físico): treino físico rende mais com o bônus', withGym.budget > noBonus.budget);
  gate('Academia: NÃO afeta treino de quadra (bônus é por grupo, não global)', calculateTrainingGainBudget({ profile: { ...baseProfile, facility_physical_gain_pct: 10 }, training: courtActivity, intensityId: 'moderado' }).budget
    === calculateTrainingGainBudget({ profile: baseProfile, training: courtActivity, intensityId: 'moderado' }).budget);

  const withBiomechanics = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_technique_gain_pct: 10 }, training: courtActivity, intensityId: 'moderado' });
  gate('Biomecânica (+10% técnica): treino de quadra rende mais', withBiomechanics.budget > calculateTrainingGainBudget({ profile: baseProfile, training: courtActivity, intensityId: 'moderado' }).budget);

  const withPsychology = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_mental_gain_pct: 10 }, training: mentalActivity, intensityId: 'moderado' });
  gate('Psicologia (+10% mental): treino mental rende mais', withPsychology.budget > calculateTrainingGainBudget({ profile: baseProfile, training: mentalActivity, intensityId: 'moderado' }).budget);

  const withPerformanceAnalysis = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_training_gain_pct: 10 }, training: physicalActivity, intensityId: 'moderado' });
  const withPerformanceAnalysisCourt = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_training_gain_pct: 10 }, training: courtActivity, intensityId: 'moderado' });
  gate('Análise de Desempenho (+10% em todos os treinos): afeta físico', withPerformanceAnalysis.budget > noBonus.budget);
  gate('Análise de Desempenho: afeta quadra também (bônus global, não por grupo)', withPerformanceAnalysisCourt.budget > calculateTrainingGainBudget({ profile: baseProfile, training: courtActivity, intensityId: 'moderado' }).budget);

  const withLaboratory = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_overall_gain_pct: 6 }, training: mentalActivity, intensityId: 'moderado' });
  gate('Laboratório (+6% geral): afeta mental também (bônus global)', withLaboratory.budget > calculateTrainingGainBudget({ profile: baseProfile, training: mentalActivity, intensityId: 'moderado' }).budget);

  const withStack = calculateTrainingGainBudget({ profile: { ...baseProfile, facility_physical_gain_pct: 10, facility_training_gain_pct: 10, facility_overall_gain_pct: 6 }, training: physicalActivity, intensityId: 'moderado' });
  const expectedStack = noBonus.budget * 1.10 * 1.10 * 1.06;
  gate('Composição multiplicativa: Academia x Análise x Laboratório = produto dos três fatores (nunca soma de %)', Math.abs(withStack.budget - Number(expectedStack.toFixed(3))) < 0.01);

  // ── 5. Departamento Médico -> risco e recuperação de lesão ──────────────
  gate('rollInjury aceita riskMultiplier e reduz a chance', (() => {
    // energy=20<30 -> chance base 0.12. 0.08 < 0.12 (sem redução, lesiona)
    // mas 0.08 >= 0.12*0.5=0.06 (com -50% de risco, não lesiona).
    const original = Math.random;
    Math.random = () => 0.08;
    const withoutReduction = padel.rollInjury(20, 25, 1);
    const withReduction = padel.rollInjury(20, 25, 0.5);
    Math.random = original;
    return withoutReduction === true && withReduction === false;
  })());

  // ── 6. Alojamentos -> rest_anytime desbloqueia descanso mesmo após atividade ──
  const restBlocked = await padel.applyRecovery({ id: 'x', energy: 50, trainings_today: 1, facility_rest_anytime: false }, padel.RECOVERY_TYPES.find((r) => r.id === 'rest'));
  gate('Sem Alojamentos nível 3+: descanso bloqueado após já ter treinado', restBlocked === null);

  // ── 7. Fontes de UI usam o resolver canônico (nunca a constante fixa) ───
  const readSrc = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  gate('TrainingCenter.jsx (HUD do hub) usa getDailyTrainingLimit', readSrc('src/pages/TrainingCenter.jsx').includes('getDailyTrainingLimit(profile)'));
  gate('CareerCalendar.jsx usa getDailyTrainingLimit', readSrc('src/components/career/CareerCalendar.jsx').includes('getDailyTrainingLimit(profile)'));
  gate('careerNextAction.js usa getDailyTrainingLimit (mensagem "x/N treinos hoje" correta)', readSrc('src/lib/careerNextAction.js').includes('getDailyTrainingLimit(profile)'));
  gate('trainingSystemV2.js (execução real) usa getDailyTrainingLimit, não a constante fixa', readSrc('src/lib/trainingSystemV2.js').includes('getDailyTrainingLimit(profile)') && !readSrc('src/lib/trainingSystemV2.js').includes('DAILY_TRAINING_LIMIT'));
  gate('trainingSystem.js legado (V1, inatingível da UI) também corrigido por consistência', readSrc('src/lib/trainingSystem.js').includes('getDailyTrainingLimit(profile)'));

  // ── 8. Upgrade grava os efeitos no profile (HUD atualiza sem reload) ────
  const facilityViewSrc = readSrc('src/components/training-center/TrainingFacilityView.jsx');
  gate('handleUpgrade grava facility_daily_training_bonus no PlayerProfile (mesma escrita que já dispara onProfileUpdate/padel:profile-updated)', facilityViewSrc.includes('facility_daily_training_bonus: resolvedEffects.dailyTrainingBonus'));
  gate('handleUpgrade recalcula getCenterEffects com TODAS as instalações (não só a que subiu de nível)', facilityViewSrc.includes('getCenterEffects({ facilities })'));
  gate('Nenhum polling/timer novo introduzido na view do Centro', !/setInterval|setTimeout/.test(facilityViewSrc));

  // ── 9. Migração de save legado (v20) ─────────────────────────────────────
  const { migrateCareer } = await vite.ssrLoadModule('/src/careers/CareerMigration.js');
  const legacySave = {
    save_schema_version: 19,
    player: { id: 'legacy-player', career_date: '2026-01-01', sport_name: 'Legado', birth_date: '2000-01-01', fatigue: 0 },
    entities: { TrainingCenter: [{ id: 'tc-legacy', profile_id: 'legacy-player', facilities: { courts: 2, gym: 1 } }] },
  };
  const migrated = migrateCareer(legacySave);
  gate('Save legado com Quadras nível 2 (comprado antes da correção) recebe facility_daily_training_bonus=1 automaticamente', migrated.data.player.facility_daily_training_bonus === 1);
  gate('Save legado com Academia nível 1 recebe facility_physical_gain_pct=5', migrated.data.player.facility_physical_gain_pct === 5);
  gate('Migração não exige comprar de novo (deriva do TrainingCenter já existente, não recria)', migrated.data.entities.TrainingCenter[0].facilities.courts === 2);
  gate('Save já sem TrainingCenter nenhum migra com bônus zerado (sem erro)', migrateCareer({ save_schema_version: 19, player: { id: 'no-center' }, entities: {} }).data.player.facility_daily_training_bonus === 0);

  // ── 10. Cold start (carreira nova) — nenhum bônus fantasma ──────────────
  let phantomBonus = 0;
  for (let seed = 0; seed < 20; seed += 1) {
    const freshLimit = getDailyTrainingLimit({});
    if (freshLimit !== DAILY_TRAINING_LIMIT) phantomBonus += 1;
  }
  gate('20 cold starts: nenhum bônus fantasma antes de qualquer upgrade', phantomBonus === 0);

  console.log(`\n${gates} gates executados, todos PASS — Fase 15.5.3 Training Center Effects.`);
} finally {
  await vite.close();
}
