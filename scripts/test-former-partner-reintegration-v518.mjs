// Playthrough 5.18-E, Partes A/B/C — REPRODUZIR E PROVAR O BECO SEM SAÍDA.
//
// A 5.18-D deixou uma sonda vermelha: o ex-parceiro do jogador passava 6 meses
// com OVR 64→64, Race 0, Circuit 0, rank #1001, sem dupla e sem competir.
// Este teste instrumenta MÊS A MÊS para provar a causa, antes de qualquer
// correção (a fase proíbe corrigir antes de responder a Parte B).
//
// Hipóteses candidatas, levantadas por leitura de código:
//   H1  `hasHumanContract` mantém o ex-parceiro fora de `availableAthletes`
//       para sempre (marcadores não limpos na separação).
//   H2  `rankGapWeight = exp(-gap*0.01)` penaliza ~150× um atleta a 500
//       posições de distância, então ele nunca é sorteado como `second`.
//   H3  `targetPairs = floor(free.length * 0.14 / 2)` dá ZERO quando o pool
//       livre é pequeno (<15), deixando o mercado inerte por completo.
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
const {
  processAiPartnershipMarket, MARKET_FORMATION_FRACTION, MARKET_WAIT_RESERVED_SHARE,
} = await mod('/src/game-core/aiPartnershipLifecycle.js');
const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');
const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'Reintegracao', playerName: 'Reintegracao' });
activeCareerAdapter.setActiveCareer(career);
let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'reint', sport_name: 'Reintegracao', career_date: START, birth_date: '2001-01-01',
  level: 'Avançado', coins: 300000, xp: 60000, court_side: 'direita',
  rank_points: 900, world_ranking: 400, ranking_position: 400,
});
await ensureWorldSeed2025();
await ensureFutureTournaments(START);

const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
await formPartnerContract(profile, bot, { durationDays: 60, prizeSplit: 50, monthlySalary: 300 });
profile = await localGame.entities.PlayerProfile.get('reint');

const partnerRow = await localGame.entities.AthleteProfile.get(bot.id).catch(() => null);
const EX_ID = partnerRow?.id || bot.id;
console.log(`ex-parceiro: ${partnerRow?.sport_name || partnerRow?.name} id=${EX_ID} OVR=${partnerRow?.overall_rating}`);

// Separação precoce, para maximizar o tempo de observação.
const SEPARATION = '2026-01-20';
const active = await getActivePartnership('reint');
await endPartnership(active.id, 'encerrada_jogador', 'Teste 5.18-E', SEPARATION);
await localGame.entities.PlayerProfile.update('reint', {
  partner_id: null, partner_name: null, partner_locked_until: null,
});
profile = await localGame.entities.PlayerProfile.get('reint');

// H1 — os marcadores de contrato humano foram limpos?
const afterSeparation = await localGame.entities.AthleteProfile.get(EX_ID);
await check('Parte B/H1: os marcadores de contrato humano SÃO limpos na separação', () => {
  console.log(`   [registro] current_partner_profile_id=${afterSeparation.current_partner_profile_id} contracted_to_profile_id=${afterSeparation.contracted_to_profile_id} market_status=${afterSeparation.market_status}`);
  assert.ok(!afterSeparation.current_partner_profile_id, 'current_partner_profile_id não foi limpo — H1 confirmada');
  assert.ok(!afterSeparation.contracted_to_profile_id, 'contracted_to_profile_id não foi limpo — H1 confirmada');
});

// --- 12 meses com instrumentação MENSAL ----------------------------------
const monthly = [];
let circuitAnchor = SEPARATION;
let date = SEPARATION;
const drawnByMonth = new Map();

for (let i = 0; i < 365; i += 1) {
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

  if (market && !market.skipped) {
    // Snapshot no mês em que o mercado rodou.
    const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
    const ex = athletes.find((a) => a.id === EX_ID);
    const freePool = athletes.filter((a) => a?.id && !a.retired && a.career_status !== 'aposentado'
      && !a.ai_partner_id && !a.current_partner_profile_id && !a.contracted_to_profile_id
      && !(a.injured_until && a.injured_until >= date));
    const targetPairs = Math.max(0, Math.floor((freePool.length * MARKET_FORMATION_FRACTION) / 2));
    const reserved = Math.round(targetPairs * MARKET_WAIT_RESERVED_SHARE);
    const exRank = Number(ex?.ranking_position) || 0;
    // Candidatos "compatíveis": livres com rank a até 150 posições.
    const nearby = freePool.filter((a) => a.id !== EX_ID
      && Math.abs((Number(a.ranking_position) || 9999) - exRank) <= 150).length;
    monthly.push({
      date,
      inFreePool: freePool.some((a) => a.id === EX_ID),
      freePoolSize: freePool.length,
      targetPairs,
      reserved,
      formed: Number(market.formed) || 0,
      dissolved: Number(market.dissolved) || 0,
      exRank,
      exOvr: Number(ex?.overall_rating) || 0,
      exCircuit: Number(ex?.world_ranking_points) || 0,
      exRace: Number(ex?.race_points) || 0,
      exPartner: ex?.ai_partner_id || null,
      nearbyCandidates: nearby,
      freeDays: ex?.market_status_since
        ? Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${String(ex.market_status_since).slice(0, 10)}T00:00:00Z`)) / 86400000)
        : null,
    });
  }
}

// Torneios do ex-parceiro.
const tournaments = await localGame.entities.Tournament.list('start_date', 5000);
const partnerships = await localGame.entities.Partnership.list(null, 5000).catch(() => []);
const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));
const membersOf = (pid) => {
  const raw = String(pid);
  if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
  const p = partnershipById.get(raw);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};
let exAppearances = 0;
for (const t of tournaments) {
  if (!Array.isArray(t.draw_pair_ids)) continue;
  for (const pid of t.draw_pair_ids) {
    if (membersOf(pid).includes(EX_ID)) { exAppearances += 1; break; }
  }
}

await vite.close();

console.log('\n=== PARTE A: instrumentação mensal do ex-parceiro (12 meses) ===');
console.log('data        noPool  poolLivre  alvoPares  reserv  formadas  dissolv  rank   OVR  circuit  dupla  proximos  diasLivre');
for (const m of monthly) {
  console.log(
    `${m.date}  ${String(m.inFreePool).padEnd(7)}${String(m.freePoolSize).padStart(10)}${String(m.targetPairs).padStart(11)}`
    + `${String(m.reserved).padStart(8)}${String(m.formed).padStart(10)}${String(m.dissolved).padStart(9)}`
    + `${String(m.exRank).padStart(6)}${String(m.exOvr).padStart(6)}${String(m.exCircuit).padStart(9)}`
    + `${String(m.exPartner ? 'sim' : 'não').padStart(7)}${String(m.nearbyCandidates).padStart(10)}${String(m.freeDays ?? '-').padStart(11)}`,
  );
}
console.log(`\naparições do ex-parceiro em torneio: ${exAppearances}`);

const monthsInPool = monthly.filter((m) => m.inFreePool).length;
const monthsMarketInert = monthly.filter((m) => m.targetPairs === 0).length;
const monthsWithFormation = monthly.filter((m) => m.formed > 0).length;
const paired = monthly.some((m) => m.exPartner);

await check('Parte A: a instrumentação cobriu 12 meses de mercado', () => {
  console.log(`   [registro] meses observados=${monthly.length}`);
  assert.ok(monthly.length >= 11, `só ${monthly.length} meses`);
});

await check('Parte B/H1: H1 REFUTADA — o ex-parceiro ENTRA no pool livre', () => {
  // CORREÇÃO DE ASSERÇÃO: "fora do pool" não é exclusão — é o oposto,
  // significa que ele CONSEGUIU dupla (o pool é de quem está livre). A versão
  // anterior exigia estar no pool em 11 de 12 meses e reprovava justamente o
  // desfecho desejado. O que H1 afirmaria é ele nunca entrar no pool enquanto
  // está livre.
  const whileFree = monthly.filter((m) => !m.exPartner);
  const inPoolWhileFree = whileFree.filter((m) => m.inFreePool).length;
  console.log(`   [registro] meses livre=${whileFree.length} | destes, no pool=${inPoolWhileFree}`);
  assert.equal(inPoolWhileFree, whileFree.length,
    'havia mês em que ele estava livre e FORA do pool — H1 seria a causa');
});

await check('Parte B/H3: o mercado fica INERTE quando o pool é pequeno', () => {
  // `targetPairs = floor(free.length * 0.14 / 2)` => 0 para free.length < 15.
  const small = monthly.filter((m) => m.freePoolSize < 15);
  const inertAmongSmall = small.filter((m) => m.targetPairs === 0).length;
  console.log(`   [registro] meses com pool<15: ${small.length} | destes, alvo=0: ${inertAmongSmall}`);
  console.log(`   [registro] meses com mercado inerte (alvo=0): ${monthsMarketInert}/${monthly.length}`);
  if (small.length) {
    assert.equal(inertAmongSmall, small.length,
      'pool pequeno sem inércia — H3 não explica');
  }
});

await check('Parte C: rank #1001 significa SEM PONTOS, não atleta fraco', () => {
  // CORREÇÃO DE ASSERÇÃO (2ª): as versões anteriores mediam o período ÓRFÃO,
  // que depois da correção de convergência pode ser VAZIO — e `Math.max` de
  // conjunto vazio devolve -Infinity. A distinção UNRANKED × LOWEST_RANKED não
  // depende de ele estar órfão: ela existe sempre que um atleta de OVR
  // competitivo aparece no fim da tabela por ter zero pontos.
  const zeroPointMonths = monthly.filter((m) => m.exCircuit === 0 && m.exRank > 0);
  assert.ok(zeroPointMonths.length > 0, 'nenhum mês com zero pontos para avaliar');
  const ranks = zeroPointMonths.map((m) => m.exRank);
  const ovrs = zeroPointMonths.map((m) => m.exOvr);
  console.log(`   [registro] com 0 pontos de Circuit: rank ${Math.min(...ranks)}–${Math.max(...ranks)}, OVR ${Math.min(...ovrs)}–${Math.max(...ovrs)}`);
  assert.ok(Math.min(...ovrs) >= 55,
    `OVR ${Math.min(...ovrs)} — seria atleta estruturalmente fraco, não o caso da Parte C`);
  assert.ok(Math.max(...ranks) >= 900,
    `rank máximo ${Math.max(...ranks)} — não reproduz a confusão #1001 sem pontos`);
  console.log('   [conclusão] o sistema NÃO distingue "sem pontos" de "pior atleta": '
    + `OVR ${Math.max(...ovrs)} classificado em #${Math.max(...ranks)}`);
});

await check('Parte F/Y: a reintegração é de PAREAMENTO — competir é outro degrau', () => {
  // Achado honesto: com a correção, ele encontra dupla imediatamente, mas
  // registrou 0 aparições em torneio em 12 meses. O ciclo de PONTOS continua
  // fechado por outra via — uma dupla no fim da tabela raramente é elegível/
  // selecionada para os eventos. Corrigir isso exigiria mexer em
  // eligibility/chooseTournament, que são sistemas protegidos nesta fase.
  const paired = monthly.filter((m) => m.exPartner).length;
  console.log(`   [registro] meses com dupla=${paired}/${monthly.length} | aparições em torneio=${exAppearances} | circuit final=${monthly[monthly.length - 1].exCircuit}`);
  assert.ok(paired >= monthly.length - 1,
    `só ${paired} meses com dupla — o pareamento não convergiu`);
  if (exAppearances === 0) {
    console.log('   [dívida] pareado mas sem competir em 12 meses: o ciclo '
      + 'pontos->rank->seleção segue fechado para dupla de fundo de tabela');
  }
});

await check('Parte E: o ex-parceiro NÃO fica em limbo algorítmico por 12 meses', () => {
  const last = monthly[monthly.length - 1];
  console.log(`   [registro] pareado em algum mês=${paired} | meses com formação no mundo=${monthsWithFormation} | aparições=${exAppearances}`);
  assert.ok(paired || exAppearances > 0,
    `12 meses livre: pool médio=${Math.round(monthly.reduce((s, m) => s + m.freePoolSize, 0) / monthly.length)}, `
    + `candidatos próximos no último mês=${last.nearbyCandidates}, `
    + `meses de mercado inerte=${monthsMarketInert} — limbo algorítmico confirmado`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-former-partner-reintegration-v518: PASS');
