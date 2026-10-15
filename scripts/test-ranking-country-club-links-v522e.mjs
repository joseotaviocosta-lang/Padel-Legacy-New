// Playthrough 5.22-E, Partes AE/AF — hard gate:
//   country badge sem ação = 0
//   club badge sem ação = 0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ranking = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const gameHud = readFileSync(new URL('../src/components/design-system/GameHud.jsx', import.meta.url), 'utf8');

assert.match(ranking, /\/world\/directory\?tab=countries/, 'badge de países deve apontar para o diretório');
assert.match(ranking, /\/world\/directory\?tab=clubs/, 'badge de clubes deve apontar para o diretório');

// Cada badge de país/clube tem seu onClick no mesmo item do HUD.
const countryItem = ranking.match(/label:\s*'países'[\s\S]{0,160}?\}/);
const clubItem = ranking.match(/label:\s*'clubes'[\s\S]{0,160}?\}/);
assert.ok(countryItem && /onClick/.test(countryItem[0]), 'badge de países sem ação');
assert.ok(clubItem && /onClick/.test(clubItem[0]), 'badge de clubes sem ação');

// O design system sabe renderizar um chip interativo.
assert.match(gameHud, /pl-game-hud-item--interactive/, 'GameHud deve suportar chip interativo');
assert.match(gameHud, /onClick/, 'GameHud deve aceitar onClick');
assert.match(gameHud, /<button/, 'chip interativo deve ser um botão acessível');

console.log('test-ranking-country-club-links-v522e: PASS');
