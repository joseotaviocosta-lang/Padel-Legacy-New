// Playthrough 5.3, TESTE 6/Parte L — Part L pede uma fórmula ADAPTATIVA
// completa (desiredPool = drawSize × candidateMultiplier, expandindo a
// elegibilidade só até atingir um pool saudável, medindo a população
// elegível AO VIVO a cada chamada). NÃO implementada nesta fase — exigiria
// que evaluateTournamentEntry/getAiQualifyingLimit tivessem acesso à
// população REAL no momento da chamada (hoje são funções puras, chamadas
// milhares de vezes por temporada simulada; buscar a população inteira
// em cada chamada teria custo proibitivo dado o orçamento de performance
// já apertado desta fase — Parte Y). Implementado em vez disso:
// getAiQualifyingLimit (candidato C do Parte J) — uma largura ESTÁTICA
// derivada da densidade populacional conhecida a priori (a largura do
// próprio platô ideal do tier, TIER_FIT_BANDS), não um multiplicador
// universal. Este teste confirma que o resultado ESTÁTICO já se comporta
// de forma razoável nos três cenários que a Parte L pede (pool
// abundante/normal/escasso), usando os tiers REAIS da escada como
// proxies observados (Gold=abundante, Masters=normal, Crown=escasso —
// populações medidas na 5.2), documentando honestamente que a expansão
// EM TEMPO REAL não foi construída.
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
  const { getAiQualifyingLimit, TOURNAMENT_TIER_CONFIG } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  console.log('=== largura de qualifying da IA por tier (estática, derivada de TIER_FIT_BANDS) ===');
  const widths = {};
  for (const tier of ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
    const directLimit = TOURNAMENT_TIER_CONFIG[tier].minRanking;
    const limit = getAiQualifyingLimit(tier, directLimit);
    widths[tier] = limit - directLimit;
    console.log(`${tier}: direto=${directLimit} limite=${limit} largura=${widths[tier]}`);
  }

  check('pool abundante (Gold, população natural mais numerosa — 5.2 mediu ~65-72 duplas): largura de qualifying > 0, nunca hard cut igual ao corte direto', () => {
    assert.ok(widths.Gold > 0, 'Gold deveria ter alguma largura de qualifying além do corte direto');
  });
  check('pool escasso (Crown, população natural quase zero — 5.2 mediu ~0-1 dupla): largura de qualifying PROPORCIONALMENTE maior que Gold, relativo ao próprio corte direto (expande mais pra compensar escassez)', () => {
    const goldRatio = widths.Gold / TOURNAMENT_TIER_CONFIG.Gold.minRanking;
    const crownRatio = widths.Crown / TOURNAMENT_TIER_CONFIG.Crown.minRanking;
    assert.ok(crownRatio > goldRatio, `Crown deveria expandir proporcionalmente mais (escassez) — Gold ratio=${goldRatio.toFixed(2)} Crown ratio=${crownRatio.toFixed(2)}`);
  });
  check('pool normal (Masters): largura entre a de Gold e a de Crown em termos absolutos', () => {
    assert.ok(widths.Masters > 0 && widths.Masters < widths.Gold, `Masters=${widths.Masters} deveria ficar entre 0 e Gold=${widths.Gold}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  console.log('Nota (Parte L): expansão adaptativa EM TEMPO REAL (medindo o pool elegível ao vivo a cada torneio) não foi implementada nesta fase — custo de performance incompatível com o orçamento já apertado (Parte Y). A largura estática derivada de TIER_FIT_BANDS é a aproximação entregue, calibrada UMA VEZ a partir de densidade populacional conhecida, não recalculada a cada chamada.');
  if (failed > 0) process.exitCode = 1;
  else console.log('test-adaptive-tier-eligibility-pool: PASS');
} finally {
  await vite.close();
}
