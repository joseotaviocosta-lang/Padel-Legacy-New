import assert from 'node:assert/strict';
import { buildPlayerRankingContext, getNextRankingMilestone, buildRankNeighborhood } from '../src/lib/rankingDisplay.js';

const context = buildPlayerRankingContext({
  rank: 983,
  points: 24,
  above: { name: 'Martín Romero', rank: 982, points: 25 },
  below: { name: 'Adrián Medina', rank: 984, points: 22 },
  total: 1500,
});

assert.equal(context.nextMilestone.label, 'Top 750');
assert.equal(context.nextMilestone.positionsRemaining, 233);
assert.equal(context.above.name, 'Martín Romero');
assert.equal(context.below.name, 'Adrián Medina');
assert.equal(context.neighborhood.length, 9);
assert.equal(context.neighborhood[4].isPlayer, true);
assert.equal(context.neighborhood[4].label, 'VOCÊ');

const milestone = getNextRankingMilestone(620);
assert.equal(milestone.label, 'Top 500');
assert.equal(milestone.positionsRemaining, 120);

const neighborhood = buildRankNeighborhood(983, 1500);
assert.equal(neighborhood[4].rank, 983);
assert.equal(neighborhood[4].label, 'VOCÊ');

console.log('test-ranking-world-player-context-v522: PASS');
