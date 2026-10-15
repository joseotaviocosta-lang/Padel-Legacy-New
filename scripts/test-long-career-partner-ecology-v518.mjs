// Playthrough 5.18, Partes C/W — A ECOLOGIA SE SUSTENTA POR VÁRIAS
// TEMPORADAS?
//
// O inventário (Partes A/B) refutou a premissa da fase: o mercado mensal de
// IA existe, roda e produz 268 agentes livres numa temporada — os "~6 livres"
// da 5.17 eram artefato de um harness que nunca chamava
// `processAiPartnershipMarket`.
//
// Mas a mesma medição expôs um desequilíbrio REAL e de sinal oposto ao que o
// brief supunha: numa temporada houve 205 dissoluções contra 74 formações,
// saldo de -131 duplas. Se isso se acumular, o mundo drena para um estado de
// agentes livres — o problema não é "mercado morto", é "formação não
// acompanha a dissolução".
//
// Este teste mede 3 temporadas para decidir se o desequilíbrio compõe ou
// estabiliza. NADA é alterado antes desta resposta.
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
const SEASONS = 3;

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
const { career } = await manager.createCareer({ saveName: 'EcoLonga', playerName: 'EcoLonga' });
activeCareerAdapter.setActiveCareer(career);
let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'eco-longa', sport_name: 'EcoLonga', career_date: START, birth_date: '2001-01-01',
  level: 'Amador', coins: 1000, xp: 0,
});
await ensureWorldSeed2025();
await ensureFutureTournaments(START);

async function census() {
  const [athletes, partnerships, teams] = await Promise.all([
    localGame.entities.AthleteProfile.list(null, 5000),
    localGame.entities.Partnership.list(null, 5000).catch(() => []),
    localGame.entities.TeamRanking.list('-ranking_points', 5000),
  ]);
  const active = (partnerships || []).filter((p) => p.status === 'ativa');
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const alive = athletes.filter((a) => !a.retired && a.career_status !== 'aposentado');
  const free = alive.filter((a) => !a.ai_partner_id);
  let unilateral = 0;
  for (const a of athletes) {
    if (!a.ai_partner_id) continue;
    const b = byId.get(a.ai_partner_id);
    if (!b || b.ai_partner_id !== a.id) unilateral += 1;
  }
  const appearances = new Map();
  for (const p of active) {
    for (const id of [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id].filter(Boolean)) {
      appearances.set(id, (appearances.get(id) || 0) + 1);
    }
  }
  // CORREÇÃO DE MEDIÇÃO: churn tem de ser "a dupla ainda EXISTE?", não "a
  // dupla ainda está no Top N?". Uma dupla que segue junta e cai de #9 para
  // #12 não sofreu churn nenhum — contá-la inflaria o número e faria parecer
  // que a elite se desfez quando só o ranking se mexeu.
  const top = (n) => teams.slice(0, n).map((t) => ({
    key: [t.player1_id, t.player2_id].sort().join('_'),
    a: t.player1_id,
    b: t.player2_id,
  }));
  // Um par "sobrevive" quando os dois membros seguem se declarando parceiros.
  const pairStillExists = ({ a, b }) => {
    const A = byId.get(a);
    const B = byId.get(b);
    return Boolean(A && B && A.ai_partner_id === b && B.ai_partner_id === a);
  };
  return {
    pairStillExists,
    athletes: athletes.length,
    alive: alive.length,
    free: free.length,
    freePct: free.length / Math.max(1, alive.length),
    activePartnerships: active.length,
    teams: teams.length,
    unilateral,
    inTwoPlus: [...appearances.values()].filter((n) => n > 1).length,
    top10Keys: top(10),
    top20Keys: top(20),
    top50Keys: top(50),
  };
}

const seasons = [];
let previousCensus = await census();
console.log(`T0: vivos=${previousCensus.alive} livres=${previousCensus.free} (${(previousCensus.freePct * 100).toFixed(0)}%) parcerias=${previousCensus.activePartnerships}`);

let circuitAnchor = START;
let date = START;
const freeSince = new Map();

for (let season = 1; season <= SEASONS; season += 1) {
  let formed = 0;
  let dissolved = 0;
  const startCensus = await census();
  for (let i = 0; i < 365; i += 1) {
    const previous = date;
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    const market = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
    if (market && !market.skipped) {
      formed += Number(market.formed) || 0;
      dissolved += Number(market.dissolved) || 0;
      if (market.profile) profile = market.profile;
    }
    if ((i + 1) % 14 === 0) {
      const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
      if (c?.profile) profile = c.profile;
      circuitAnchor = date;
    }
    if ((i + 1) % 14 === 0) {
      const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
      for (const a of athletes) {
        const isFree = !a.ai_partner_id && !a.retired;
        if (isFree && !freeSince.has(a.id)) freeSince.set(a.id, date);
        if (!isFree) freeSince.delete(a.id);
      }
    }
    if ((i + 1) % 60 === 0) {
      await ensureFutureTournaments(date).catch(() => null);
    }
  }
  const endCensus = await census();
  // Churn = fração das duplas da faixa que DEIXARAM DE EXISTIR como dupla,
  // avaliada contra o estado final do mundo (não contra a faixa final).
  const churn = (beforePairs) => {
    if (!beforePairs.length) return 0;
    const dissolvedPairs = beforePairs.filter((p) => !endCensus.pairStillExists(p)).length;
    return dissolvedPairs / beforePairs.length;
  };
  const long = { d90: 0, d180: 0 };
  for (const [, since] of freeSince) {
    const days = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${since}T00:00:00Z`)) / 86400000);
    if (days > 90) long.d90 += 1;
    if (days > 180) long.d180 += 1;
  }
  seasons.push({
    season, formed, dissolved,
    freeStart: startCensus.free, freeEnd: endCensus.free,
    freePctEnd: endCensus.freePct,
    partnershipsEnd: endCensus.activePartnerships,
    teamsEnd: endCensus.teams,
    unilateral: endCensus.unilateral,
    inTwoPlus: endCensus.inTwoPlus,
    churn10: churn(startCensus.top10Keys),
    churn20: churn(startCensus.top20Keys),
    churn50: churn(startCensus.top50Keys),
    longFree90: long.d90,
    longFree180: long.d180,
    alive: endCensus.alive,
  });
  console.log(`T${season}: livres ${startCensus.free}->${endCensus.free} (${(endCensus.freePct * 100).toFixed(0)}%) | formadas=${formed} dissolvidas=${dissolved} | parcerias=${endCensus.activePartnerships} | churn T10=${(churn(startCensus.top10Keys) * 100).toFixed(0)}%`);
  previousCensus = endCensus;
}

await vite.close();

console.log('\n=== PARTE W: ecologia por temporada ===');
console.log('T  Livres ini  Livres fim  %livres  Dissol  Novas  Saldo  Parcerias  >90d  >180d  churn10  churn20  churn50');
for (const s of seasons) {
  console.log(
    `${String(s.season).padEnd(3)}${String(s.freeStart).padStart(11)}${String(s.freeEnd).padStart(12)}`
    + `${`${(s.freePctEnd * 100).toFixed(0)}%`.padStart(9)}${String(s.dissolved).padStart(8)}${String(s.formed).padStart(7)}`
    + `${String(s.formed - s.dissolved).padStart(7)}${String(s.partnershipsEnd).padStart(11)}`
    + `${String(s.longFree90).padStart(6)}${String(s.longFree180).padStart(7)}`
    + `${`${(s.churn10 * 100).toFixed(0)}%`.padStart(9)}${`${(s.churn20 * 100).toFixed(0)}%`.padStart(9)}${`${(s.churn50 * 100).toFixed(0)}%`.padStart(9)}`,
  );
}

check('Parte W: as 3 temporadas rodaram com o mercado ativo', () => {
  assert.equal(seasons.length, SEASONS);
  for (const s of seasons) assert.ok(s.dissolved > 0 && s.formed > 0, `T${s.season} sem atividade de mercado`);
});

check('Parte S: reciprocidade 100% em todas as temporadas', () => {
  for (const s of seasons) assert.equal(s.unilateral, 0, `T${s.season}: ${s.unilateral} unilaterais`);
});

check('Parte S: ninguém em duas duplas em nenhuma temporada', () => {
  for (const s of seasons) assert.equal(s.inTwoPlus, 0, `T${s.season}: ${s.inTwoPlus} em 2+ duplas`);
});

check('Parte H: a elite Top10 permanece estável (churn baixo)', () => {
  for (const s of seasons) {
    console.log(`   [registro] T${s.season} churn Top10=${(s.churn10 * 100).toFixed(0)}%`);
    assert.ok(s.churn10 <= 0.40, `T${s.season}: churn Top10 de ${(s.churn10 * 100).toFixed(0)}%`);
  }
});

check('Parte H: Top50 circula mais que Top10 (gradiente esperado)', () => {
  const avg10 = seasons.reduce((s, r) => s + r.churn10, 0) / seasons.length;
  const avg50 = seasons.reduce((s, r) => s + r.churn50, 0) / seasons.length;
  console.log(`   [registro] churn médio Top10=${(avg10 * 100).toFixed(0)}% Top50=${(avg50 * 100).toFixed(0)}%`);
  assert.ok(avg50 >= avg10, 'a base circula menos que a elite — gradiente invertido');
});

check('Parte C/W: o mercado NÃO drena para um mundo de agentes livres', () => {
  // A pergunta central: o saldo negativo compõe ao longo das temporadas?
  const last = seasons[seasons.length - 1];
  console.log(`   [registro] % de livres por temporada: ${seasons.map((s) => `${(s.freePctEnd * 100).toFixed(0)}%`).join(' -> ')}`);
  console.log(`   [registro] parcerias ativas: ${seasons.map((s) => s.partnershipsEnd).join(' -> ')}`);
  assert.ok(last.freePctEnd < 0.70,
    `${(last.freePctEnd * 100).toFixed(0)}% da população ficou livre — o mercado drenou`);
  assert.ok(last.partnershipsEnd >= 100,
    `só ${last.partnershipsEnd} parcerias ativas restaram`);
});

check('Parte C: o mercado não deixa massa parada indefinidamente', () => {
  const last = seasons[seasons.length - 1];
  console.log(`   [registro] livres >90d=${last.longFree90} >180d=${last.longFree180}`);
  assert.ok(last.longFree180 <= last.alive * 0.15,
    `${last.longFree180} atletas livres há mais de 180 dias`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-long-career-partner-ecology-v518: PASS');
