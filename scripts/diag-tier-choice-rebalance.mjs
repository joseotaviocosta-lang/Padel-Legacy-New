// Playthrough 5.1, Parte A — diagnóstico ANTES/DEPOIS de alterar a
// escolha de torneio da IA. Roda N temporadas (padrão 1, PADEL_DIAG_YEARS
// pra mais) e imprime a tabela completa pedida por tier — mesma métrica
// que os testes de gate desta fase (test-tier-strength-distribution-v2,
// heldout) usam por baixo, então este script serve tanto de baseline
// quanto de conferência manual rápida.
import { runHeadlessWorldSimulation, computeTierFieldMetrics, formatTierStatsTable, TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_DIAG_YEARS || 1);
const label = process.env.PADEL_DIAG_LABEL || 'diag';

console.log(`\n=== diag-tier-choice-rebalance — ${years} temporada(s), label=${label} ===\n`);
const sim = await runHeadlessWorldSimulation({ years, label });
const { tierStats, tierMobility } = computeTierFieldMetrics(sim, { tiers: TIER_ORDER });

console.log(formatTierStatsTable(tierStats));
console.log(`\nmobilidade entre tiers (aparições consecutivas por dupla): pares_rastreados=${tierMobility.pairsTracked} transições=${tierMobility.transitions} repetiu_tier=${tierMobility.repeatedTier} subiu=${tierMobility.promoted} desceu=${tierMobility.demoted}`);

// Checagem de ordem — só informativo aqui (o gate real é Parte Q/test-tier-strength-distribution-v2.mjs).
const active = TIER_ORDER.filter((t) => tierStats[t]?.tournaments > 0);
console.log(`\ntiers ativos na amostra: ${active.join(', ')}`);
for (let i = 1; i < active.length; i += 1) {
  const prev = active[i - 1]; const cur = active[i];
  const okRank = tierStats[cur].avgRank < tierStats[prev].avgRank;
  const okOvr = tierStats[cur].avgOVR > tierStats[prev].avgOVR;
  console.log(`${prev} -> ${cur}: avgRank ${okRank ? 'OK (melhora)' : 'INVERTIDO'} (${tierStats[prev].avgRank?.toFixed(0)} -> ${tierStats[cur].avgRank?.toFixed(0)}), avgOVR ${okOvr ? 'OK (melhora)' : 'INVERTIDO'} (${tierStats[prev].avgOVR?.toFixed(1)} -> ${tierStats[cur].avgOVR?.toFixed(1)})`);
}
console.log('\n=== fim do diagnóstico ===\n');
