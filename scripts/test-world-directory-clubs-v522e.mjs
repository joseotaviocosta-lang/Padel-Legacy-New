// Playthrough 5.22-E, Partes AC/AE — Clubes tem destino real no diretório
// do mundo e mostra nome, país, número de atletas e principais jogadores /
// reputação quando o dado real existe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hub = readFileSync(new URL('../src/pages/hubs/AthletesClubsHub.jsx', import.meta.url), 'utf8');
const clubs = readFileSync(new URL('../src/pages/Clubs.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(hub, /key:\s*'clubs'/, 'diretório deve ter aba Clubes');
assert.match(clubs, /club\.country|country/, 'Clubes deve mostrar país');
assert.match(clubs, /member_count/, 'Clubes deve mostrar número de membros/atletas');
assert.match(clubs, /club_points/, 'Clubes deve mostrar pontos reais do clube');
assert.match(clubs, /reputation/, 'Clubes deve mostrar reputação quando existir');
assert.match(clubs, /Clubes ativos|Clubes do circuito/i, 'Clubes deve ter título próprio');

// Rota real: /world/directory?tab=clubs e redirect legado preservado.
assert.match(app, /path="\/world\/directory"/, 'rota do diretório do mundo deve existir');
assert.match(app, /to="\/world\/directory" tab="clubs"/, 'rota legada /clubs deve chegar na aba Clubes');

console.log('test-world-directory-clubs-v522e: PASS');
