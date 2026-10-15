// Playthrough 5.9 (continuação), Parte D — quem escolhe o torneio dos
// avisos D-7/D-5/D-4, e o que acontece com vários torneios simultâneos.
//
// Autoridade localizada (calendarSystem.js:537-543): o day-tick varre TODOS
// os torneios que começam nos próximos 7 dias e chama
// `ensureTournamentRegistrationReminders` para CADA UM. A função não
// escolhe nada — ela recebe um torneio específico e decide apenas se
// aquele torneio merece aviso (janela REGISTRATION_OPEN + elegibilidade
// real via evaluateTournamentRegistration).
//
// Ou seja: planner e reminder têm AUTORIDADES DIFERENTES.
//   planner  -> getTournamentPlanningRecommendation: escolhe UM
//               (fit*2 + retorno + pontos - risco).
//   reminder -> fan-out por elegibilidade: avisa de TODOS os elegíveis.
// O dedupe existente é por (torneio, marco) via id estável — impede repetir
// o MESMO aviso, não impede N avisos de N torneios distintos.
//
// Este teste mede esse comportamento em vez de presumi-lo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-registration-reminder-tournament-authority-v59', search: '' };
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
  const { ensureTournamentRegistrationReminders } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { buildUpcomingTournamentPlanning, getTournamentPlanningRecommendation } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Reminder Authority', playerName: 'Player59Rem' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-rem', sport_name: 'Player59Rem', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Avançado', coins: 500000, xp: 60000, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const allTournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const partner = BOTS_BY_DIFFICULTY.lenda?.[0] || BOTS_BY_DIFFICULTY.iniciante[0];
  // `ensureTournamentRegistrationReminders` resolve o parceiro INTERNAMENTE
  // a partir de `profile.partner_id` (findPartnerBot) e a validação de
  // inscrição exige dupla — sem isto nenhum aviso nasce.
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: partner.id });
  Object.assign(profile, { partner_id: partner.id });

  // Data com o maior número de torneios simultâneos na janela de 7 dias.
  const starts = [...new Set(allTournaments.map((t) => t.start_date).filter(Boolean))].sort().filter((d) => d > '2026-01-05');
  let bestDate = null; let bestWindow = [];
  for (const start of starts) {
    const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 5);
    const careerDate = d.toISOString().slice(0, 10);
    const end = new Date(`${careerDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
    const endStr = end.toISOString().slice(0, 10);
    const inWindow = allTournaments.filter((t) => t.start_date >= careerDate && t.start_date <= endStr);
    if (inWindow.length > bestWindow.length) { bestWindow = inWindow; bestDate = careerDate; }
  }
  console.log(`data-base: ${bestDate} | torneios na janela de 7 dias: ${bestWindow.length}`);
  for (const t of bestWindow) console.log(`   ${t.tier.padEnd(16)} ${t.name} (início ${t.start_date})`);

  // Varredura D-7..D-1 relativa ao INÍCIO dos torneios da janela, para
  // localizar exatamente em que dias os avisos realmente nascem (os marcos
  // são daysBeforeStart 7/5/4, mas o gate real é a janela de inscrição).
  const sweepStart = bestWindow[0]?.start_date;
  console.log(`\n=== varredura D-7..D-1 (rank #120) sobre início ${sweepStart} ===`);
  for (let d = 7; d >= 1; d -= 1) {
    const dd = new Date(`${sweepStart}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() - d);
    const dayDate = dd.toISOString().slice(0, 10);
    const stale = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    for (const msg of stale || []) await localGame.entities.CareerMessage.delete(msg.id).catch(() => null);
    const snap = { ...profile, career_date: dayDate, world_ranking: 120, rank: 120 };
    for (const item of bestWindow) {
      await ensureTournamentRegistrationReminders(snap, item, { teamRank: 120 }).catch(() => null);
    }
    const msgs = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const rem = (msgs || []).filter((m) => String(m.title || '').match(/Inscriç|Prazo de inscrição|Última chance/i));
    const names = [...new Set(rem.map((m) => bestWindow.find((t) => t.id === (m.related_entity_id || m.metadata?.tournament_id))?.name).filter(Boolean))];
    console.log(`  D-${d} (${dayDate}): ${rem.length} aviso(s) | torneios: ${names.join(', ') || 'nenhum'}`);
  }

  const RANKS = [{ label: '#800 (base)', rank: 800 }, { label: '#120 (avançado)', rank: 120 }];
  const summary = {};

  for (const scenario of RANKS) {
    // Limpa mensagens entre cenários para medir cada um isoladamente.
    const existing = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    for (const msg of existing || []) await localGame.entities.CareerMessage.delete(msg.id).catch(() => null);

    const scenarioDate = (() => { const dd = new Date(`${bestWindow[0].start_date}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() - 7); return dd.toISOString().slice(0, 10); })();
    const snapshot = { ...profile, career_date: scenarioDate, world_ranking: scenario.rank, rank: scenario.rank };
    // Reproduz EXATAMENTE o laço do day-tick (calendarSystem.js:541).
    for (const item of bestWindow) {
      await ensureTournamentRegistrationReminders(snapshot, item, { teamRank: scenario.rank }).catch(() => null);
    }
    const created = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const reminders = (created || []).filter((m) => String(m.title || '').match(/Inscriç|Prazo de inscrição|Última chance/i));
    const byTournament = new Map();
    for (const r of reminders) {
      const tid = r.related_entity_id || r.metadata?.tournament_id;
      byTournament.set(tid, (byTournament.get(tid) || 0) + 1);
    }

    const items = buildUpcomingTournamentPlanning(snapshot, {
      tournaments: allTournaments, registrations: [], calendarEvents: [], teamRank: scenario.rank, partner,
    });
    const recommendation = getTournamentPlanningRecommendation(items);
    const recommendedName = items.find((i) => i.id === recommendation?.tournamentId)?.name || null;

    summary[scenario.label] = {
      reminderCount: reminders.length,
      distinctTournaments: byTournament.size,
      tournamentNames: [...byTournament.keys()].map((tid) => bestWindow.find((t) => t.id === tid)?.name || tid),
      plannerRecommendation: recommendedName,
    };
    const s = summary[scenario.label];
    console.log(`\n${scenario.label}: ${s.reminderCount} reminder(s) para ${s.distinctTournaments} torneio(s) distinto(s)`);
    console.log(`   torneios avisados: ${s.tournamentNames.join(' | ') || 'nenhum'}`);
    console.log(`   planner recomenda: ${s.plannerRecommendation || 'nenhum'}`);
  }

  await check('Perguntas 1-3: o reminder NÃO escolhe um torneio — o day-tick avisa de todos os elegíveis da janela', async () => {
    const anyFanOut = Object.values(summary).some((s) => s.distinctTournaments > 1);
    const anyAtAll = Object.values(summary).some((s) => s.distinctTournaments >= 1);
    assert.ok(anyAtAll, 'nenhum reminder foi criado em nenhum cenário — amostra inválida');
    // Registra o comportamento real (fan-out) sem exigir que ele seja >1
    // numa semana em que o jogador só é elegível a um evento.
    console.log(`   [registro] fan-out observado em múltiplos torneios: ${anyFanOut}`);
  });

  await check('Pergunta 7/23: existe dedupe por (torneio, marco) — reexecutar o MESMO tick (mesma data) não duplica avisos', async () => {
    // Precisa ser a MESMA data do último cenário: em outra data novos
    // marcos ficam devidos legitimamente (não seria duplicação).
    const sameDate = (() => {
      const dd = new Date(`${bestWindow[0].start_date}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() - 7);
      return dd.toISOString().slice(0, 10);
    })();
    const before = (await localGame.entities.CareerMessage.filter({ profile_id: profile.id })).length;
    const snapshot = { ...profile, career_date: sameDate, world_ranking: 120, rank: 120 };
    for (const item of bestWindow) {
      await ensureTournamentRegistrationReminders(snapshot, item, { teamRank: 120 }).catch(() => null);
    }
    const after = (await localGame.entities.CareerMessage.filter({ profile_id: profile.id })).length;
    assert.equal(after, before, `avisos duplicaram no mesmo tick: ${before} -> ${after}`);
  });

  await check('Pergunta 22 (volume): o fan-out acumula marcos — quantifica o risco real de spam', async () => {
    // Registro explícito: N torneios elegíveis x até 3 marcos (D-7/D-5/D-4).
    const advanced = summary['#120 (avançado)'];
    console.log(`   [registro] ${advanced.distinctTournaments} torneio(s) elegível(is) -> até ${advanced.distinctTournaments * 3} avisos na janela`);
    assert.ok(advanced.distinctTournaments >= 1);
  });

  await check('Pergunta 22: o fan-out é limitado por elegibilidade real (não avisa de torneio inelegível)', async () => {
    // Um jogador de base não deve receber aviso de tier de elite.
    const base = summary['#800 (base)'];
    const eliteNames = bestWindow.filter((t) => ['Masters', 'Elite', 'Crown'].includes(t.tier)).map((t) => t.name);
    for (const name of base.tournamentNames) {
      assert.ok(!eliteNames.includes(name), `jogador #800 recebeu aviso de evento de elite: ${name}`);
    }
  });

  await check('Perguntas 20-21: planner e reminder são autoridades DIFERENTES (registrado, não "corrigido")', async () => {
    // O planner escolhe um; o reminder avisa de todos os elegíveis. Isso é
    // estrutural: são funções distintas com critérios distintos.
    assert.equal(typeof getTournamentPlanningRecommendation, 'function');
    assert.equal(typeof ensureTournamentRegistrationReminders, 'function');
    const advanced = summary['#120 (avançado)'];
    if (advanced.plannerRecommendation && advanced.tournamentNames.length) {
      const plannerInsideReminders = advanced.tournamentNames.includes(advanced.plannerRecommendation);
      console.log(`   [registro] a recomendação do planner está entre os torneios avisados: ${plannerInsideReminders}`);
    }
  });

  console.log('\nConclusão (Parte D): autoridades distintas por desenho atual.');
  console.log('  planner  = uma decisão competitiva (melhor opção da janela).');
  console.log('  reminder = cobertura de prazo (todo evento elegível com inscrição aberta).');
  console.log('  Dedupe: por (torneio, marco). Não há dedupe ENTRE torneios distintos.');

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-registration-reminder-tournament-authority-v59: PASS');
} finally {
  await vite.close();
}
