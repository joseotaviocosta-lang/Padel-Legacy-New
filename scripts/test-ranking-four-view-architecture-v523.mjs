// Playthrough 5.23, Partes K/X — arquitetura de DOIS NÍVEIS: período
// (Mundial/Race) × tipo (Individual/Duplas), com quatro views distintas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /const SCOPE_TABS = \[[\s\S]*?'world'[\s\S]*?'race'[\s\S]*?\]/, 'SCOPE_TABS deve ter world/race');
assert.match(source, /const TYPE_TABS = \[[\s\S]*?'individual'[\s\S]*?'doubles'[\s\S]*?\]/, 'TYPE_TABS deve ter individual/doubles');

// As três abas antigas (Mundial/Race/Duplas) NÃO são mais a navegação.
assert.doesNotMatch(source, /const TABS = \[[\s\S]*?key: 'circuit'[\s\S]*?key: 'race'[\s\S]*?key: 'teams'[\s\S]*?\]/, 'nav antiga de 3 abas ainda existe');

// As quatro views existem como componentes/render condicional.
assert.match(source, /scope === 'world' && type === 'individual'/);
assert.match(source, /scope === 'world' && type === 'doubles'/);
assert.match(source, /scope === 'race' && type === 'individual'/);
assert.match(source, /scope === 'race' && type === 'doubles'/);
assert.match(source, /function WorldIndividualCard/);
assert.match(source, /function WorldDoublesCard/);
assert.match(source, /function RaceIndividualCard/);
assert.match(source, /function RaceDoublesCard/);

// Duas linhas de tabs, nunca quatro botões no mesmo nível.
const tabRows = (source.match(/<Tabs /g) || []).length;
assert.equal(tabRows, 2, `esperado 2 linhas de Tabs, encontrado ${tabRows}`);

console.log('test-ranking-four-view-architecture-v523: PASS');
