// Playthrough 5.20-B, Parte AL — BINDINGS DE ROTA EM App.jsx.
//
// O arquivo declarava 47 componentes desestruturando um array de 47 strings na
// ordem exata. Remover ou inserir um item em so um dos lados trocaria um
// componente por outro EM SILENCIO: o build passa, a rota continua existindo e
// so a tela errada aparece. Nenhum teste de rota pegaria isso, porque do ponto
// de vista do roteador nada mudou.
//
// Alem disso, a consolidacao da 5.20-A deixou 22 bindings sem rota nenhuma —
// esses componentes passaram a ser carregados pelos proprios hubs.
//
// Gates:
//   1. nao existe desestruturacao posicional de lazy bindings;
//   2. todo binding declarado e usado por alguma rota;
//   3. toda rota referencia um binding declarado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

console.log('\n=== Parte AL: bindings de rota ===');

check('Parte AL (gate): nenhuma desestruturacao posicional de lazy bindings', () => {
  const posicional = /const \[[\s\S]*?\] = \[[\s\S]*?\]\.map\(lazyPage\)/.test(APP);
  assert.equal(posicional, false, 'o array posicional voltou: um item fora de ordem troca componentes sem erro de build');
});

const declarados = [...APP.matchAll(/const (\w+) = lazyPage\('(\w+)'\)/g)];
note(`bindings declarados=${declarados.length}`);
check('Parte AL: cada binding aponta para o modulo de mesmo nome', () => {
  const trocados = declarados.filter(([, nome, modulo]) => nome !== modulo).map(([, n, m]) => `${n} -> ${m}`);
  assert.deepEqual(trocados, [], `binding com nome diferente do modulo: ${trocados.join(', ')}`);
});

const corpo = APP.slice(APP.indexOf('<Routes'));
const nomes = declarados.map(([, n]) => n);
const semUso = nomes.filter((n) => !corpo.includes(`<${n} `) && !corpo.includes(`<${n}/`) && !corpo.includes(`<${n}>`));
note(`bindings sem rota=${semUso.length}${semUso.length ? ' -> ' + semUso.join(', ') : ''}`);
check('Parte AL (gate): todo binding declarado e usado por alguma rota', () => {
  assert.deepEqual(semUso, [], `binding morto: ${semUso.join(', ')}`);
});

const usados = [...corpo.matchAll(/element=\{<(\w+)\s*\/?>/g)].map((m) => m[1]);
// Um componente de rota pode chegar por import nomeado (ActiveCareerGuard),
// nao so por lazy binding ou declaracao local. Contar isso como "nao
// declarado" era falha do detector, nao do App.jsx.
const nomesImportados = new Set();
for (const linha of APP.split('\n')) {
  if (!linha.startsWith('import ') || !linha.includes('{')) continue;
  const dentro = linha.slice(linha.indexOf('{') + 1, linha.indexOf('}'));
  for (const parte of dentro.split(',')) nomesImportados.add(parte.trim().split(' ').pop());
}
const naoDeclarados = [...new Set(usados)].filter((u) => !nomes.includes(u)
  && !nomesImportados.has(u)
  && !APP.includes(`const ${u} =`)
  && !APP.includes(`function ${u}`));
note(`rotas com elemento=${usados.length} | referencias nao declaradas=${naoDeclarados.length}`);
check('Parte AL (gate): toda rota referencia um binding declarado', () => {
  assert.deepEqual(naoDeclarados, [], `rota aponta para componente nao declarado: ${naoDeclarados.join(', ')}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
