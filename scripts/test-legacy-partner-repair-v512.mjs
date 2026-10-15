// Playthrough 5.12, Parte F — carreiras criadas ANTES desta fase têm
// parceria e contrato, mas o parceiro nunca virou AthleteProfile. O reparo
// materializa o atleta sem resetar nada: contrato, química, confiança,
// moral, partidas, vitórias e títulos continuam exatamente como estavam.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-legacy-partner-repair-v512', search: '' };
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
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { repairLegacyPlayerPartnerAthlete } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Legacy', playerName: 'P512L' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512l', sport_name: 'P512L', career_date: '2026-04-20', birth_date: '2001-01-01',
    level: 'Amador', coins: 10000, xp: 0,
  });
  await ensureWorldSeed2025();

  // Reproduz um save PRÉ-5.12: Partnership escrita à mão apontando para o
  // template do bot, sem AthleteProfile correspondente.
  const bot = (BOTS_BY_DIFFICULTY.iniciante || [])[2];
  const legacyPartnership = await localGame.entities.Partnership.create({
    profile_id: 'p512l',
    partnership_type: 'player',
    scope: 'career',
    athlete_a_id: 'p512l',
    athlete_b_id: bot.id,
    athlete_ids: ['p512l', bot.id],
    athlete_a_name: 'P512L',
    athlete_b_name: bot.name,
    partner_bot_id: bot.id,
    partner_name: bot.name,
    status: 'ativa',
    started_career_date: '2026-02-01',
    contract_status: 'ativo',
    contract_started_date: '2026-02-01',
    contract_end_date: '2026-08-01',
    monthly_salary: 450,
    prize_split_pct: 60,
    chemistry: 64,
    natural_chemistry: 58,
    partner_trust: 51,
    partner_morale: 77,
    shared_matches: 14,
    shared_wins: 9,
    titles_won: 2,
  });

  console.log(`save legacy: parceiro ${bot.name} (${bot.id}) OVR=${bot.overall_rating}`);

  await check('pré-condição: o parceiro NÃO existe como AthleteProfile', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1).catch(() => []);
    assert.equal(rows.length, 0);
  });

  const before = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  const resolveTemplate = (id) => Object.values(BOTS_BY_DIFFICULTY).flat().find((b) => b.id === id) || null;
  const summary = await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
  const after = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  const athlete = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
  const partnershipAfter = (await localGame.entities.Partnership.filter({ id: legacyPartnership.id }, null, 1))[0];

  console.log(`reparo: ${JSON.stringify(summary)} | população ${before} -> ${after}`);
  console.log(`atleta: ${athlete?.id} OVR=${athlete?.overall_rating} potencial=${athlete?.potential} idade=${athlete?.age}`);

  await check('Parte F/12-13: o parceiro legacy foi materializado', () => {
    assert.equal(summary.materialized, 1, `materialized=${summary.materialized}`);
    assert.ok(athlete, 'atleta não criado');
    assert.equal(after, before + 1);
  });

  await check('Parte T: o reparo COPIA o OVR, não infla', () => {
    assert.equal(Number(athlete.overall_rating), Number(bot.overall_rating));
  });

  await check('Parte F: o reparo preserva NOME e idade de origem', () => {
    assert.equal(athlete.name, bot.name);
    assert.equal(Number(athlete.age), Number(bot.age));
  });

  await check('Parte L/14: contrato intacto (datas, salário, split, status)', () => {
    assert.equal(partnershipAfter.contract_status, 'ativo');
    assert.equal(partnershipAfter.contract_started_date, '2026-02-01');
    assert.equal(partnershipAfter.contract_end_date, '2026-08-01');
    assert.equal(Number(partnershipAfter.monthly_salary), 450);
    assert.equal(Number(partnershipAfter.prize_split_pct), 60);
  });

  await check('Parte M/15-17: química, confiança e moral NÃO foram resetadas', () => {
    assert.equal(Number(partnershipAfter.chemistry), 64);
    assert.equal(Number(partnershipAfter.natural_chemistry), 58);
    assert.equal(Number(partnershipAfter.partner_trust), 51);
    assert.equal(Number(partnershipAfter.partner_morale), 77);
  });

  await check('Parte F/18-20: partidas, vitórias e títulos preservados', () => {
    assert.equal(Number(partnershipAfter.shared_matches), 14);
    assert.equal(Number(partnershipAfter.shared_wins), 9);
    assert.equal(Number(partnershipAfter.titles_won), 2);
  });

  await check('Parte F: a data de início da parceria não mudou', () => {
    assert.equal(partnershipAfter.started_career_date, '2026-02-01');
  });

  await check('Parte F/16: o reparo é IDEMPOTENTE', async () => {
    const second = await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
    const count = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(second.materialized, 0, `segunda passada materializou ${second.materialized}`);
    assert.equal(second.alreadyReal, 1, `alreadyReal=${second.alreadyReal}`);
    assert.equal(count, after, 'população mudou na segunda passada');
  });

  await check('Parte F: template irresolvível NÃO cria atleta inventado', async () => {
    const orphan = await localGame.entities.Partnership.create({
      profile_id: 'p512l-orphan', partnership_type: 'player', status: 'ativa',
      partner_bot_id: 'template-que-nao-existe', partner_name: 'Fantasma',
      athlete_b_id: 'template-que-nao-existe',
    });
    const countBefore = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    const result = await repairLegacyPlayerPartnerAthlete({ id: 'p512l-orphan' }, resolveTemplate);
    const countAfter = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(countAfter, countBefore, 'criou atleta para um template inexistente');
    assert.equal(result.unresolved, 1, `unresolved=${result.unresolved}`);
    void orphan;
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-legacy-partner-repair-v512: PASS');
} finally {
  await vite.close();
}
