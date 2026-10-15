// Playthrough 5.23, Parte N — cada troca de view EMPILHA histórico (push),
// para Back/Forward do navegador funcionarem; só a normalização de link
// legado usa replace.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

const setView = source.match(/const setView = useCallback\([\s\S]*?\}, \[searchParams, setSearchParams\]\);/)[0];
assert.match(setView, /next\.set\('scope', nextScope\)/);
assert.match(setView, /next\.set\('type', nextType\)/);
// Push: sem `{ replace: true }`.
assert.doesNotMatch(setView, /replace:\s*true/, 'troca de view deve empilhar histórico (push)');

// A normalização do legado usa replace (não polui o histórico).
assert.match(source, /setSearchParams\(next, \{ replace: true \}\)/, 'legado normaliza com replace');

// A view vive na URL, não só em state.
assert.match(source, /useSearchParams/);
assert.match(source, /resolveRankingView\(searchParams\)/);

console.log('test-ranking-history-navigation-v523: PASS');
