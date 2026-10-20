// Playthrough 5.23, Partes K/O — mobile: dois seletores de 2 opções cada,
// nunca quatro tabs concorrentes no mesmo controle.
// Fase 5.32-A: os dois níveis viraram dois controles segmentados
// (SegmentedToggle) lado a lado; o princípio — 2 níveis × 2 opções — segue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

const scopeBlock = source.match(/const SCOPE_TABS = \[[\s\S]*?\];/)[0];
const typeBlock = source.match(/const TYPE_TABS = \[[\s\S]*?\];/)[0];
assert.equal((scopeBlock.match(/key:/g) || []).length, 2, 'scope deve ter 2 opções');
assert.equal((typeBlock.match(/key:/g) || []).length, 2, 'type deve ter 2 opções');

// Dois controles (período e tipo), nunca um com 4.
assert.match(source, /<SegmentedToggle label="Período do ranking" options=\{SCOPE_TABS\}/);
assert.match(source, /<SegmentedToggle label="Tipo de ranking" options=\{TYPE_TABS\}/);
assert.equal((source.match(/<SegmentedToggle /g) || []).length, 2);

// Labels curtos o suficiente para 360px.
assert.match(scopeBlock, /label: 'Mundial'/);
assert.match(scopeBlock, /label: 'Race'/);
assert.match(typeBlock, /label: 'Individual'/);
assert.match(typeBlock, /label: 'Duplas'/);

console.log('test-ranking-mobile-two-level-tabs-v523: PASS');
