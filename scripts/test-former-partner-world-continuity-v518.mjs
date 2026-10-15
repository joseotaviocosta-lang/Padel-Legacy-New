// Playthrough 5.18-D, Parte I — CONTINUIDADE DO EX-PARCEIRO.
//
// Depois da separação o ex-parceiro não pode "voltar a ser template": ele
// continua AthleteProfile persistente (regra da 5.12), evolui, mantém ranking
// individual/Race/Circuit, pode formar dupla de IA pelo mercado mensal, pode
// entrar em torneio e pode reaparecer como adversário.
//
// Diferente da validação da 5.17 (que só checava existência imediata), aqui o
// mundo AVANÇA com paridade de produção depois da separação, para provar que
// ele segue vivo no ecossistema.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
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
const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');
const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'ExParceiro', playerName: 'ExParceiro' });
activeCareerAdapter.setActiveCareer(career);
let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'ex-parceiro', sport_name: 'ExParceiro', career_date: START, birth_date: '2001-01-01',
  level: 'Avançado', coins: 300000, xp: 60000, court_side: 'direita',
  rank_points: 900, world_ranking: 400, ranking_position: 400,
});
await ensureWorldSeed2025();
await ensureFutureTournaments(START);

const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
await formPartnerContract(profile, bot, { durationDays: 365, prizeSplit: 50, monthlySalary: 300 });
profile = await localGame.entities.PlayerProfile.get('ex-parceiro');

// Estado do ex-parceiro ANTES da separação.
const partnerBefore = await localGame.entities.AthleteProfile.get(bot.id).catch(() => null)
  || (await localGame.entities.AthleteProfile.filter({ bot_id: bot.id }).catch(() => []))[0];
assert.ok(partnerBefore, 'pré-condição: parceiro não materializado como AthleteProfile');
const EX_ID = partnerBefore.id;
const BEFORE = {
  id: partnerBefore.id,
  name: partnerBefore.sport_name || partnerBefore.name,
  ovr: Number(partnerBefore.overall_rating) || 0,
  rank: Number(partnerBefore.ranking_position) || 0,
  racePoints: Number(partnerBefore.race_points) || 0,
  circuitPoints: Number(partnerBefore.world_ranking_points) || 0,
};
console.log(`ex-parceiro antes: ${BEFORE.name} OVR=${BEFORE.ovr} rank=${BEFORE.rank} race=${BEFORE.racePoints} circuit=${BEFORE.circuitPoints}`);

// --- Separação ------------------------------------------------------------
const SEPARATION = '2026-02-15';
const active = await getActivePartnership('ex-parceiro');
await endPartnership(active.id, 'encerrada_jogador', 'Teste 5.18-D', SEPARATION);
await localGame.entities.PlayerProfile.update('ex-parceiro', {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get('ex-parceiro');

await check('Parte I: o ex-parceiro CONTINUA AthleteProfile após a separação', async () => {
  const still = await localGame.entities.AthleteProfile.get(EX_ID).catch(() => null);
  console.log(`   [registro] ${still ? (still.sport_name || still.name) : 'AUSENTE'}`);
  assert.ok(still, 'o ex-parceiro deixou de existir como AthleteProfile');
  assert.equal(still.id, EX_ID, 'o id mudou — virou outro registro');
});

// --- O mundo avança 6 meses com paridade ---------------------------------
let circuitAnchor = SEPARATION;
let date = SEPARATION;
for (let i = 0; i < 180; i += 1) {
  const previous = date;
  date = addDays(date, 1);
  await ensureWorldTourDraws(date).catch(() => null);
  await resolveCompletedWorldTourEvents(date).catch(() => null);
  const world = await simulateWorldDay(profile, previous, date).catch(() => null);
  if (world?.profile) profile = world.profile;
  const market = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
  if (market?.profile) profile = market.profile;
  if ((i + 1) % 14 === 0) {
    const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
    if (c?.profile) profile = c.profile;
    circuitAnchor = date;
  }
  if ((i + 1) % 60 === 0) await ensureFutureTournaments(date).catch(() => null);
}

const after = await localGame.entities.AthleteProfile.get(EX_ID).catch(() => null);
const tournaments = await localGame.entities.Tournament.list('start_date', 5000);
const partnerships = await localGame.entities.Partnership.list(null, 5000).catch(() => []);
const AFTER = after ? {
  ovr: Number(after.overall_rating) || 0,
  rank: Number(after.ranking_position) || 0,
  racePoints: Number(after.race_points) || 0,
  circuitPoints: Number(after.world_ranking_points) || 0,
  aiPartner: after.ai_partner_id || null,
  retired: Boolean(after.retired),
} : null;
console.log(`ex-parceiro depois: OVR=${AFTER?.ovr} rank=${AFTER?.rank} race=${AFTER?.racePoints} circuit=${AFTER?.circuitPoints} dupla=${AFTER?.aiPartner || 'nenhuma'}`);

await check('Parte I: permanece no mundo depois de 6 meses', () => {
  assert.ok(after, 'o ex-parceiro desapareceu durante a simulação');
  assert.ok(!AFTER.retired || AFTER.rank > 0, 'sem ranking nem status coerente');
});

await check('Parte I: o ranking individual continua existindo', () => {
  console.log(`   [registro] rank ${BEFORE.rank} -> ${AFTER.rank}`);
  assert.ok(AFTER.rank > 0, 'perdeu ranking individual');
});

await check('Parte I: Race e Circuit continuam acumulando/existindo', () => {
  console.log(`   [registro] race ${BEFORE.racePoints} -> ${AFTER.racePoints} | circuit ${BEFORE.circuitPoints} -> ${AFTER.circuitPoints}`);
  assert.ok(Number.isFinite(AFTER.racePoints) && AFTER.racePoints >= 0, 'Race inválida');
  assert.ok(Number.isFinite(AFTER.circuitPoints) && AFTER.circuitPoints >= 0, 'Circuit inválido');
});

await check('Parte I: o desenvolvimento (OVR) segue seu curso', () => {
  console.log(`   [registro] OVR ${BEFORE.ovr} -> ${AFTER.ovr}`);
  assert.ok(AFTER.ovr > 0, 'OVR zerado');
  // Não se exige subir (veterano pode declinar) — exige-se não congelar em 0
  // nem virar NaN.
  assert.ok(Number.isFinite(AFTER.ovr));
});

await check('Parte I: pode formar dupla de IA pelo mercado', () => {
  console.log(`   [registro] parceiro de IA atual: ${AFTER.aiPartner || 'nenhum'}`);
  // Não é garantido que o mercado o pareie em 6 meses; o que se exige é que
  // ele seja ELEGÍVEL — ou seja, esteja livre e não retirado, ou já pareado.
  const eligible = Boolean(AFTER.aiPartner) || (!AFTER.retired);
  assert.ok(eligible, 'ficou inelegível para o mercado');
});

await check('Parte I: pode voltar a competir (aparece em campo sorteado)', () => {
  const drawn = tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));
  const membersOf = (pid) => {
    const raw = String(pid);
    if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
    const p = partnershipById.get(raw);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };
  let appearances = 0;
  for (const t of drawn) {
    for (const pid of t.draw_pair_ids) {
      if (membersOf(pid).includes(EX_ID)) { appearances += 1; break; }
    }
  }
  console.log(`   [registro] aparições em campo sorteado após a separação: ${appearances}`);
  // Se o mercado o pareou, ele deve ter competido. Se ainda está livre, zero é
  // legítimo — e nesse caso o gate anterior já garantiu elegibilidade.
  if (AFTER.aiPartner) {
    assert.ok(appearances > 0, 'pareado mas nunca competiu em 6 meses');
  } else {
    assert.ok(appearances >= 0);
  }
});

await check('Parte I: NÃO voltou a ser template estático', async () => {
  // Regra da 5.12: depois de materializado, o parceiro é AthleteProfile
  // persistente. Um id de bot estático reaparecendo no lugar seria regressão.
  const byBot = await localGame.entities.AthleteProfile.filter({ bot_id: bot.id }).catch(() => []);
  console.log(`   [registro] registros com bot_id=${bot.id}: ${(byBot || []).length}`);
  assert.ok((byBot || []).length <= 1, 'mais de um AthleteProfile para o mesmo template');
  assert.equal(after.id, EX_ID, 'a identidade persistente mudou');
});

// --- SONDA DE DÍVIDA (5.18-D) --------------------------------------------
// As checagens acima confirmam o critério de aceite ("ex-parceiro continua no
// mundo"): ele existe, tem id estável, não virou template. Mas os números
// observados mostram um BECO SEM SAÍDA funcional que não quero deixar passar
// por asserção permissiva: materializado com 0 pontos, ele fica no fim do
// ranking, o mercado mensal não o pareia, sem dupla não entra em torneio, e
// sem torneio não pontua nem evolui.
//
// Esta sonda FALHA de propósito quando isso acontece. A Regra Zero proíbe
// retunar mercado/evolução nesta continuação, então o objetivo aqui é
// registrar a dívida com dado, não corrigi-la às escondidas.
await check('SONDA DE DÍVIDA: o ex-parceiro não fica em beco sem saída', () => {
  const stalled = !AFTER.aiPartner
    && AFTER.racePoints === 0
    && AFTER.circuitPoints === 0
    && AFTER.ovr === BEFORE.ovr;
  console.log(`   [registro] pareado=${Boolean(AFTER.aiPartner)} race=${AFTER.racePoints} circuit=${AFTER.circuitPoints} OVR ${BEFORE.ovr}->${AFTER.ovr} rank=${AFTER.rank}`);
  assert.ok(!stalled,
    'após 6 meses: sem dupla, sem Race, sem Circuit e sem evolução de OVR — '
    + `ex-parceiro isolado do ecossistema (rank ${AFTER.rank})`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-former-partner-world-continuity-v518: PASS');
