// Playthrough 5.22-E, Partes C/D/E/F — o Mundial é compacto: sem "Ver minha
// faixa", sem grade de vizinhança; posição e pontos com o mesmo destaque;
// acima/abaixo e próximo objetivo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /Ver minha faixa/i, 'botão "Ver minha faixa" ainda existe');
assert.doesNotMatch(source, /buildRankNeighborhood/, 'grade de vizinhança ainda é importada/usada');
assert.doesNotMatch(source, /showNeighborhood/, 'estado showNeighborhood ainda existe');
assert.doesNotMatch(source, /setShowNeighborhood/, 'setter de showNeighborhood ainda existe');

assert.match(source, /Sua posição mundial/i, 'Mundial deve ter o bloco "Sua posição mundial"');
assert.match(source, /Próximo objetivo/i, 'Mundial deve mostrar próximo objetivo');
assert.match(source, /ArrowUp/, 'deve indicar o atleta acima');
assert.match(source, /ArrowDown/, 'deve indicar o atleta abaixo');
assert.match(source, /pontos/i, 'pontos devem aparecer');

// Pontos com destaque (não metadado irrelevante): o número da posição e o de
// pontos usam tamanho grande.
// Fase 5.32-A: a posição vem de `rank` (null = "Ainda sem ranking").
assert.match(source, /text-4xl font-black leading-none tabular-nums text-primary">#\{rank\}/, 'posição mundial deve ser grande');
assert.match(source, /text-lg font-black tabular-nums text-foreground/, 'pontos devem ter destaque');

console.log('test-ranking-world-compact-v522e: PASS');
