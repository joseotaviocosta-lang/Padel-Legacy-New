// Playthrough 5.24, Parte C — header do Ranking e página de Países usam a
// MESMA autoridade (buildCountryDirectory), então o número coincide.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCountryDirectory, countCountries } from '../src/lib/countryDirectory.js';

const athletes = [
  { id: 'a1', country: 'Brasil', world_ranking_points: 100 },
  { id: 'a2', nationality: 'Espanha', world_ranking_points: 90 },
  { id: 'a3', country: 'Brasil', world_ranking_points: 80 },
  { id: 'a4', country: 'Espanha', retired: true, world_ranking_points: 5000 }, // aposentado não conta
  { id: 'a5', world_ranking_points: 10 }, // sem país → Internacional
];
const clubs = [
  { id: 'c1', country: 'Portugal' }, // país só com clube
  { id: 'c2', country: 'Brasil' },
];

const directory = buildCountryDirectory(athletes, clubs);
const count = countCountries(athletes, clubs);

assert.equal(count, directory.length, 'countCountries deve ser o tamanho do diretório');
assert.equal(count, 4, `esperado 4 países (Brasil, Espanha, Internacional, Portugal), veio ${count}`);

const byName = new Map(directory.map((c) => [c.name, c]));
assert.equal(byName.get('Brasil').athletes, 2);
assert.equal(byName.get('Brasil').clubs, 1);
assert.equal(byName.get('Espanha').athletes, 1, 'aposentado não conta');
assert.equal(byName.get('Portugal').athletes, 0);
assert.equal(byName.get('Portugal').clubs, 1, 'país só com clube entra no diretório');
assert.equal(byName.get('Internacional').athletes, 1, 'sem país cai no fallback');
assert.equal(byName.has('Espanha') && byName.get('Espanha').athletes, 1);

// Determinismo: mesmas listas → mesmo número (é o que o teste do header exige).
assert.equal(countCountries(athletes, clubs), count);

// Estático: as duas superfícies importam a MESMA autoridade.
const ranking = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const countries = readFileSync(new URL('../src/pages/Countries.jsx', import.meta.url), 'utf8');
assert.match(ranking, /buildCountryDirectory\(athletes, clubs\)/, 'Ranking usa a autoridade');
assert.match(countries, /buildCountryDirectory\(athletes, clubs\)/, 'Países usa a autoridade');
assert.doesNotMatch(ranking, /const countryMap = \{\}/, 'Ranking não pode ter a contagem própria antiga');

console.log(`test-countries-authority-v524: PASS (${count} países)`);
