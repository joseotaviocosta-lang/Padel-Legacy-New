import assert from 'node:assert/strict';
import { buildSupplementalRankingPopulation, pointsForRank, WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '../../lib/rankingPopulation.js';

const baseAthletes = Array.from({ length: 24 }, (_, i) => ({ bot_id: `base-${i}`, name: `Base ${i}`, world_ranking_points: 13000 - i * 300 }));
const baseTeams = Array.from({ length: 12 }, (_, i) => ({ team_key: `base-team-${i}`, ranking_points: 5000 - i * 100 }));
const result = buildSupplementalRankingPopulation(baseAthletes, baseTeams);
assert.equal(baseAthletes.length + result.athletes.length, WORLD_RANKING_TARGET);
assert.equal(baseTeams.length + result.teams.length, TEAM_RANKING_TARGET);
assert.equal(new Set(result.athletes.map(a => a.bot_id)).size, result.athletes.length);
assert.ok(result.athletes.every(a => a.world_ranking_points > 0));
assert.ok(result.teams.every(t => t.ranking_points > 0));
console.log(`RankingPopulationTest: ${WORLD_RANKING_TARGET} atletas e ${TEAM_RANKING_TARGET} duplas aprovados`);

assert.equal(pointsForRank(1), 13000);
assert.equal(pointsForRank(24), 3110);
assert.equal(pointsForRank(500), 200);
assert.ok(pointsForRank(25) < pointsForRank(24));
