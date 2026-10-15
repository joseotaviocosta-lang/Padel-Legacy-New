// Playthrough 5.13, Partes U/V/W — auditoria da distribuição semanal de
// tiers ao longo de uma temporada inteira.
//
// Observação do playtest: uma semana mostrou 1 Bronze + 2 Gold + 1 Masters
// e NENHUM Silver. O briefing é explícito: não assumir bug e não adicionar
// Silver manualmente. Este teste apenas MEDE — eventos por tier por ano,
// semanas sem evento, maior lacuna — e classifica a semana observada como
// normal ou anômala com dados.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-calendar-tier-cadence-v513', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const weekOf = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.floor((d - start) / 604800000) + 1).padStart(2, '0')}`;
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 Cadence', playerName: 'P513C' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p513c', sport_name: 'P513C', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const all = await localGame.entities.Tournament.list('start_date', 5000);
  const season = all.filter((t) => t.start_date >= '2026-01-01' && t.start_date <= '2026-12-31' && TIERS.includes(t.tier));

  const perTier = Object.fromEntries(TIERS.map((t) => [t, 0]));
  const weeks = new Map();
  for (const t of season) {
    perTier[t.tier] += 1;
    const w = weekOf(t.start_date);
    if (!weeks.has(w)) weeks.set(w, Object.fromEntries(TIERS.map((x) => [x, 0])));
    weeks.get(w)[t.tier] += 1;
  }
  const orderedWeeks = [...weeks.keys()].sort();

  console.log(`=== Temporada 2026: ${season.length} eventos em ${orderedWeeks.length} semanas ===\n`);
  console.log('tier        eventos/ano   semanas c/ evento   maior lacuna (semanas)');
  const gaps = {};
  for (const tier of TIERS) {
    const withEvent = orderedWeeks.filter((w) => weeks.get(w)[tier] > 0);
    let maxGap = 0; let last = null;
    for (const w of orderedWeeks) {
      if (weeks.get(w)[tier] > 0) {
        if (last !== null) maxGap = Math.max(maxGap, orderedWeeks.indexOf(w) - last - 1);
        last = orderedWeeks.indexOf(w);
      }
    }
    gaps[tier] = maxGap;
    console.log(`${tier.padEnd(11)} ${String(perTier[tier]).padStart(11)} ${String(withEvent.length).padStart(19)} ${String(maxGap).padStart(23)}`);
  }

  // A semana relatada: Bronze + 2 Gold + Masters, sem Silver.
  const matching = orderedWeeks.filter((w) => {
    const c = weeks.get(w);
    return c.Silver === 0 && c.Bronze >= 1 && c.Gold >= 1 && c.Masters >= 1;
  });
  const weeksWithoutSilver = orderedWeeks.filter((w) => weeks.get(w).Silver === 0);

  console.log(`\nsemanas SEM Silver: ${weeksWithoutSilver.length}/${orderedWeeks.length} (${((weeksWithoutSilver.length / orderedWeeks.length) * 100).toFixed(0)}%)`);
  console.log(`semanas com o padrão relatado (Bronze+Gold+Masters, sem Silver): ${matching.length}`);
  console.log(`  exemplos: ${matching.slice(0, 5).join(', ') || 'nenhuma'}`);

  check('Parte U: a temporada tem eventos em todos os tiers', () => {
    for (const tier of TIERS) {
      assert.ok(perTier[tier] > 0, `${tier} não tem nenhum evento no ano`);
    }
  });

  check('Parte V/39-40: a semana sem Silver relatada é COMUM, não anomalia', () => {
    // Se semanas sem Silver são frequentes, a observação do playtest é
    // calendário normal — não há bug a corrigir (Parte W).
    const share = weeksWithoutSilver.length / orderedWeeks.length;
    console.log(`   [registro] ${(share * 100).toFixed(0)}% das semanas do ano não têm Silver`);
    assert.ok(share > 0.2,
      `semanas sem Silver são raras (${(share * 100).toFixed(0)}%) — a semana observada seria anomalia`);
  });

  check('Parte V: nenhum tier de BASE desaparece por um trimestre inteiro', () => {
    for (const tier of ['Bronze', 'Silver', 'Gold']) {
      assert.ok(gaps[tier] <= 13,
        `${tier} ficou ${gaps[tier]} semanas sem nenhum evento (> 1 trimestre)`);
    }
  });

  check('Parte V: tiers de elite são raros POR DESIGN, não ausentes', () => {
    for (const tier of ['Masters', 'Elite', 'Crown']) {
      assert.ok(perTier[tier] >= 1, `${tier} sem eventos`);
    }
    assert.ok(perTier.Crown <= perTier.Masters, 'Crown deveria ser mais raro que Masters');
    assert.ok(perTier.Masters <= perTier.Gold, 'Masters deveria ser mais raro que Gold');
  });

  check('Parte U: a base é mais frequente que a elite (pirâmide do circuito)', () => {
    const base = perTier.Bronze + perTier.Silver + perTier.Gold;
    const elite = perTier.Masters + perTier.Elite + perTier.Crown;
    console.log(`   [registro] base=${base} elite=${elite}`);
    assert.ok(base > elite, `base ${base} <= elite ${elite}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-calendar-tier-cadence-v513: PASS');
} finally {
  await vite.close();
}
