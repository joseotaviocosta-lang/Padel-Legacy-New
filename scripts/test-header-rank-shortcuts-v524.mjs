// Playthrough 5.24, Parte B — header superior com 3 atalhos clicáveis:
// ranking individual, ranking da dupla e OVR, todos com rota canônica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shortcuts = readFileSync(new URL('../src/components/career/HeaderRankShortcuts.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../src/navigation/routes.js', import.meta.url), 'utf8');

// Rotas canônicas.
assert.match(shortcuts, /scope=world&type=individual/, 'ranking individual → world/individual');
assert.match(shortcuts, /scope=world&type=doubles/, 'ranking da dupla → world/doubles');
assert.match(shortcuts, /APP_ROUTES\.CAREER_ATHLETE/, 'OVR → página do jogador');
assert.match(routes, /CAREER_ATHLETE:\s*'\/career\/athlete'/, 'rota do atleta é /career/athlete');

// Acessibilidade: links reais (âncora), com aria-label.
assert.match(shortcuts, /<Link/, 'atalhos devem ser links semânticos');
assert.match(shortcuts, /aria-label=/, 'cada atalho tem aria-label');
assert.match(shortcuts, /focus-visible:ring-2/, 'foco visível');

// O header renderiza os atalhos no desktop E no mobile.
const renders = (layout.match(/<HeaderRankShortcuts/g) || []).length;
assert.ok(renders >= 2, `esperado HeaderRankShortcuts no desktop e no mobile, encontrado ${renders}`);

// Estado sem dupla não quebra: mostra "Sem dupla" e continua navegável.
assert.match(shortcuts, /Sem dupla/);
assert.match(shortcuts, /teamRank\?\.noPartner|!teamRank/);

console.log('test-header-rank-shortcuts-v524: PASS');
