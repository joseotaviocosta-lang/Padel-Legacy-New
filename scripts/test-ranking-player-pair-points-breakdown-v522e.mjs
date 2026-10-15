// Playthrough 5.22-E, Partes W/X — o card "Sua dupla" decompõe os pontos dos
// dois atletas e mostra o total como a soma. Se a soma > 0, nunca exibe 0.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeCanonicalTeamRankingPoints as f } from '../src/lib/teamRankingFormula.js';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /Sua dupla/i, 'card "Sua dupla" deve existir');
assert.match(source, /rankingSnapshot\?\.playerPoints/, 'deve mostrar os pontos individuais do jogador');
assert.match(source, /playerPartner\?\.world_ranking_points/, 'deve mostrar os pontos individuais do parceiro');
assert.match(source, /playerPairRank/, 'total da dupla vem da linha canônica');
assert.match(source, /pairRank\.points/, 'o card exibe o total canônico');
assert.match(source, /Total/, 'deve rotular o total da soma');
assert.match(source, /Sem ranking/, 'deve tratar dupla sem ranking');

// A matemática do card é a fórmula canônica.
assert.equal(f(39, 0), 39);
assert.equal(f(0, 0), 0);

// zezao 39 + Tomás 0 = 39 (nunca 0).
const playerPoints = 39;
const partnerPoints = 0;
const total = f(playerPoints, partnerPoints);
assert.equal(total, 39);
assert.notEqual(total, 0, 'dupla com soma > 0 não pode ser exibida como 0');

console.log('test-ranking-player-pair-points-breakdown-v522e: PASS');
