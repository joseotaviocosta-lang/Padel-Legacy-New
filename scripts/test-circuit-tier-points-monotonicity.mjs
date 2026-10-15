// Playthrough 5.4, TESTE 5/Parte J — auditoria estática (sem simulação,
// direto na fonte de verdade `circuitCatalog.js:getRoundOutcomeTable`) de
// que pontos por tier/rodada seguem a hierarquia esperada: campeão de um
// tier mais forte > campeão de um tier mais fraco (Bronze<Silver<Gold<
// Platinum<Masters<Elite<Crown — a escada competitiva principal, TIER_ORDER
// do harness), e que DENTRO de cada tier os pontos nunca caem conforme a
// dupla avança rodadas (perder na estreia nunca vale mais que ser campeão).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getRoundOutcomeTable, TOURNAMENT_TIER_CONFIG } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  console.log('=== pontos por tier/rodada (mainDrawSize canônico de cada tier) ===');
  const tables = {};
  for (const tier of TIER_ORDER) {
    const drawSize = TOURNAMENT_TIER_CONFIG[tier].mainDrawSize;
    const table = getRoundOutcomeTable(tier, drawSize);
    tables[tier] = table;
    console.log(`${tier} (draw=${drawSize}): ` + table.roundLabels.map((label, i) => `${label}=${table.roundPoints[i]}`).join(' > '));
  }

  check('pontos de campeão sobem monotonicamente ao longo da escada principal (Bronze<Silver<Gold<Platinum<Masters<Elite<Crown)', () => {
    let prev = -1;
    for (const tier of TIER_ORDER) {
      const championPoints = tables[tier].roundPoints[tables[tier].roundPoints.length - 1];
      assert.ok(championPoints > prev, `${tier} campeão=${championPoints} não é > tier anterior=${prev}`);
      prev = championPoints;
    }
  });

  for (const tier of TIER_ORDER) {
    check(`${tier}: pontos nunca caem conforme a dupla avança rodadas (não-decrescente até o campeão)`, () => {
      const points = tables[tier].roundPoints;
      for (let i = 1; i < points.length; i += 1) {
        assert.ok(points[i] >= points[i - 1], `${tier}: rodada ${i} (${points[i]}) < rodada anterior (${points[i - 1]})`);
      }
    });
  }

  check('draw sizes não-canônicos (campo reduzido por semana fraca) ainda produzem tabela monotonicamente não-decrescente — Gold com metade do draw', () => {
    const table = getRoundOutcomeTable('Gold', Math.floor(TOURNAMENT_TIER_CONFIG.Gold.mainDrawSize / 2));
    for (let i = 1; i < table.roundPoints.length; i += 1) {
      assert.ok(table.roundPoints[i] >= table.roundPoints[i - 1], `rodada ${i} caiu em relação à anterior`);
    }
  });

  check('campeão de tier reduzido continua valendo o rankPoints canônico do tier (Parte J — "campeão de 9 paga o mesmo título que um de 16")', () => {
    const table = getRoundOutcomeTable('Bronze', 9);
    const canonicalTable = getRoundOutcomeTable('Bronze', TOURNAMENT_TIER_CONFIG.Bronze.mainDrawSize);
    assert.equal(table.roundPoints[table.roundPoints.length - 1], canonicalTable.roundPoints[canonicalTable.roundPoints.length - 1]);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-circuit-tier-points-monotonicity: PASS');
} finally {
  await vite.close();
}
