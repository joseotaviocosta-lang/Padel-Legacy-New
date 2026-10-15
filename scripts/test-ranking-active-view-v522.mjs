import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /Sua dupla|Sua Dupla/i, 'Ranking deve expor a dupla ativa no contexto de render do tab Duplas');
assert.match(source, /getTeamRank\s*\(/, 'Ranking deve consultar o rank canônico da dupla ativa');

console.log('test-ranking-active-view-v522: PASS');
