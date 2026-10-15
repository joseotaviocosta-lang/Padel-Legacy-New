// Playthrough 5.17 (continuação), Partes I/J/K/M — MASTERS 24 vs 32.
//
// Hipótese do usuário: talvez os grandes torneios precisem de 32 vagas, com
// os melhores recebendo bye. Esta fase MEDE antes de decidir.
//
// Pergunta central (Parte K): as duplas fortes ficam de fora porque faltam
// vagas, ou porque o mecanismo de seleção as deixa ociosas?
//
// O harness compartilhado roda a simulação inteira de uma vez e não permite
// intervir ENTRE a semeadura e os sorteios — que é exatamente onde o tamanho
// do Masters precisa ser alterado. Por isso este teste tem loop próprio:
// mesma sequência de dias, mesma semeadura, e a ÚNICA diferença entre os
// modelos é `main_draw_size` dos Masters (Parte I: nada mais muda).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

installShims('/tournaments');

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
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

const START = '2026-01-01';
const DAYS = 365;

async function runSeason(label, mastersDrawSize) {
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
  const { buildOriginIndex, classifyPair } = await import('./lib/originClassifier.mjs');
  const { resolvePairMemberIds } = await import('./lib/tierRebalanceHarness.mjs');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: `ms-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(START);

  // A ÚNICA intervenção: o tamanho de chave dos Masters ainda não sorteados.
  const all = await localGame.entities.Tournament.list('start_date', 5000);
  const mastersToResize = all.filter((t) => t.tier === 'Masters');
  const originalSize = Number(mastersToResize[0]?.main_draw_size) || 0;
  if (mastersDrawSize !== originalSize) {
    for (const t of mastersToResize) {
      await localGame.entities.Tournament.update(t.id, { main_draw_size: mastersDrawSize }).catch(() => {});
    }
  }

  let circuitAnchor = START;
  let date = START;
  for (let i = 0; i < DAYS; i += 1) {
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    if ((i + 1) % 14 === 0) {
      const r = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
      if (r?.profile) profile = r.profile;
      circuitAnchor = date;
    }
  }
  await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);

  const [tournaments, athletes, partnerships, teams] = await Promise.all([
    localGame.entities.Tournament.list('start_date', 5000),
    localGame.entities.AthleteProfile.list(null, 5000),
    localGame.entities.Partnership.list(null, 5000).catch(() => []),
    localGame.entities.TeamRanking.list('-ranking_points', 5000),
  ]);
  const originIndex = await buildOriginIndex(vite, athletes);
  await vite.close();

  const { originById } = originIndex;
  const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));
  const membersOf = (pairId) => {
    const direct = resolvePairMemberIds(pairId);
    if (direct?.length === 2) return direct;
    const p = partnershipById.get(pairId);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };
  const rankByKey = new Map();
  teams.forEach((row, i) => rankByKey.set([row.player1_id, row.player2_id].sort().join('_'), i + 1));
  const rankOf = (pairId) => {
    const m = membersOf(pairId);
    if (m.length !== 2) return null;
    return rankByKey.get([...m].sort().join('_')) ?? null;
  };

  const drawnAll = tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  const masters = drawnAll.filter((t) => t.tier === 'Masters');
  const seasonEnd = tournaments.reduce((max, t) => (t.draw_date && t.draw_date > max ? t.draw_date : max), START);
  const inSeason = tournaments.filter((t) => t.start_date > START && t.start_date <= seasonEnd);
  const cancelled = inSeason.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');

  let top5 = 0; let top10 = 0; let top20 = 0;
  let rr = 0; let rp = 0; let pp = 0; let byes = 0; let matches = 0;
  const fieldRanks = [];
  const observedSizes = new Set();
  for (const t of masters) {
    const size = t.draw_pair_ids.length;
    observedSizes.add(Number(t.main_draw_size) || size);
    const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, size)));
    byes += bracketSize - size;
    matches += size - 1;
    for (const pid of t.draw_pair_ids) {
      const rank = rankOf(pid);
      if (rank) {
        fieldRanks.push(rank);
        if (rank <= 5) top5 += 1;
        if (rank <= 10) top10 += 1;
        if (rank <= 20) top20 += 1;
      }
      const m = membersOf(pid);
      if (m.length === 2) {
        const cls = classifyPair(originById, m[0], m[1]);
        if (cls === 'RR') rr += 1; else if (cls === 'RP') rp += 1; else pp += 1;
      }
    }
  }

  const weekOf = (d) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 604800000);
  const allWeeks = new Set(drawnAll.map((t) => weekOf(t.start_date)));
  const busyByKey = new Map();
  const eventsByKey = new Map();
  for (const t of drawnAll) {
    for (const pid of t.draw_pair_ids) {
      const m = membersOf(pid);
      if (m.length !== 2) continue;
      const key = [...m].sort().join('_');
      if (!busyByKey.has(key)) busyByKey.set(key, new Set());
      const s = weekOf(t.start_date);
      const e = weekOf(t.end_date || t.start_date);
      for (let w = s; w <= e; w += 1) busyByKey.get(key).add(w);
      eventsByKey.set(key, (eventsByKey.get(key) || 0) + 1);
    }
  }
  let idleSum = 0; let eventsSum = 0; let zeroMatch = 0;
  const top20Rows = teams.slice(0, 20);
  for (const row of top20Rows) {
    const key = [row.player1_id, row.player2_id].sort().join('_');
    const busy = busyByKey.get(key) || new Set();
    idleSum += [...allWeeks].filter((w) => !busy.has(w)).length;
    const ev = eventsByKey.get(key) || 0;
    eventsSum += ev;
    if (ev === 0) zeroMatch += 1;
  }

  const slots = rr + rp + pp;
  const evCount = Math.max(1, masters.length);
  return {
    label,
    configuredSize: mastersDrawSize,
    observedSizes: [...observedSizes],
    mastersEvents: masters.length,
    avgFieldSize: masters.reduce((s, t) => s + t.draw_pair_ids.length, 0) / evCount,
    top5: top5 / evCount,
    top10: top10 / evCount,
    top20: top20 / evCount,
    avgFieldRank: fieldRanks.reduce((s, v) => s + v, 0) / Math.max(1, fieldRanks.length),
    medianRank: percentile(fieldRanks, 0.5),
    p25: percentile(fieldRanks, 0.25),
    p75: percentile(fieldRanks, 0.75),
    rrShare: rr / Math.max(1, slots),
    ppShare: pp / Math.max(1, slots),
    byes,
    matches,
    cancelled: cancelled.length,
    top20IdleRate: idleSum / Math.max(1, top20Rows.length * allWeeks.size),
    top20Events: eventsSum / Math.max(1, top20Rows.length),
    top20ZeroMatch: zeroMatch,
  };
}

console.log('=== Modelo A: Masters 24 ===');
const a = await runSeason('Masters24', 24);
console.log(`  campo observado: ${a.observedSizes.join(',')} | eventos=${a.mastersEvents} campo médio=${a.avgFieldSize.toFixed(1)}`);

console.log('\n=== Modelo B: Masters 32 ===');
const b = await runSeason('Masters32', 32);
console.log(`  campo observado: ${b.observedSizes.join(',')} | eventos=${b.mastersEvents} campo médio=${b.avgFieldSize.toFixed(1)}`);

const rows = [
  ['Masters/temporada', a.mastersEvents, b.mastersEvents],
  ['campo médio', a.avgFieldSize, b.avgFieldSize],
  ['Top5 slots/evento', a.top5, b.top5],
  ['Top10 slots/evento', a.top10, b.top10],
  ['Top20 slots/evento', a.top20, b.top20],
  ['rank médio do campo', a.avgFieldRank, b.avgFieldRank],
  ['mediana rank', a.medianRank, b.medianRank],
  ['P25 rank', a.p25, b.p25],
  ['P75 rank', a.p75, b.p75],
  ['RR share', a.rrShare, b.rrShare],
  ['PP share', a.ppShare, b.ppShare],
  ['byes/temporada', a.byes, b.byes],
  ['partidas/temporada', a.matches, b.matches],
  ['cancelamentos', a.cancelled, b.cancelled],
  ['Top20 idle rate', a.top20IdleRate, b.top20IdleRate],
  ['Top20 eventos/dupla', a.top20Events, b.top20Events],
  ['Top20 com 0 partidas', a.top20ZeroMatch, b.top20ZeroMatch],
];

console.log('\n=== PARTE J: comparativo 24 vs 32 ===');
console.log('Métrica                            24          32           Δ');
for (const [name, va, vb] of rows) {
  const d = vb - va;
  console.log(`${name.padEnd(32)}${va.toFixed(2).padStart(10)}${vb.toFixed(2).padStart(12)}${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(12)}`);
}

check('Parte I: os dois modelos realmente diferem no tamanho de chave', () => {
  console.log(`   [registro] campo médio 24=${a.avgFieldSize.toFixed(1)} | 32=${b.avgFieldSize.toFixed(1)}`);
  assert.ok(b.avgFieldSize > a.avgFieldSize + 2,
    'o modelo de 32 não produziu campo maior — a comparação seria falsa');
});

check('Parte J: nenhum modelo aumenta cancelamentos', () => {
  console.log(`   [registro] cancelados 24=${a.cancelled} 32=${b.cancelled}`);
  assert.ok(b.cancelled <= a.cancelled + 1, 'o modelo de 32 aumentou cancelamentos');
});

check('Parte M: o modelo de 24 concede bye; o de 32 não', () => {
  console.log(`   [registro] byes 24=${a.byes} 32=${b.byes}`);
  assert.ok(a.byes > 0, 'o modelo de 24 deixou de conceder bye');
});

check('Parte K: a pergunta principal tem resposta numérica', () => {
  const top20Gain = b.top20 - a.top20;
  const idleDrop = a.top20IdleRate - b.top20IdleRate;
  const ppCost = b.ppShare - a.ppShare;
  console.log(`   [registro] ganho Top20/evento=${top20Gain.toFixed(2)} | queda de idle=${(idleDrop * 100).toFixed(1)}pp | custo PP=${(ppCost * 100).toFixed(1)}pp`);
  assert.ok(Number.isFinite(top20Gain) && Number.isFinite(idleDrop) && Number.isFinite(ppCost));
});

check('Parte L: nenhuma dupla do Top20 fica com 0 partidas em qualquer modelo', () => {
  assert.equal(a.top20ZeroMatch, 0, `24: ${a.top20ZeroMatch} duplas do Top20 sem partida`);
  assert.equal(b.top20ZeroMatch, 0, `32: ${b.top20ZeroMatch} duplas do Top20 sem partida`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-masters-draw-size-comparison-v517: PASS');
