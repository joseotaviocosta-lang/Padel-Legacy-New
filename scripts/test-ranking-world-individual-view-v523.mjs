// Playthrough 5.23, Partes B/P — Mundial → Individual preserva a autoridade
// individual validada: posição, pontos, acima/abaixo, próximo marco, Top 3 e
// lista completa. Sem "Minha faixa".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /Sua posição mundial/);
assert.match(source, /playerPositionContext/);
assert.match(source, /nextMilestone/);
assert.match(source, /ArrowUp/);
assert.match(source, /ArrowDown/);
assert.match(source, /buildPlayerRankingContext/);
assert.match(source, /circuitAthletes/);
assert.match(source, /<Podium/);
assert.doesNotMatch(source, /Ver minha faixa/i, 'não pode trazer de volta "Minha faixa"');
assert.doesNotMatch(source, /buildRankNeighborhood/, 'grade de vizinhança não deve voltar');

console.log('test-ranking-world-individual-view-v523: PASS');
