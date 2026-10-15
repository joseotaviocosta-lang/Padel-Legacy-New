// Playthrough 5.22-E, Partes G/H/J/K — a Race tem layout e dados próprios:
// pontos da temporada, torneios, melhor campanha, últimos pontos e corte de
// Finals. Usa Race points/rank, nunca Circuit/World.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RACE_FINALS_CUTOFF, TEAM_FINALS_CUT, bestRaceResult } from '../src/lib/rankingDisplay.js';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /Sua temporada/i, 'Race deve ter card sazonal');
assert.match(source, /raceRank/, 'Race deve usar a posição da Race');
assert.match(source, /racePoints/, 'Race deve usar Race points');
assert.match(source, /Torneios/, 'Race deve mostrar número de torneios');
assert.match(source, /Melhor resultado/, 'Race deve mostrar melhor resultado');
assert.match(source, /Últimos pontos/, 'Race deve mostrar últimos pontos');
assert.match(source, /TEAM_FINALS_CUT|buildTeamFinalsCut/, 'Race deve citar o corte de Finals');

// Mundial usa a posição/pontos mundiais; Race usa a posição/pontos sazonais.
assert.match(source, /playerPositionContext/, 'Mundial deve usar a posição mundial');
assert.match(source, /function RaceIndividualCard/, 'Race tem card próprio');

// Paridade do corte de Finals com a autoridade real (WorldTourLifecycle).
const worldTour = readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8');
assert.match(worldTour, /'Circuit Finals':\s*8/, 'autoridade deve definir Circuit Finals = 8');
assert.equal(RACE_FINALS_CUTOFF, 8, 'RACE_FINALS_CUTOFF deve espelhar a autoridade');
assert.equal(TEAM_FINALS_CUT, 8, 'TEAM_FINALS_CUT deve espelhar a autoridade');

// Melhor campanha é escolhida por dados reais, não inventada.
const best = bestRaceResult([
  { finish: 'Participante', points: 10 },
  { finish: 'Semifinalista', points: 120 },
  { finish: 'Quartas de final', points: 80 },
]);
assert.equal(best.finish, 'Semifinalista');

console.log('test-ranking-race-distinct-v522e: PASS');
