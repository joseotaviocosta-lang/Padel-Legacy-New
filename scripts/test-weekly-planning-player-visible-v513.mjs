// Playthrough 5.13, Partes A/B — "o planejamento da comissão continua
// praticamente invisível".
//
// O CareerHub promove a seção para o topo quando
// `hasActionableTournamentDecision` é verdadeiro, isto é, quando existe um
// item com `isRecommended && canRegisterNow && registrationAllowed`. Este
// teste mede, nos dias em que o jogador precisa decidir (D-10, D-7, D-5,
// D-4), se essa condição é de fato satisfeita — ou se o bloco fica na
// posição baixa justamente nos dias da decisão.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-planning-player-visible-v513', search: '' };
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

const shiftDays = (date, delta) => {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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
  const { buildUpcomingTournamentPlanning, getTournamentPlanningRecommendation } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 PlannerVisible', playerName: 'P513V' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p513v', sport_name: 'P513V', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const partner = BOTS_BY_DIFFICULTY.avancado?.[0] || BOTS_BY_DIFFICULTY.amador?.[0];

  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const target = tournaments.find((t) => t.start_date > '2026-02-01' && t.start_date < '2026-04-01'
    && evaluateTournamentEntry(t, { rank: 300, teamRank: 300 }).eligible);
  assert.ok(target, 'pré-condição: nenhum torneio elegível');
  console.log(`torneio-alvo: ${target.name} (${target.tier}) início=${target.start_date}\n`);

  // A "decisão" do jogador acontece nestes dias antes do INÍCIO.
  const DAYS = [10, 7, 5, 4];
  const rows = [];
  for (const d of DAYS) {
    const date = shiftDays(target.start_date, -d);
    const snapshot = { ...profile, career_date: date, world_ranking: 300, rank: 300 };
    const items = buildUpcomingTournamentPlanning(snapshot, {
      tournaments, registrations: [], calendarEvents: [], teamRank: 300, partner,
    });
    const recommendation = getTournamentPlanningRecommendation(items);
    // MESMA condição do CareerHub.
    const actionable = items.some((i) => i.isRecommended && i.canRegisterNow && i.registrationAllowed);
    const recommended = items.find((i) => i.id === recommendation?.tournamentId) || null;
    rows.push({
      d, date, count: items.length,
      hasRecommendation: Boolean(recommendation),
      recommendedName: recommended?.name || null,
      canRegisterNow: Boolean(recommended?.canRegisterNow),
      registrationAllowed: Boolean(recommended?.registrationAllowed),
      actionable,
      deadline: recommended?.deadline || null,
    });
  }

  console.log('dia    data         itens  recomendação             podeInscrever  permitido  PROMOVIDO');
  for (const r of rows) {
    console.log(`D-${String(r.d).padEnd(3)} ${r.date}  ${String(r.count).padStart(5)}  ${String(r.recommendedName || '-').slice(0, 22).padEnd(24)} ${String(r.canRegisterNow).padEnd(14)} ${String(r.registrationAllowed).padEnd(10)} ${r.actionable ? 'SIM' : 'NÃO'}`);
  }

  check('Parte A/1: o planner PRODUZ itens em todos os dias da decisão', () => {
    for (const r of rows) {
      assert.ok(r.count > 0, `D-${r.d}: planner vazio`);
    }
  });

  check('Parte A: existe recomendação da comissão em todos esses dias', () => {
    for (const r of rows) {
      assert.ok(r.hasRecommendation, `D-${r.d}: sem recomendação`);
    }
  });

  check('Parte A/4: a seção é PROMOVIDA ao topo nos dias em que há decisão real', () => {
    const notPromoted = rows.filter((r) => !r.actionable);
    console.log(`   [registro] dias sem promoção: ${notPromoted.map((r) => `D-${r.d}`).join(', ') || 'nenhum'}`);
    assert.equal(notPromoted.length, 0,
      `a seção fica na posição baixa em ${notPromoted.map((r) => `D-${r.d}`).join(', ')} — exatamente quando o jogador precisa decidir`);
  });

  check('Parte B/5: o item recomendado carrega PRAZO para o CTA', () => {
    for (const r of rows) {
      assert.ok(r.deadline, `D-${r.d}: recomendação sem prazo de inscrição`);
    }
  });

  check('Parte B: a decisão é perceptível SEM depender de notificação', () => {
    // O dado que a tela precisa (recomendação + prazo + inscrição possível)
    // existe no próprio planner, sem consultar CareerMessage.
    for (const r of rows) {
      assert.ok(r.hasRecommendation && r.canRegisterNow && r.deadline,
        `D-${r.d}: a tela não teria o suficiente para mostrar a decisão sozinha`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-planning-player-visible-v513: PASS');
} finally {
  await vite.close();
}
