// Playthrough 5.22-E, Parte I — hard gate: duplicated race season summary = 0.
// A Race deve renderizar um único card sazonal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
// Conta apenas o que é renderizado — comentários podem citar os rótulos.
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const seasonSummaries = (source.match(/Sua temporada/gi) || []).length;
assert.equal(seasonSummaries, 1, `esperado 1 resumo "Sua temporada", encontrado ${seasonSummaries}`);

// O card sazonal da Race Individual tem UM único badge de posição.
const raceCard = source.match(/function RaceIndividualCard[\s\S]*?\n\}/)[0];
const raceRankBadges = (raceCard.match(/na Race/gi) || []).length;
assert.equal(raceRankBadges, 1, `esperado 1 badge de posição na Race, encontrado ${raceRankBadges}`);

const raceLists = (source.match(/<IndividualList[\s\S]*?items=\{raceAthletes\}/g) || []).length;
assert.equal(raceLists, 1, `esperado 1 lista da Race, encontrado ${raceLists}`);

console.log('test-ranking-race-no-duplicate-summary-v522e: PASS');
