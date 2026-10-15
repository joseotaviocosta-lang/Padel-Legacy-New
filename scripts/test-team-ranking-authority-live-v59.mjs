// Playthrough 5.9 (continuação), Parte E — estado LIVE do leaderboard de
// Duplas, num mundo realmente simulado.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B) para TODA a
// tabela. A conclusão original da 5.9 ("unidades heterogêneas, razão ~132x")
// media a função incremental +50/+20 — hoje CÓDIGO MORTO (zero chamadores de
// produção; ver test-team-ranking-unified-authority-v510). O caminho REAL
// (finalizeTournamentRun) grava a dupla do jogador com a MESMA autoridade
// canônica das duplas de IA. Portanto, neste mundo, TODA linha resolvível da
// aba Duplas deve valer exatamente A + B e a homogeneidade deve ser SIM.
//
// Nada por nome hardcoded na lógica: os pares de elite são escolhidos pelo
// TOPO do próprio leaderboard produzido pela simulação.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { computeCanonicalTeamRankingPoints as canonical } from '../src/lib/teamRankingFormula.js';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_TRLIVE_YEARS || 1);

// Preenchido DENTRO do mundo vivo (hook onBeforeClose).
const live = {
  playerRow: null, playerRowAfterReload: null, playerMatchLabel: null,
  playerPoints: 0, playerPartnerPoints: 0, playerPartnerName: null,
  teamRowsBefore: [], teamRowsAfterMutation: [], teamRowsAfterReload: [],
  playerRank: null, playerTotalTeams: 0,
};

const sim = await runHeadlessWorldSimulation({
  years, label: 'trlive59', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, profile, vite }) => {
    const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
    const { teamKey, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

    live.teamRowsBefore = (await localGame.entities.TeamRanking.list(null, 5000)) || [];

    // Parceiro de IA REAL do mundo simulado (não um bot de catálogo), para
    // que os dois membros tenham rolling points comparáveis.
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000);
    const partner = athletes.find((a) => Number(a.world_ranking_points) > 0) || athletes[0];
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const tournament = tournaments.find((t) => t.tier === 'Silver') || tournaments[0];

    // Caminho REAL de produção: finalizeTournamentRun grava a dupla do
    // jogador pela autoridade canônica (soma dos rolling), a MESMA das
    // duplas de IA — não há mais acúmulo incremental por partida.
    const result = await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });
    const key = teamKey(profile.id, partner.id);
    const rows = (await localGame.entities.TeamRanking.list(null, 5000)) || [];
    live.playerRow = rows.find((r) => r.team_key === key) || null;
    live.playerPartnerName = partner.name || partner.id;
    live.playerPoints = Number(result.updatedProfile?.rank_points) || 0;
    live.playerPartnerPoints = Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);
    live.playerMatchLabel = '1 torneio finalizado (sem acúmulo por partida)';

    const board = (await getTeamRankings(5000)) || [];
    live.playerTotalTeams = board.length;
    live.playerRank = board.findIndex((r) => r.team_key === key) + 1 || null;

    // Snapshot pós-mutação, antes da releitura de idempotência.
    live.teamRowsAfterMutation = (await localGame.entities.TeamRanking.list(null, 5000)) || [];

    // Releitura (idempotência de leitura): reler não pode mover pontos nem
    // criar linhas novas.
    live.teamRowsAfterReload = (await localGame.entities.TeamRanking.list(null, 5000)) || [];
    live.playerRowAfterReload = live.teamRowsAfterReload.find((r) => r.team_key === key) || null;
  },
});

// ---------------------------------------------------------------------------
const teamRows = live.teamRowsAfterReload.length ? live.teamRowsAfterReload : (sim.teamRankings || []);
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

console.log(`\n=== Parte E: TeamRanking LIVE (${years} temporada(s), ${teamRows.length} linhas) ===\n`);

// Top duplas de IA pelo próprio leaderboard (sem hardcode de nome).
const aiRows = teamRows
  .filter((r) => r.player1_id && r.player2_id && athleteById.has(r.player1_id) && athleteById.has(r.player2_id))
  .sort((a, b) => (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0));

const observations = aiRows.slice(0, 3).map((row) => {
  const a = athleteById.get(row.player1_id);
  const b = athleteById.get(row.player2_id);
  const expected = canonical(Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0);
  return { label: `${a.name} / ${b.name}`, row, expected, a, b };
});

console.log('--- Duplas de IA (topo real do leaderboard) ---');
for (const o of observations) {
  console.log(`${o.label}`);
  console.log(`   fórmula  = soma canônica dos rolling dos dois atletas (teamRankingFormula.js)`);
  console.log(`   Circuito = ${o.a.world_ranking_points} + ${o.b.world_ranking_points} -> esperado ${o.expected}`);
  console.log(`   TeamRanking.ranking_points = ${o.row.ranking_points}`);
  console.log(`   Race     = ${o.a.race_points} / ${o.b.race_points}  (NÃO alimenta a aba Duplas)`);
  console.log(`   matches=${o.row.matches_played ?? 0} wins=${o.row.wins ?? 0} titles=${Array.isArray(o.row.titles) ? o.row.titles.length : 0}`);
}

console.log('\n--- Dupla do JOGADOR (mesmo mundo, mesma tabela) ---');
if (live.playerRow) {
  console.log(`Jogador / ${live.playerPartnerName}`);
  console.log(`   fórmula  = autoridade canônica (soma) via finalizeTournamentRun`);
  console.log(`   ${live.playerMatchLabel}`);
  console.log(`   rolling do jogador = ${live.playerPoints} | rolling do parceiro = ${live.playerPartnerPoints}`);
  console.log(`   TeamRanking.ranking_points = ${live.playerRow.ranking_points} (esperado ${canonical(live.playerPoints, live.playerPartnerPoints)})`);
  console.log(`   matches=${live.playerRow.matches_played ?? 0} wins=${live.playerRow.wins ?? 0} titles=${Array.isArray(live.playerRow.titles) ? live.playerRow.titles.length : 0}`);
  console.log(`   rank na aba Duplas = #${live.playerRank} de ${live.playerTotalTeams}`);
} else {
  console.log('(dupla do jogador não materializada)');
}

check('Perguntas 24-25: cada dupla de IA no topo tem valor EXPLICÁVEL pela soma canônica', () => {
  assert.ok(observations.length > 0, 'nenhuma dupla de IA encontrada');
  for (const o of observations) {
    assert.equal(Number(o.row.ranking_points), o.expected,
      `${o.label}: points=${o.row.ranking_points} != soma canônica ${o.expected}`);
  }
});

check('Pergunta 25: a dupla do jogador usa a MESMA autoridade canônica (soma) das duplas de IA', () => {
  assert.ok(live.playerRow, 'dupla do jogador sem linha de TeamRanking');
  const expected = canonical(live.playerPoints, live.playerPartnerPoints);
  assert.equal(Number(live.playerRow.ranking_points), expected,
    `persistido=${live.playerRow.ranking_points} != soma canônica ${expected}`);
  assert.ok(Number(live.playerRow.ranking_points) > 0, 'dupla do jogador ficou com 0 pontos');
});

// ---------------------------------------------------------------------------
// Playthrough 5.22-F — a asserção central: TODA linha resolvível da aba
// Duplas vale exatamente A + B (unidades homogêneas, uma só autoridade).
// ---------------------------------------------------------------------------
let resolvable = 0; let canonicalMismatch = 0; const mismatchSample = [];
for (const row of teamRows) {
  if (!row.player1_id || !row.player2_id) continue;
  const a = athleteById.get(row.player1_id);
  const b = athleteById.get(row.player2_id);
  if (!a || !b) continue;
  resolvable += 1;
  const expected = canonical(Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0);
  if (Number(row.ranking_points) !== expected) {
    canonicalMismatch += 1;
    if (mismatchSample.length < 3) mismatchSample.push(`${row.team_key}: ${row.ranking_points} != ${expected}`);
  }
}
console.log(`\nlinhas resolvíveis: ${resolvable} | batem A + B: ${resolvable - canonicalMismatch} | divergentes: ${canonicalMismatch}`);

check('Perguntas 24-27: TODA linha resolvível da aba Duplas vale exatamente A + B', () => {
  assert.ok(resolvable > 0, 'nenhuma linha resolvível de TeamRanking');
  assert.equal(canonicalMismatch, 0, `${canonicalMismatch}/${resolvable} divergem: ${mismatchSample.join(' | ')}`);
});

check('Pergunta 26: zero duplicatas por identidade canônica de par', () => {
  const counts = new Map();
  for (const row of teamRows) {
    if (!row.player1_id || !row.player2_id) continue;
    const key = [row.player1_id, row.player2_id].map(String).sort().join('::');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  assert.equal(dups.length, 0, `${dups.length} pares duplicados (ex.: ${dups.slice(0, 3).map(([k]) => k).join(', ')})`);
});

// Classificação de PROVENIÊNCIA das linhas.
const provenance = { ia: [], jogador: [], seedSuplementar: [], semOrigem: [], malformada: [] };
for (const row of teamRows) {
  if (!row.player1_id || !row.player2_id) { provenance.malformada.push(row); continue; }
  if (row.team_key === live.playerRow?.team_key) { provenance.jogador.push(row); continue; }
  if (athleteById.has(row.player1_id) || athleteById.has(row.player2_id)) { provenance.ia.push(row); continue; }
  const botLike = [row.player1_id, row.player2_id].every((id) => /^ranking-bot-\d+$/.test(String(id)));
  if (botLike) provenance.seedSuplementar.push(row);
  else provenance.semOrigem.push(row);
}
console.log('\n--- Proveniência das linhas da aba Duplas ---');
console.log(`   duplas de IA (soma canônica) ....... ${provenance.ia.length}`);
console.log(`   seed suplementar (ranking-bot-*) ... ${provenance.seedSuplementar.length}`);
console.log(`   dupla do jogador (soma canônica) ... ${provenance.jogador.length}`);
console.log(`   malformadas (sem player ids) ....... ${provenance.malformada.length}`);
console.log(`   sem origem identificável ........... ${provenance.semOrigem.length}`);

check('Pergunta 26: zero phantom points (nenhuma linha pontuada de origem desconhecida)', () => {
  const phantom = provenance.semOrigem.filter((row) => Number(row.ranking_points) > 0);
  assert.equal(phantom.length, 0,
    `${phantom.length} linhas pontuadas sem origem identificável (ex.: ${phantom.slice(0, 3).map((r) => r.team_key).join(', ')})`);
});

check('Pergunta 26 (achado): a seed suplementar referencia bot_id, NÃO o id do AthleteProfile', () => {
  // rankingPopulation.js pareia com `a.id || a.bot_id` ANTES do bulkCreate
  // atribuir `id` — logo grava sempre `bot_id` (caracterização, não correção).
  if (!provenance.seedSuplementar.length) return;
  for (const row of provenance.seedSuplementar.slice(0, 50)) {
    assert.ok(!athleteById.has(row.player1_id) && !athleteById.has(row.player2_id),
      `${row.team_key} deveria ser irresolvível via AthleteProfile`);
  }
});

check('Pergunta 26 (reload): reler o leaderboard não altera pontos nem cria linhas', () => {
  assert.equal(live.teamRowsAfterReload.length, live.teamRowsAfterMutation.length,
    `contagem mudou só por reler: ${live.teamRowsAfterMutation.length} -> ${live.teamRowsAfterReload.length}`);
  assert.ok(live.playerRowAfterReload, 'linha do jogador sumiu na releitura');
  assert.equal(Number(live.playerRowAfterReload.ranking_points), Number(live.playerRow.ranking_points),
    'pontos do jogador mudaram só por reler');
});

// ---------- conclusão obrigatória sobre unidades ----------
const maxAi = observations.length ? Math.max(...observations.map((o) => Number(o.row.ranking_points) || 0)) : 0;
const playerPoints = Number(live.playerRow?.ranking_points) || 0;
const ratio = playerPoints > 0 ? maxAi / playerPoints : Infinity;
const homogeneous = canonicalMismatch === 0 && ratio < 10;

console.log('\n=== CONCLUSÃO OBRIGATÓRIA (Parte E) ===');
console.log(`Maior dupla de IA .......... ${maxAi} pts  (soma canônica dos rolling)`);
console.log(`Dupla do jogador ........... ${playerPoints} pts  (soma canônica via finalizeTournamentRun)`);
console.log(`Razão de escala ............. ${Number.isFinite(ratio) ? `${ratio.toFixed(1)}x` : 'n/a'}`);
console.log(`"Leaderboard de Duplas usa hoje unidades homogêneas?" -> ${homogeneous ? 'SIM' : 'NÃO'}`);
if (homogeneous) {
  console.log('');
  console.log('DÍVIDA RESOLVIDA (Playthrough 5.22-E/F): a MESMA tabela ordena a');
  console.log('MESMA grandeza. Duplas de IA e a dupla do jogador derivam da soma');
  console.log('canônica dos rolling points dos dois membros; a seed suplementar');
  console.log('foi reprojetada para a autoridade (parte das linhas segue');
  console.log('irresolvível via AthleteProfile por referenciar bot_id, mas não');
  console.log('introduz uma escala paralela pontuada — zero phantom points).');
} else {
  console.log('');
  console.log('AINDA HETEROGÊNEO: existem linhas resolvíveis fora de A + B. Rever');
  console.log('a autoridade de TeamRanking antes de confiar na aba Duplas.');
}

check('Perguntas 27-28: a conclusão sobre homogeneidade é emitida e reflete o estado atual', () => {
  assert.equal(typeof homogeneous, 'boolean');
  // Estado atual esperado (5.22-F): HOMOGÊNEO — todas as linhas resolvíveis
  // usam a soma canônica. Se voltar a divergir, este teste falha para forçar
  // a revisão do diagnóstico acima.
  assert.equal(homogeneous, true,
    `ainda há ${canonicalMismatch} linhas resolvíveis fora de A + B (razão ${Number.isFinite(ratio) ? ratio.toFixed(1) : 'n/a'}x)`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-authority-live-v59: PASS');
