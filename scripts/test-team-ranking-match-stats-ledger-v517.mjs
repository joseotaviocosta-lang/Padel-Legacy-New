// Playthrough 5.17, Parte J — V · D · títulos têm de ser REAIS.
//
// Playtest: #3 Lebrón/Augsburger aparecia com 0V · 0D e milhares de pontos,
// e várias Top10/Top20 com zero partidas. Auditoria dos writers:
//
//   1. São estatísticas reais da dupla?  NÃO (antes desta fase).
//   2. São aproximação dos membros?      SIM — min(career_wins de A, de B).
//   3. São seed?                         Parcialmente, nas linhas suplementares.
//   4. Incrementadas no settlement?      Só na dupla do JOGADOR.
//   5. Caminho de IA que dá ponto e não estatística? SIM — era a causa: os
//      pontos vinham do settlement real e as partidas de uma derivação.
//   6. Recalcular TeamRanking apagava os contadores? SIM — updateTeamRankings
//      SOBRESCREVIA os três campos a cada passada do circuito.
//   7. O repair legado apaga? NÃO (só toca pontos/ids/team_key).
//
// Correção: o settlement do World Tour passou a gravar um ledger real por
// dupla (partidas vencidas no evento + eliminação), e o circuito apenas
// PRESERVA. Linhas sem ledger ficam marcadas como histórico indisponível em
// vez de exibir um "0V · 0D" que parece fato.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const live = {};
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v517-ledger', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  },
});

const teams = live.teams;
const top20 = teams.slice(0, 20);
const withLedger = teams.filter((t) => t.stats_source === 'ledger');
const unavailable = teams.filter((t) => t.stats_source !== 'ledger');

console.log(`duplas: ${teams.length} | com ledger: ${withLedger.length} | sem histórico: ${unavailable.length}\n`);

console.log('=== PARTE J: Top20 — V/D reais ===');
console.log('rank dupla                                      pts     V    D   part  fonte');
top20.forEach((t, i) => {
  const name = `${t.player1_name}/${t.player2_name}`.slice(0, 42);
  console.log(`${String('#' + (i + 1)).padEnd(5)}${name.padEnd(44)}${String(t.ranking_points).padStart(6)}${String(t.wins ?? '-').padStart(6)}${String(t.losses ?? '-').padStart(5)}${String(t.matches_played ?? '-').padStart(6)}  ${t.stats_source || 'n/d'}`);
});

check('Parte J/1: o ledger REAL existe e cobre duplas de verdade', () => {
  console.log(`   [registro] linhas com ledger: ${withLedger.length}`);
  assert.ok(withLedger.length > 0, 'nenhuma dupla ganhou ledger real durante a temporada');
});

check('Parte J/11: V + D é exatamente o total de partidas', () => {
  const broken = withLedger.filter((t) => (
    (Number(t.wins) || 0) + (Number(t.losses) || 0) !== (Number(t.matches_played) || 0)
  ));
  console.log(`   [registro] linhas incoerentes: ${broken.length}`);
  assert.equal(broken.length, 0,
    `${broken.length} linhas com V+D != partidas (ex.: ${broken.slice(0, 2).map((t) => `${t.player1_name}/${t.player2_name} ${t.wins}+${t.losses}!=${t.matches_played}`).join(' | ')})`);
});

check('Parte J/10: nenhuma Top20 com ledger mostra 0V/0D tendo jogado', () => {
  // A patologia exata do playtest: pontos altos com 0V·0D.
  const zeroed = top20.filter((t) => t.stats_source === 'ledger'
    && (Number(t.matches_played) || 0) === 0 && (Number(t.ranking_points) || 0) > 0);
  assert.equal(zeroed.length, 0,
    `${zeroed.length} duplas do Top20 com ledger, pontos e zero partidas`);
});

check('Parte J: uma dupla SEM histórico é marcada, não inventada', () => {
  // Regra da Parte J: melhor "histórico indisponível" que número inventado.
  const lying = unavailable.filter((t) => (Number(t.matches_played) || 0) > 0);
  console.log(`   [registro] sem ledger mas com partidas gravadas: ${lying.length}`);
  assert.equal(lying.length, 0,
    'há linhas sem ledger exibindo contagem de partidas — número sem origem');
});

check('Parte J/20: os contadores vêm de EVENTOS, não de derivação', () => {
  // NOTA DE MEDIÇÃO: comparar com `min(career_wins A, B)` NÃO discrimina
  // nada — `career_wins` do atleta é incrementado dos MESMOS outcomes, então
  // para uma dupla que sempre joga junta os dois números coincidem por
  // construção. Uma coincidência de 100% ali não prova derivação.
  //
  // A prova estrutural verdadeira é esta: no ledger, cada evento disputado
  // contribui com exatamente uma derrota, exceto quando a dupla foi campeã.
  // Logo `derrotas == eventos - títulos`, uma identidade que a derivação por
  // contadores individuais não teria motivo nenhum de satisfazer.
  const broken = withLedger.filter((t) => (
    (Number(t.losses) || 0) !== ((Number(t.ledger_events) || 0) - (Number(t.ledger_titles) || 0))
  ));
  console.log(`   [registro] linhas que violam derrotas = eventos - títulos: ${broken.length}/${withLedger.length}`);
  assert.equal(broken.length, 0,
    `${broken.length} linhas cujo V/D não corresponde aos eventos disputados`);
});

check('Parte J/4-6: recalcular o circuito NÃO apaga o ledger', () => {
  // Se updateTeamRankings voltasse a sobrescrever, as linhas com ledger
  // teriam sido zeradas pela última passada do circuito da simulação.
  const survived = withLedger.filter((t) => (Number(t.matches_played) || 0) > 0);
  console.log(`   [registro] linhas com ledger e partidas > 0 após o circuito: ${survived.length}/${withLedger.length}`);
  assert.ok(survived.length > 0, 'o circuito zerou todos os ledgers');
});

check('Parte J: títulos do ledger são coerentes com vitórias', () => {
  const impossible = withLedger.filter((t) => (Number(t.ledger_titles) || 0) > (Number(t.ledger_events) || 0));
  assert.equal(impossible.length, 0, 'dupla com mais títulos que eventos disputados');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-match-stats-ledger-v517: PASS');
