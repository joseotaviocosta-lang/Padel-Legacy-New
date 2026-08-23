// Fase 15.5.3 — gera reports/training-center-effect-matrix.json a partir do
// catálogo real (trainingCenter.js, storeCatalog.js), não de uma lista
// escrita à mão. Rodar novamente sempre que um novo benefício for conectado.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { FACILITY_LIST, getCenterEffects } = await vite.ssrLoadModule('/src/lib/trainingCenter.js');
  const { ATTRIBUTE_KEYS } = await vite.ssrLoadModule('/src/lib/attributes.js');
  const { ensureExpandedShopCatalog, getExpandedCatalogSummary } = await vite.ssrLoadModule('/src/lib/storeCatalog.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  class MemoryStorage {
    constructor() { this.files = new Map(); this.directories = new Set(); }
    isSupported() { return true; }
    async initialize() {}
    getDataDirectoryDescription() { return 'memory'; }
    async ensureDirectory(p) { this.directories.add(p); return true; }
    async exists(p) { return this.files.has(p) || this.directories.has(p); }
    async writeText(p, c) { this.files.set(p, String(c)); }
    async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
    async remove(p) { return this.files.delete(p); }
    async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
    async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
    async list(dir = '.') { return [...this.files.keys()].filter((p) => dir === '.' || p.startsWith(`${dir}/`)).map((p) => ({ name: p.split('/').pop(), isDirectory: false })); }
    async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
  }
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'matrix-gen', career_name: 'Matrix Gen' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'matrix-player', sport_name: 'Matrix', career_date: '2026-01-01', birth_date: '2001-01-01' });
  await ensureExpandedShopCatalog();
  const allItems = await localGame.entities.ShopItem.list('-created_date', 5000);

  const CONSUMER_BY_KEY = {
    dailyTrainingBonus: 'padel.js: getDailyTrainingLimit -> canTrainToday/canDoPhysio; trainingSystemV2.js: executeTrainingWork (limite real)',
    physicalGainPct: 'trainingSystemV2.js: calculateTrainingGainBudget (facilityGroupMultiplier, grupo physical)',
    techniqueGainPct: 'trainingSystemV2.js: calculateTrainingGainBudget (facilityGroupMultiplier, grupo court)',
    mentalGainPct: 'trainingSystemV2.js: calculateTrainingGainBudget (facilityGroupMultiplier, grupo mental)',
    trainingGainPct: 'trainingSystemV2.js: calculateTrainingGainBudget (facilityGlobalMultiplier, todos os grupos)',
    overallGainPct: 'trainingSystemV2.js: calculateTrainingGainBudget (facilityGlobalMultiplier, todos os grupos)',
    energyRecoveryBonus: 'career.js: advanceDay (recovery aditivo diário)',
    energyRecoveryPct: 'career.js: advanceDay (multiplicador percentual sobre a recuperação diária)',
    injuryRiskReduction: 'trainingSystemV2.js: previewTraining (facilityInjuryMultiplier); padel.js: buildMatchRewardsPatch (rollInjury riskMultiplier)',
    injuryRecoveryBonus: 'trainingSystemV2.js: executeTrainingWork (recoveryDays); padel.js: buildMatchRewardsPatch (recoveryDays)',
    moraleBonus: 'career.js: advanceDay (moraleRecovery aditivo diário)',
    restAnytime: 'padel.js: applyRecovery (bypassa o bloqueio de descanso após atividade)',
    coinsPerMatch: 'padel.js: buildMatchRewardsPatch (coinsGain aditivo por partida)',
    maxEnergyBonus: null,
    sponsorAppeal: null,
    fanAppeal: null,
  };
  const STATUS_AFTER = {
    dailyTrainingBonus: 'A', physicalGainPct: 'A', techniqueGainPct: 'A', mentalGainPct: 'A', trainingGainPct: 'A', overallGainPct: 'A',
    energyRecoveryBonus: 'A', energyRecoveryPct: 'A', injuryRiskReduction: 'A', injuryRecoveryBonus: 'A', moraleBonus: 'A', restAnytime: 'A', coinsPerMatch: 'A',
    maxEnergyBonus: 'F', sponsorAppeal: 'F', fanAppeal: 'F',
  };
  const AMBIGUITY_NOTE = {
    maxEnergyBonus: 'Elevar o teto real de energia acima de 100 quebraria formatPercent()/todas as barras de energia da UI, que assumem escala 0-100 (MIN/MAX_FATIGUE). Requer auditar e ajustar cada exibição de energia antes de ativar — não implementado nesta fase para não introduzir uma regressão visual silenciosa.',
    sponsorAppeal: 'profile.fan_appeal/sponsor_appeal já existem e têm um modelo de deriva-para-baseline (athleteBehavior.js) e efeitos pontuais de entrevista (pressData.js). Um bônus fixo de instalação entraria em conflito com esse modelo (a deriva devolveria o valor à baseline com o tempo) — a semântica correta (piso permanente? recálculo do baseline? multiplicador?) é uma decisão de design fora do escopo deste hotfix.',
    fanAppeal: 'Mesmo caso de sponsorAppeal — mesma instalação (Área VIP), mesmo conflito com o modelo de deriva existente.',
  };

  const facilities = FACILITY_LIST.map((facility) => {
    const declaredKeys = new Set();
    facility.levels.forEach((lvl) => Object.keys(lvl.benefits || {}).forEach((k) => declaredKeys.add(k)));
    const RESOLVED_MAP = {
      daily_training_bonus: 'dailyTrainingBonus', energy_recovery_bonus: 'energyRecoveryBonus', max_energy_bonus: 'maxEnergyBonus',
      energy_recovery_pct: 'energyRecoveryPct', injury_risk_reduction: 'injuryRiskReduction', injury_recovery_bonus: 'injuryRecoveryBonus',
      training_gain_pct: 'trainingGainPct', physical_gain_pct: 'physicalGainPct', technique_gain_pct: 'techniqueGainPct',
      mental_gain_pct: 'mentalGainPct', overall_gain_pct: 'overallGainPct', morale_bonus: 'moraleBonus',
      coins_per_match: 'coinsPerMatch', sponsor_appeal: 'sponsorAppeal', fan_appeal: 'fanAppeal', rest_anytime: 'restAnytime',
    };
    return {
      id: facility.id,
      name: facility.name,
      category: facility.category,
      maxLevel: facility.maxLevel,
      benefits: [...declaredKeys].map((declaredKey) => {
        const resolvedKey = RESOLVED_MAP[declaredKey];
        return {
          declaredEffect: declaredKey,
          resolvedEffect: resolvedKey,
          consumer: CONSUMER_BY_KEY[resolvedKey] || null,
          statusBefore: 'B',
          statusAfter: STATUS_AFTER[resolvedKey] || 'F',
          ambiguityNote: AMBIGUITY_NOTE[resolvedKey] || null,
        };
      }),
    };
  });

  const declaredEquipKeys = new Set();
  const equipItemsWithBonus = allItems.filter((i) => i.attribute_bonus && Object.keys(i.attribute_bonus).length);
  equipItemsWithBonus.forEach((i) => Object.keys(i.attribute_bonus).forEach((k) => declaredEquipKeys.add(k)));
  const equipment = [...declaredEquipKeys].sort().map((key) => {
    const consumed = ATTRIBUTE_KEYS.includes(key);
    return {
      declaredEffect: key,
      resolvedEffect: consumed ? key : null,
      consumer: consumed ? 'Inventory.jsx: toggleEquip (soma/subtrai diretamente em profile[attribute], cascateando para overallRating/ranking/motor de partida)' : null,
      statusBefore: consumed ? 'D' : 'E',
      statusAfter: consumed ? 'A' : 'F',
      ambiguityNote: consumed
        ? (key === 'reputation' || key === 'followers' ? null : null)
        : 'Chave declarada no catálogo de itens de suporte (storeCatalog.js) que não corresponde a nenhum ATTRIBUTE_KEYS real do jogador — provável confusão com o vocabulário de atributos de mundo (athleteGenerator.js: speed/stamina/strength/reflexes/concentration/tactics/positioning) ou com sistemas adjacentes (reputation/followers/health/durability). Vira um campo órfão no profile sem efeito prático. Requer decisão de design (remapear para o atributo correto ou remover o bônus) antes de conectar.',
    };
  });

  const matrix = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-training-center-effect-matrix.mjs',
    facilities,
    equipment,
    summary: {
      facilitiesTotal: facilities.length,
      facilityBenefitsTotal: facilities.reduce((sum, f) => sum + f.benefits.length, 0),
      facilityBenefitsFunctionalAfter: facilities.reduce((sum, f) => sum + f.benefits.filter((b) => b.statusAfter === 'A').length, 0),
      facilityBenefitsAmbiguous: facilities.reduce((sum, f) => sum + f.benefits.filter((b) => b.statusAfter === 'F').length, 0),
      equipmentCatalogTotal: allItems.length,
      equipmentItemsWithBonus: equipItemsWithBonus.length,
      equipmentBonusKeysTotal: equipment.length,
      equipmentBonusKeysConsumed: equipment.filter((e) => e.statusAfter === 'A').length,
      equipmentBonusKeysOrphan: equipment.filter((e) => e.statusAfter === 'F').length,
    },
  };

  writeFileSync(new URL('../reports/training-center-effect-matrix.json', import.meta.url), `${JSON.stringify(matrix, null, 2)}\n`);
  console.log('Wrote reports/training-center-effect-matrix.json');
  console.log(JSON.stringify(matrix.summary, null, 2));
} finally {
  await vite.close();
}
