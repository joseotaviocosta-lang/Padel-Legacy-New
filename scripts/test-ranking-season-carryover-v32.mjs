import fs from 'node:fs';
import assert from 'node:assert/strict';
const season = fs.readFileSync(new URL('../src/game-core/seasonLifecycle.js', import.meta.url), 'utf8');
const team = fs.readFileSync(new URL('../src/lib/teamRanking.js', import.meta.url), 'utf8');
assert(season.includes('previousRankPoints * 0.80'));
assert(season.includes('rank_points: nextRankPoints'));
assert(season.includes('applyTeamRankingSeasonCarryover'));
assert(team.includes('ranking_points: carried +'));
console.log('RankingSeasonCarryoverV32Test: PASS');
