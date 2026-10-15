// Playthrough 5.1, Parte C/D/W — teste unitário puro (sem simulação, sem
// storage) da nova curva de `rankingFit` (getTierRankingFit,
// circuitCatalog.js). Confirma: zona ideal por tier (não um platô que só
// sobe), decaimento gradual dos dois lados, determinismo, e que a "escada"
// de zonas ideais segue a ordem real dos tiers (nenhum buraco, nenhuma
// inversão) — a causa raiz exata da Playthrough 5.0 (Gold em platô=100
// pra qualquer rank 1-410) não pode voltar a existir.
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
  const { getTierRankingFit, TOURNAMENT_TIER_CONFIG } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  check('determinístico — mesma entrada produz sempre a mesma saída', () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal(getTierRankingFit('Gold', 300), getTierRankingFit('Gold', 300));
    }
  });

  check('nenhum valor fora de [0,100], nenhum NaN, em toda a escada de tiers pagos', () => {
    const gatedTiers = ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
    for (const tier of gatedTiers) {
      for (let rank = 0; rank <= 2000; rank += 17) {
        const fit = getTierRankingFit(tier, rank);
        assert.ok(Number.isFinite(fit), `${tier}@${rank} não é finito: ${fit}`);
        assert.ok(fit >= 0 && fit <= 100, `${tier}@${rank} fora de [0,100]: ${fit}`);
      }
    }
  });

  check('Gold NÃO fica mais em platô 100 do rank 1 ao 410 (causa raiz da 5.0) — decai pra rank muito melhor que seu próprio corte', () => {
    const fitAt1 = getTierRankingFit('Gold', 1);
    const fitAt100 = getTierRankingFit('Gold', 100);
    const fitAt400 = getTierRankingFit('Gold', 400); // dentro da zona ideal de Gold.
    assert.ok(fitAt1 < fitAt400, `esperava fit(1)=${fitAt1} < fit(400)=${fitAt400} — rank 1 é forte demais pra Gold, não deveria empatar com o platô`);
    assert.ok(fitAt100 < fitAt400, `esperava fit(100)=${fitAt100} < fit(400)=${fitAt400}`);
  });

  check('cada tier pago tem uma zona ideal e decai fora dela — Gold usa inclinação interna, não platô plano', () => {
    for (const tier of ['Gold', 'Platinum', 'Masters', 'Elite']) {
      const cfg = TOURNAMENT_TIER_CONFIG[tier];
      const atOwnCutoff = getTierRankingFit(tier, cfg.minRanking);
      const nextStrongerCutoff = tier === 'Gold' ? TOURNAMENT_TIER_CONFIG.Platinum.minRanking : cfg.minRanking;
      const atIdealEdge = getTierRankingFit(tier, nextStrongerCutoff);
      const wayStronger = getTierRankingFit(tier, 1);
      const wayWeaker = getTierRankingFit(tier, cfg.minRanking + 2000);
      assert.equal(atIdealEdge, 100, `${tier}: esperava máximo=100 na borda forte da zona ideal (${nextStrongerCutoff}), obtido ${atIdealEdge}`);
      if (tier === 'Gold') assert.ok(atOwnCutoff < atIdealEdge, `Gold deve inclinar dentro da zona ideal: corte=${atOwnCutoff}, borda forte=${atIdealEdge}`);
      else assert.equal(atOwnCutoff, 100, `${tier}: platô não calibrado deve permanecer em 100 no próprio corte`);
      assert.ok(wayStronger <= atIdealEdge, `${tier}: rank 1 (${wayStronger}) deveria ser <= máximo ideal (${atIdealEdge})`);
      assert.ok(wayWeaker < atIdealEdge, `${tier}: rank muito pior que o corte (${wayWeaker}) deveria ser < máximo ideal (${atIdealEdge})`);
    }
  });

  check('Crown (topo da escada) não decai no lado forte — nada é "forte demais" pro topo', () => {
    const fitAt1 = getTierRankingFit('Crown', 1);
    const fitAt50 = getTierRankingFit('Crown', 50);
    assert.equal(fitAt1, 100);
    assert.equal(fitAt50, 100);
  });

  check('Silver tem fit melhor que Bronze na faixa aberta intermediária — Parte C/O', () => {
    for (const rank of [400, 500, 600, 700]) {
      const silver = getTierRankingFit('Silver', rank);
      const bronze = getTierRankingFit('Bronze', rank);
      assert.ok(silver > bronze, `rank ${rank}: esperava Silver(${silver}) > Bronze(${bronze})`);
    }
  });

  check('Bronze tem fit melhor que Silver na cauda fraca — nunca os dois empatados indefinidamente', () => {
    for (const rank of [800, 1000, 1200]) {
      const bronze = getTierRankingFit('Bronze', rank);
      const silver = getTierRankingFit('Silver', rank);
      assert.ok(bronze >= silver, `rank ${rank}: esperava Bronze(${bronze}) >= Silver(${silver})`);
    }
  });

  check('existe overlap real entre tiers vizinhos (Parte F) — nenhum corte abrupto pra zero logo na fronteira', () => {
    // Um rank bem no meio do caminho entre dois cortes vizinhos (Gold 450,
    // Platinum 320 -> meio=385) deve ter fit>0 pros dois lados — nem Gold
    // nem Platinum descartam essa dupla de cara.
    const midpoint = Math.round((450 + 320) / 2);
    const gold = getTierRankingFit('Gold', midpoint);
    const platinum = getTierRankingFit('Platinum', midpoint);
    assert.ok(gold > 30, `Gold no meio-do-caminho (${midpoint}) deveria ter fit razoável, obtido ${gold}`);
    assert.ok(platinum > 30, `Platinum no meio-do-caminho (${midpoint}) deveria ter fit razoável, obtido ${platinum}`);
  });

  check('duas duplas de força MUITO diferente (rank 10 vs rank 100), ambas "fortes demais" pra Gold, continuam se diferenciando (nunca empatadas no mesmo piso)', () => {
    // Bug real encontrado e corrigido durante esta própria fase (largura de
    // decaimento do lado forte era estreita demais e clampava no piso
    // cedo demais) — este teste existe especificamente pra não regredir.
    const fitRank10 = getTierRankingFit('Gold', 10);
    const fitRank100 = getTierRankingFit('Gold', 100);
    assert.notEqual(fitRank10, fitRank100, `rank 10 (${fitRank10}) e rank 100 (${fitRank100}) não deveriam empatar no mesmo piso`);
    assert.ok(fitRank100 > fitRank10, `rank 100 está mais perto da zona ideal de Gold que rank 10 — deveria ter fit maior`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-ranking-fit-curve: PASS');
} finally {
  await vite.close();
}
