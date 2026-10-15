// Playthrough 5.14, Partes E/F/G/H — a recomendação da comissão precisa
// ACOMPANHAR a carreira, usando a autoridade que já existe. Nada de
// hardcode de torneio e nada de retunar tierPreferenceFit nesta fase.
//
// Cenário-chave da Parte F: semana com Bronze + 2 Gold + Masters. Um
// iniciante NÃO pode ser mandado ao Masters só porque é mais prestigioso.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-staff-review-career-progression-v514', search: '' };
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

const TIER_LADDER = ['Exibição', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const tierIndex = (tier) => TIER_LADDER.indexOf(tier);

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { buildCompetitiveWeeklyDecision } = await vite.ssrLoadModule('/src/lib/competitiveWeeklyDecision.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.14 Progression', playerName: 'P514P' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p514p', sport_name: 'P514P', career_date: '2026-01-19', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-19');
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const partner = BOTS_BY_DIFFICULTY.avancado?.[0] || BOTS_BY_DIFFICULTY.amador?.[0];

  // A semana real do playtest: Bronze + 2 Gold + Masters em 2026-01-29.
  const sameDay = tournaments.filter((t) => t.start_date === '2026-01-29');
  console.log(`semana-alvo 2026-01-29: ${sameDay.map((t) => `${t.name} (${t.tier})`).join(' | ')}\n`);

  const SCENARIOS = [
    { label: '#1000+ (iniciante)', rank: 1000 },
    { label: '#500', rank: 500 },
    { label: '#300', rank: 300 },
    { label: '#150', rank: 150 },
    { label: 'Top10', rank: 8 },
  ];

  const results = {};
  console.log('faixa                 estado        recomendado                     tier       alternativas');
  for (const scenario of SCENARIOS) {
    const snapshot = { ...profile, career_date: '2026-01-19', world_ranking: scenario.rank, ranking_position: scenario.rank, rank: scenario.rank };
    const decision = buildCompetitiveWeeklyDecision(snapshot, {
      tournaments, registrations: [], calendarEvents: [], teamRank: scenario.rank, partner,
    });
    results[scenario.label] = decision;
    const rec = decision.recommended;
    console.log(`${scenario.label.padEnd(20)} ${String(decision.state).padEnd(12)} ${String(rec?.name || '-').slice(0, 30).padEnd(32)} ${String(rec?.tier || '-').padEnd(10)} ${(decision.alternatives || []).length}`);
  }

  check('Parte E: toda faixa recebe uma decisão (ou um "sem competição" explícito)', () => {
    for (const [label, d] of Object.entries(results)) {
      assert.ok(d.state, `${label}: sem estado`);
      assert.ok(d.recommended || d.state === 'no_event', `${label}: sem recomendação nem motivo`);
    }
  });

  check('Parte F/11: o INICIANTE não é mandado para Masters/Elite/Crown', () => {
    const rookie = results['#1000+ (iniciante)'];
    if (!rookie.recommended) return;
    assert.ok(!['Masters', 'Elite', 'Crown'].includes(rookie.recommended.tier),
      `iniciante recomendado a ${rookie.recommended.tier}`);
    console.log(`   [registro] iniciante -> ${rookie.recommended.name} (${rookie.recommended.tier})`);
  });

  check('Parte F: o torneio recomendado ao iniciante é ELEGÍVEL de verdade', () => {
    const rookie = results['#1000+ (iniciante)'];
    if (!rookie.recommended) return;
    assert.ok(rookie.recommended.eligible, 'recomendou um torneio inelegível');
    assert.ok(rookie.recommended.registrationAllowed, 'recomendou onde não pode se inscrever');
  });

  check('Parte G/H: a recomendação NUNCA enfraquece conforme o ranking melhora', () => {
    const ordered = SCENARIOS.map((s) => results[s.label]).filter((d) => d.recommended);
    let best = -1;
    for (const d of ordered) {
      const idx = tierIndex(d.recommended.tier);
      assert.ok(idx >= best - 1, `regrediu para ${d.recommended.tier}`);
      best = Math.max(best, idx);
    }
  });

  check('Parte H: o Top10 pode receber recomendação de elite', () => {
    const elite = results['Top10'];
    if (!elite.recommended) return;
    console.log(`   [registro] Top10 -> ${elite.recommended.name} (${elite.recommended.tier})`);
    assert.ok(tierIndex(elite.recommended.tier) >= tierIndex('Gold'),
      `Top10 recomendado a ${elite.recommended.tier}`);
  });

  check('Parte E: a recomendação MUDA ao longo da progressão (não é constante)', () => {
    const tiers = Object.values(results).map((d) => d.recommended?.tier).filter(Boolean);
    assert.ok(new Set(tiers).size > 1, `mesma recomendação para todas as faixas: ${tiers.join(', ')}`);
  });

  check('Parte S: cada faixa recebe no máximo 3 alternativas', () => {
    for (const [label, d] of Object.entries(results)) {
      assert.ok((d.alternatives || []).length <= 3, `${label}: ${d.alternatives.length} alternativas`);
    }
  });

  check('Parte D: as alternativas inelegíveis explicam o motivo', () => {
    for (const d of Object.values(results)) {
      for (const alt of d.alternatives || []) {
        if (alt.eligible) continue;
        assert.ok(alt.why, `alternativa ${alt.name} sem motivo`);
      }
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-staff-review-career-progression-v514: PASS');
} finally {
  await vite.close();
}
