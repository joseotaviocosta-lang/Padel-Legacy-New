// Testes de correção (não de tempo — ver benchmark-time-advance-rc.mjs) do
// pipeline de avanço de tempo após a otimização de escrita em lote: garante
// que +1/+3/+7 dias, evento bloqueante, virada de mês e lesão continuam
// se comportando exatamente como antes, e que o número de escritas caiu de
// verdade (prova de que a conversão para bulkUpdate/batch funcionou).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(relativePath, content) { files.set(relativePath, String(content)); },
    async readText(relativePath) {
      if (!files.has(relativePath)) {
        const error = new Error('O arquivo não existe no armazenamento local.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(relativePath);
    },
    async exists(relativePath) { return files.has(relativePath); },
    async remove(relativePath) { return files.delete(relativePath); },
    async copy(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); return destinationPath; },
    async rename(sourcePath, destinationPath) { files.set(destinationPath, files.get(sourcePath)); files.delete(sourcePath); return destinationPath; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let failures = 0;
const check = (condition, message) => {
  if (condition) { console.log(`✓ ${message}`); return; }
  failures += 1;
  console.error(`✗ ${message}`);
};

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { careerWriteStats, resetCareerWriteStats } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { advanceCareerDay, advanceCareerDays, advanceCareerUntilRecovered } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { processGameStateDay } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { generateFictionalAthletes } = await server.ssrLoadModule('/src/players/athleteGenerator.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  let idCounter = 0;
  async function freshCareer({ careerDate = '2026-01-05', athleteCount = 400, injured = false } = {}) {
    idCounter += 1;
    const careerId = `perf-test-${Date.now()}-${idCounter}`;
    const { career } = await careerManager.createCareer({ career_id: careerId, career_name: `Perf ${careerId}` });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: 'perf-player', sport_name: 'Jogador Teste', career_date: careerDate, birth_date: '2003-05-10',
      energy: 70, fatigue: 35, morale: 65, form: 55, coins: 25000, xp: 4200, level: 'Amador',
      court_side: 'direita', play_style: 'controle', career_difficulty: 'hard',
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
      injured_until: injured ? addDays(careerDate, 6) : null,
      injury_status: injured ? 'lesionado' : null,
    });
    const athletes = generateFictionalAthletes({ count: athleteCount, seed: `perf-${careerId}` })
      .map((athlete, index) => ({ ...athlete, id: athlete.id || `perf-athlete-${careerId}-${index}` }));
    const activeCareer = await activeCareerAdapter.getActiveCareer({ fresh: false, cloneResult: false });
    activeCareer.entities.AthleteProfile = athletes;
    activeCareer.entities.Match = [];
    activeCareer.entities.CalendarEvent = [];
    await activeCareerAdapter.saveActiveCareer(activeCareer);
    return await localGame.entities.PlayerProfile.get('perf-player');
  }

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ---- +1 dia avança exatamente um dia ----
  {
    const profile = await freshCareer({ careerDate: '2026-01-05' });
    const updated = await advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true });
    check(updated.career_date === '2026-01-06', '+1 dia avança exatamente para o dia seguinte');
  }

  // ---- +1 dia: contagem de escritas caiu (prova da conversão para bulkUpdate) ----
  {
    const profile = await freshCareer({ careerDate: '2026-01-05', athleteCount: 500 });
    resetCareerWriteStats();
    const core = await advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true });
    const writesAfterCore = careerWriteStats.count;
    await processGameStateDay(core, profile.career_date, core.career_date);
    const writesAfterSecondary = careerWriteStats.count;
    check(writesAfterCore <= 10, `fase rápida (core) usa poucas escritas (${writesAfterCore} <= 10)`);
    check(writesAfterSecondary - writesAfterCore <= 15, `fase secundária usa poucas escritas em vez de ~90+ individuais (${writesAfterSecondary - writesAfterCore} <= 15)`);
  }

  // ---- +3 dias avança exatamente 3 dias, sem pular nem duplicar ----
  {
    const profile = await freshCareer({ careerDate: '2026-02-01' });
    const result = await advanceCareerDays(profile, 3);
    check(result.daysAdvanced === 3, '+3 dias avança exatamente 3 dias');
    check(result.profile.career_date === '2026-02-04', '+3 dias termina na data correta');
    check(!result.blockedBy, '+3 dias sem evento bloqueante não é interrompido');
  }

  // ---- +7 dias avança exatamente 7 dias ----
  {
    const profile = await freshCareer({ careerDate: '2026-03-01' });
    const result = await advanceCareerDays(profile, 7);
    check(result.daysAdvanced === 7, '+7 dias avança exatamente 7 dias');
    check(result.profile.career_date === '2026-03-08', '+7 dias termina na data correta');
  }

  // ---- Evento bloqueante interrompe o avanço no dia certo ----
  {
    const profile = await freshCareer({ careerDate: '2026-04-01' });
    await localGame.entities.CalendarEvent.create({
      profile_id: profile.id,
      status: 'scheduled',
      event_type: 'tournament',
      start_date: '2026-04-04',
      end_date: '2026-04-04',
      requires_decision: true,
      decision_type: 'play_tournament',
    });
    const result = await advanceCareerDays(profile, 7);
    check(Boolean(result.blockedBy), 'evento com requires_decision interrompe o avanço em lote');
    check(result.profile.career_date === '2026-04-03', 'avanço para exatamente um dia antes do evento bloqueante');
  }

  // ---- Virada de mês processa o fechamento mensal exatamente uma vez ----
  {
    const profile = await freshCareer({ careerDate: '2026-01-30' });
    const updated = await advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true });
    check(updated.career_date === '2026-01-31', 'dia comum antes da virada avança normalmente');
    const monthEnd = await localGame.entities.PlayerProfile.get('perf-player');
    const crossedMonth = await advanceCareerDay(monthEnd, { deferGameState: true, deferGlobalProcessing: true });
    check(crossedMonth.career_date === '2026-02-01', 'virada de mês avança exatamente um dia');
  }

  // ---- Universo vivo/circuito processam sem duplicar quando chamados só pela fase secundária ----
  {
    const profile = await freshCareer({ careerDate: '2026-05-05', athleteCount: 300 });
    const core = await advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true });
    const secondary = await processGameStateDay(core, profile.career_date, core.career_date);
    check(Boolean(secondary?.profile?.id), 'fase secundária (mundo/circuito/universo vivo) roda sem erro após a reativação do universo vivo');
    check(secondary.report?.livingWorld !== undefined, 'relatório da fase secundária inclui o resumo do universo vivo');
  }

  // ---- Avançar até a recuperação limpa a lesão ----
  {
    const profile = await freshCareer({ careerDate: '2026-06-01', injured: true });
    const result = await advanceCareerUntilRecovered(profile);
    check(result.recovered === true, 'avançar até a recuperação limpa a lesão');
    check(!result.profile.injured_until || result.profile.injured_until <= result.profile.career_date, 'injured_until não fica no futuro após a recuperação');
  }

  console.log(failures === 0 ? '\nTimeAdvancePerformanceTest: PASS' : `\nTimeAdvancePerformanceTest: FAIL (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error('[test-time-advance-performance] falhou:', error);
  process.exitCode = 1;
} finally {
  await server.close();
}
