// Playthrough 5.15 (continuação), Partes K/L — o resgate de campo só pode
// PREENCHER vaga que sobrou. Nunca expulsar um candidato que já entrou.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// ---- Parte K: a ORDEM exata, lida do código ----
const source = readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const clean = stripComments(source);

check('Parte K: o resgate só roda quando o campo está ABAIXO do mínimo viável', () => {
  assert.match(clean, /if\s*\(\s*entrants\.length\s*<\s*minViableDraw\(drawSize\)\s*&&\s*idlePairs\.length\s*\)/,
    'o resgate não está condicionado a campo incompleto');
});

check('Parte K/18: o resgate ACRESCENTA, nunca substitui', () => {
  assert.match(clean, /entrants\s*=\s*\[\s*\.\.\.entrants\s*,\s*\.\.\.rescue\s*\]/,
    'o resgate não é aditivo — poderia sobrescrever o field');
  assert.ok(!/entrants\s*=\s*rescue\b/.test(clean), 'o resgate substitui a lista inteira');
});

check('Parte K: o resgate exclui quem já está no campo (sem duplicar dupla)', () => {
  assert.match(clean, /idlePairs\.filter\(\(pair\)\s*=>\s*!usedIds\.has\(pair\.id\)\)/,
    'o resgate pode reinserir uma dupla que já entrou');
});

check('Parte L: o corte de capacidade é por SCORE, não por ordem de iteração', () => {
  assert.match(clean, /\.sort\(\(a,\s*b\)\s*=>\s*blendedCutScore\(b\)\s*-\s*blendedCutScore\(a\)\)\s*\n?\s*\.slice\(0,\s*drawSize\)/,
    'o corte do field não está ordenado por score antes do slice');
});

// ---- Comportamento real numa temporada ----
const live = {};
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v515-rescue', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
    live.originIndex = await buildOriginIndex(vite, athletesNow);
  },
});

const { originById } = live.originIndex;
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
function membersOf(pairId) {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
}

const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
console.log(`\ntorneios com chave: ${drawn.length}`);

// Nenhum field pode conter a MESMA dupla duas vezes (sintoma de resgate
// reinserindo quem já entrou).
let duplicateInField = 0;
let membersRepeated = 0;
for (const t of drawn) {
  const keys = new Set();
  const seenMembers = new Set();
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const key = [m[0], m[1]].sort().join('_');
    if (keys.has(key)) duplicateInField += 1;
    keys.add(key);
    for (const id of m) {
      if (seenMembers.has(id)) membersRepeated += 1;
      seenMembers.add(id);
    }
  }
}

// Campos abaixo do mínimo (onde o resgate atuaria) e acima da capacidade.
const overCapacity = drawn.filter((t) => {
  const size = Number(t.main_draw_size) || 0;
  return size > 0 && t.draw_pair_ids.length > size;
});

console.log(`duplas repetidas dentro do mesmo field ... ${duplicateInField}`);
console.log(`atletas repetidos dentro do mesmo field . ${membersRepeated}`);
console.log(`fields acima da capacidade .............. ${overCapacity.length}`);

const mastersFields = drawn.filter((t) => t.tier === 'Masters');
const mix = { RR: 0, RP: 0, PP: 0, UNKNOWN: 0 };
for (const t of mastersFields) {
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) { mix.UNKNOWN += 1; continue; }
    mix[classifyPair(originById, m[0], m[1])] += 1;
  }
}
console.log(`Masters: RR=${mix.RR} RP=${mix.RP} PP=${mix.PP} desconhecidas=${mix.UNKNOWN}`);

check('Parte K/18: nenhuma dupla aparece duas vezes no mesmo field', () => {
  assert.equal(duplicateInField, 0, `${duplicateInField} duplas repetidas`);
});

check('Parte K: nenhum atleta aparece em duas duplas do mesmo field', () => {
  assert.equal(membersRepeated, 0, `${membersRepeated} atletas repetidos`);
});

check('Parte L: nenhum field excede a capacidade (o corte acontece antes do resgate)', () => {
  assert.equal(overCapacity.length, 0,
    `${overCapacity.length} fields acima do main_draw_size`);
});

check('Parte K: toda dupla do field resolve para uma identidade canônica', () => {
  assert.equal(mix.UNKNOWN, 0, `${mix.UNKNOWN} duplas irresolvíveis nos Masters`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-rescue-does-not-displace-qualified-v515: PASS');
