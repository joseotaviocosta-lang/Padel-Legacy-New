// Playthrough 5.1, Parte J/W — qualidade mínima do campo, além de número
// de duplas. Não cancela torneio por campo fraco (Parte J: "não precisa
// cancelar") — só confirma que Masters/Gold não ficam sistematicamente
// dominados por duplas de NÍVEL BRONZE (o exemplo literal do prompt: "um
// Masters com 24 duplas não deve ser considerado saudável se 18 delas são
// de nível Bronze").
//
// Duas versões anteriores descartadas, ambas medidas e comprovadamente
// erradas antes desta:
// (1) piso absoluto de rankingFit>=50 pro PRÓPRIO tier — fit é uma curva
//     de PREFERÊNCIA relativa entre vizinhos (Parte C/D), não uma nota de
//     qualidade absoluta; Masters "reprovava" mesmo com avgOVR=73 (nível
//     competitivo real).
// (2) "qual tier tem o MAIOR fit pra este rank" (bestFitTier) — Bronze
//     tem plateau até rank=∞ (é o tier de acesso livre, sem teto — by
//     design, Parte C), então SEMPRE vence a comparação de fit bruto
//     contra o lado fraco de qualquer outro tier, mesmo quando o fit do
//     outro tier já está alto (ex.: rank 500 tinha Gold fit=89, ainda
//     assim Bronze(100, sem teto) "vencia" — não significa que a dupla é
//     fraca, só que a curva de Bronze não tem limite superior de rank).
// Corrigido pra medir o que "nível Bronze" realmente quer dizer em
// linguagem simples — OVERALL RATING, não uma comparação de curvas de
// rank: "nível Bronze" = OVR dentro da faixa que o PRÓPRIO Bronze
// realmente recruta (empírico, desta mesma simulação — nunca um número
// cravado a dedo). Limiar = percentil 75 do OVR observado em Bronze
// (a "cauda de cima" de Bronze é o ponto onde alguém já deixou de ser
// claramente nível Bronze).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_FQ_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'field-quality', trackWeeklyDraws: false });

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const ALL_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

function entrantOvrs(tier) {
  const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
  const ovrs = [];
  for (const tournament of resolved) {
    for (const pairId of tournament.draw_pair_ids) {
      const partnership = partnershipById.get(pairId);
      for (const id of [partnership?.athlete_a_id, partnership?.athlete_b_id].filter(Boolean)) {
        const ovr = Number(athleteById.get(id)?.overall_rating) || 0;
        if (ovr > 0) ovrs.push(ovr);
      }
    }
  }
  return ovrs;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

const bronzeOvrs = entrantOvrs('Bronze');
const bronzeLevelThreshold = percentile(bronzeOvrs, 0.75);
console.log(`limiar "nível Bronze" (P75 do OVR real de Bronze nesta simulação): OVR <= ${bronzeLevelThreshold}`);

const tierQuality = {};
for (const tier of ALL_TIERS) {
  const ovrs = entrantOvrs(tier);
  const bronzeLevelCount = ovrs.filter((v) => v <= bronzeLevelThreshold).length;
  tierQuality[tier] = { total: ovrs.length, bronzeLevelCount, pct: ovrs.length ? (bronzeLevelCount / ovrs.length) * 100 : null };
}

console.log('=== qualidade do campo (% de entrantes com OVR "nível Bronze", OVR <= P75 real de Bronze) ===');
for (const [tier, q] of Object.entries(tierQuality)) {
  console.log(`${tier}: ${q.bronzeLevelCount}/${q.total} nível-Bronze (${q.pct?.toFixed(1)}%)`);
}

for (const tier of ['Gold', 'Masters']) {
  check(`${tier}: amostra real coletada`, () => {
    assert.ok(tierQuality[tier].total > 0, `${tier} sem amostra`);
  });
  check(`${tier}: campo NÃO é dominado (>50%) por atletas de OVR nível Bronze`, () => {
    assert.ok(tierQuality[tier].pct < 50, `${tier}: ${tierQuality[tier].pct?.toFixed(1)}% do campo tem OVR nível Bronze — exemplo literal do prompt ("18 de 24 são Bronze")`);
  });
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-field-quality: PASS');
