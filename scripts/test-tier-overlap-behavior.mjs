// Playthrough 5.1, Parte H/W — audita TIER_WEEK_OFFSET/o calendário real
// (getWeekProgram, exportado nesta fase só pra leitura) pra medir quantas
// vezes tiers vizinhos coexistem na mesma semana. Não altera nenhum
// offset (Parte H: "só altere offsets se houver evidência clara"; a causa
// raiz medida na Playthrough 5.0 já foi endereçada em rankingFit, não
// aqui) — este teste só confirma que a sobreposição continua existindo
// (ela é intencional, Parte F: overlap saudável) e documenta a taxa real.
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
  const { getWeekProgram } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const program = getWeekProgram();

  function overlapRate(tierA, tierB) {
    const weeksWithA = program.filter(([, tiers]) => tiers.includes(tierA));
    const coincident = weeksWithA.filter(([, tiers]) => tiers.includes(tierB));
    return { coincident: coincident.length, total: weeksWithA.length, pct: weeksWithA.length ? (coincident.length / weeksWithA.length) * 100 : 0 };
  }

  console.log('=== sobreposição semanal real (getWeekProgram) ===');
  for (const [a, b] of [['Silver', 'Gold'], ['Bronze', 'Gold'], ['Masters', 'Gold'], ['Gold', 'Platinum'], ['Masters', 'Elite'], ['Elite', 'Crown']]) {
    const r = overlapRate(a, b);
    console.log(`${a} coincide com ${b} em ${r.coincident}/${r.total} semanas (${r.pct.toFixed(1)}%)`);
  }

  check('existe ALGUMA sobreposição real entre Gold e os tiers vizinhos (Parte F — overlap é saudável, não deveria ser 0%)', () => {
    const silverGold = overlapRate('Silver', 'Gold');
    const goldPlatinum = overlapRate('Gold', 'Platinum');
    assert.ok(silverGold.coincident > 0, 'Silver nunca coincide com Gold — sobreposição saudável esperada');
    assert.ok(goldPlatinum.coincident > 0, 'Gold nunca coincide com Platinum — sobreposição saudável esperada');
  });

  check('nenhum tier fica com ZERO semanas no calendário regular (todo tier configurado em TIER_EVENTS_PER_YEAR realmente aparece)', () => {
    const seen = new Set(program.flatMap(([, tiers]) => tiers));
    for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
      assert.ok(seen.has(tier), `${tier} nunca aparece em nenhuma semana do calendário`);
    }
  });

  check('a sobreposição não é 100% pra TODOS os pares adjacentes — ainda existem semanas exclusivas (agenda não vira um bloco único)', () => {
    const silverGold = overlapRate('Silver', 'Gold');
    assert.ok(silverGold.pct < 100, 'Silver deveria ter ao menos alguma semana sem Gold concorrendo');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  console.log('Nota (Parte H): a causa raiz do desequilíbrio de força por tier medida na Playthrough 5.0 foi endereçada em getTournamentChoiceProfile/rankingFit (circuitCatalog.js) — não em TIER_WEEK_OFFSET. A sobreposição de calendário em si (inclusive Masters+Gold coincidindo em praticamente todas as semanas de Masters) é aceita como desenho intencional (Parte F), não uma causa a corrigir aqui; nenhum offset foi alterado nesta fase.');
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-overlap-behavior: PASS');
} finally {
  await vite.close();
}
