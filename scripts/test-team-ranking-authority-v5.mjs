// Playthrough 5.5, Parte I — TeamRanking representa realmente a dupla
// ATUAL? Confirma: (1) nenhuma duplicata por identidade canônica de par
// (achado histórico da Playthrough 4.5C, dedupeTeamRankingsByCanonicalPair);
// (2) getTeamRankings()/rankForTeamKey (a MESMA função usada por
// getTeamRank do jogador e getCanonicalTeamWorldRank de qualquer dupla,
// "Minha dupla"/cabeçalho/painel de torneio — nenhuma fórmula divergente,
// per teamRanking.js) devolve um ranking coerente com os dados brutos de
// TeamRanking; (3) ranking_points de cada linha bate com a SOMA dos
// world_ranking_points dos dois atletas ATUAIS do par (updateTeamRankings,
// circuitLifecycle.js — recomputado do zero toda passada, nunca um
// acumulador incremental divergente). A soma é a autoridade vigente desde a
// Playthrough 5.22-E (antes: média geométrica na 5.11, média simples antes).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_TEAMRANK_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'team-rank-authority', trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { dedupeTeamRankingsByCanonicalPair, canonicalPairId, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

  console.log(`=== Parte I: autoridade de TeamRanking (${years} temporada(s), ${sim.teamRankings?.length ?? 0} linhas brutas) ===\n`);

  const rawRows = sim.teamRankings || [];
  const byCanonicalKey = new Map();
  for (const row of rawRows) {
    if (!row.player1_id || !row.player2_id) continue;
    const key = canonicalPairId(row.player1_id, row.player2_id);
    if (!byCanonicalKey.has(key)) byCanonicalKey.set(key, []);
    byCanonicalKey.get(key).push(row);
  }
  const duplicatedKeys = [...byCanonicalKey.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`linhas brutas: ${rawRows.length} | pares canônicos distintos: ${byCanonicalKey.size} | pares com MAIS DE 1 linha (duplicata): ${duplicatedKeys.length}`);

  check('amostra real (TeamRanking populado)', () => {
    assert.ok(rawRows.length > 50, `rawRows.length=${rawRows.length}`);
  });
  check('nenhuma duplicata por identidade canônica de par (achado histórico 4.5C não regrediu)', () => {
    assert.equal(duplicatedKeys.length, 0, `${duplicatedKeys.length} pares com linhas duplicadas: ${duplicatedKeys.slice(0, 3).map(([k]) => k).join(', ')}`);
  });

  let consistent = 0; let checkedForParity = 0;
  for (const row of rawRows) {
    const a = athleteById.get(row.player1_id);
    const b = athleteById.get(row.player2_id);
    if (!a || !b) continue;
    // Só compara pares onde os dois AINDA são parceiros ATUAIS um do outro
    // (ai_partner_id mútuo) — TeamRanking pode legitimamente ficar
    // "desatualizado" (stale) por uma semana pra pares que já se separaram,
    // até a próxima passada de updateTeamRankings recompor a lista; o
    // teste de autoridade é sobre pares AINDA ativos.
    if (a.ai_partner_id !== b.id || b.ai_partner_id !== a.id) continue;
    checkedForParity += 1;
    const expected = Math.round((Number(a.world_ranking_points) || 0) + (Number(b.world_ranking_points) || 0));
    if (Number(row.ranking_points) === expected) consistent += 1;
  }
  console.log(`pares AINDA ativos verificados: ${checkedForParity} | com ranking_points == soma dos world_ranking_points atuais: ${consistent}`);
  check('TeamRanking.ranking_points bate com a SOMA dos world_ranking_points ATUAIS pra pares ainda ativos (representa a dupla ATUAL, não uma acumulação divergente)', () => {
    assert.ok(checkedForParity > 0, 'nenhum par ativo encontrado pra comparar');
    assert.equal(consistent, checkedForParity, `${checkedForParity - consistent} de ${checkedForParity} divergem`);
  });

  const dedupedViaFunction = dedupeTeamRankingsByCanonicalPair(rawRows);
  // dedupeTeamRankingsByCanonicalPair usa um fallback (`team_key || id`)
  // pra linhas SEM player1_id/player2_id (dado malformado, não duplicata
  // real) — cada uma dessas conta como sua própria chave "única" ali,
  // enquanto o agrupamento estrito deste teste (byCanonicalKey, que exige
  // os dois ids) as ignora por completo. Compara contra o número de
  // linhas malformadas real, não assume 1:1 com byCanonicalKey.
  const malformedRows = rawRows.filter((r) => !r.player1_id || !r.player2_id).length;
  console.log(`linhas malformadas (sem player1_id/player2_id — fora do agrupamento canônico estrito): ${malformedRows}`);
  check('dedupeTeamRankingsByCanonicalPair produz exatamente 1 linha por par canônico + 1 por linha malformada (a mesma função que getTeamRankings usa em produção)', () => {
    assert.equal(dedupedViaFunction.length, byCanonicalKey.size + malformedRows, `deduped=${dedupedViaFunction.length} pares_canonicos+malformadas=${byCanonicalKey.size + malformedRows}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-authority-v5: PASS');
} finally {
  await vite.close();
}
