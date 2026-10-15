// Playthrough 5.3, Parte I/V/W — matriz de elegibilidade do jogador por
// rank × tier. Confirma que a inscrição do jogador continua EXATAMENTE
// igual à de antes desta fase (nenhum chamador sem aiFieldContext:true
// muda de comportamento — Parte D/Z). Usa evaluateTournamentEntry
// diretamente (a mesma função que tournamentRegistration.js/
// Tournaments.jsx/calendarSystem.js chamam), sem a flag nova.
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
  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

  // Playthrough 5.22-F, Parte 4 — a matriz cobre também Elite e Crown
  // (quando aplicável), para validar que a mudança da fórmula de TeamRanking
  // não criou regressão de elegibilidade no topo.
  const RANKS = [1000, 800, 700, 600, 500, 400, 300, 200, 150, 100, 50];
  const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

  console.log('=== matriz de elegibilidade do jogador (rank × tier, SEM aiFieldContext) ===');
  console.log('rank'.padEnd(8) + TIERS.map((t) => t.padEnd(10)).join(''));
  const matrix = {};
  for (const rank of RANKS) {
    matrix[rank] = {};
    let row = String(rank).padEnd(8);
    for (const tier of TIERS) {
      const entry = evaluateTournamentEntry({ tier }, { rank, teamRank: rank });
      matrix[rank][tier] = entry;
      row += (entry.eligible ? `SIM(${entry.path})` : 'não').padEnd(10);
    }
    console.log(row);
  }

  check('rank 1000+ pode Bronze/Silver (tiers abertos)', () => {
    assert.ok(matrix[1000].Bronze.eligible && matrix[1000].Silver.eligible);
  });
  check('rank 1000+ NÃO pode Gold/Platinum/Masters direto (fora do qualifying)', () => {
    assert.ok(!matrix[1000].Gold.eligible && !matrix[1000].Platinum.eligible && !matrix[1000].Masters.eligible);
  });
  check('rank 500 pode Gold (qualifying, rede larga do jogador — 900, não a estreitada da IA)', () => {
    assert.ok(matrix[500].Gold.eligible, `rank 500 deveria poder Gold via qualifying (jogador nunca usa a rede estreita da IA)`);
  });
  check('rank 400 pode Gold direto (rank <= minRanking=450)', () => {
    assert.ok(matrix[400].Gold.eligible && matrix[400].Gold.path === 'direct');
  });
  check('rank 300 pode Gold e Platinum direto', () => {
    assert.ok(matrix[300].Gold.eligible && matrix[300].Platinum.eligible);
  });
  check('rank 200 pode Masters via qualifying (200 <= 460)', () => {
    assert.ok(matrix[200].Masters.eligible);
  });
  check('rank 100 pode todos os tiers pagos testados, mas NÃO Bronze/Silver (acima do teto de acesso livre, Parte 5.1/5.4)', () => {
    assert.ok(matrix[100].Gold.eligible && matrix[100].Platinum.eligible && matrix[100].Masters.eligible);
    assert.ok(!matrix[100].Bronze.eligible && !matrix[100].Silver.eligible, 'rank 100 já "classifica para tiers acima" — overqualified pro acesso livre, por design (EntryManager.js)');
  });
  check('rank 150 pode Elite e Crown via qualifying (cortes 140/75)', () => {
    assert.ok(matrix[150].Elite.eligible, 'rank 150 deveria poder Elite via qualifying');
    assert.ok(matrix[150].Crown.eligible, 'rank 150 deveria poder Crown via qualifying (limite 155)');
  });
  check('rank 100 pode Elite direto e Crown via qualifying', () => {
    assert.ok(matrix[100].Elite.eligible && matrix[100].Elite.path === 'direct', 'rank 100 deveria entrar direto no Elite (corte 140)');
    assert.ok(matrix[100].Crown.eligible, 'rank 100 deveria poder Crown via qualifying');
  });
  check('rank 50 pode Crown direto (corte 75)', () => {
    assert.ok(matrix[50].Crown.eligible && matrix[50].Crown.path === 'direct', 'rank 50 deveria entrar direto no Crown');
  });
  check('progressão nunca regride — todo rank melhor (menor) mantém ou ganha acesso aos tiers pagos que o rank pior já tinha', () => {
    // RANKS está em ordem DECRESCENTE de valor numérico (1000 é o pior
    // rank, 50 é o melhor) — RANKS[i] é sempre melhor (número menor) que
    // RANKS[i-1] nesta ordem.
    for (let i = 1; i < RANKS.length; i += 1) {
      const worse = RANKS[i - 1]; const better = RANKS[i];
      for (const tier of ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
        if (matrix[worse][tier].eligible) {
          assert.ok(matrix[better][tier].eligible, `rank ${better} (melhor que ${worse}) perdeu acesso a ${tier} que ${worse} tinha`);
        }
      }
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-tier-eligibility-matrix: PASS');
} finally {
  await vite.close();
}
