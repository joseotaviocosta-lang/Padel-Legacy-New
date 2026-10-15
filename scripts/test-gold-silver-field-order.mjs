// Playthrough 5.2 — o gate principal da fase: Gold > Silver em avgOVR,
// medianOVR, avgRank, medianRank e Top100 share. Documentado como
// FALHANDO HONESTAMENTE (Parte 5.2, veredito B) — investigado a fundo
// (diag-tier-capacity-economy.mjs, testes isolados de frequência e
// tamanho de chave em circuitCatalog.js, ambos com resultado negativo
// medido) e a causa raiz real (largura de qualifyingLimit,
// EntryManager.js) está fora do escopo autorizado desta fase (Parte Z:
// "não reescrever... inscrições" — a mesma fórmula decide elegibilidade
// de inscrição do JOGADOR). Este teste continua aqui, falhando de
// propósito, pra não mascarar o achado.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_GS_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-silver-order', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Gold', 'Silver'] });

console.log(`Gold: avgOVR=${tierStats.Gold.avgOVR?.toFixed(1)} medianOVR=${tierStats.Gold.medianOVR} avgRank=${tierStats.Gold.avgRank?.toFixed(0)} medianRank=${tierStats.Gold.medianRank} top100=${tierStats.Gold.pctTop100?.toFixed(1)}%`);
console.log(`Silver: avgOVR=${tierStats.Silver.avgOVR?.toFixed(1)} medianOVR=${tierStats.Silver.medianOVR} avgRank=${tierStats.Silver.avgRank?.toFixed(0)} medianRank=${tierStats.Silver.medianRank} top100=${tierStats.Silver.pctTop100?.toFixed(1)}%`);

check('amostra real de ambos os tiers', () => {
  assert.ok(tierStats.Gold.tournaments > 0 && tierStats.Silver.tournaments > 0);
});
check('Gold avgOVR > Silver avgOVR', () => {
  assert.ok(tierStats.Gold.avgOVR > tierStats.Silver.avgOVR, `Gold=${tierStats.Gold.avgOVR} Silver=${tierStats.Silver.avgOVR}`);
});
check('Gold medianOVR > Silver medianOVR', () => {
  assert.ok(tierStats.Gold.medianOVR > tierStats.Silver.medianOVR, `Gold=${tierStats.Gold.medianOVR} Silver=${tierStats.Silver.medianOVR}`);
});
check('Gold avgRank < Silver avgRank', () => {
  assert.ok(tierStats.Gold.avgRank < tierStats.Silver.avgRank, `Gold=${tierStats.Gold.avgRank} Silver=${tierStats.Silver.avgRank}`);
});
check('Gold medianRank < Silver medianRank', () => {
  assert.ok(tierStats.Gold.medianRank < tierStats.Silver.medianRank, `Gold=${tierStats.Gold.medianRank} Silver=${tierStats.Silver.medianRank}`);
});
check('Gold Top100 share >= Silver Top100 share', () => {
  assert.ok((tierStats.Gold.pctTop100 || 0) >= (tierStats.Silver.pctTop100 || 0), `Gold=${tierStats.Gold.pctTop100} Silver=${tierStats.Silver.pctTop100}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) console.log('test-gold-silver-field-order: FAIL (esperado — pendência conhecida da Playthrough 5.2, causa raiz documentada em circuitCatalog.js:TIER_EVENTS_PER_YEAR)');
else console.log('test-gold-silver-field-order: PASS');
process.exitCode = failed > 0 ? 1 : 0;
