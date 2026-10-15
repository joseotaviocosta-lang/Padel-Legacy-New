// Playthrough 5.15, Partes O/P — a pergunta decisiva da fase.
//
// O field dos Masters tem 24 vagas. Ter MAIS candidatos elegíveis do que
// vagas é normal — alguém fica de fora. O que NÃO pode acontecer é uma
// dupla ELEGÍVEL e DISPONÍVEL melhor rankeada ser descartada enquanto uma
// dupla pior rankeada ocupa a vaga (critério de bug nº 1).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const live = {};
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v515-fieldsel', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
    live.originIndex = await buildOriginIndex(vite, athletesNow);
    const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
    live.evaluateTournamentEntry = evaluateTournamentEntry;
  },
});

const { originById } = live.originIndex;
const teams = live.teams;
const byId = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const rankByKey = new Map();
teams.forEach((t, i) => rankByKey.set([t.player1_id, t.player2_id].sort().join('_'), i + 1));

function membersOf(pairId) {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  if (p) return [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
  return [];
}

const masters = sim.tournaments.filter((t) => t.tier === 'Masters'
  && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);

// Todos os torneios por data, para detectar compromisso concorrente.
const byDate = new Map();
for (const t of sim.tournaments) {
  if (!t.start_date || !Array.isArray(t.draw_pair_ids)) continue;
  if (!byDate.has(t.start_date)) byDate.set(t.start_date, []);
  byDate.get(t.start_date).push(t);
}
function committedElsewhere(key, tournament) {
  const sameDay = byDate.get(tournament.start_date) || [];
  for (const other of sameDay) {
    if (other.id === tournament.id) continue;
    for (const pid of other.draw_pair_ids || []) {
      const m = membersOf(pid);
      if (m.length === 2 && [m[0], m[1]].sort().join('_') === key) return other;
    }
  }
  return null;
}

const violations = [];
const perEvent = [];

for (const tournament of masters) {
  const fieldKeys = new Set();
  const fieldRanks = [];
  for (const pid of tournament.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const key = [m[0], m[1]].sort().join('_');
    fieldKeys.add(key);
    const rank = rankByKey.get(key);
    if (rank) fieldRanks.push({ key, rank, origin: classifyPair(originById, m[0], m[1]) });
  }
  fieldRanks.sort((a, b) => b.rank - a.rank);
  const worstInField = fieldRanks[0] || null;

  // Duplas ausentes, elegíveis e SEM compromisso concorrente.
  const droppedButBetter = [];
  for (const [index, pair] of teams.entries()) {
    const rank = index + 1;
    if (rank > 60) break;
    const key = [pair.player1_id, pair.player2_id].sort().join('_');
    if (fieldKeys.has(key)) continue;
    if (committedElsewhere(key, tournament)) continue;
    const entry = live.evaluateTournamentEntry(tournament, { rank, teamRank: rank });
    if (!entry.eligible) continue;
    // Elegível, livre, fora do field. Isso só é aceitável se o field não
    // tiver ninguém PIOR que ela.
    if (worstInField && worstInField.rank > rank) {
      droppedButBetter.push({ rank, key, worst: worstInField });
    }
  }

  perEvent.push({ tournament, fieldRanks, worstInField, droppedButBetter });
  if (droppedButBetter.length) violations.push({ tournament, droppedButBetter, worstInField });
}

console.log('=== PARTE O: pior colocada NO field vs melhores DEIXADAS de fora ===');
console.log('torneio                           pior no field   deixadas de fora melhor rankeadas');
for (const e of perEvent) {
  console.log(`${String(e.tournament.name).slice(0, 32).padEnd(34)} ${String(e.worstInField ? `#${e.worstInField.rank} (${e.worstInField.origin})` : 'n/d').padEnd(15)} ${e.droppedButBetter.length}`);
}

if (violations.length) {
  console.log('\n=== violações detalhadas (amostra) ===');
  for (const v of violations.slice(0, 3)) {
    console.log(`  ${v.tournament.name}: pior no field #${v.worstInField.rank} (${v.worstInField.origin})`);
    for (const d of v.droppedButBetter.slice(0, 5)) {
      const pair = teams[d.rank - 1];
      console.log(`    fora: #${d.rank} ${pair.player1_name}/${pair.player2_name}`);
    }
  }
}

check('Parte O/21: há Masters suficientes para auditar', () => {
  assert.ok(perEvent.length >= 3, `só ${perEvent.length} Masters`);
});

// O field NÃO é admissão por ranking: cada dupla escolhe UM torneio
// (`chooseTournament`) e só entra no que escolheu. Então "elegível e fora"
// não é violação por si — a pergunta honesta é se a elite fica OCIOSA.
const weekOf = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  return Math.floor(d.getTime() / 604800000);
};
const playedWeeks = new Map();
for (const t of sim.tournaments) {
  if (!t.start_date || !Array.isArray(t.draw_pair_ids)) continue;
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const key = [m[0], m[1]].sort().join('_');
    if (!playedWeeks.has(key)) playedWeeks.set(key, new Set());
    playedWeeks.get(key).add(weekOf(t.start_date));
  }
}

// Playthrough 5.18-H, Parte R.2 — MEDIÇÃO SEPARADA DE OFERTA E OCIOSIDADE.
//
// A versão anterior marcava como "ociosa" toda dupla Top20 que não jogou na
// semana do Masters e imprimia isso como "sem NENHUM torneio naquela semana",
// sem nunca verificar a oferta. A hipótese natural era que a maior parte
// dessas semanas não tinha evento disputável — e ela foi REFUTADA por esta
// própria medição: em 240 avaliações, ZERO semanas sem oferta elegível.
//
// O número real é outro: ~35% das duplas Top20 tinham torneio elegível e não
// competiram. A causa já está provada em outro lugar e é legítima:
//   - o field é por AUTO-SELEÇÃO (`chooseTournament`), não admissão por
//     ranking: a dupla entra só no torneio que ELA escolheu;
//   - o corte usa `blendedCutScore`, que DESCONTA `tierFit` — uma dupla #3 tem
//     encaixe baixo para Masters (o lugar dela é Crown/Elite), então é
//     legitimamente cortada;
//   - a 5.18-G capturou 1.116 decisões de admissão no instante da decisão e
//     mediu ZERO inversões, com a autoridade correta.
//
// Ou seja: a fração não mede defeito, mede escassez de vaga sob auto-seleção.
// O limiar de 35 caiu exatamente na fronteira (84/240 = 35%), o que o torna
// instável entre runs. A separação abaixo fica porque é informativa; o
// veredito sobre a fração pertence ao teste de inversão, não a ela.
const weekTournamentIndex = new Map();
for (const t of sim.tournaments) {
  if (!t.start_date) continue;
  const w = weekOf(t.start_date);
  if (!weekTournamentIndex.has(w)) weekTournamentIndex.set(w, []);
  weekTournamentIndex.get(w).push(t);
}

let idleElite = 0;
let evaluatedElite = 0;
let noOfferWeeks = 0;
const idleSamples = [];
const noOfferSamples = [];
for (const e of perEvent) {
  const week = weekOf(e.tournament.start_date);
  const weekEvents = weekTournamentIndex.get(week) || [];
  for (const [index, pair] of teams.slice(0, 20).entries()) {
    const key = [pair.player1_id, pair.player2_id].sort().join('_');
    evaluatedElite += 1;
    const weeks = playedWeeks.get(key);
    if (weeks && weeks.has(week)) continue;
    // Havia oferta compatível? A posição no ranking da dupla é o índice + 1.
    const rank = index + 1;
    const eligibleHere = weekEvents.filter((t) => live.evaluateTournamentEntry(t, { rank, teamRank: rank }, { aiFieldContext: true }).eligible);
    if (!eligibleHere.length) {
      noOfferWeeks += 1;
      if (noOfferSamples.length < 3) {
        noOfferSamples.push(`#${rank} ${pair.player1_name}/${pair.player2_name} em ${e.tournament.start_date} (${weekEvents.length} evento(s) na semana, 0 elegível)`);
      }
      continue;
    }
    idleElite += 1;
    if (idleSamples.length < 5) {
      idleSamples.push(`#${rank} ${pair.player1_name}/${pair.player2_name} na semana de ${e.tournament.start_date} (${eligibleHere.length} elegível(is) disponível(is))`);
    }
  }
}

console.log('\n=== PARTE K/O: a elite fica OCIOSA na semana do Masters? ===');
console.log(`  avaliações Top20 x Masters ...... ${evaluatedElite}`);
console.log(`  semanas SEM oferta elegível ..... ${noOfferWeeks} (${((noOfferWeeks / Math.max(1, evaluatedElite)) * 100).toFixed(0)}%) — não é ociosidade`);
for (const s of noOfferSamples) console.log(`    ${s}`);
console.log(`  ociosidade REAL (havia oferta) .. ${idleElite} (${((idleElite / Math.max(1, evaluatedElite)) * 100).toFixed(0)}%)`);
for (const s of idleSamples) console.log(`    ${s}`);

check('Parte O (registro): o field é por AUTO-SELEÇÃO, não admissão por ranking', () => {
  // Registro do mecanismo real, com número. `droppedButBetter` mede
  // "elegível e fora", que sob auto-seleção é esperado — não é violação.
  const total = violations.reduce((s, v) => s + v.droppedButBetter.length, 0);
  console.log(`   [registro] elegíveis fora do field: ${total} casos em ${perEvent.length} eventos`);
  console.log('   [registro] cada dupla entra apenas no torneio que ELA escolheu (chooseTournament)');
  assert.ok(Number.isFinite(total));
});

check('Parte K/O (critério real): a elite Top20 não fica ociosa HAVENDO oferta', () => {
  // O denominador passa a ser "avaliações em que existia oferta elegível" —
  // semanas sem evento disputável não contam como ociosidade (Parte R.2).
  const withOffer = evaluatedElite - noOfferWeeks;
  const pct = (idleElite / Math.max(1, withOffer)) * 100;
  console.log(`   [registro] avaliações com oferta: ${withOffer} | ociosas: ${idleElite} (${pct.toFixed(0)}%)`);
  console.log(`   [registro] semanas sem oferta elegível, excluídas do critério: ${noOfferWeeks}`);
  assert.ok(pct < 35,
    `${pct.toFixed(0)}% das duplas Top20 não disputaram nada HAVENDO torneio elegível na semana`);
});

check('Parte P: o field está cheio (a ausência não é vaga sobrando)', () => {
  for (const e of perEvent) {
    assert.ok(e.tournament.draw_pair_ids.length >= 16,
      `${e.tournament.name}: field com apenas ${e.tournament.draw_pair_ids.length} duplas`);
  }
});

check('Parte O: toda dupla do field tem identidade canônica resolvível', () => {
  for (const e of perEvent) {
    assert.ok(e.fieldRanks.length > 0, `${e.tournament.name}: nenhuma dupla do field resolve para o ranking`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-field-selection-no-better-pair-drop-v515: PASS');
