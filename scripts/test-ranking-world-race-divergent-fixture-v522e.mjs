// Playthrough 5.22-E, Partes L/K — fixture divergente: o jogador é World #400
// (2.800 pts) e Race #63 (320 pts). Mundial e Race precisam responder
// perguntas diferentes: ranks e pontos não podem coincidir, e o líder mundial
// não pode ser o mesmo líder da Race.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A ordenação da Race é a mesma que Ranking.jsx aplica (b.racePoints primeiro).
const worldSort = (a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id));
const raceSort = (a, b) => b.racePoints - a.racePoints || b.points - a.points || String(a.id).localeCompare(String(b.id));

const competitors = Array.from({ length: 500 }, (_, i) => ({
  id: `a${String(i).padStart(3, '0')}`,
  points: i < 399 ? 5000 - i : 2000,
  racePoints: 0,
}));

// 399 atletas acima do jogador no Mundial -> jogador #400.
// 62 atletas acima no Race (321..999) -> jogador #63.
competitors[100].racePoints = 999; // líder da Race, propositalmente != líder mundial
for (let k = 0, i = 0; k < 61; i += 1) {
  if (i === 100) continue;
  competitors[i].racePoints = 900 - k;
  k += 1;
}

const player = { id: 'player', points: 2800, racePoints: 320 };
const population = [...competitors, player];

const worldBoard = [...population].sort(worldSort);
const raceBoard = [...population].sort(raceSort);
const worldRank = worldBoard.findIndex((e) => e.id === 'player') + 1;
const raceRank = raceBoard.findIndex((e) => e.id === 'player') + 1;

assert.equal(worldRank, 400, `world rank esperado 400, obtido ${worldRank}`);
assert.equal(raceRank, 63, `race rank esperado 63, obtido ${raceRank}`);
assert.notEqual(worldRank, raceRank, 'world rank e race rank não podem coincidir no fixture');
assert.notEqual(player.points, player.racePoints, 'world points e race points não podem coincidir no fixture');
assert.notEqual(worldBoard[0].id, raceBoard[0].id, 'world leader != race leader (Parte K)');

// A UI precisa consumir as duas autoridades separadamente.
const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
assert.match(source, /\.sort\(\(a, b\) => b\.racePoints - a\.racePoints/, 'Race deve ordenar por racePoints');
assert.match(source, /playerPositionContext/, 'Mundial usa rank mundial');
assert.match(source, /raceRank/, 'Race usa rank sazonal');

console.log(`test-ranking-world-race-divergent-fixture-v522e: PASS (World #${worldRank} · Race #${raceRank})`);
