// Playthrough 5.22-F, Parte 5 — Masters com 24 participantes numa chave de
// 32: 8 BYEs, top seeds corretos e R16 completa, agora com o seedRank vindo
// da autoridade canônica de dupla (SOMA A+B), não de uma escala paralela.
import assert from 'node:assert/strict';
import { buildSeededDrawSlots, seedCountForDrawSize } from '../src/gameplay/worldTour/tournamentSettlement.js';
import { computeCanonicalTeamRankingPoints as canonical, buildSyntheticPopulation } from './lib/teamFormulaModels.mjs';

const { pairs } = buildSyntheticPopulation({ pairCount: 40, worldSize: 120 });
// Ranking canônico (soma) -> seedRank por posição.
const board = [...pairs].sort((x, y) => canonical(y.a, y.b) - canonical(x.a, x.b));
const seedRankByKey = new Map(board.map((p, i) => [p.key, i + 1]));
const entrants = pairs.slice(0, 24).map((p) => ({
  name: p.key,
  strength: 1000 - seedRankByKey.get(p.key),
  seedRank: seedRankByKey.get(p.key),
}));

const { slots, bracketSize, seedCount, ranked } = buildSeededDrawSlots({ entrants, tournamentId: 'masters-24', seedCount: 8 });

assert.equal(entrants.length, 24, 'campo deve ter 24 participantes');
assert.equal(bracketSize, 32, 'chave deve ser de 32');
assert.equal(slots.length, 32, 'slots devem ter 32 posições');
assert.equal(seedCountForDrawSize(24), 8, '24 entrantes => 8 seeds por tamanho');

const byes = [];
const matches = [];
for (let i = 0; i < slots.length; i += 2) {
  const a = slots[i];
  const b = slots[i + 1];
  if (!a || !b) byes.push(a || b);
  else matches.push([a, b]);
}

assert.equal(byes.length, 8, `esperado 8 BYEs, obtido ${byes.length}`);
assert.equal(matches.length, 8, `esperado 8 confrontos na rodada 0, obtido ${matches.length}`);
assert.equal(seedCount, 8, 'proteção deve cobrir os 8 byes');

// Top seeds: os 8 protegidos são exatamente os 8 melhores seedRanks.
const byeRanks = byes.map((e) => e.seedRank).sort((x, y) => x - y);
assert.deepEqual(byeRanks, [1, 2, 3, 4, 5, 6, 7, 8], `byes devem ir para os seeds 1..8, veio ${byeRanks.join(',')}`);

// Os 8 seeds entram na chave na ordem de seedOrder (1 encara o espelho fraco).
for (const seed of ranked.slice(0, 8)) {
  assert.ok(byes.includes(seed), `seed #${seed.seedRank} não recebeu bye`);
}

// R16 completa: 16 participantes = 8 vencedores da rodada 0 + 8 byes.
const round0Players = matches.flat().length;
const r16Participants = round0Players / 2 + byes.length; // 8 vencedores + 8 byes
assert.equal(round0Players, 16, 'rodada 0 deve ter 16 jogadores');
assert.equal(r16Participants, 16, 'R16 deve ter 16 participantes');

// Nenhum entrante duplicado na chave.
const placed = slots.filter(Boolean);
assert.equal(placed.length, 24, 'todos os 24 entrantes devem estar na chave');
assert.equal(new Set(placed.map((e) => e.name)).size, 24, 'entrante duplicado na chave');

console.log(`test-masters-24-8byes-r16-v522f: PASS (24 entrantes · ${byes.length} BYEs · seeds 1-8 · R16 com ${r16Participants})`);
