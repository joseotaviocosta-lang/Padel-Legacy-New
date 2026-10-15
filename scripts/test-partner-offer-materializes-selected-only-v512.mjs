// Playthrough 5.12 (continuação), Partes K/L — o fluxo REAL de oferta
// inicial. Exibir N ofertas não pode materializar N atletas: a oferta é
// uma projeção do template; só o parceiro ESCOLHIDO vira AthleteProfile.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-offer-materializes-selected-only-v512', search: '' };
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
  const { getAvailablePartners } = await vite.ssrLoadModule('/src/lib/career.js');
  const { ensureInitialPartnerOffers, listPartnerOffers, acceptPartnerOffer, offerCandidate } =
    await vite.ssrLoadModule('/src/lib/partnerOffers.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 OfferOnly', playerName: 'P512O' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512o', sport_name: 'P512O', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100,
    overall: 40, overall_rating: 40, reputation: 50,
  });
  await ensureWorldSeed2025();

  const candidates = await getAvailablePartners(profile);
  const populationBeforeOffers = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
  await ensureInitialPartnerOffers(profile, candidates);
  const offers = await listPartnerOffers('p512o');
  const populationAfterOffers = (await localGame.entities.AthleteProfile.list(null, 5000)).length;

  console.log(`candidatos no pool: ${candidates.length}`);
  console.log(`ofertas exibidas: ${offers.length}`);
  offers.forEach((o, i) => {
    const c = offerCandidate(o);
    console.log(`  ${i + 1}. ${c?.name} | OVR=${c?.overall_rating} idade=${c?.age} | id=${c?.id}`);
  });
  console.log(`população de atletas: ${populationBeforeOffers} -> ${populationAfterOffers}`);

  await check('Parte K: o fluxo real produz múltiplas ofertas iniciais', () => {
    assert.ok(offers.length >= 3, `só ${offers.length} ofertas`);
  });

  await check('Parte L/18: EXIBIR ofertas NÃO materializa nenhum atleta', () => {
    assert.equal(populationAfterOffers, populationBeforeOffers,
      `população subiu ${populationAfterOffers - populationBeforeOffers} ao apenas listar ofertas`);
  });

  await check('Parte L: cada oferta é uma PROJEÇÃO (candidate_snapshot), não uma entidade', async () => {
    for (const offer of offers) {
      const candidate = offerCandidate(offer);
      assert.ok(candidate?.id, 'oferta sem snapshot de candidato');
      const persisted = await localGame.entities.AthleteProfile.filter({ id: candidate.id }, null, 1).catch(() => []);
      assert.equal(persisted.length, 0, `${candidate.name} já estava persistido antes da escolha`);
    }
  });

  await check('Parte M: reload ANTES da escolha não materializa nem duplica ofertas', async () => {
    const before = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    const reread = await ensureInitialPartnerOffers(await localGame.entities.PlayerProfile.get('p512o'), candidates);
    const after = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(after, before, 'recarregar criou atleta');
    assert.equal(reread.length, offers.length, `ofertas foram de ${offers.length} para ${reread.length}`);
  });

  // ---- escolha ----
  const chosen = offers[0];
  const chosenCandidate = offerCandidate(chosen);
  const fresh = await localGame.entities.PlayerProfile.get('p512o');
  const accepted = await acceptPartnerOffer(fresh, chosen);
  const populationAfterChoice = (await localGame.entities.AthleteProfile.list(null, 5000)).length;

  console.log(`\nescolhido: ${chosenCandidate.name} | população -> ${populationAfterChoice}`);

  await check('Parte L/16-18: SÓ o parceiro escolhido é materializado (exatamente 1)', () => {
    assert.equal(populationAfterChoice, populationAfterOffers + 1,
      `criou ${populationAfterChoice - populationAfterOffers} atletas para ${offers.length} ofertas`);
  });

  await check('Parte L: os candidatos NÃO escolhidos continuam sem AthleteProfile', async () => {
    for (const offer of offers) {
      const candidate = offerCandidate(offer);
      if (candidate.id === chosenCandidate.id) continue;
      const persisted = await localGame.entities.AthleteProfile.filter({ id: candidate.id }, null, 1).catch(() => []);
      assert.equal(persisted.length, 0, `${candidate.name} foi materializado sem ter sido escolhido`);
    }
  });

  await check('Parte K: a parceria aponta para o atleta materializado do escolhido', async () => {
    const athlete = (await localGame.entities.AthleteProfile.filter({ id: chosenCandidate.id }, null, 1))[0];
    assert.ok(athlete, 'escolhido não foi materializado');
    assert.equal(accepted.partnership.partner_bot_id, athlete.id);
  });

  await check('Parte N/19: reload DEPOIS da escolha não duplica o parceiro', async () => {
    const before = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    await ensureInitialPartnerOffers(await localGame.entities.PlayerProfile.get('p512o'), candidates);
    const rows = await localGame.entities.AthleteProfile.filter({ id: chosenCandidate.id });
    const after = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
    assert.equal(rows.length, 1, `${rows.length} AthleteProfiles para o mesmo parceiro`);
    assert.equal(after, before, 'recarregar após a escolha criou atleta');
  });

  await check('Parte M: as demais ofertas foram retiradas, não materializadas', async () => {
    const after = await listPartnerOffers('p512o');
    const pending = after.filter((o) => o.status === 'pending');
    assert.equal(pending.length, 0, `${pending.length} ofertas ainda pendentes`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-offer-materializes-selected-only-v512: PASS');
} finally {
  await vite.close();
}
