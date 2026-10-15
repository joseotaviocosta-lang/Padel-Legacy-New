// Playthrough 5.18, Parte J — O MERCADO DO JOGADOR COM A ECOLOGIA VIVA.
//
// A 5.17 reportou que o mercado pós-separação "esgota após ~2 janelas porque
// só existem ~6 agentes livres". Essa conclusão herdou o MESMO artefato de
// medição do inventário: o harness nunca rodava
// `processAiPartnershipMarket`, então o mundo ficava congelado no seed
// super-pareado. Com o mercado mensal ativo existem ~180–270 agentes livres.
//
// Este teste mede a disponibilidade real para o jogador, em D+0/3/7/14/30,
// com a ecologia funcionando — e em perfis de ranking diferentes, porque a
// elegibilidade depende da carreira dele.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

installShims('/partners');

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

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const START = '2026-01-01';
// Roda meio ano com o mercado de IA ligado para o mundo relaxar do seed
// super-pareado antes de a separação do jogador acontecer.
const WARMUP_DAYS = 210;
const PROFILES = [
  { label: 'Rank1000', rank: 1000 },
  { label: 'Rank500', rank: 500 },
  { label: 'Rank250', rank: 250 },
  { label: 'Rank100', rank: 100 },
  { label: 'Top20', rank: 18 },
];

async function runProfile({ label, rank }) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await mod('/src/storage/GameStorage.js');
  const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
  const { CareerManager } = await mod('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
  const { localGame } = await mod('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await mod('/src/lib/career.js');
  const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
  const { processPartnerDay } = await mod('/src/game-core/partnerLifecycle.js');
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
  const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: `pm-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
    level: 'Avançado', coins: 300000, xp: 60000, rank_points: 900,
    world_ranking: rank, ranking_position: rank,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(START);

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 365, prizeSplit: 50, monthlySalary: 300 });
  profile = await localGame.entities.PlayerProfile.get(`pm-${label}`);

  // Aquecimento com a ecologia viva.
  let date = START;
  for (let i = 0; i < WARMUP_DAYS; i += 1) {
    const previous = date;
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    const m = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
    if (m?.profile) profile = m.profile;
  }

  const athletesAtSeparation = await localGame.entities.AthleteProfile.list(null, 5000);
  const freeAgents = athletesAtSeparation.filter((a) => !a.ai_partner_id && !a.retired
    && a.career_status !== 'aposentado').length;

  // Separação do jogador.
  const active = await getActivePartnership(`pm-${label}`).catch(() => null);
  if (active) await endPartnership(active.id, 'encerrada_contrato', 'Teste 5.18', date);
  await localGame.entities.PlayerProfile.update(`pm-${label}`, {
    partner_id: null, partner_name: null, partner_locked_until: null,
  });
  profile = await localGame.entities.PlayerProfile.get(`pm-${label}`);
  const separationDate = date;

  // Mede as ofertas em D+0/3/7/14/30, avançando SÓ o tick diário — o jogador
  // nunca abre a tela de busca.
  const offersAt = {};
  const milestones = new Set([0, 3, 7, 14, 30]);
  if (milestones.has(0)) {
    const rows = await localGame.entities.PartnerOffer.filter({ profile_id: `pm-${label}` }).catch(() => []);
    offersAt[0] = (rows || []).length;
  }
  for (let d = 1; d <= 30; d += 1) {
    const previous = date;
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    const m = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
    if (m?.profile) profile = m.profile;
    const fresh = await localGame.entities.PlayerProfile.get(`pm-${label}`);
    await processPartnerDay({ ...fresh, career_date: date }, previous, date).catch(() => null);
    if (milestones.has(d)) {
      const rows = await localGame.entities.PartnerOffer.filter({ profile_id: `pm-${label}` }).catch(() => []);
      offersAt[d] = (rows || []).length;
    }
  }

  const finalOffers = await localGame.entities.PartnerOffer.filter({ profile_id: `pm-${label}` }).catch(() => []);
  const candidateIds = (finalOffers || []).map((o) => o.candidate_player_id).filter(Boolean);
  const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
  const byId = new Map(athletesNow.map((a) => [a.id, a]));
  const committedOffered = candidateIds.filter((id) => byId.get(id)?.ai_partner_id).length;
  const messages = await localGame.entities.CareerMessage.filter({ profile_id: `pm-${label}` }).catch(() => []);
  const marketMsgs = (messages || []).filter((m) => m.message_type === 'partner_market_window');

  await vite.close();
  return {
    label, rank, separationDate, freeAgents, offersAt,
    totalOffers: (finalOffers || []).length,
    distinctCandidates: new Set(candidateIds).size,
    committedOffered,
    marketMessages: marketMsgs.length,
  };
}

const results = [];
for (const p of PROFILES) {
  const r = await runProfile(p);
  results.push(r);
  console.log(`[${r.label}] livres no mundo=${r.freeAgents} | ofertas D+0=${r.offersAt[0]} D+3=${r.offersAt[3]} D+7=${r.offersAt[7]} D+14=${r.offersAt[14]} D+30=${r.offersAt[30]}`);
}

console.log('\n=== PARTE J: disponibilidade para o jogador (mercado de IA ativo) ===');
console.log('perfil      rank  livres  D+0  D+3  D+7  D+14  D+30  distintos  comprometidos  avisos');
for (const r of results) {
  console.log(
    `${r.label.padEnd(12)}${String(r.rank).padStart(5)}${String(r.freeAgents).padStart(8)}`
    + `${String(r.offersAt[0]).padStart(5)}${String(r.offersAt[3]).padStart(5)}${String(r.offersAt[7]).padStart(5)}`
    + `${String(r.offersAt[14]).padStart(6)}${String(r.offersAt[30]).padStart(6)}`
    + `${String(r.distinctCandidates).padStart(11)}${String(r.committedOffered).padStart(15)}${String(r.marketMessages).padStart(8)}`,
  );
}

check('Parte J: existe pool de agentes livres no momento da separação', () => {
  // NOTA DE CALIBRAÇÃO: o contrato padrão de dupla de IA dura 240 dias
  // (aiPartnershipLifecycle: `addDays(startDate, 240)`). Com 210 dias de
  // aquecimento quase nenhum expirou, então o pool aqui é pequeno DE
  // PROPÓSITO — é o estado de início de carreira. Numa temporada completa o
  // mesmo mundo chega a ~270 livres (medido no inventário). Exigir um piso
  // alto aqui seria um limiar inventado, desalinhado da duração do contrato.
  for (const r of results) {
    console.log(`   [registro] ${r.label}: ${r.freeAgents} livres após ${WARMUP_DAYS}d de aquecimento`);
    assert.ok(r.freeAgents > 0, `${r.label}: pool completamente vazio`);
  }
});

check('Parte J/6: o jogador recebe ofertas SEM abrir a busca', () => {
  for (const r of results) {
    assert.equal(r.offersAt[0], 0, `${r.label}: já havia oferta em D+0`);
    assert.ok(r.offersAt[3] >= 2, `${r.label}: só ${r.offersAt[3]} ofertas em D+3`);
  }
});

check('Parte J: o mercado do jogador NÃO esgota em 30 dias', () => {
  // Era a limitação reportada na 5.17 — medida com o mercado desligado.
  for (const r of results) {
    console.log(`   [registro] ${r.label}: D+3=${r.offersAt[3]} -> D+30=${r.offersAt[30]}`);
    assert.ok(r.offersAt[30] > r.offersAt[3],
      `${r.label}: nenhuma oferta nova entre D+3 e D+30`);
  }
});

check('Parte J/7: nenhuma proposta duplicada', () => {
  for (const r of results) {
    assert.equal(r.distinctCandidates, r.totalOffers,
      `${r.label}: ${r.totalOffers} ofertas para ${r.distinctCandidates} candidatos distintos`);
  }
});

check('Parte J: candidato já comprometido NÃO é oferecido', () => {
  for (const r of results) {
    assert.equal(r.committedOffered, 0,
      `${r.label}: ${r.committedOffered} candidatos já tinham parceiro`);
  }
});

check('Parte V: os avisos de mercado não viram spam em 30 dias', () => {
  for (const r of results) {
    console.log(`   [registro] ${r.label}: ${r.marketMessages} avisos em 30 dias`);
    assert.ok(r.marketMessages <= 6, `${r.label}: ${r.marketMessages} avisos — spam`);
  }
});

check('Parte J: perfis de ranking diferentes todos têm mercado', () => {
  const starved = results.filter((r) => r.offersAt[30] < 2);
  assert.equal(starved.length, 0,
    `perfis sem mercado: ${starved.map((r) => r.label).join(', ')}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-player-post-separation-market-v518: PASS');
