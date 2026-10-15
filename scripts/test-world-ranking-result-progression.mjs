// Playthrough 5.0, Parte B/C/X — Circuito (world_ranking_points) não está
// congelado: é uma janela rolling (22 melhores resultados em 364 dias,
// rankingWindow.js) que recompute a cada resultado real. A "quase
// imóvel" visual relatada pelo usuário vem de uma âncora histórica grande
// (legacy seed, criada uma vez a partir do world_ranking_points pré-
// existente de atletas reais) — nunca de um pipeline quebrado. Este teste
// prova que novos resultados SEMPRE somam por cima da âncora, e que sem
// âncora (atleta novo) o Circuito cresce normalmente resultado a resultado.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { computeRollingPoints, buildLegacySeedRow, needsLegacySeed, isResultExpired } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');

  // Atleta novo, sem histórico: cada resultado soma diretamente.
  {
    const rows = [];
    const r1 = { id: 'a1', athlete_id: 'a', date: '2026-01-01', points: 300 };
    let total = computeRollingPoints(rows, [r1], '2026-01-01');
    assert.equal(total, 300);
    rows.push(r1);
    const r2 = { id: 'a2', athlete_id: 'a', date: '2026-02-01', points: 500 };
    total = computeRollingPoints(rows, [r2], '2026-02-01');
    assert.equal(total, 800, 'segundo resultado precisa SOMAR ao primeiro, nunca substituir');
  }

  // Atleta real com histórico grande (âncora legacy-seed) — resultados novos
  // somam por cima, exatamente como Race, mesmo que o total pareça "não
  // se mover muito" por causa do tamanho da âncora.
  {
    const migrationDate = '2026-01-01';
    const lifetimePoints = 13000;
    const priorRows = []; // sem AthleteRankingResult nenhum ainda -> precisa de âncora.
    assert.equal(needsLegacySeed(priorRows, lifetimePoints), true);
    const seed = buildLegacySeedRow('coello', lifetimePoints, migrationDate);
    assert.equal(seed.points, 13000);
    assert.equal(seed.is_legacy_seed, true);

    const afterSeedOnly = computeRollingPoints([], [seed], migrationDate);
    assert.equal(afterSeedOnly, 13000, 'no dia da migração, o total é exatamente a âncora (ninguém perde posição)');

    // Um resultado real de +500 (ex.: vice de Masters) some por cima da âncora.
    const result1 = { id: 'coello:t1', athlete_id: 'coello', date: '2026-02-01', points: 500 };
    const afterFirstResult = computeRollingPoints([seed], [result1], '2026-02-01');
    assert.equal(afterFirstResult, 13500, 'Circuito precisa refletir a âncora + o resultado novo — nunca ficar travado em 13000');

    // Um segundo resultado (+300) soma por cima de novo.
    const result2 = { id: 'coello:t2', athlete_id: 'coello', date: '2026-03-01', points: 300 };
    const afterSecondResult = computeRollingPoints([seed, result1], [result2], '2026-03-01');
    assert.equal(afterSecondResult, 13800, 'terceiro estado precisa ser âncora + resultado 1 + resultado 2');

    // A âncora expira depois de 364 dias — depois disso (mas ainda dentro
    // da janela dos resultados reais, mais recentes), só eles contam.
    const afterAnchorExpiryOnly = '2027-01-15'; // >364d da âncora (2026-01-01), ainda dentro de 364d de result1/result2.
    assert.equal(isResultExpired(seed, afterAnchorExpiryOnly), true, 'a âncora precisa expirar depois de 364 dias, como qualquer resultado');
    assert.equal(isResultExpired(result1, afterAnchorExpiryOnly), false, 'pré-condição: result1 ainda não deveria ter expirado nesta data');
    const afterExpiry = computeRollingPoints([seed, result1, result2], [], afterAnchorExpiryOnly);
    assert.equal(afterExpiry, 800, 'depois da âncora expirar, só os resultados reais (500+300) contam — nunca mais os 13000 originais');
  }

  console.log('test-world-ranking-result-progression: PASS');
} finally {
  await vite.close();
}
