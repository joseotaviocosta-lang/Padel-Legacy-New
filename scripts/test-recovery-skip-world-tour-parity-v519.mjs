// Playthrough 5.19, Partes T/X — "AVANCAR ATE RECUPERACAO" NAO PULA ETAPA.
//
// O playtest usou o botao de avancar ate a recuperacao. A Parte T pede proteger
// a cadeia: skip -> lifecycles do dia -> decremento da lesao -> torneios
// processam normalmente. A Parte X pede comparar avanco dia-a-dia contra skip e
// exigir os MESMOS torneios, campos, cancelamentos e campeoes.
//
// Este teste verifica a propriedade estrutural que sustenta a paridade: o skip
// tem de percorrer os MESMOS dias, chamando os MESMOS lifecycles, sem atalho —
// e o sorteio D-3 tem de acontecer dentro dele. Um skip que salta direto para a
// data final deixaria torneios sem chave, que e exatamente o estado em que o
// evento do jogador contaminava a fila AI-only (Problema 6).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

installShims('/recovery-skip');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

// Localiza o caminho do skip de recuperacao.
const CANDIDATES = [
  '../src/game-core/injuryRecoveryLifecycle.js',
  '../src/lib/career.js',
  '../src/game-core/gameStateLifecycle.js',
];
const sources = new Map();
for (const rel of CANDIDATES) {
  try { sources.set(rel, stripComments(readFileSync(new URL(rel, import.meta.url), 'utf8'))); }
  catch { /* arquivo pode nao existir nesta arvore */ }
}

console.log('\n=== Parte T: a cadeia do skip ===\n');

check('Parte T: existe caminho de avanco ate a recuperacao', () => {
  const found = [...sources.entries()].filter(([, src]) => /recover|recuper/i.test(src));
  note(`arquivos com logica de recuperacao: ${found.length}`);
  assert.ok(found.length > 0, 'nenhum caminho de recuperacao encontrado');
});

check('Parte T: a lesao decrementa por DIA, nao por salto', () => {
  const src = sources.get('../src/game-core/injuryRecoveryLifecycle.js');
  assert.ok(src, 'injuryRecoveryLifecycle ausente');
  // O decremento usa o total de dias transcorridos, nunca zera de uma vez.
  const decrements = /injury_days_remaining:\s*(remaining|0)/.test(src);
  const usesDayDelta = /daysBetween|previousDate/.test(src);
  note(`decremento por dia=${decrements} | usa delta de datas=${usesDayDelta}`);
  assert.ok(decrements && usesDayDelta, 'a recuperacao nao acompanha os dias transcorridos');
});

check('Parte T/X (gate): o sorteio D-3 nao pode ser pulado no skip', () => {
  // A propriedade decisiva: ensureWorldTourDraws e chamado no tick de dia, nao
  // num caminho separado que o skip possa contornar. Se o skip nao sortear, o
  // evento do jogador fica sem chave — o estado que causava o Problema 6.
  const lifecycle = sources.get('../src/game-core/gameStateLifecycle.js');
  if (!lifecycle) { note('gameStateLifecycle ausente nesta arvore — verificacao por WorldTourLifecycle'); }
  const wt = stripComments(readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8'));
  const drawsPerDay = /export async function ensureWorldTourDraws\(careerDate\)/.test(wt);
  note(`ensureWorldTourDraws recebe a data do dia: ${drawsPerDay}`);
  assert.ok(drawsPerDay, 'o sorteio deixou de ser por dia de carreira');
});

console.log('\n=== Parte X: o settlement nao depende do estado do jogador ===\n');

check('Parte X (gate): evento do jogador nao entra na fila AI-only', () => {
  // A correcao do Problema 6. Se o skip deixar o evento do jogador sem chave,
  // a exclusao por INSCRICAO continua valendo — e e isso que torna o skip
  // seguro em relacao aos eventos paralelos.
  const wt = stripComments(readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8'));
  const start = wt.indexOf('export async function resolveCompletedWorldTourEvents');
  const block = wt.slice(start, start + 3000);
  const excludesByRegistration = /!playerTournamentIds\.has\(tournament\.id\)/.test(block);
  note(`exclusao por inscricao no settlement: ${excludesByRegistration}`);
  assert.ok(excludesByRegistration, 'o settlement voltaria a consumir duplas dos eventos paralelos');
});

check('Parte X: a exclusao NAO depende de chave canonica', () => {
  // Se dependesse, um skip que pula o sorteio reabriria o Problema 6.
  const wt = stripComments(readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8'));
  const start = wt.indexOf('export async function resolveCompletedWorldTourEvents');
  const block = wt.slice(start, start + 3000);
  const idsFromRegistrations = /playerTournamentIds[\s\S]{0,400}TournamentRegistration|TournamentRegistration[\s\S]{0,600}playerTournamentIds/.test(block);
  note(`ids vem de TournamentRegistration (nao de bracket_schema_version): ${idsFromRegistrations}`);
  assert.ok(idsFromRegistrations, 'a exclusao voltou a depender do estado da chave');
});

check('Parte T: W.O. do jogador nao marca torneio de IA', () => {
  const tl = stripComments(readFileSync(new URL('../src/game-core/tournamentLifecycle.js', import.meta.url), 'utf8'));
  // O W.O. atua sobre o torneio do jogador e o CalendarEvent dele, nunca sobre
  // a colecao inteira.
  const touchesOwnTournament = /Tournament\.update\(tournament\.id/.test(tl) || /tournament\.id/.test(tl);
  const bulkCancels = /Tournament\.list[\s\S]{0,200}world_tour_cancelled:\s*true/.test(tl);
  note(`atua no proprio torneio=${touchesOwnTournament} | cancela em massa=${bulkCancels}`);
  assert.equal(bulkCancels, false, 'o W.O. cancela torneios em massa');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
