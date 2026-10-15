// Playthrough 5.18, Partes A/B/C — INVENTÁRIO DA ECOLOGIA, MEDIDO ANTES DE
// QUALQUER ALTERAÇÃO.
//
// CORREÇÃO DE PREMISSA (a mais importante desta fase):
//
// A 5.17 reportou "~994 de 1000 atletas pareados, ~6 livres" e concluiu que o
// pool de agentes livres era estruturalmente vazio. Essa medição estava
// ERRADA por omissão do harness: `runHeadlessWorldSimulation` chama
// ensureWorldTourDraws + resolveCompletedWorldTourEvents + processWorldCircuit,
// mas NUNCA chama `processAiPartnershipMarket` — a autoridade mensal que
// dissolve e forma duplas de IA (aiPartnershipLifecycle.js, acionada em
// produção por gameStateLifecycle.js:120).
//
// Ou seja: o mundo medido era o estado de SEED arrastado por um ano, com o
// mercado desligado. Este teste mede a ecologia com o lifecycle REAL rodando,
// que é o que a Parte A pede.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';
import { buildOriginIndex, ORIGIN } from './lib/originClassifier.mjs';

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

const BANDS = [
  ['Top 20', 1, 20], ['21–50', 21, 50], ['51–100', 51, 100],
  ['101–250', 101, 250], ['251–500', 251, 500], ['501–1000', 501, 100000],
];

const START = '2026-01-01';

/**
 * `runMarket` liga ou desliga `processAiPartnershipMarket`. Rodar as duas
 * versões é o que prova se o pool vazio é estrutural ou artefato de medição.
 */
async function runEcology({ label, years, runMarket }) {
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

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: `eco-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(START);

  const snapshot = async (when) => {
    const [athletes, partnerships, teams] = await Promise.all([
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      localGame.entities.TeamRanking.list('-ranking_points', 5000),
    ]);
    const active = (partnerships || []).filter((p) => p.status === 'ativa');
    const appearances = new Map();
    for (const p of active) {
      for (const id of [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id].filter(Boolean)) {
        appearances.set(id, (appearances.get(id) || 0) + 1);
      }
    }
    const withPartnerId = athletes.filter((a) => a.ai_partner_id);
    const free = athletes.filter((a) => !a.ai_partner_id && !a.retired && a.career_status !== 'aposentado');
    // Reciprocidade: A aponta B e B aponta A.
    const byId = new Map(athletes.map((a) => [a.id, a]));
    let unilateral = 0;
    for (const a of withPartnerId) {
      const b = byId.get(a.ai_partner_id);
      if (!b || b.ai_partner_id !== a.id) unilateral += 1;
    }
    return {
      when,
      athletes: athletes.length,
      withPartnerId: withPartnerId.length,
      free: free.length,
      activePartnerships: active.length,
      inOnePair: [...appearances.values()].filter((n) => n === 1).length,
      inTwoPlus: [...appearances.values()].filter((n) => n > 1).length,
      unilateral,
      teams: teams.length,
      athletesRaw: athletes,
    };
  };

  const t0 = await snapshot('T0 (seed)');

  let circuitAnchor = START;
  let date = START;
  let marketMonths = 0;
  let formedTotal = 0;
  let dissolvedTotal = 0;
  const freeSince = new Map();
  const perSeason = [];

  for (let i = 0; i < years * 365; i += 1) {
    const previous = date;
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    if (runMarket) {
      const r = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
      if (r && !r.skipped) {
        marketMonths += 1;
        formedTotal += Number(r.formed) || 0;
        dissolvedTotal += Number(r.dissolved) || 0;
        if (r.profile) profile = r.profile;
      }
    }
    if ((i + 1) % 14 === 0) {
      const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
      if (c?.profile) profile = c.profile;
      circuitAnchor = date;
    }
    // Rastreia há quanto tempo cada atleta está livre.
    if ((i + 1) % 7 === 0) {
      const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
      for (const a of athletes) {
        const isFree = !a.ai_partner_id && !a.retired;
        if (isFree && !freeSince.has(a.id)) freeSince.set(a.id, date);
        if (!isFree) freeSince.delete(a.id);
      }
    }
    if ((i + 1) % 365 === 0) {
      const s = await snapshot(`fim T${perSeason.length + 1}`);
      perSeason.push({ ...s, formedTotal, dissolvedTotal, marketMonths });
    }
  }

  const tEnd = await snapshot(`T${years} (fim)`);
  const athletes = tEnd.athletesRaw;
  const originIndex = await buildOriginIndex(vite, athletes);
  await vite.close();

  // Duração do estado livre no fim.
  const longFree = { d30: 0, d90: 0, d180: 0 };
  for (const [, since] of freeSince) {
    const days = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${since}T00:00:00Z`)) / 86400000);
    if (days > 30) longFree.d30 += 1;
    if (days > 90) longFree.d90 += 1;
    if (days > 180) longFree.d180 += 1;
  }

  // Distribuição de livres por faixa de ranking.
  const bands = BANDS.map(([name, lo, hi]) => {
    const inBand = athletes.filter((a) => {
      const r = Number(a.ranking_position) || 99999;
      return r >= lo && r <= hi;
    });
    const free = inBand.filter((a) => !a.ai_partner_id && !a.retired);
    return { name, total: inBand.length, paired: inBand.length - free.length, free: free.length };
  });

  const { originById } = originIndex;
  const freeAthletes = athletes.filter((a) => !a.ai_partner_id && !a.retired);
  const freeReal = freeAthletes.filter((a) => originById.get(a.id) === ORIGIN.REAL).length;

  return {
    label, runMarket, years,
    t0, tEnd, perSeason, bands,
    marketMonths, formedTotal, dissolvedTotal, longFree,
    freeReal, freeProcedural: freeAthletes.length - freeReal,
    freeByAge: {
      u23: freeAthletes.filter((a) => Number(a.age) > 0 && Number(a.age) < 23).length,
      a23_29: freeAthletes.filter((a) => Number(a.age) >= 23 && Number(a.age) <= 29).length,
      o30: freeAthletes.filter((a) => Number(a.age) > 29).length,
    },
  };
}

// --- Medição 1: mercado DESLIGADO (reproduz o que a 5.17 mediu) -----------
console.log('=== MEDIÇÃO 1: sem processAiPartnershipMarket (como a 5.17 media) ===');
const noMarket = await runEcology({ label: 'SemMercado', years: 1, runMarket: false });
console.log(`T0: atletas=${noMarket.t0.athletes} pareados=${noMarket.t0.withPartnerId} livres=${noMarket.t0.free}`);
console.log(`fim: atletas=${noMarket.tEnd.athletes} pareados=${noMarket.tEnd.withPartnerId} livres=${noMarket.tEnd.free}`);

// --- Medição 2: mercado LIGADO (o lifecycle real) -------------------------
console.log('\n=== MEDIÇÃO 2: com processAiPartnershipMarket (lifecycle real) ===');
const withMarket = await runEcology({ label: 'ComMercado', years: 1, runMarket: true });
console.log(`T0: atletas=${withMarket.t0.athletes} pareados=${withMarket.t0.withPartnerId} livres=${withMarket.t0.free}`);
console.log(`fim: atletas=${withMarket.tEnd.athletes} pareados=${withMarket.tEnd.withPartnerId} livres=${withMarket.tEnd.free}`);
console.log(`meses de mercado=${withMarket.marketMonths} formadas=${withMarket.formedTotal} dissolvidas=${withMarket.dissolvedTotal}`);

console.log('\n=== PARTE A: livres por faixa de ranking (com mercado, fim da temporada) ===');
console.log('Faixa        Atletas  Pareados  Livres  % livres');
for (const b of withMarket.bands) {
  const pct = b.total ? (b.free / b.total) * 100 : 0;
  console.log(`${b.name.padEnd(13)}${String(b.total).padStart(7)}${String(b.paired).padStart(10)}${String(b.free).padStart(8)}${`${pct.toFixed(0)}%`.padStart(10)}`);
}

console.log('\n=== PARTE A: perfil dos agentes livres ===');
console.log(`reais=${withMarket.freeReal} procedurais=${withMarket.freeProcedural}`);
console.log(`idade: <23=${withMarket.freeByAge.u23} 23-29=${withMarket.freeByAge.a23_29} 30+=${withMarket.freeByAge.o30}`);
console.log(`livres >30d=${withMarket.longFree.d30} >90d=${withMarket.longFree.d90} >180d=${withMarket.longFree.d180}`);

console.log('\n=== PARTE C: comparativo das duas medições ===');
console.log('métrica                      sem mercado   com mercado');
const rows = [
  ['livres no fim', noMarket.tEnd.free, withMarket.tEnd.free],
  ['pareados no fim', noMarket.tEnd.withPartnerId, withMarket.tEnd.withPartnerId],
  ['parcerias ativas', noMarket.tEnd.activePartnerships, withMarket.tEnd.activePartnerships],
  ['duplas no ranking', noMarket.tEnd.teams, withMarket.tEnd.teams],
  ['atleta em 2+ duplas', noMarket.tEnd.inTwoPlus, withMarket.tEnd.inTwoPlus],
  ['parcerias unilaterais', noMarket.tEnd.unilateral, withMarket.tEnd.unilateral],
];
for (const [name, a, b] of rows) {
  console.log(`${name.padEnd(28)}${String(a).padStart(12)}${String(b).padStart(14)}`);
}

check('Parte A/B: o mercado mensal de IA EXISTE e roda', () => {
  console.log(`   [registro] meses processados=${withMarket.marketMonths} formadas=${withMarket.formedTotal} dissolvidas=${withMarket.dissolvedTotal}`);
  assert.ok(withMarket.marketMonths >= 11, `só ${withMarket.marketMonths} meses de mercado em 1 ano`);
});

check('Parte C: o mercado REALMENTE dissolve e forma duplas', () => {
  assert.ok(withMarket.dissolvedTotal > 0, 'nenhuma dupla foi dissolvida no ano');
  assert.ok(withMarket.formedTotal > 0, 'nenhuma dupla foi formada no ano');
});

check('Parte A: o pool de livres NÃO é estruturalmente vazio com o mercado ligado', () => {
  console.log(`   [registro] livres sem mercado=${noMarket.tEnd.free} | com mercado=${withMarket.tEnd.free}`);
  assert.ok(withMarket.tEnd.free >= noMarket.tEnd.free,
    'o mercado reduziu o pool de livres — hipótese invertida');
});

check('Parte S: reciprocidade é 100% (nenhuma parceria unilateral)', () => {
  assert.equal(withMarket.tEnd.unilateral, 0, `${withMarket.tEnd.unilateral} parcerias unilaterais`);
});

check('Parte S: ninguém ocupa duas duplas ativas', () => {
  assert.equal(withMarket.tEnd.inTwoPlus, 0, `${withMarket.tEnd.inTwoPlus} atletas em 2+ duplas`);
});

check('Parte R: a população não explode com o mercado vivo', () => {
  console.log(`   [registro] atletas T0=${withMarket.t0.athletes} fim=${withMarket.tEnd.athletes}`);
  assert.ok(withMarket.tEnd.athletes <= withMarket.t0.athletes + 60,
    `população cresceu de ${withMarket.t0.athletes} para ${withMarket.tEnd.athletes}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-partner-ecology-inventory-v518: PASS');
