// Playthrough 5.23, Partes H/I/T — semântica do corte de Finals: a
// autoridade é o TeamRanking MUNDIAL, Top 8 DUPLAS. O card vive em
// Mundial → Duplas; a Race Individual só explica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTeamFinalsCut, TEAM_FINALS_CUT } from '../src/lib/rankingDisplay.js';

assert.equal(TEAM_FINALS_CUT, 8);

const board = [
  { ranking_display_position: 1, ranking_points: 20000 },
  { ranking_display_position: 8, ranking_points: 1017 },
  { ranking_display_position: 9, ranking_points: 900 },
];
const qualified = buildTeamFinalsCut({ rank: 5, points: 5000, board });
const outside = buildTeamFinalsCut({ rank: 12, points: 932, board });
const noRank = buildTeamFinalsCut({ rank: 0, points: 0, board });

assert.equal(qualified.qualified, true);
assert.equal(qualified.pointsToCut, null); // classificada: não há distância a exibir

assert.equal(outside.qualified, false);
assert.equal(outside.eighthPoints, 1017);
assert.equal(outside.pointsToCut, 85);

assert.equal(noRank.hasRank, false);

// A UI: card de corte só no bloco Mundial → Duplas; Race Individual explica.
const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const worldDoublesBlock = source.match(/scope === 'world' && type === 'doubles'[\s\S]*?scope === 'race'/)[0];
assert.match(worldDoublesBlock, /<FinalsCutCard/, 'o corte deve estar em Mundial → Duplas');
assert.match(source, /Top \{cut\.cut\} duplas → Circuit Finals/, 'texto explícito de "duplas"');

const raceIndividualCard = source.match(/function RaceIndividualCard[\s\S]*?\n\}/)[0]
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(raceIndividualCard, /Top\s*8/, 'Race individual não pode implicar 8 jogadores');
assert.match(raceIndividualCard, /melhores duplas/);

console.log('test-ranking-finals-cut-semantic-v523: PASS (faltam 85 pontos para o Top 8)');
