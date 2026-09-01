// Diagnóstico pontual (Fase 0.1): rastreia MÊS A MÊS como/quando cada atleta
// real recebe ai_partner_id via processAiPartnershipMarket, para entender o
// mecanismo real por trás da dominância real observada na baseline v1.
import { createServer } from 'vite';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

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
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'diag-player', sport_name: 'Diag', career_date: '2026-01-01', energy: 100, fatigue: 0, coins: 0, xp: 0 });
  const profile = await localGame.entities.PlayerProfile.get('diag-player');

  const realAthleteIds = new Set();
  const idScheme0 = process.argv.includes('--idScheme=random') ? 'random' : 'meaningful';
  function fakeRandomId0(botId, index) {
    let h = 2166136261;
    for (const ch of String(botId)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return `athleteprofile-${1788201827554 + index}-${(h >>> 0).toString(36).slice(0, 6)}`;
  }
  for (const [index, athlete] of worldSeed.athletes.entries()) {
    const id = idScheme0 === 'random' ? fakeRandomId0(athlete.bot_id, index) : athlete.bot_id;
    await localGame.entities.AthleteProfile.create({ ...athlete, id });
    realAthleteIds.add(id);
  }
  console.log(`Esquema de id testado: ${idScheme0} (aplicado a REAIS e BOTS)`);
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.map((a, index) => ({ ...a, id: idScheme0 === 'random' ? fakeRandomId0(a.bot_id, index + 1000) : a.bot_id })));

  let cursor = '2026-01-01';
  for (let month = 0; month < 12; month += 1) {
    const previousCursor = cursor;
    const [y, m] = cursor.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`;
    cursor = nextMonth;
    const result = await processAiPartnershipMarket(profile, previousCursor, cursor);
    const allNow = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
    const realsPaired = allNow.filter((a) => realAthleteIds.has(a.id) && a.ai_partner_id);
    const realRealPairs = realsPaired.filter((a) => realAthleteIds.has(a.ai_partner_id));
    const freePool = allNow.filter((a) => !a.ai_partner_id);
    const freeReals = freePool.filter((a) => realAthleteIds.has(a.id));
    console.log(`Mês ${month + 1} (${previousCursor}→${cursor}): formed=${result.formed} dissolved=${result.dissolved} | reais pareados=${realsPaired.length}/24 (real-real=${realRealPairs.length / 2}) | pool livre=${freePool.length} (${freeReals.length} reais, ${(freeReals.length / freePool.length * 100).toFixed(2)}%)`);
    if (realRealPairs.length) {
      console.log('   Pares real-real:', [...new Set(realRealPairs.map((a) => [a.id, a.ai_partner_id].sort().join(' + ')))].join(' | '));
    }
  }
} finally {
  await vite.close();
}
