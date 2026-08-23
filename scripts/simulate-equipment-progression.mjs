// Fase 15.5.3 — simulação comparativa de equipamentos (item 38 do briefing),
// separada da simulação de instalações para não herdar o custo crescente
// observado em carreiras muito longas/muito intensas (D_max) — aqui o
// horizonte é 90 dias, sem bônus de Centro, isolando só o efeito do
// equipamento sobre a progressão real (executeTraining, pipeline real).
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
  const { executeTraining, TRAINING_ACTIVITIES } = await vite.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const { getDailyTrainingLimit, isInjured } = await vite.ssrLoadModule('/src/lib/padel.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;

  function overallOf(profile) {
    return Math.round(ATTRS.reduce((s, k) => s + (Number(profile[k]) || 0), 0) / ATTRS.length);
  }

  async function runSimulation({ id, equipmentBonus, days }) {
    const { career } = await manager.createCareer({ career_id: `equip-sim-${id}`, career_name: `Equip Sim ${id}` });
    activeCareerAdapter.setActiveCareer(career);
    const startAttrs = Object.fromEntries(ATTRS.map((k) => [k, 30]));
    const equippedAttrs = { ...startAttrs };
    for (const [key, val] of Object.entries(equipmentBonus || {})) {
      if (ATTRS.includes(key)) equippedAttrs[key] = Math.max(0, Math.min(100, (equippedAttrs[key] || 0) + val));
    }
    await activeCareerAdapter.createPlayerProfile({
      id: `equip-sim-${id}-player`, sport_name: `Equip ${id}`, career_date: '2026-01-01', birth_date: '2005-01-01',
      energy: 100, fatigue: 0, morale: 70, form: 50, confidence: 60, coins: 999999, xp: 0,
      level: 'Amador', court_side: 'direita', play_style: 'controle', weekly_training_enabled: false,
      ...equippedAttrs,
    });
    let profile = await localGame.entities.PlayerProfile.get(`equip-sim-${id}-player`);
    const startOverall = overallOf(profile);
    const activities = ['court', 'physical', 'mental'].map((cat) => TRAINING_ACTIVITIES.find((a) => a.category === cat)).filter(Boolean);
    let day = 0; let sessionsTotal = 0;
    while (day < days) {
      if (!isInjured(profile)) {
        const limit = getDailyTrainingLimit(profile);
        let trained = 0;
        while (trained < limit && Number(profile.energy || 0) >= 12) {
          const activity = activities[trained % activities.length];
          const result = await executeTraining(profile, activity, 'moderado', {}).catch(() => ({ error: 'exception' }));
          if (result.error) break;
          profile = result.profile;
          sessionsTotal += 1;
          trained += 1;
        }
      }
      profile = await advanceCareerDayOnce(profile);
      day += 1;
    }
    const endOverall = overallOf(profile);
    return { id, days, startOverall, endOverall, deltaOverall: endOverall - startOverall, trainingsExecuted: sessionsTotal, finalAttributes: Object.fromEntries(ATTRS.map((k) => [k, Number(profile[k]) || 0])) };
  }

  const EQUIPMENT_PROFILES = {
    E_none: null,
    F_starter: { smash: 1, forehand: 1 },
    G_mid: { smash: 3, forehand: 2, defense: -1 },
    H_best_accessible: { smash: 6, forehand: 5, bandeja: -2, defense: -4 },
  };

  const results = [];
  for (const [id, bonus] of Object.entries(EQUIPMENT_PROFILES)) {
    const r = await runSimulation({ id, equipmentBonus: bonus, days: 90 });
    results.push(r);
    console.log(`[equipment] ${id} @90d -> OVR ${r.startOverall}->${r.endOverall} (Δ${r.deltaOverall}) treinos=${r.trainingsExecuted}`);
  }
  console.log('\n=== RESUMO JSON ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await vite.close();
}
