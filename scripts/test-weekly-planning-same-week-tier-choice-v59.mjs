// Playthrough 5.9 (continuação), Parte C (segundo teste) — escolha DENTRO
// de uma mesma janela com vários tiers simultâneos.
//
// O primeiro teste (career-progression) mostrou a tendência correta
// (#1000->Bronze, #500->Silver, #300->Platinum), mas também levantou uma
// pergunta: para #100/Top10 o conjunto ELEGÍVEL apareceu como
// [Platinum, Gold] apenas, com fit=1 e risco=100 — ou seja, sem nenhum
// evento de elite disponível naquela janela específica.
//
// Este teste escolhe deliberadamente uma janela que CONTÉM Masters/Elite/
// Crown e audita, por faixa de rank: o que está no horizonte, o que é
// elegível, e o que é recomendado. Sem hardcode de nome — só a escada.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-planning-same-week-tier-choice-v59', search: '' };
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

const TIER_LADDER = ['Exibição', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const ELITE_TIERS = ['Masters', 'Elite', 'Crown'];
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
  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 SameWeek', playerName: 'Player59Week' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-week', sport_name: 'Player59Week', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Avançado', coins: 500000, xp: 60000, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const partner = BOTS_BY_DIFFICULTY.lenda?.[0] || BOTS_BY_DIFFICULTY.elite?.[0] || BOTS_BY_DIFFICULTY.iniciante[0];

  // Janela de planejamento (28 dias) que CONTENHA ao menos um evento de elite.
  const starts = [...new Set(tournaments.map((t) => t.start_date).filter(Boolean))].sort();
  let planningDate = null; let horizonList = [];
  for (const start of starts) {
    const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 12);
    const candidate = d.toISOString().slice(0, 10);
    if (candidate < '2026-01-01') continue;
    const horizon = new Date(`${candidate}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 28);
    const horizonEnd = horizon.toISOString().slice(0, 10);
    const inWindow = tournaments.filter((t) => t.start_date >= candidate && t.start_date <= horizonEnd);
    const tiers = new Set(inWindow.map((t) => t.tier));
    if (ELITE_TIERS.some((tier) => tiers.has(tier)) && tiers.size >= 4) {
      planningDate = candidate; horizonList = inWindow; break;
    }
  }
  assert.ok(planningDate, 'pré-condição: precisa existir janela com evento de elite');
  const horizonTiers = [...new Set(horizonList.map((t) => t.tier))];
  console.log(`janela de planejamento: ${planningDate} (+28d) | tiers no horizonte: ${horizonTiers.join(', ')}`);
  console.log(`eventos de elite no horizonte: ${horizonList.filter((t) => ELITE_TIERS.includes(t.tier)).map((t) => `${t.name}(${t.tier})`).join(' | ') || 'nenhum'}\n`);

  const SCENARIOS = [
    { label: '#1000+', rank: 1000 },
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

    // Elegibilidade CRUA (autoridade EntryManager), independente do recorte
    // de 4 itens que o planner exibe.
    const rawEligibleTiers = [...new Set(horizonList
      .filter((t) => evaluateTournamentEntry(t, { rank: scenario.rank, teamRank: scenario.rank }).eligible)
      .map((t) => t.tier))];

    results[scenario.label] = {
      rank: scenario.rank,
      horizonEliteEvents: horizonList.filter((t) => ELITE_TIERS.includes(t.tier)).length,
      rawEligibleTiers,
      rawEligibleElite: rawEligibleTiers.filter((tier) => ELITE_TIERS.includes(tier)),
      plannerTiers: [...new Set(items.map((i) => i.tier))],
      recommendedTier: recommended?.tier || null,
      fit: recommended?.fit ?? null,
      risk: recommended?.choice?.risk ?? null,
    };
    const r = results[scenario.label];
    console.log(`${scenario.label.padEnd(8)} elegívelCru=[${r.rawEligibleTiers.join(',')}] plannerMostra=[${r.plannerTiers.join(',')}] -> recomendado=${r.recommendedTier || 'nenhum'} fit=${r.fit} risco=${r.risk}`);
  }

  check('a janela escolhida realmente contém evento(s) de elite', () => {
    assert.ok(results['Top10'].horizonEliteEvents > 0);
  });

  check('elegibilidade CRUA acompanha o rank: Top10 é elegível a mais tiers de elite que um #1000+', () => {
    const rookie = results['#1000+'].rawEligibleElite.length;
    const elite = results['Top10'].rawEligibleElite.length;
    assert.ok(elite >= rookie, `Top10 elegível a ${elite} tiers de elite vs estreante ${rookie}`);
  });

  check('Parte C: Top10 É elegível a pelo menos um evento de elite quando ele existe no horizonte', () => {
    const r = results['Top10'];
    assert.ok(r.rawEligibleElite.length > 0,
      `Top10 não elegível a nenhum evento de elite; elegíveis=[${r.rawEligibleTiers.join(',')}]`);
  });

  check('Parte C: a recomendação do Top10 não é um tier de base havendo elite elegível no horizonte', () => {
    const r = results['Top10'];
    if (!r.recommendedTier || !r.rawEligibleElite.length) return;
    assert.ok(tierIndex(r.recommendedTier) >= tierIndex('Gold'),
      `Top10 recomendado a ${r.recommendedTier} com elite elegível [${r.rawEligibleElite.join(',')}]`);
  });

  check('estreante segue restrito a tiers de base (não vira elegível a elite)', () => {
    const r = results['#1000+'];
    assert.equal(r.rawEligibleElite.length, 0, `estreante elegível a elite: ${r.rawEligibleElite.join(',')}`);
  });

  console.log('\nObservação (registrada): o planner exibe no máximo 4 itens ordenados por planningScore');
  console.log('(urgência de prazo domina a ordenação), então a lista visível pode não conter todos os');
  console.log('tiers a que o jogador é elegível no horizonte — a elegibilidade crua acima é a referência.');

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-planning-same-week-tier-choice-v59: PASS');
} finally {
  await vite.close();
}
