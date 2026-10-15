// Playthrough 5.14, Partes A/B/C/D/L/M/R — a comissão técnica precisa
// produzir uma REUNIÃO COMPETITIVA semanal, com recomendação de torneio,
// em vez de deixar os lembretes da Federação serem a única pista.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-staff-weekly-competitive-review-v514', search: '' };
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
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { ensureWeeklyCompetitiveStaffReview, competitiveReviewContextKey, competitiveWeekKey } =
    await vite.ssrLoadModule('/src/game-core/competitiveStaffReview.js');
  const { buildCompetitiveWeeklyDecision } = await vite.ssrLoadModule('/src/lib/competitiveWeeklyDecision.js');
  const { getTournamentPlanningRecommendation, buildUpcomingTournamentPlanning } =
    await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.14 Review', playerName: 'P514R' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p514r', sport_name: 'P514R', career_date: '2026-01-19', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-19');

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 180, prizeSplit: 50, monthlySalary: 300 });
  profile = await localGame.entities.PlayerProfile.get('p514r');

  const result = await ensureWeeklyCompetitiveStaffReview(profile, '2026-01-19');
  const week = competitiveWeekKey('2026-01-19');
  const key = competitiveReviewContextKey(week);

  console.log(`semana: ${week} | chave: ${key}`);
  console.log(`estado: ${result.decision?.state}`);
  console.log(`assunto: ${result.message?.subject}`);
  console.log(`corpo: ${result.message?.body}`);
  console.log(`alternativas: ${(result.message?.metadata?.alternatives || []).length}`);

  await check('Parte B/3: a reunião competitiva foi criada', () => {
    assert.ok(result.created, 'nenhuma reunião criada');
    assert.ok(result.message?.id, 'mensagem sem id');
  });

  await check('Parte U: é uma mensagem COMPETITIVA, não o relatório de folha/moral', () => {
    assert.equal(result.message.message_type, 'staff_competitive_review');
    assert.ok(!/folha|salarial|equipe pede atenção|equipe está em ordem/i.test(result.message.subject),
      `assunto genérico: ${result.message.subject}`);
  });

  await check('Parte D: o assunto nomeia o torneio recomendado', () => {
    const recommended = result.message.metadata.recommended_tournament_name;
    assert.ok(recommended, 'sem torneio recomendado no metadata');
    assert.match(result.message.subject, new RegExp(recommended.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `assunto não cita ${recommended}`);
  });

  await check('Parte D: o corpo explica POR QUÊ e traz o prazo', () => {
    assert.ok((result.message.metadata.recommendations || []).length > 0, 'sem justificativas');
    assert.ok(result.message.metadata.deadline, 'sem prazo de inscrição');
    assert.match(result.message.body, /Recomendamos/i);
  });

  await check('Parte S: traz alternativas (até 3), não uma mensagem por torneio', () => {
    const alternatives = result.message.metadata.alternatives || [];
    console.log(`   [registro] alternativas: ${alternatives.join(' | ')}`);
    assert.ok(alternatives.length <= 3, `${alternatives.length} alternativas`);
  });

  await check('Parte L/4: a recomendação é EXATAMENTE a do planner (mesma autoridade)', async () => {
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: 'p514r' }).catch(() => []);
    const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: 'p514r' }).catch(() => []);
    const partner = await localGame.entities.AthleteProfile.get(bot.id).catch(() => bot);
    const snapshot = { ...profile, career_date: '2026-01-19' };
    const items = buildUpcomingTournamentPlanning(snapshot, {
      tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: 300, partner,
    });
    const plannerPick = getTournamentPlanningRecommendation(items);
    assert.equal(result.message.metadata.recommended_tournament_id, plannerPick.tournamentId,
      'reunião e planner apontam torneios diferentes');
  });

  await check('Parte L: a projeção única devolve a mesma decisão', async () => {
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const partner = await localGame.entities.AthleteProfile.get(bot.id).catch(() => bot);
    const decision = buildCompetitiveWeeklyDecision(
      { ...profile, career_date: '2026-01-19' },
      { tournaments, registrations: [], calendarEvents: [], teamRank: 300, partner },
    );
    assert.equal(decision.recommended?.id, result.message.metadata.recommended_tournament_id);
  });

  await check('Parte M: a notificação é da categoria COMISSÃO e tem CTA', () => {
    assert.equal(result.message.notification_type, 'STAFF');
    assert.ok((result.message.actions || []).length > 0, 'sem CTA');
    console.log(`   [registro] CTA: ${result.message.actions[0].label}`);
  });

  await check('Parte R/25: rodar de novo no MESMO dia não cria segunda reunião', async () => {
    await ensureWeeklyCompetitiveStaffReview(profile, '2026-01-19');
    const all = await localGame.entities.CareerMessage.filter({ profile_id: 'p514r' });
    const reviews = (all || []).filter((m) => m.message_type === 'staff_competitive_review');
    assert.equal(reviews.length, 1, `${reviews.length} reuniões para a mesma semana`);
  });

  await check('Parte C/R: outro dia da MESMA semana também não duplica', async () => {
    await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: '2026-01-21' }, '2026-01-21');
    const all = await localGame.entities.CareerMessage.filter({ profile_id: 'p514r' });
    const reviews = (all || []).filter((m) => m.message_type === 'staff_competitive_review');
    const sameWeek = reviews.filter((m) => m.metadata?.context_key === key);
    assert.equal(sameWeek.length, 1, `${sameWeek.length} reuniões na semana ${week}`);
  });

  await check('Parte R: a chave de contexto é estável e semanal', () => {
    assert.equal(result.message.metadata.context_key, key);
    assert.match(key, /^staff-competitive-review:/);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-staff-weekly-competitive-review-v514: PASS');
} finally {
  await vite.close();
}
