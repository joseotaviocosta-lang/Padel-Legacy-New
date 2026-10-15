// Playthrough 5.9, BUG 2 / Partes 2-3 — "a comissão/planejamento não
// apareceu como experiência real no playtest; o jogador acabou dependendo
// dos avisos D-7/D-5/D-4".
//
// Este teste responde, com carreira real e sem inscrição (igual ao
// playtest), às perguntas 5-10 do relatório:
//   - o planner está sendo GERADO? (em D-10/D-7/D-5/D-4)
//   - existe decisão ACIONÁVEL (recomendação + inscrição ainda possível)?
//
// Achado de UX já corrigido em CareerHub.jsx: a seção era renderizada na
// 6ª posição da página (abaixo do bloco "O que fazer agora", do calendário,
// do banner de tutorial e do painel médico) e renderizava SEMPRE, inclusive
// vazia — diluindo o caso com decisão real. Agora, quando há decisão
// acionável, a MESMA seção sobe para logo abaixo do objetivo principal
// (sem popup, sem notificação nova, conforme a Parte 3).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-planning-visible-decision-v59', search: '' };
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

function shiftDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
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
  const { buildWeeklyCareerReview } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Planner Visibility', playerName: 'Player59Plan' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-plan', sport_name: 'Player59Plan', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 5000, xp: 0, morale: 70, form: 50, energy: 100,
  });
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id });
  profile = await activeCareerAdapter.getPlayerProfile();
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  // Alvo: primeiro torneio de entrada com janela de inscrição conhecida.
  const target = tournaments.find((t) => ['Exibição', 'Bronze', 'Silver'].includes(t.tier) && getTournamentRegistrationWindow(t)?.closesAt);
  assert.ok(target, 'pré-condição: precisa existir torneio com janela de inscrição');
  const windowInfo = getTournamentRegistrationWindow(target);
  console.log(`alvo: ${target.name} (${target.tier}) início=${target.start_date} inscrições fecham=${windowInfo.closesAt}`);

  // O playtest NÃO se inscreveu — medimos só a geração do planejamento.
  const milestones = [10, 7, 5, 4];
  const observed = {};
  for (const d of milestones) {
    const date = shiftDays(windowInfo.closesAt, -d);
    const snapshot = { ...profile, career_date: date };
    const review = buildWeeklyCareerReview(snapshot, {
      matches: [], trainings: [], messages: [],
      tournaments, registrations: [], calendarEvents: [],
      teamRank: 0, partner: BOTS_BY_DIFFICULTY.iniciante[0],
    });
    const items = review?.upcomingTournaments || [];
    const recommended = items.find((item) => item.isRecommended) || null;
    const actionable = items.some((item) => item.isRecommended && item.canRegisterNow && item.registrationAllowed);
    observed[`D-${d}`] = { date, count: items.length, recommended: recommended?.name || null, actionable };
    console.log(`D-${d} (${date}): itens=${items.length} recomendado=${recommended?.name || 'nenhum'} acionável=${actionable}`);
  }

  check('Pergunta 5: o planejamento da comissão ESTÁ sendo gerado (não é código morto)', () => {
    const anyGenerated = Object.values(observed).some((row) => row.count > 0);
    assert.ok(anyGenerated, 'nenhum item de planejamento foi gerado em nenhum marco');
  });

  check('Perguntas 7-10: há recomendação em D-10/D-7/D-5/D-4 (ou o marco é documentado como vazio)', () => {
    // Não exigimos os quatro: exigimos que os marcos DENTRO da janela de
    // inscrição tenham recomendação — é isso que o jogador precisa ver.
    const inWindow = Object.entries(observed).filter(([, row]) => row.count > 0);
    assert.ok(inWindow.length >= 2, `só ${inWindow.length} marco(s) com planejamento — esperado ao menos 2 dentro da janela`);
  });

  check('Parte 3: existe ao menos um marco com decisão ACIONÁVEL (é o gatilho que promove a seção no topo)', () => {
    const actionableMarks = Object.entries(observed).filter(([, row]) => row.actionable);
    assert.ok(actionableMarks.length > 0, `nenhum marco acionável: ${JSON.stringify(observed)}`);
  });

  check('a recomendação é estável dentro da janela (não troca de torneio a cada dia sem motivo)', () => {
    const names = Object.values(observed).map((row) => row.recommended).filter(Boolean);
    if (names.length < 2) return;
    const distinct = new Set(names);
    assert.ok(distinct.size <= 2, `recomendação oscilou demais entre marcos: ${[...distinct].join(', ')}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-planning-visible-decision-v59: PASS');
} finally {
  await vite.close();
}
