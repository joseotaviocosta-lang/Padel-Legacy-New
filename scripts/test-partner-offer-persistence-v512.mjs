// Playthrough 5.12 (continuação), Partes K/M/O/P — o parceiro escolhido na
// oferta inicial é persistido com EXATAMENTE os valores mostrados ao
// jogador. Nada pode mudar silenciosamente entre a vitrine e a entidade.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-offer-persistence-v512', search: '' };
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
  const { derivePartnerPotential } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 OfferPersist', playerName: 'P512P' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512p', sport_name: 'P512P', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Amador', coins: 50000, xp: 0, morale: 70, form: 50, energy: 100,
    overall: 40, overall_rating: 40, reputation: 50,
  });
  await ensureWorldSeed2025();

  const candidates = await getAvailablePartners(profile);
  await ensureInitialPartnerOffers(profile, candidates);
  const offers = await listPartnerOffers('p512p');

  // Parte P — as regras da 4.8 seguem valendo: diversidade de perfis, sem
  // "velho + OVR muito baixo" como recomendado. Aqui só OBSERVAMOS, sem
  // retunar scoring.
  const shown = offers.map((o) => offerCandidate(o));
  console.log('ofertas:');
  shown.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} OVR=${c.overall_rating} idade=${c.age} estilo=${c.play_style} lado=${c.preferred_side || c.position}`));
  const ages = shown.map((c) => Number(c.age)).filter(Number.isFinite);
  const ovrs = shown.map((c) => Number(c.overall_rating)).filter(Number.isFinite);
  console.log(`  idades ${Math.min(...ages)}–${Math.max(...ages)} | OVR ${Math.min(...ovrs)}–${Math.max(...ovrs)}`);

  await check('Parte P: as ofertas mantêm diversidade de perfis (4.8 preservada)', () => {
    assert.ok(shown.length >= 3, `só ${shown.length} ofertas`);
    assert.ok(Math.max(...ages) - Math.min(...ages) >= 5,
      `faixa de idade estreita: ${Math.min(...ages)}–${Math.max(...ages)}`);
  });

  await check('Parte P: o recomendado NÃO é "velho + OVR muito baixo"', () => {
    const recommended = offers.find((o) => o.recommended) || offers[0];
    const c = offerCandidate(recommended);
    const isBad = Number(c.age) >= 34 && Number(c.overall_rating) <= 20;
    console.log(`   [registro] recomendado: ${c.name} OVR=${c.overall_rating} idade=${c.age}`);
    assert.ok(!isBad, `recomendado ruim: ${c.name} ${c.overall_rating}/${c.age}`);
  });

  // ---- escolha e comparação campo a campo ----
  const chosenOffer = offers[0];
  const shownCandidate = offerCandidate(chosenOffer);
  const fresh = await localGame.entities.PlayerProfile.get('p512p');
  const accepted = await acceptPartnerOffer(fresh, chosenOffer);
  const athlete = (await localGame.entities.AthleteProfile.filter({ id: shownCandidate.id }, null, 1))[0];

  console.log(`\nvitrine : ${shownCandidate.name} OVR=${shownCandidate.overall_rating} idade=${shownCandidate.age}`);
  console.log(`entidade: ${athlete?.name} OVR=${athlete?.overall_rating} idade=${athlete?.age} potencial=${athlete?.potential}`);

  await check('Parte O/20-22: nome, idade e OVR idênticos ao que foi mostrado', () => {
    assert.ok(athlete, 'escolhido não materializado');
    assert.equal(athlete.name, shownCandidate.name);
    assert.equal(Number(athlete.age), Number(shownCandidate.age));
    assert.equal(Number(athlete.overall_rating), Number(shownCandidate.overall_rating));
    assert.equal(Number(athlete.overall), Number(shownCandidate.overall_rating));
  });

  await check('Parte O/23: potencial é o do template (ou derivado determinístico)', () => {
    assert.equal(Number(athlete.potential), derivePartnerPotential(shownCandidate));
    assert.ok(Number(athlete.potential) >= Number(athlete.overall_rating));
  });

  await check('Parte O: lado, estilo e arquétipo preservados', () => {
    assert.equal(athlete.play_style ?? null, shownCandidate.play_style ?? null);
    assert.equal(athlete.preferred_side ?? null, shownCandidate.preferred_side ?? null);
    assert.equal(athlete.position ?? null, (shownCandidate.position || shownCandidate.preferred_side) ?? null);
    assert.equal(athlete.archetype_id ?? null, shownCandidate.archetype_id ?? null);
  });

  await check('Parte O/24: source_attributes reflete os atributos do template', () => {
    if (!athlete.source_attributes) { console.log('   (template sem atributos numéricos)'); return; }
    for (const [key, value] of Object.entries(athlete.source_attributes)) {
      assert.equal(Number(value), Number(shownCandidate[key] ?? shownCandidate.attributes?.[key]),
        `${key} divergiu`);
    }
    console.log(`   [registro] ${Object.keys(athlete.source_attributes).length} atributos carregados`);
  });

  await check('Parte O: bot_id de origem e id canônico registrados', () => {
    assert.equal(athlete.id, shownCandidate.id, 'id canônico != id do template');
    assert.ok(athlete.bot_id, 'sem bot_id de origem');
    assert.equal(athlete.materialized_from, shownCandidate.id);
  });

  await check('Parte K: contrato da oferta foi aplicado à parceria', () => {
    const terms = chosenOffer.contract || {};
    assert.equal(accepted.partnership.contract_status, 'ativo');
    if (Number.isFinite(Number(terms.prizeSplit))) {
      assert.equal(Number(accepted.partnership.prize_split_pct), Number(terms.prizeSplit));
    }
    assert.ok(accepted.partnership.contract_end_date, 'sem data de fim');
  });

  await check('Parte M: recarregar depois da escolha mantém os mesmos valores', async () => {
    const reread = (await localGame.entities.AthleteProfile.filter({ id: shownCandidate.id }, null, 1))[0];
    assert.equal(reread.id, athlete.id);
    assert.equal(Number(reread.overall_rating), Number(athlete.overall_rating));
    assert.equal(Number(reread.potential), Number(athlete.potential));
    assert.equal(reread.birth_date, athlete.birth_date);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-offer-persistence-v512: PASS');
} finally {
  await vite.close();
}
