// Fase 15.5.3 — simulação comparativa de progressão (item 37/38 do briefing).
// Mede o IMPACTO REAL (não só a existência) dos efeitos agora conectados do
// Centro de Treinamento e de equipamentos, usando o pipeline real
// (executeTraining, advanceCareerDayOnce) — nenhum atalho/mocked engine.
import { createServer } from 'vite';

const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];

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

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { executeTraining, TRAINING_ACTIVITIES, getDailyTrainingLimit: _unused } = await vite.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { getDailyTrainingLimit, isInjured } = await vite.ssrLoadModule('/src/lib/padel.js');
  const { getCenterEffects } = await vite.ssrLoadModule('/src/lib/trainingCenter.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;

  function overallOf(profile) {
    return Math.round(ATTRS.reduce((s, k) => s + (Number(profile[k]) || 0), 0) / ATTRS.length);
  }

  async function runSimulation({ id, facilities, equipmentBonus, days }) {
    const { career } = await manager.createCareer({ career_id: `sim-${id}-${days}d`, career_name: `Sim ${id}` });
    activeCareerAdapter.setActiveCareer(career);
    const effects = getCenterEffects({ facilities });
    const startAttrs = Object.fromEntries(ATTRS.map((k) => [k, 30]));
    const equippedAttrs = { ...startAttrs };
    for (const [key, val] of Object.entries(equipmentBonus || {})) {
      if (ATTRS.includes(key)) equippedAttrs[key] = Math.max(0, Math.min(100, (equippedAttrs[key] || 0) + val));
    }
    await activeCareerAdapter.createPlayerProfile({
      id: `sim-${id}-${days}d-player`, sport_name: `Sim ${id}`,
      career_date: '2026-01-01', birth_date: '2005-01-01',
      energy: 100, fatigue: 0, morale: 70, form: 50, confidence: 60, coins: 999999, xp: 0,
      level: 'Amador', court_side: 'direita', play_style: 'controle', weekly_training_enabled: false,
      ...equippedAttrs,
      facility_daily_training_bonus: effects.dailyTrainingBonus,
      facility_energy_recovery_bonus: effects.energyRecoveryBonus,
      facility_energy_recovery_pct: effects.energyRecoveryPct,
      facility_injury_risk_reduction: effects.injuryRiskReduction,
      facility_injury_recovery_bonus: effects.injuryRecoveryBonus,
      facility_training_gain_pct: effects.trainingGainPct,
      facility_physical_gain_pct: effects.physicalGainPct,
      facility_technique_gain_pct: effects.techniqueGainPct,
      facility_mental_gain_pct: effects.mentalGainPct,
      facility_overall_gain_pct: effects.overallGainPct,
      facility_morale_bonus: effects.moraleBonus,
      facility_coins_per_match: effects.coinsPerMatch,
      facility_rest_anytime: effects.restAnytime,
    });
    let profile = await localGame.entities.PlayerProfile.get(`sim-${id}-${days}d-player`);
    const startOverall = overallOf(profile);
    let energySum = 0; let fatigueSum = 0; let samples = 0;
    let sessionsTotal = 0; let extraSessions = 0; let injuries = 0; let coinsSpent = 0; let xpGained = -Number(profile.xp || 0);
    const activities = ['court', 'physical', 'mental'].map((cat) => TRAINING_ACTIVITIES.find((a) => a.category === cat)).filter(Boolean);
    let day = 0;
    while (day < days) {
      if (!isInjured(profile)) {
        const limit = getDailyTrainingLimit(profile);
        let trained = 0;
        while (trained < limit && Number(profile.energy || 0) >= 12) {
          const activity = activities[trained % activities.length];
          const before = Number(profile.injured_until ? 1 : 0);
          const result = await executeTraining(profile, activity, 'moderado', {}).catch(() => ({ error: 'exception' }));
          if (result.error) break;
          profile = result.profile;
          sessionsTotal += 1;
          if (trained >= 3) extraSessions += 1;
          coinsSpent += Number(result.cost || 0);
          if (result.injured) injuries += 1;
          trained += 1;
        }
      }
      energySum += Number(profile.energy || 0);
      fatigueSum += Number(profile.fatigue || 0);
      samples += 1;
      const before = profile;
      profile = await advanceCareerDayOnce(profile);
      day += 1;
    }
    xpGained += Number(profile.xp || 0);
    const endOverall = overallOf(profile);
    return {
      id, days,
      startOverall, endOverall, deltaOverall: endOverall - startOverall,
      finalAttributes: Object.fromEntries(ATTRS.map((k) => [k, Number(profile[k]) || 0])),
      trainingsExecuted: sessionsTotal, extraSessionsFromFacilities: extraSessions,
      avgEnergy: Math.round((energySum / samples) * 10) / 10, avgFatigue: Math.round((fatigueSum / samples) * 10) / 10,
      injuries, coinsSpent: Math.round(coinsSpent), xpGained,
    };
  }

  const FACILITY_PROFILES = {
    A_baseline: {},
    B_moderate: { courts: 2, gym: 2, physio: 2 },
    C_advanced: { courts: 3, gym: 3, physio: 3, medical: 3, performance_analysis: 3 },
    D_max: { courts: 5, gym: 5, physio: 5, medical: 5, performance_analysis: 5, biomechanics: 5, nutrition: 5, psychology: 5, accommodation: 5, laboratory: 5, vip: 5 },
  };
  const EQUIPMENT_PROFILES = {
    E_none: null,
    F_starter: { smash: 1, forehand: 1 }, // racquete comum, tier base
    G_mid: { smash: 3, forehand: 2, defense: -1 }, // raquete rara, tier intermediário
    H_best_accessible: { smash: 6, forehand: 5, bandeja: -2, defense: -4 }, // raquete épica, melhor plausível cedo na carreira
  };

  const horizons = [30, 90, 365, 1095];
  const facilityResults = [];
  for (const days of horizons) {
    for (const [id, facilities] of Object.entries(FACILITY_PROFILES)) {
      const r = await runSimulation({ id, facilities, equipmentBonus: null, days });
      facilityResults.push(r);
      console.log(`[facility] ${id} @${days}d -> OVR ${r.startOverall}->${r.endOverall} (Δ${r.deltaOverall}) treinos=${r.trainingsExecuted} extras=${r.extraSessionsFromFacilities} energiaMed=${r.avgEnergy} fadigaMed=${r.avgFatigue} lesões=${r.injuries} gasto=${r.coinsSpent} xp=${r.xpGained}`);
    }
  }

  const equipmentResults = [];
  for (const [id, bonus] of Object.entries(EQUIPMENT_PROFILES)) {
    const r = await runSimulation({ id, facilities: {}, equipmentBonus: bonus, days: 90 });
    equipmentResults.push(r);
    console.log(`[equipment] ${id} @90d -> OVR ${r.startOverall}->${r.endOverall} (Δ${r.deltaOverall}) treinos=${r.trainingsExecuted}`);
  }

  console.log('\n=== RESUMO JSON ===');
  console.log(JSON.stringify({ facilityResults, equipmentResults }, null, 2));
} finally {
  await vite.close();
}
