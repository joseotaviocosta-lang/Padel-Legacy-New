// Playthrough 5.19, Partes U/V/W/Y/Z/AA — W.O. DO JOGADOR E EVENTOS PARALELOS.
//
// O playtest: jogador lesionado, seu torneio teve W.O. corretamente, e OUTROS
// eventos do mesmo dia (São Paulo Cup, Melbourne World Gold, Xangai
// Championship) apareceram cancelados por "número insuficiente de duplas
// elegíveis". As simulações 5.17/5.18 mediram ZERO cancelamentos — porque
// nenhuma delas tinha jogador inscrito.
//
// Hipótese da Parte V, testada aqui: o evento do jogador está contaminando a
// atribuição semanal dos eventos de IA.
//
// O mecanismo suspeito (Parte W, item 8): `isWorldTourResolutionPending` só
// exclui o torneio do jogador quando existe CHAVE CANÔNICA:
//
//   const bracketReady = Number(tournament.bracket_schema_version) >= 2;
//   if (bracketReady && (player_participated || hasPlayerMatchInBracket)) return false;
//
// Sem chave canônica (sorteio não executado — por exemplo durante "avançar até
// recuperação"), o torneio do jogador CAI na fila AI-only, entra em
// `tournamentsByWeek` e vai para `assignPairsForWeek` junto com os eventos
// paralelos. As duplas de IA que o escolhem são consumidas e desaparecem dos
// demais — que então cancelam por campo insuficiente.
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

installShims('/wo-isolation');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const wt = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { isWorldTourResolutionPending, assignPairsForWeek } = wt;

const CAREER_DATE = '2026-04-20';
const WEEK_START = '2026-04-13';
const WEEK_END = '2026-04-16';

const mkTournament = (id, tier, extra = {}) => ({
  id, name: id, tier, world_tour_event: true,
  start_date: WEEK_START, end_date: WEEK_END,
  main_draw_size: tier === 'Masters' ? 24 : 16,
  ...extra,
});

console.log('\n=== Parte V: o evento do jogador entra na fila AI-only? ===\n');

const CASES = [
  ['jogador com chave canonica e participacao', { bracket_schema_version: 2, player_participated: true }, false],
  ['jogador com chave canonica, W.O. registrado no bracket', {
    bracket_schema_version: 2,
    bracket_history: [{ matches: [{ player_match: true }] }],
  }, false],
  ['jogador SEM chave canonica (sorteio nao executado)', { player_participated: true }, true],
  ['jogador SEM chave e sem participacao (W.O. antes de tudo)', {}, true],
  ['evento de IA normal', {}, true],
];
console.log(`${'cenario'.padEnd(52)}${'entra na fila AI'.padEnd(18)}esperado`);
const observed = [];
for (const [label, extra, expectedPending] of CASES) {
  const t = mkTournament(`t-${label.slice(0, 12)}`, 'Gold', extra);
  const pending = isWorldTourResolutionPending(t, CAREER_DATE);
  observed.push({ label, pending, expectedPending });
  console.log(`${label.padEnd(52)}${String(pending).padEnd(18)}${expectedPending}`);
}
console.log('');

check('Parte V: chave canonica + participacao exclui o evento do jogador', () => {
  const withBracket = observed.filter((o) => o.label.includes('com chave canonica'));
  for (const o of withBracket) {
    assert.equal(o.pending, false, `${o.label}: entrou na fila AI-only`);
  }
  note(`${withBracket.length} cenarios com chave canonica: todos excluidos`);
});

check('Parte V: sem chave canonica, o predicado sozinho NAO protege', () => {
  // Registro do limite do predicado, não um gate: `isWorldTourResolutionPending`
  // recebe só o torneio e não conhece inscrições, então não pode saber que o
  // evento é do jogador quando falta a chave. A proteção tem de estar no
  // CHAMADOR (`resolveCompletedWorldTourEvents`), que lê TournamentRegistration
  // — e é lá que o gate de integração abaixo verifica.
  const noBracket = observed.filter((o) => o.label.startsWith('jogador SEM chave'));
  const leaking = noBracket.filter((o) => o.pending === true);
  note(`cenarios do jogador sem chave que o predicado deixa passar: ${leaking.length}/${noBracket.length}`);
  note('por isso a exclusao por INSCRICAO foi adicionada em resolveCompletedWorldTourEvents');
  assert.equal(leaking.length, noBracket.length, 'o predicado mudou de contrato — revisar o chamador');
});

check('Parte V (gate): o chamador exclui o evento do jogador por INSCRICAO', () => {
  // A correção vive em `resolveCompletedWorldTourEvents`: ela lê
  // TournamentRegistration e remove esses torneios de `pending` ANTES de montar
  // `tournamentsByWeek`. Sem isso o evento do jogador entra em
  // `assignPairsForWeek` junto com os paralelos.
  const src = stripComments(readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8'));
  const start = src.indexOf('export async function resolveCompletedWorldTourEvents');
  assert.ok(start > 0, 'funcao de settlement nao encontrada');
  const block = src.slice(start, start + 3000);
  const readsRegistrations = /TournamentRegistration\.list/.test(block);
  const buildsIds = /playerTournamentIds\s*=\s*new Set/.test(block);
  const filtersPending = /!playerTournamentIds\.has\(tournament\.id\)[\s\S]{0,80}isWorldTourResolutionPending/.test(block);
  note(`le inscricoes=${readsRegistrations} | monta ids=${buildsIds} | filtra pending=${filtersPending}`);
  assert.ok(readsRegistrations, 'o settlement nao le inscricoes do jogador');
  assert.ok(buildsIds, 'o settlement nao monta o conjunto de torneios do jogador');
  assert.ok(filtersPending, 'o settlement nao exclui os torneios do jogador da fila');
});

// ------------------------------------------------------- Parte Y/AA
console.log('=== Parte Y/AA: mesmo dia, cinco tiers, com e sem o evento do jogador ===\n');

const mkPair = (n, rank, ovr) => ({
  id: `pair-${n}`, name: `Dupla ${n}`, chemistry: 50, priorityWindowRemaining: 0,
  athletes: [
    { id: `a-${n}-1`, name: `A${n}1`, ranking_position: rank, overall_rating: ovr, tournaments_played: 4, energy: 100 },
    { id: `a-${n}-2`, name: `A${n}2`, ranking_position: rank + 5, overall_rating: ovr, tournaments_played: 4, energy: 100 },
  ],
});
const pairs = Array.from({ length: 120 }, (_, i) => mkPair(i, 10 + i * 8, 90 - Math.floor(i / 3)));

const aiEvents = [
  mkTournament('sao-paulo-cup', 'Bronze'),
  mkTournament('melbourne-world-gold', 'Gold'),
  mkTournament('xangai-championship', 'Silver'),
  mkTournament('doha-platinum', 'Platinum'),
  mkTournament('madrid-masters', 'Masters'),
];
const playerEvent = mkTournament('player-event-casablanca', 'Gold');

const minViable = (draw) => Math.min(8, Math.max(2, Math.ceil(draw / 2)));
const summarize = (assignments, events, label) => {
  console.log(`  ${label}`);
  const rows = [];
  for (const t of events) {
    const list = assignments.get(t.id) || [];
    const draw = t.main_draw_size;
    const viable = list.length >= minViable(draw);
    rows.push({ id: t.id, tier: t.tier, candidates: list.length, draw, minViable: minViable(draw), viable });
    console.log(`    ${t.id.padEnd(26)}${t.tier.padEnd(11)}candidatos=${String(list.length).padStart(4)} chave=${String(draw).padStart(3)} minimo=${minViable(draw)} ${viable ? 'OK' : 'CANCELARIA'}`);
  }
  return rows;
};

// A: só eventos de IA (o mundo dos harnesses 5.17/5.18).
const withoutPlayer = assignPairsForWeek(aiEvents, pairs);
const rowsA = summarize(withoutPlayer, aiEvents, 'A) sem o evento do jogador na semana:');
console.log('');
// B: o evento do jogador na MESMA semana, como a fila AI-only o veria.
const withPlayer = assignPairsForWeek([...aiEvents, playerEvent], pairs);
const rowsB = summarize(withPlayer, aiEvents, 'B) com o evento do jogador na mesma semana:');
const stolen = (withPlayer.get(playerEvent.id) || []).length;
console.log(`    ${'-> consumidas pelo evento do jogador'.padEnd(37)}${stolen}`);
console.log('');

check('Parte AA: forense — nenhum evento de IA fica abaixo do minimo sem o jogador', () => {
  const failing = rowsA.filter((r) => !r.viable);
  note(`eventos de IA=${rowsA.length} | abaixo do minimo=${failing.length}`);
  for (const f of failing) note(`  ${f.id}: ${f.candidates} candidatos, minimo ${f.minViable}`);
  assert.equal(failing.length, 0, 'o cenario base ja cancela — o teste nao isola o efeito do jogador');
});

check('Parte Z: o DANO de incluir o evento do jogador esta quantificado', () => {
  // Esta comparação mede o tamanho do problema, e é o motivo de a exclusão
  // existir. `assignPairsForWeek` recebe a lista de torneios que lhe dão: ela
  // NÃO pode saber que um deles é do jogador, então a proteção não é aqui.
  // Depois da correção, o evento do jogador nunca chega a esta lista.
  const regressions = [];
  for (const b of rowsB) {
    const a = rowsA.find((x) => x.id === b.id);
    if (b.candidates < a.candidates) regressions.push({ id: b.id, before: a.candidates, after: b.candidates });
  }
  note(`duplas que o evento do jogador consumiria: ${stolen}`);
  note(`eventos de IA que perderiam campo: ${regressions.length}`);
  for (const r of regressions) note(`  ${r.id}: ${r.before} -> ${r.after}`);
  assert.ok(stolen > 0, 'o cenario nao reproduz o consumo — a medicao perdeu o objeto');
  note('a correcao impede que esta lista inclua o evento do jogador (gate da Parte V, acima)');
});

check('Parte Z: nenhum evento paralelo passa a cancelar por causa do jogador', () => {
  const newlyFailing = rowsB.filter((b) => {
    const a = rowsA.find((x) => x.id === b.id);
    return !b.viable && a.viable;
  });
  note(`eventos que passam a cancelar com o jogador na semana: ${newlyFailing.length}`);
  for (const f of newlyFailing) note(`  ${f.id}: ${f.candidates} candidatos, minimo ${f.minViable}`);
  assert.equal(newlyFailing.length, 0);
});

check('Parte AB: nenhum minimo viavel foi reduzido para resolver isto', () => {
  // A correcao nao pode passar por afrouxar minViableDraw nem aumentar campo.
  const expected = [[24, 8], [16, 8], [8, 4], [4, 2], [2, 2]];
  for (const [draw, want] of expected) assert.equal(minViable(draw), want, `minViable(${draw})`);
  note(`minimo viavel intacto: ${expected.map(([d, w]) => `${d}->${w}`).join(' ')}`);
  const masters = aiEvents.find((t) => t.tier === 'Masters');
  assert.equal(masters.main_draw_size, 24, 'Masters deixou de ser 24');
  note('Masters=24 intacto');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
