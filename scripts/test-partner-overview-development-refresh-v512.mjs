// Playthrough 5.12 (continuação), Parte T — o teste crucial: um parceiro
// jovem que EVOLUI precisa aparecer com o OVR novo na tela, nunca com o
// valor congelado do template do catálogo.
//
// Usa o pipeline mensal REAL de produção (`evolveAthletesMonthly`,
// athleteBehavior.js), o mesmo que roda na virada de mês da carreira.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-overview-development-refresh-v512', search: '' };
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
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { evolveAthletesMonthly } = await vite.ssrLoadModule('/src/lib/athleteBehavior.js');
  const { resolvePartnerOverall } = await vite.ssrLoadModule('/src/components/partner/PartnerOverview.jsx');
  const { getPartnerBot } = await vite.ssrLoadModule('/src/lib/career.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 DevRefresh', playerName: 'P512D' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512d', sport_name: 'P512D', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100,
  });
  await ensureWorldSeed2025();

  // Parceiro JOVEM com margem de crescimento — template explícito para o
  // cenário do briefing (OVR 45, alto potencial).
  const youngTemplate = {
    id: 'dev-refresh-young', name: 'Jovem Promessa', age: 18,
    overall_rating: 45, overall: 45, potential: 88,
    country: 'Brasil', position: 'direita', play_style: 'controle',
  };

  const { partnership } = await formPartnerContract(profile, youngTemplate, { durationDays: 120, prizeSplit: 50, monthlySalary: 300 });
  const initial = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);
  const shownBefore = resolvePartnerOverall(initial, partnership.partner_overall);

  console.log(`início: OVR persistido=${initial.overall_rating} | exibido pela tela=${shownBefore} | potencial=${initial.potential}`);

  await check('pré-condição: o parceiro nasce com o OVR do template', () => {
    assert.equal(Number(initial.overall_rating), 45);
    assert.equal(shownBefore, 45);
  });

  // ---- 12 meses pelo pipeline REAL ----
  for (let month = 1; month <= 12; month += 1) {
    const date = `2026-${String(month).padStart(2, '0')}-01`;
    await evolveAthletesMonthly(date, { isYearBoundary: month === 1, profile });
  }

  const evolved = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);
  const shownAfter = resolvePartnerOverall(evolved, partnership.partner_overall);
  const templateOverall = Number(youngTemplate.overall_rating);

  console.log(`após 12 meses: OVR persistido=${evolved.overall_rating} | exibido pela tela=${shownAfter} | template continua=${templateOverall}`);

  await check('Parte T/26: o parceiro EVOLUIU pelo pipeline mensal real', () => {
    assert.ok(Number(evolved.overall_rating) > 45,
      `OVR continuou em ${evolved.overall_rating} — o parceiro não entrou no pipeline mensal`);
  });

  await check('Parte T/26: a TELA mostra o OVR evoluído, não o do template', () => {
    assert.equal(shownAfter, Number(evolved.overall_rating),
      `tela mostra ${shownAfter}, persistido é ${evolved.overall_rating}`);
    assert.notEqual(shownAfter, templateOverall,
      `tela ainda mostra o valor do template (${templateOverall})`);
  });

  await check('Parte T: a evolução respeita o potencial', () => {
    assert.ok(Number(evolved.overall_rating) <= Number(evolved.potential),
      `OVR ${evolved.overall_rating} passou do potencial ${evolved.potential}`);
  });

  await check('Parte T: a idade avançou junto (o parceiro envelhece)', () => {
    assert.ok(Number(evolved.age) >= Number(initial.age),
      `idade regrediu: ${initial.age} -> ${evolved.age}`);
  });

  await check('Parte S: o catálogo estático NÃO é a autoridade da tela', async () => {
    // getPartnerBot resolve no catálogo de módulo; este template nem existe
    // lá. A tela não pode depender disso para mostrar o OVR.
    const fromCatalog = getPartnerBot({ ...profile, partner_id: partnership.partner_bot_id });
    console.log(`   [registro] getPartnerBot devolveu: ${fromCatalog ? fromCatalog.name : 'null'}`);
    assert.equal(resolvePartnerOverall(evolved, 999), Number(evolved.overall_rating),
      'a tela caiu no fallback em vez do atleta persistido');
  });

  await check('Parte T: identidade preservada durante toda a evolução', () => {
    assert.equal(evolved.id, initial.id);
    assert.equal(evolved.name, initial.name);
    assert.equal(evolved.birth_date, initial.birth_date);
  });

  await check('Parte T: recarregar continua mostrando o valor evoluído', async () => {
    const reread = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id);
    assert.equal(resolvePartnerOverall(reread, partnership.partner_overall), shownAfter);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-overview-development-refresh-v512: PASS');
} finally {
  await vite.close();
}
