// Playthrough 5.12, Partes C/D/E/T — quando o jogador forma parceria, o
// parceiro vira um AthleteProfile REAL, com id persistente, sem OVR
// inflado e sem duplicar quem já existe no mundo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-materialization-v512', search: '' };
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
  const { startPartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { materializePartnerAthlete, derivePartnerPotential } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Materialize', playerName: 'P512M' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512m', sport_name: 'P512M', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Amador', coins: 20000, xp: 0, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();

  const bot = (BOTS_BY_DIFFICULTY.iniciante || [])[0];
  console.log(`template: ${bot.name} | id=${bot.id} | OVR=${bot.overall_rating} | idade=${bot.age} | potencial=${bot.potential}`);

  await check('pré-condição: o template NÃO existe como AthleteProfile', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1).catch(() => []);
    assert.equal(rows.length, 0, 'o template já estava persistido');
  });

  const before = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  const result = await startPartnership(profile, bot, 60, 50);
  const after = (await localGame.entities.AthleteProfile.list(null, 5000)).length;

  const athlete = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
  console.log(`\nAthleteProfile criado: ${athlete?.id} | OVR=${athlete?.overall_rating} | potencial=${athlete?.potential} | idade=${athlete?.age} | nascimento=${athlete?.birth_date}`);
  console.log(`população: ${before} -> ${after}`);

  await check('Parte C/1: formar parceria CRIA um AthleteProfile real para o parceiro', () => {
    assert.ok(athlete, 'nenhum AthleteProfile criado');
    assert.equal(after, before + 1, `população foi de ${before} para ${after}`);
  });

  await check('Parte D/2: o AthleteProfile tem ID persistente e a Partnership aponta para ele', () => {
    assert.ok(athlete.id, 'sem id');
    assert.equal(result.partnership.partner_bot_id, athlete.id);
    assert.equal(result.partnership.athlete_b_id, athlete.id);
    assert.ok(Array.isArray(result.partnership.athlete_ids)
      && result.partnership.athlete_ids.includes(athlete.id));
  });

  await check('Parte T/4: o OVR NÃO foi inflado — é exatamente o do template', () => {
    assert.equal(Number(athlete.overall_rating), Number(bot.overall_rating),
      `OVR ${athlete.overall_rating} != template ${bot.overall_rating}`);
    assert.equal(Number(athlete.overall), Number(bot.overall_rating));
  });

  await check('Parte H/5: o parceiro tem POTENCIAL coerente (>= OVR, determinístico)', () => {
    assert.ok(Number.isFinite(Number(athlete.potential)), 'sem potencial');
    assert.ok(Number(athlete.potential) >= Number(athlete.overall_rating),
      `potencial ${athlete.potential} < OVR ${athlete.overall_rating}`);
    assert.equal(derivePartnerPotential(bot), derivePartnerPotential(bot), 'não determinístico');
  });

  await check('Parte A/3-4: idade e data de nascimento persistidas (o motor mensal precisa)', () => {
    assert.ok(Number(athlete.age) > 0, `idade = ${athlete.age}`);
    assert.match(String(athlete.birth_date), /^\d{4}-\d{2}-\d{2}$/);
    const derivedAge = 2026 - Number(String(athlete.birth_date).slice(0, 4));
    assert.equal(derivedAge, Number(athlete.age), 'idade e birth_date inconsistentes');
  });

  await check('Parte I: o parceiro carrega os campos que evolveAthleteCareerMonth consome', () => {
    for (const field of ['id', 'overall_rating', 'potential', 'age', 'growth_rate', 'decline_rate']) {
      assert.ok(athlete[field] !== undefined && athlete[field] !== null, `faltou ${field}`);
    }
  });

  await check('Parte O: o parceiro entra no mundo SEM histórico competitivo inventado', () => {
    assert.equal(Number(athlete.world_ranking_points), 0);
    assert.equal(Number(athlete.race_points), 0);
    assert.equal(Number(athlete.rank_points), 0);
  });

  await check('Parte V: atributos de origem preservados, sem inventar os que faltam', () => {
    // O vocabulário do bot não coincide com ATTRIBUTE_KEYS; nada é
    // preenchido com zero — só o que existia é carregado.
    if (athlete.source_attributes) {
      for (const [key, value] of Object.entries(athlete.source_attributes)) {
        assert.ok(Number.isFinite(Number(value)), `${key} não numérico`);
        assert.equal(Number(value), Number(bot[key] ?? bot.attributes?.[key]), `${key} divergiu do template`);
      }
    }
  });

  await check('Parte E: materializar de novo NÃO cria outro atleta', async () => {
    const again = await materializePartnerAthlete(bot, { careerDate: '2026-03-01' });
    assert.equal(again.id, athlete.id, 'id mudou na segunda materialização');
    const count = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(count, after, `população cresceu para ${count}`);
  });

  await check('Parte E: um atleta REAL já existente no mundo é RECONCILIADO, não duplicado', async () => {
    const world = await localGame.entities.AthleteProfile.list(null, 5000);
    const coello = world.find((a) => /coello/i.test(a.name || ''));
    if (!coello) { console.log('   (Coello não presente nesta seed)'); return; }
    const catalogCoello = Object.values(BOTS_BY_DIFFICULTY).flat().find((b) => /coello/i.test(b.name || ''));
    if (!catalogCoello) { console.log('   (Coello não está no catálogo de bots)'); return; }
    console.log(`   [registro] mundo=${coello.id} catálogo=${catalogCoello.id}`);
    assert.notEqual(coello.id, catalogCoello.id, 'pré-condição: os ids deveriam diferir');
    const countBefore = world.length;
    const resolved = await materializePartnerAthlete(catalogCoello, { careerDate: '2026-01-05' });
    const countAfter = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(countAfter, countBefore, 'criou um segundo Coello');
    assert.equal(resolved.id, coello.id, `resolveu para ${resolved.id} em vez do atleta do mundo`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-materialization-v512: PASS');
} finally {
  await vite.close();
}
