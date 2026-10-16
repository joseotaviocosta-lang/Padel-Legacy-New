// Playthrough 5.13 (continuação), Partes C/J/K/L/M — depois da inscrição o
// planner não pode sumir nem continuar pedindo uma decisão já tomada.
//
// Antes: ao confirmar inscrição, `canRegisterNow` vira false,
// `hasActionableTournamentDecision` vira false e a seção caía para DEPOIS
// da jornada/tutorial/painel médico. Agora um COMPROMISSO também mantém a
// seção no topo, relabelada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-planning-after-registration-v513', search: '' };
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
  const { buildUpcomingTournamentPlanning } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { isPlayerParticipating } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { registerTournament } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 AfterReg', playerName: 'P513A' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p513a', sport_name: 'P513A', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-05');

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 180, prizeSplit: 50, monthlySalary: 300 });
  profile = await localGame.entities.PlayerProfile.get('p513a');
  const partner = await localGame.entities.AthleteProfile.get(bot.id).catch(() => bot);

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const target = tournaments.find((t) => t.start_date > '2026-01-20' && t.start_date < '2026-03-01'
    && evaluateTournamentEntry(t, { rank: 300, teamRank: 300 }).eligible);
  assert.ok(target, 'pré-condição: nenhum torneio elegível');

  const snapshotFor = async () => {
    const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: 'p513a' }).catch(() => []);
    const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: 'p513a' }).catch(() => []);
    const fresh = await localGame.entities.PlayerProfile.get('p513a');
    const items = buildUpcomingTournamentPlanning(
      { ...fresh, world_ranking: 300, rank: 300 },
      { tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: 300, partner },
    );
    // MESMAS expressões do CareerHub.
    const actionable = items.some((i) => i.isRecommended && i.canRegisterNow && i.registrationAllowed);
    const commitment = items.find((i) => isPlayerParticipating(i.registrationState)) || null;
    return { items, actionable, commitment, showAtTop: actionable || Boolean(commitment) };
  };

  const before = await snapshotFor();
  console.log(`ANTES da inscrição: itens=${before.items.length} acionável=${before.actionable} compromisso=${before.commitment ? before.commitment.name : 'nenhum'} -> topo=${before.showAtTop}`);

  await check('pré-condição: antes da inscrição existe decisão acionável', () => {
    assert.ok(before.actionable, 'sem decisão acionável antes da inscrição');
    assert.ok(before.showAtTop, 'seção não estaria no topo antes da inscrição');
  });

  // ---- inscrição ----
  const result = await registerTournament({ player: profile, partner, tournament: target, teamRank: 300 });
  assert.ok(result?.success, `inscrição falhou: ${JSON.stringify(result?.reasons)}`);

  const after = await snapshotFor();
  console.log(`DEPOIS da inscrição: itens=${after.items.length} acionável=${after.actionable} compromisso=${after.commitment ? after.commitment.name : 'nenhum'} -> topo=${after.showAtTop}`);

  await check('Parte L/13: após a inscrição existe um COMPROMISSO detectado', () => {
    assert.ok(after.commitment, 'nenhum item marcado como participação do jogador');
    assert.equal(after.commitment.id, target.id, `compromisso aponta para ${after.commitment.name}`);
  });

  await check('Parte C/J: a seção CONTINUA no topo depois da inscrição', () => {
    assert.ok(after.showAtTop,
      'a seção voltaria para a posição baixa justamente após a inscrição — o sintoma relatado');
  });

  await check('Parte L: o planner NÃO fica vazio depois da inscrição', () => {
    assert.ok(after.items.length > 0, 'planner vazio após inscrição');
  });

  await check('Parte L/14: o compromisso carrega torneio, data e estado', () => {
    const c = after.commitment;
    assert.ok(c.name, 'sem nome do torneio');
    assert.ok(c.startDate, 'sem data de estreia');
    assert.ok(c.registrationState, 'sem estado de inscrição');
    console.log(`   [registro] ${c.name} · estreia ${c.startDate} · estado ${c.registrationState}`);
  });

  // Fase 5.30 — a Home não promove/rebaixa mais a seção: o compromisso tem
  // lugar FIXO ("O que vem agora", 2º bloco). As intenções das Partes K/M
  // continuam cobradas na nova forma.
  await check('Parte K: depois da inscrição o bloco vira o COMPROMISSO (rótulo próprio)', () => {
    const lib = readFileSync(new URL('../src/lib/homeDashboard.js', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
    assert.match(lib, /if \(weeklyCommitment\) \{[\s\S]{0,900}eyebrow: 'Seu próximo torneio'/, 'buildHomeCommitment não prioriza o compromisso');
    assert.match(source, /buildHomeCommitment\(\{ weeklyCommitment,/, 'a Home não passa o compromisso para o bloco');
  });

  await check('Parte M: contrato de layout — compromisso fica no topo, logo após o status', () => {
    const source = readFileSync(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
    const status = source.indexOf('<HomeStatusCard');
    const commitment = source.indexOf('<HomeNextCommitment');
    assert.ok(status > 0 && commitment > status && source.indexOf('<HomePriorities') > commitment, 'o compromisso não é o 2º bloco');
  });

  await check('Parte M: a seção tem heading e CTA identificáveis', () => {
    const source = readFileSync(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
    assert.match(source, /data-home-next-commitment aria-label="O que vem agora"/, 'sem rótulo acessível');
    assert.match(source, /Ver calendário/, 'sem CTA para o calendário');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-planning-after-registration-v513: PASS');
} finally {
  await vite.close();
}
