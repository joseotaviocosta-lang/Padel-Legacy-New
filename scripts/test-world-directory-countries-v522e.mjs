// Playthrough 5.22-E, Partes AB/AD/AE — Países tem destino real no diretório
// do mundo: país, atletas, clubes, melhores atletas e representação no
// circuito. É diretório/estatística, não um "ranking de países".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hub = readFileSync(new URL('../src/pages/hubs/AthletesClubsHub.jsx', import.meta.url), 'utf8');
const countries = readFileSync(new URL('../src/pages/Countries.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(hub, /key:\s*'countries'/, 'diretório deve ter aba Países');
assert.match(countries, /title="Países"/, 'página deve se chamar Países');
assert.match(countries, /athletes/, 'deve contar atletas por país');
assert.match(countries, /clubs/, 'deve contar clubes por país');
assert.match(countries, /topAthletes/, 'deve listar melhores atletas');
assert.match(countries, /representation/, 'deve mostrar representação no circuito');
assert.match(countries, /totalPoints/, 'deve mostrar pontos somados reais');

// Rota real: /world/directory?tab=countries.
assert.match(app, /path="\/world\/directory"/, 'rota do diretório do mundo deve existir');

console.log('test-world-directory-countries-v522e: PASS');
