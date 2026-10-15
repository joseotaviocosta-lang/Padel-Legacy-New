// Playthrough 5.4, Parte O — experimento (diagnóstico, não teste de
// regressão): compara, sobre o MESMO ledger real de uma temporada simulada,
// o total de ranking que cada atleta teria sob estratégias alternativas —
// soma de TUDO (sem corte), melhor-8, melhor-12, melhor-16, melhor-22
// (produção atual) — pra decidir com dados, não suposição, se o corte de
// produção (RANKING_BEST_N=22) é uma escolha razoável ou se está
// deixando volume dominar demais / de menos. Não muda nada em produção —
// só mede e relata (Parte O pede "testar, não assumir").
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_BESTN_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'bestn-experiment', trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { groupResultsByAthlete, isResultExpired, RANKING_BEST_N } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');
  const resultsByAthlete = groupResultsByAthlete(sim.rankingResultRows);

  function bestNSum(rows, n) {
    const unexpired = rows.filter((row) => !isResultExpired(row, sim.finalDate));
    const sorted = [...unexpired].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
    const slice = n === Infinity ? sorted : sorted.slice(0, n);
    return slice.reduce((s, r) => s + (Number(r.points) || 0), 0);
  }

  const strategies = [
    { label: 'sum-all (sem corte)', n: Infinity },
    { label: 'best-8', n: 8 },
    { label: 'best-12', n: 12 },
    { label: 'best-16', n: 16 },
    { label: `best-${RANKING_BEST_N} (produção)`, n: RANKING_BEST_N },
  ];

  const touchedAthletes = sim.athletes.filter((a) => resultsByAthlete.has(a.id));
  console.log(`=== experimento best-N — ${years} temporada(s), ${touchedAthletes.length} atletas com resultado ===\n`);

  // Pra cada estratégia: recomputa o total de cada atleta, re-rankeia por
  // esse total, e mede a correlação de rank resultante contra o rank de
  // PRODUÇÃO (best-22 já persistido) — quanto mais próximo de 1.0, menos a
  // escolha do corte muda a ORDEM final, só a escala dos pontos.
  const productionRankByAthlete = new Map(
    [...touchedAthletes].sort((a, b) => Number(a.ranking_position) - Number(b.ranking_position)).map((a, i) => [a.id, i + 1])
  );

  for (const strategy of strategies) {
    const totals = touchedAthletes.map((a) => ({ id: a.id, total: bestNSum(resultsByAthlete.get(a.id) || [], strategy.n) }));
    totals.sort((a, b) => b.total - a.total);
    let rankShiftSum = 0; let maxShift = 0;
    totals.forEach((entry, i) => {
      const altRank = i + 1;
      const prodRank = productionRankByAthlete.get(entry.id);
      const shift = Math.abs(altRank - prodRank);
      rankShiftSum += shift;
      if (shift > maxShift) maxShift = shift;
    });
    const avgShift = rankShiftSum / totals.length;
    const avgTotal = totals.reduce((s, t) => s + t.total, 0) / totals.length;
    console.log(`${strategy.label}: avgTotal=${avgTotal.toFixed(0)} avgPosicaoDeslocada=${avgShift.toFixed(1)} deslocamentoMax=${maxShift}`);
  }

  console.log('\nNota (Parte O): experimento observacional — nenhuma mudança de produção feita nesta fase. Interpretação: se avgPosicaoDeslocada for pequeno pra todas as estratégias, o corte de N não é o fator dominante na ordem final (o problema estrutural, se existir, está em outro lugar — profundidade de talento por faixa, já documentado nas fases 5.2/5.3, não no tamanho da janela best-N).');
} finally {
  await vite.close();
}
