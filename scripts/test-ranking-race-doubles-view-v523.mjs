// Playthrough 5.23, Partes E/F/S — Race → Duplas: autoridade sazonal de
// pares (Race(A)+Race(B)), card próprio e lista canônica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /function RaceDoublesCard/);
assert.match(source, /Sua dupla na Race/);
assert.match(source, /getTeamRaceRank\b/, 'deve ler a autoridade de Race por dupla');
assert.match(source, /getTeamRaceRankings/, 'lista da Race de duplas');
assert.match(source, /playerRacePairRank/, 'total vem da linha canônica da Race');
assert.match(source, /<TeamList[\s\S]*?items=\{raceTeams\}/, 'lista deve usar o board de Race de duplas');

// Não pode usar World points no card de Race de Duplas.
const raceCard = source.match(/function RaceDoublesCard[\s\S]*?\n\}/)[0];
assert.doesNotMatch(raceCard, /world_ranking_points/, 'Race doubles não pode usar World points');
assert.match(raceCard, /Race<\/span>/, 'breakdown deve rotular "Nome Race"');
assert.match(raceCard, /playerRacePoints/);
assert.match(raceCard, /partnerRacePoints/);

console.log('test-ranking-race-doubles-view-v523: PASS');
