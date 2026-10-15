// Playthrough 5.23, Partes C/Q — Mundial → Duplas usa o TeamRanking MUNDIAL
// (World(A)+World(B)), com card, decomposição e lista canônica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /function WorldDoublesCard/);
assert.match(source, /getTeamRank\b/, 'deve ler a autoridade TeamRanking');
assert.match(source, /getTeamRankings/, 'lista mundial de duplas');
assert.match(source, /playerPairRank/, 'total da dupla do jogador vem da linha canônica');
assert.match(source, /world_ranking_points \?\? playerPartner\?\.ranking_points/, 'breakdown usa World points do parceiro');
assert.match(source, /<TeamList[\s\S]*?items=\{teams\}/, 'lista deve usar o board mundial');
assert.match(source, /Sua dupla/);
assert.match(source, /Total/);

// A lista mundial usa `teams`; a lista da Race usa `raceTeams` (autoridades
// separadas). O card mundial não referencia race_points.
const worldCard = source.match(/function WorldDoublesCard[\s\S]*?\n\}/)[0];
assert.doesNotMatch(worldCard, /race_points/, 'World doubles não pode usar Race points');

console.log('test-ranking-world-doubles-view-v523: PASS');
