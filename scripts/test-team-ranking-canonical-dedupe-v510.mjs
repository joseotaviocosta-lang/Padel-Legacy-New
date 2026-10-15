// Playthrough 5.10, Partes M/P/X — dedupe por identidade canônica.
// A autoridade é canonicalPairId(player1_id, player2_id), nunca o team_key
// persistido. Nenhuma linha com dois membros válidos pode desaparecer.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { dedupeTeamRankingsByCanonicalPair, canonicalPairId, normalizeTeamRankingRow } =
    await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const row = (over = {}) => ({ player1_id: 'x', player2_id: 'y', ranking_points: 100, matches_played: 2, ...over });

  check('Parte X: linha com team_key canônico é MANTIDA', () => {
    const r = row({ team_key: canonicalPairId('x', 'y') });
    assert.equal(dedupeTeamRankingsByCanonicalPair([r]).length, 1);
  });

  check('Parte X: linha com team_key DIVERGENTE é mantida + normalizada (nunca descartada)', () => {
    const out = dedupeTeamRankingsByCanonicalPair([row({ team_key: 'legacy-key' })]);
    assert.equal(out.length, 1, 'linha com key divergente sumiu');
    assert.equal(out[0].team_key, canonicalPairId('x', 'y'), 'key não foi normalizada');
    assert.equal(out[0].team_key_normalized_from, 'legacy-key', 'não registrou a origem da normalização');
  });

  check('Parte X: linha SEM team_key é mantida + normalizada', () => {
    const out = dedupeTeamRankingsByCanonicalPair([row()]);
    assert.equal(out.length, 1, 'linha sem key sumiu');
    assert.equal(out[0].team_key, canonicalPairId('x', 'y'));
  });

  check('Parte X: mesmo par com ids INVERTIDOS deduplica para uma linha só', () => {
    const out = dedupeTeamRankingsByCanonicalPair([
      row({ player1_id: 'x', player2_id: 'y', ranking_points: 300 }),
      row({ player1_id: 'y', player2_id: 'x', ranking_points: 900 }),
    ]);
    assert.equal(out.length, 1, 'A+B e B+A precisam ser o mesmo par');
    assert.equal(out[0].ranking_points, 900, 'manteve a linha errada');
  });

  check('Parte P: NUNCA soma pontos de duplicatas — mantém a de mais pontos', () => {
    const out = dedupeTeamRankingsByCanonicalPair([row({ ranking_points: 400 }), row({ ranking_points: 900 })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].ranking_points, 900, `somou ou escolheu errado: ${out[0].ranking_points}`);
    assert.notEqual(out[0].ranking_points, 1300, 'somou as duas linhas');
  });

  check('Parte P: empate em pontos -> desempata por matches_played', () => {
    const out = dedupeTeamRankingsByCanonicalPair([
      row({ ranking_points: 500, matches_played: 3 }),
      row({ ranking_points: 500, matches_played: 40 }),
    ]);
    assert.equal(out[0].matches_played, 40);
  });

  check('Parte P: empate em pontos+partidas -> desempata pela atualização mais recente', () => {
    const out = dedupeTeamRankingsByCanonicalPair([
      row({ ranking_points: 500, matches_played: 5, updated_date: '2026-01-01', id: 'old' }),
      row({ ranking_points: 500, matches_played: 5, updated_date: '2026-06-01', id: 'new' }),
    ]);
    assert.equal(out[0].id, 'new');
  });

  check('Parte O: linha sem os dois ids de membro fica FORA da classificação atual', () => {
    assert.equal(dedupeTeamRankingsByCanonicalPair([{ team_key: 'k', ranking_points: 900 }]).length, 0);
    assert.equal(dedupeTeamRankingsByCanonicalPair([row({ player2_id: null })]).length, 0);
    assert.equal(normalizeTeamRankingRow({ player1_id: 'a', player2_id: 'a' }), null, 'par consigo mesmo não é par');
  });

  check('dedupe é idempotente (rodar duas vezes não muda nada)', () => {
    const input = [row({ team_key: 'legacy' }), row({ player1_id: 'y', player2_id: 'x', ranking_points: 50 })];
    const once = dedupeTeamRankingsByCanonicalPair(input);
    const twice = dedupeTeamRankingsByCanonicalPair(once);
    assert.deepEqual(twice, once);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-canonical-dedupe-v510: PASS');
} finally {
  await vite.close();
}
