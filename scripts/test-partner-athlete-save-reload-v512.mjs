// Playthrough 5.12, Partes E/L/M/Q/W — persistência e ciclo de vida do
// parceiro materializado: identidade estável entre recargas, contrato e
// química preservados, e o atleta continua existindo no mundo depois da
// separação.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-save-reload-v512', search: '' };
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
  const { startPartnership, endPartnership, getActivePartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { materializePartnerAthlete } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Reload', playerName: 'P512R' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512r', sport_name: 'P512R', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();

  const bot = (BOTS_BY_DIFFICULTY.amador || [])[0];
  const contractResult = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 55, monthlySalary: 700 });
  const partnership = contractResult.partnership;
  const athleteId = partnership.partner_bot_id;
  const athlete = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];

  console.log(`parceiro: ${athlete.name} (${athlete.id}) OVR=${athlete.overall_rating}`);
  console.log(`contrato: ${partnership.contract_started_date} -> ${partnership.contract_end_date} | salário=${partnership.monthly_salary} | split=${partnership.prize_split_pct}%`);
  console.log(`química=${partnership.chemistry} confiança=${partnership.partner_trust} moral=${partnership.partner_morale}`);

  await check('Parte T: o parceiro materializado tem o OVR DO TEMPLATE (sem promoção silenciosa)', () => {
    // Guarda contra o defeito real encontrado nesta fase: reconciliar por
    // nome trocava um amador de OVR 31 por um homônimo do mundo de OVR 74.
    assert.equal(Number(athlete.overall_rating), Number(bot.overall_rating),
      `OVR ${athlete.overall_rating} != template ${bot.overall_rating} (${bot.name})`);
  });

  await check('Parte L/14: o contrato aponta para o ATLETA e preserva os termos', () => {
    assert.equal(partnership.contract_status, 'ativo');
    assert.equal(Number(partnership.monthly_salary), 700);
    assert.equal(Number(partnership.prize_split_pct), 55);
    assert.ok(partnership.contract_started_date && partnership.contract_end_date);
    assert.equal(partnership.partner_bot_id, athlete.id);
  });

  await check('Parte M/15-17: química, confiança e moral existem e não estão zeradas', () => {
    assert.ok(Number(partnership.chemistry) > 0, `chemistry=${partnership.chemistry}`);
    assert.ok(Number(partnership.partner_trust) > 0, `trust=${partnership.partner_trust}`);
    assert.ok(Number(partnership.partner_morale) > 0, `morale=${partnership.partner_morale}`);
  });

  // ---- recarga: relê tudo do store, como um load de save ----
  const reloadedAthlete = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];
  const reloadedPartnership = (await localGame.entities.Partnership.filter({ id: partnership.id }, null, 1))[0];

  await check('Parte W/11: o ID do parceiro sobrevive à recarga', () => {
    assert.ok(reloadedAthlete, 'atleta sumiu');
    assert.equal(reloadedAthlete.id, athlete.id);
    assert.equal(reloadedAthlete.name, athlete.name);
    assert.equal(Number(reloadedAthlete.overall_rating), Number(athlete.overall_rating));
    assert.equal(Number(reloadedAthlete.potential), Number(athlete.potential));
    assert.equal(reloadedAthlete.birth_date, athlete.birth_date);
  });

  await check('Parte L: o contrato sobrevive à recarga sem ser recriado', () => {
    assert.equal(reloadedPartnership.id, partnership.id);
    assert.equal(reloadedPartnership.contract_started_date, partnership.contract_started_date);
    assert.equal(reloadedPartnership.contract_end_date, partnership.contract_end_date);
    assert.equal(Number(reloadedPartnership.monthly_salary), 700);
  });

  await check('Parte M: química/confiança/moral sobrevivem à recarga', () => {
    assert.equal(Number(reloadedPartnership.chemistry), Number(partnership.chemistry));
    assert.equal(Number(reloadedPartnership.partner_trust), Number(partnership.partner_trust));
    assert.equal(Number(reloadedPartnership.partner_morale), Number(partnership.partner_morale));
  });

  await check('Parte E/10: materializar de novo após recarga devolve o MESMO atleta', async () => {
    const countBefore = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    const again = await materializePartnerAthlete(bot, { careerDate: '2026-06-01' });
    const countAfter = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(again.id, athlete.id);
    assert.equal(countAfter, countBefore, 'criou atleta duplicado');
  });

  // ---- separação ----
  const populationBefore = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  await endPartnership(partnership.id, 'encerrada_jogador', 'Teste de separação', '2026-05-01');
  const populationAfter = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  const survivor = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];
  const active = await getActivePartnership('p512r');

  console.log(`\npós-separação: população ${populationBefore} -> ${populationAfter} | parceria ativa: ${active ? 'sim' : 'não'}`);

  await check('Parte Q/33: encerrar a parceria NÃO apaga o atleta', () => {
    assert.ok(survivor, 'o parceiro foi deletado do mundo');
    assert.equal(populationAfter, populationBefore, 'a população mudou na separação');
  });

  await check('Parte Q/15: o ex-parceiro mantém identidade e pontos individuais', () => {
    assert.equal(survivor.id, athlete.id);
    assert.equal(Number(survivor.overall_rating), Number(athlete.overall_rating));
    assert.ok(Number(survivor.world_ranking_points) >= 0);
  });

  await check('Parte Q: a parceria ativa foi de fato encerrada', () => {
    assert.ok(!active, 'ainda existe parceria ativa após o encerramento');
  });

  await check('Parte R/34: o ex-parceiro segue elegível para uma NOVA dupla', async () => {
    const bot2 = (BOTS_BY_DIFFICULTY.amador || [])[1];
    const fresh = await localGame.entities.PlayerProfile.get('p512r');
    const second = await startPartnership(fresh, bot2, 60, 50);
    assert.ok(second?.partnership, 'nova parceria não formada');
    assert.notEqual(second.partnership.partner_bot_id, athlete.id, 'reusou o ex-parceiro');
    // e o ex-parceiro continua no mundo, intacto
    const stillThere = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];
    assert.ok(stillThere, 'ex-parceiro sumiu ao formar nova dupla');
    console.log(`   [registro] ex-parceiro ${stillThere.name} segue no mundo; nova dupla com ${second.partnership.partner_name}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-save-reload-v512: PASS');
} finally {
  await vite.close();
}
