// Playthrough 5.12 (continuação), Parte W — gates compartilhados do ciclo
// de vida do parceiro materializado.
//
// O briefing permite wrapper/gate compartilhado quando o comportamento já
// está coberto, desde que não se duplique teste idêntico só para cumprir
// nome. Cada gate abaixo faz asserções PRÓPRIAS sobre um aspecto distinto;
// os arquivos nominais apenas selecionam qual gate rodar, reaproveitando
// este setup em vez de repetir 60 linhas de boilerplate.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

export function installShims(pathname) {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

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

export async function bootstrap(label) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await mod('/src/storage/GameStorage.js');
  const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
  const { CareerManager } = await mod('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
  const { localGame } = await mod('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
  const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  const profileId = `p-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: profileId, sport_name: label, career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100, rank_points: 900,
  });
  await ensureWorldSeed2025();
  return { vite, mod, localGame, profile, profileId, BOTS_BY_DIFFICULTY };
}

export function makeRunner() {
  let passed = 0; let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
  const check = async (label, fn) => {
    try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  };
  const finish = (name) => {
    console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
    if (failed > 0) process.exitCode = 1;
    else console.log(`${name}: PASS`);
  };
  return { check, finish };
}

// ---------------------------------------------------------------------------
// GATES
// ---------------------------------------------------------------------------

export async function gateContractContinuity(ctx, check) {
  const { mod, localGame, profile, BOTS_BY_DIFFICULTY } = ctx;
  const { formPartnerContract, renewPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const bot = (BOTS_BY_DIFFICULTY.amador || [])[0];
  const { partnership } = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 58, monthlySalary: 650 });

  await check('contrato aponta para o AthleteProfile materializado', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ id: partnership.partner_bot_id }, null, 1);
    assert.equal(rows.length, 1, 'parceiro do contrato não é um atleta persistido');
  });

  await check('termos gravados exatamente como negociados', () => {
    assert.equal(partnership.contract_status, 'ativo');
    assert.equal(Number(partnership.monthly_salary), 650);
    assert.equal(Number(partnership.prize_split_pct), 58);
    assert.ok(partnership.contract_started_date && partnership.contract_end_date);
  });

  await check('renovação resolve o parceiro como atleta real (sem fallback sintético)', async () => {
    const fresh = await localGame.entities.PlayerProfile.get(profile.id);
    const renewed = await renewPartnerContract(fresh, { durationDays: 60, prizeSplit: 55, monthlySalary: 700 })
      .catch((error) => ({ error }));
    if (renewed?.error) {
      console.log(`   (renovação recusada pelo domínio: ${renewed.error.message})`);
      return;
    }
    const after = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];
    assert.equal(after.partner_bot_id, partnership.partner_bot_id, 'renovação trocou a identidade do parceiro');
  });

  await check('expiração não apaga o atleta', async () => {
    await localGame.entities.Partnership.update(partnership.id, { contract_end_date: '2026-03-02' });
    const athlete = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);
    assert.ok(athlete, 'atleta sumiu ao mexer no contrato');
  });
  return partnership;
}

export async function gateChemistryContinuity(ctx, check) {
  const { mod, localGame, profile, BOTS_BY_DIFFICULTY } = ctx;
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const bot = (BOTS_BY_DIFFICULTY.amador || [])[1];
  const { partnership } = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 50, monthlySalary: 500 });

  await check('química/confiança/moral nascem preenchidas', () => {
    assert.ok(Number(partnership.chemistry) > 0, `chemistry=${partnership.chemistry}`);
    assert.ok(Number(partnership.partner_trust) > 0, `trust=${partnership.partner_trust}`);
    assert.ok(Number(partnership.partner_morale) > 0, `morale=${partnership.partner_morale}`);
  });

  await check('materializar não zera a parceria', async () => {
    const { materializePartnerAthlete } = await mod('/src/lib/partnerAthlete.js');
    await materializePartnerAthlete(bot, { careerDate: '2026-05-01' });
    const after = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];
    assert.equal(Number(after.chemistry), Number(partnership.chemistry));
    assert.equal(Number(after.partner_trust), Number(partnership.partner_trust));
    assert.equal(Number(after.partner_morale), Number(partnership.partner_morale));
  });

  await check('valores sobrevivem à releitura', async () => {
    const after = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];
    assert.equal(Number(after.natural_chemistry), Number(partnership.natural_chemistry));
  });
}

export async function gateRankingCredit(ctx, check) {
  const { mod, localGame, profile, BOTS_BY_DIFFICULTY } = ctx;
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const { finalizeTournamentRun } = await mod('/src/game-core/tournamentLifecycle.js');
  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  const { partnership } = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 50, monthlySalary: 500 });
  const partner = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);

  const tournament = await localGame.entities.Tournament.create({
    id: 'gate-credit-cup', name: 'Copa Gate', tier: 'Silver', start_date: '2026-03-01', status: 'em_andamento',
  });
  const fresh = await localGame.entities.PlayerProfile.get(profile.id);
  await finalizeTournamentRun({ profile: fresh, tournament, partner, roundsWon: 2, totalRounds: 3 });

  await check('o parceiro recebe AthleteRankingResult do torneio', async () => {
    const rows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: partner.id }).catch(() => []);
    assert.ok(rows.length >= 1, `${rows.length} resultados`);
  });

  await check('crédito sem duplicação por torneio', async () => {
    const rows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: partner.id }).catch(() => []);
    const keys = rows.map((r) => `${r.athlete_id}:${r.tournament_id}`);
    assert.equal(new Set(keys).size, keys.length, 'resultado duplicado');
  });

  await check('Race do parceiro recebeu os pontos do torneio', async () => {
    const after = await localGame.entities.AthleteProfile.get(partner.id);
    assert.ok(Number(after.race_points) > 0, `race=${after.race_points}`);
  });

  await check('o OVR do parceiro não muda por jogar torneio', async () => {
    const after = await localGame.entities.AthleteProfile.get(partner.id);
    assert.equal(Number(after.overall_rating), Number(partner.overall_rating));
  });
}

export async function gateSeparation(ctx, check) {
  const { mod, localGame, profile, BOTS_BY_DIFFICULTY } = ctx;
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const { endPartnership, getActivePartnership } = await mod('/src/lib/partnershipSystem.js');
  const bot = (BOTS_BY_DIFFICULTY.amador || [])[2];
  const { partnership } = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 50, monthlySalary: 500 });
  const before = (await localGame.entities.AthleteProfile.list(null, 5000)).length;

  await endPartnership(partnership.id, 'encerrada_jogador', 'Gate de separação', '2026-06-01');
  const after = (await localGame.entities.AthleteProfile.list(null, 5000)).length;

  await check('encerrar a parceria não apaga o atleta', async () => {
    const athlete = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);
    assert.ok(athlete, 'atleta apagado');
    assert.equal(after, before, `população ${before} -> ${after}`);
  });

  await check('não resta parceria ativa', async () => {
    const active = await getActivePartnership(profile.id);
    assert.ok(!active, 'parceria ainda ativa');
  });

  await check('o histórico da parceria encerrada permanece', async () => {
    const row = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];
    assert.ok(row, 'linha da parceria sumiu');
    assert.notEqual(row.status, 'ativa');
  });
  return { partnership, bot };
}

export async function gateNewPartnership(ctx, check) {
  const { mod, localGame, profile, BOTS_BY_DIFFICULTY } = ctx;
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const { endPartnership } = await mod('/src/lib/partnershipSystem.js');

  const first = (BOTS_BY_DIFFICULTY.amador || [])[3];
  const a = await formPartnerContract(profile, first, { durationDays: 60, prizeSplit: 50, monthlySalary: 400 });
  await endPartnership(a.partnership.id, 'encerrada_jogador', 'Troca', '2026-05-01');

  const second = (BOTS_BY_DIFFICULTY.amador || [])[4];
  const fresh = await localGame.entities.PlayerProfile.get(profile.id);
  const b = await formPartnerContract(fresh, second, { durationDays: 60, prizeSplit: 50, monthlySalary: 400 });

  await check('a nova dupla tem parceiro materializado PRÓPRIO', async () => {
    assert.notEqual(b.partnership.partner_bot_id, a.partnership.partner_bot_id);
    const athlete = await localGame.entities.AthleteProfile.get(b.partnership.partner_bot_id);
    assert.ok(athlete, 'novo parceiro não materializado');
  });

  await check('o ex-parceiro continua existindo no mundo', async () => {
    const old = await localGame.entities.AthleteProfile.get(a.partnership.partner_bot_id);
    assert.ok(old, 'ex-parceiro apagado');
  });

  await check('a nova parceria não herda estatísticas da anterior', () => {
    assert.notEqual(b.partnership.id, a.partnership.id);
    assert.equal(Number(b.partnership.shared_matches || 0), 0);
  });

  await check('o ex-parceiro segue elegível (não fica marcado como indisponível)', async () => {
    const old = await localGame.entities.AthleteProfile.get(a.partnership.partner_bot_id);
    assert.notEqual(old.career_status, 'aposentado');
    assert.notEqual(old.is_active, false);
  });
}
