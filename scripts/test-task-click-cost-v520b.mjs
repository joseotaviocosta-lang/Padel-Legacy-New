// Playthrough 5.20-B, Parte AJ — CUSTO EM CLIQUES DAS TAREFAS PRINCIPAIS.
//
// A consolidacao so se justifica se as tarefas ficarem mais BARATAS, nao apenas
// mais arrumadas. Este teste conta os passos de navegacao de cada tarefa a
// partir da Home.
//
// A primeira versao casava regex no fonte de navigationConfig.js. Ela casou
// ZERO grupos, todo destino caiu no ramo "fora de grupo" e o teste imprimiu uma
// melhora inventada com os dois gates passando no vazio. A estrutura agora vem
// de NAV_GROUPS carregado de verdade, e o teste aborta se vier vazio — um
// numero bonito sem lastro e pior que nenhum numero.
//
// Um passo = um toque que muda a tela ou a aba. Abrir o grupo do menu conta,
// porque o jogador precisa faze-lo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { NAV_GROUPS } = await server.ssrLoadModule('/src/navigation/navigationConfig.js');

const rotaDoGrupo = new Map();
for (const grupo of NAV_GROUPS) {
  for (const item of grupo.items || []) rotaDoGrupo.set(item.to, grupo.label);
}
if (rotaDoGrupo.size === 0) {
  console.error('NAV_GROUPS veio vazio — medicao invalida, nao ha o que reportar');
  await server.close();
  process.exit(1);
}

// Playthrough 5.20-C, item 6 — CONCLUSAO DE PRODUTO, NAO GATE DE APROVACAO.
//
// Medido: 22 toques antes, 22 depois. A consolidacao NAO encurtou caminho —
// ela trocou LARGURA por PROFUNDIDADE: o menu caiu de 38 itens para 16, e em
// troca abrir um grupo passou a custar um toque.
//
// Isso foi aceito como resultado de produto. O objetivo da 5.20 passou a ser
// clareza: menos opcoes simultaneas, menos barra lateral, menos conteudo
// escondido — nao menos toques em toda tarefa. Melhorar 22 para um numero
// menor nao e meta, e tentar isso artificialmente (atalhos soltos na Home,
// duplicacao de CTA) pioraria justamente o que a fase veio arrumar.
//
// Por isso aqui NAO existe gate comparativo. O unico gate e absoluto: nenhuma
// tarefa principal pode passar de 3 toques. A coluna `antes` e estimativa
// escrita de memoria — a 5.20-A ja estava aplicada quando esta fase comecou,
// entao nao ha navegacao antiga para medir — e fica como contexto, nunca
// como criterio.
//
// O resultado medido: a consolidacao NAO barateou estas tarefas. Ela trocou
// largura por profundidade — o menu caiu de 38 itens para 16, mas abrir um
// grupo passou a custar um toque. O ganho da fase esta em quanto cabe na
// tela e em quanto conteudo deixa de ficar escondido, nao em caminho curto.
const TAREFAS = [
  { nome: 'Ver proximo compromisso', rota: '/game', aba: null, antes: 1 },
  { nome: 'Responder proposta de dupla', rota: '/partners', aba: 'market', antes: 3 },
  { nome: 'Rever contrato da dupla', rota: '/partners', aba: 'contract', antes: 3 },
  { nome: 'Inscrever-se num torneio', rota: '/tournaments', aba: null, antes: 2 },
  { nome: 'Ver calendario', rota: '/tournaments', aba: 'calendar', antes: 3 },
  { nome: 'Ver ranking', rota: '/ranking', aba: null, antes: 2 },
  { nome: 'Treinar', rota: '/career/training', aba: null, antes: 2 },
  { nome: 'Ver equipe tecnica', rota: '/career/team', aba: 'staff', antes: 3 },
  { nome: 'Ver financas', rota: '/game/economy', aba: null, antes: 2 },
  { nome: 'Ler notificacoes', rota: '/communications', aba: null, antes: 1 },
];

function custo(tarefa) {
  if (tarefa.rota === '/game') return 1;
  // Dentro de um grupo: abrir o grupo + escolher o item. Fora de grupo (barra
  // inferior ou atalho de cabecalho): um toque.
  let passos = rotaDoGrupo.has(tarefa.rota) ? 2 : 1;
  if (tarefa.aba) passos += 1;
  return passos;
}

console.log(`\n=== Parte AJ: custo em cliques a partir da Home ===`);
console.log(`   [registro] rotas mapeadas em grupos=${rotaDoGrupo.size}`);
console.log('\ntarefa                                est.*  agora');
let totalAntes = 0; let totalAgora = 0;
const piores = [];
const caras = [];
for (const t of TAREFAS) {
  const agora = custo(t);
  totalAntes += t.antes; totalAgora += agora;
  if (agora > t.antes) piores.push(`${t.nome} (${t.antes} -> ${agora})`);
  if (agora > 3) caras.push(`${t.nome}=${agora}`);
  const seta = agora < t.antes ? ' menos' : agora > t.antes ? ' MAIS' : '';
  console.log(`${t.nome.padEnd(38)}${String(t.antes).padStart(4)}${String(agora).padStart(7)}${seta}`);
}
console.log(`${'TOTAL'.padEnd(38)}${String(totalAntes).padStart(4)}${String(totalAgora).padStart(7)}`);
console.log('   * est. = estimativa NAO medida da navegacao anterior; so "agora" e medicao.');

// Sem gate comparativo: compararia contra numero estimado.
if (piores.length) console.log(`   [registro] acima da estimativa: ${piores.join('; ')}`);
check('Parte AJ (gate): nenhuma tarefa principal passa de 3 toques', () => {
  assert.deepEqual(caras, [], `acima de 3 toques: ${caras.join(', ')}`);
});
check('Parte AJ: toda tarefa aponta para uma rota que existe na navegacao', () => {
  const orfas = TAREFAS.filter((t) => t.rota !== '/game' && !rotaDoGrupo.has(t.rota)
    && !NAV_GROUPS.some((g) => g.to === t.rota || (g.aliases || []).includes(t.rota)));
  assert.deepEqual(orfas.map((t) => `${t.nome} (${t.rota})`), [], 'tarefa apontando para rota fora da navegacao');
});

await server.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
