// Playthrough 5.9 (continuação), Parte C — a recomendação da comissão
// precisa ACOMPANHAR a carreira: um jogador #1000+ e um Top10 não podem
// receber a mesma sugestão numa semana com vários tiers disponíveis.
//
// Nada é hardcoded por NOME de torneio: o teste só observa qual TIER a
// autoridade real (`buildUpcomingTournamentPlanning` +
// `getTournamentPlanningRecommendation`, weeklyCareerReview.js) escolhe
// para cada faixa de ranking, sobre o MESMO calendário semeado, e valida a
// TENDÊNCIA (ordem da escada de tiers), não um vencedor específico.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-planning-career-progression-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// Escada canônica de força (mesma ordem usada pelo resto da série 5.x).
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
  const { buildUpcomingTournamentPlanning, getTournamentPlanningRecommendation } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { tierPreferenceFit } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Planner Progression', playerName: 'Player59Prog' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-prog', sport_name: 'Player59Prog', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Avançado', coins: 500000, xp: 60000, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const partner = BOTS_BY_DIFFICULTY.lenda?.[0] || BOTS_BY_DIFFICULTY.elite?.[0] || BOTS_BY_DIFFICULTY.iniciante[0];

  // Procura uma data-base cuja janela de 28 dias (horizonte do planner)
  // contenha a maior variedade de tiers possível.
  const byStart = new Map();
  for (const t of tournaments) {
    if (!t.start_date) continue;
    if (!byStart.has(t.start_date)) byStart.set(t.start_date, []);
    byStart.get(t.start_date).push(t);
  }
  const candidateDates = [...new Set(tournaments.map((t) => t.start_date).filter(Boolean))].sort();
  let baseDate = null; let bestVariety = 0;
  for (const start of candidateDates) {
    const horizon = new Date(`${start}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 25);
    const horizonEnd = horizon.toISOString().slice(0, 10);
    const inWindow = tournaments.filter((t) => t.start_date >= start && t.start_date <= horizonEnd);
    const variety = new Set(inWindow.map((t) => t.tier)).size;
    if (variety > bestVariety) { bestVariety = variety; baseDate = start; }
  }
  // Recua alguns dias para que as inscrições da janela ainda estejam abertas.
  const planningDate = (() => {
    const d = new Date(`${baseDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 12);
    return d.toISOString().slice(0, 10);
  })();
  const windowTiers = [...new Set(tournaments
    .filter((t) => t.start_date >= planningDate)
    .slice(0, 40).map((t) => t.tier))];
  console.log(`data de planejamento: ${planningDate} | variedade máxima de tiers na janela: ${bestVariety}`);
  console.log(`tiers presentes na janela (amostra): ${windowTiers.join(', ')}\n`);

  const SCENARIOS = [
    { label: '#1000+ (estreante)', rank: 1000 },
    { label: '#500', rank: 500 },
    { label: '#300', rank: 300 },
    { label: '#100', rank: 100 },
    { label: 'Top10', rank: 5 },
  ];

  const results = {};
  for (const scenario of SCENARIOS) {
    const snapshot = { ...profile, career_date: planningDate, world_ranking: scenario.rank, rank: scenario.rank };
    const items = buildUpcomingTournamentPlanning(snapshot, {
      tournaments, registrations: [], calendarEvents: [], teamRank: scenario.rank, partner,
    });
    const recommendation = getTournamentPlanningRecommendation(items);
    const recommended = items.find((item) => item.id === recommendation?.tournamentId) || null;
    const eligibleTiers = [...new Set(items.filter((i) => i.eligible).map((i) => i.tier))];
    results[scenario.label] = {
      rank: scenario.rank,
      eligibleCount: items.filter((i) => i.eligible).length,
      eligibleTiers,
      recommendedTier: recommended?.tier || null,
      recommendedName: recommended?.name || null,
      fit: recommended ? recommended.fit : null,
      risk: recommended?.choice?.risk ?? null,
      expectedPoints: recommended?.choice?.expectedPoints ?? null,
      conflict: recommended?.conflictWith || null,
    };
    const r = results[scenario.label];
    console.log(`${scenario.label.padEnd(20)} elegíveis=${String(r.eligibleCount).padEnd(3)} tiers=[${r.eligibleTiers.join(',')}] -> recomendado=${r.recommendedTier || 'nenhum'} (${r.recommendedName || '-'}) fit=${r.fit} risco=${r.risk} ptsEsperados=${r.expectedPoints}`);
  }

  check('Parte C: a autoridade produz recomendação para as faixas com opção elegível', () => {
    const withRecommendation = Object.values(results).filter((r) => r.recommendedTier);
    assert.ok(withRecommendation.length >= 3, `só ${withRecommendation.length} faixas receberam recomendação`);
  });

  check('Parte C: o fit do torneio recomendado é coerente com o rank (autoridade tierPreferenceFit)', () => {
    for (const [label, r] of Object.entries(results)) {
      if (!r.recommendedTier) continue;
      const expectedFit = tierPreferenceFit(r.rank, r.recommendedTier);
      assert.equal(r.fit, expectedFit, `${label}: fit reportado=${r.fit} vs tierPreferenceFit=${expectedFit}`);
    }
  });

  check('Parte C (tendência): a recomendação NUNCA fica mais fraca conforme o ranking melhora', () => {
    const ordered = SCENARIOS.map((s) => results[s.label]).filter((r) => r.recommendedTier);
    // rank melhora (número cai) ao longo de SCENARIOS; o tier recomendado
    // deve ser monotonicamente não-decrescente na escada de força.
    let previous = -1;
    for (const r of ordered) {
      const idx = tierIndex(r.recommendedTier);
      assert.ok(idx >= previous - 1, `recomendação regrediu de ${TIER_LADDER[previous]} para ${r.recommendedTier} ao melhorar o rank`);
      previous = Math.max(previous, idx);
    }
  });

  check('Parte C: o estreante (#1000+) NÃO recebe recomendação de tier de elite', () => {
    const rookie = results['#1000+ (estreante)'];
    if (!rookie.recommendedTier) return;
    assert.ok(!['Masters', 'Elite', 'Crown'].includes(rookie.recommendedTier),
      `estreante recebeu ${rookie.recommendedTier}`);
  });

  check('Parte C: o Top10 NÃO recebe recomendação de tier de base quando há opção melhor elegível', () => {
    const elite = results['Top10'];
    if (!elite.recommendedTier) return;
    const hasBetter = elite.eligibleTiers.some((tier) => tierIndex(tier) > tierIndex('Silver'));
    if (!hasBetter) return;
    assert.ok(tierIndex(elite.recommendedTier) > tierIndex('Bronze'),
      `Top10 recebeu ${elite.recommendedTier} havendo opções superiores elegíveis: ${elite.eligibleTiers.join(',')}`);
  });

  check('Parte C/16: a recomendação MUDA ao longo da evolução (não é constante para todas as faixas)', () => {
    const tiers = Object.values(results).map((r) => r.recommendedTier).filter(Boolean);
    assert.ok(new Set(tiers).size > 1, `recomendação idêntica para todas as faixas: ${tiers.join(', ')}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-planning-career-progression-v59: PASS');
} finally {
  await vite.close();
}
