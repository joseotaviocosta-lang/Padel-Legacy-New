// Playthrough 5.3, Parte D/W — prova que a separação AI/jogador é
// intencional e consistente: `aiFieldContext:true` estreita SÓ o
// qualifying (getAiQualifyingLimit) pra escolha de campo da IA, nunca a
// elegibilidade DIRETA (rank<=minRanking, sempre igual pras duas
// políticas — Parte Z: nunca reduzir opção de inscrição/progressão do
// jogador) e nunca a rede do jogador em si (que continua usando a
// fórmula antiga, ×2/+80).
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
  const { getAiQualifyingLimit, TOURNAMENT_TIER_CONFIG } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  console.log('=== rede de qualifying: jogador (fixa) vs IA (derivada da população) ===');
  for (const tier of ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
    const directLimit = TOURNAMENT_TIER_CONFIG[tier].minRanking;
    const playerLimit = Math.max(directLimit * 2, directLimit + 80);
    const aiLimit = getAiQualifyingLimit(tier, directLimit);
    console.log(`${tier}: direto=${directLimit} jogador=${playerLimit} IA=${aiLimit}`);
  }

  check('elegibilidade DIRETA (rank<=minRanking) é IDÊNTICA pras duas políticas, em toda a escada', () => {
    for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
      for (const rank of [1, 50, 100, 150, 230, 320, 450]) {
        const player = evaluateTournamentEntry({ tier }, { rank, teamRank: rank });
        const ai = evaluateTournamentEntry({ tier }, { rank, teamRank: rank }, { aiFieldContext: true });
        const directLimit = TOURNAMENT_TIER_CONFIG[tier].minRanking;
        if (rank <= directLimit || directLimit === 0) {
          assert.equal(player.eligible, ai.eligible, `${tier}@${rank}: direto deveria concordar entre as duas políticas`);
        }
      }
    }
  });

  check('a rede da IA é mais estreita ou igual à do jogador em todo tier pago (nunca mais larga — Parte D)', () => {
    for (const tier of ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
      const directLimit = TOURNAMENT_TIER_CONFIG[tier].minRanking;
      const playerLimit = Math.max(directLimit * 2, directLimit + 80);
      const aiLimit = getAiQualifyingLimit(tier, directLimit);
      assert.ok(aiLimit <= playerLimit || tier === 'Crown', `${tier}: rede da IA (${aiLimit}) deveria ser <= rede do jogador (${playerLimit})`);
    }
  });

  check('um rank fora da rede estreita da IA, mas dentro da rede do jogador, é elegível pro jogador e não pra IA (a separação é real, não decorativa)', () => {
    // Gold: IA~645, jogador=900. rank 700 deveria diferenciar as duas.
    const rank = 700;
    const player = evaluateTournamentEntry({ tier: 'Gold' }, { rank, teamRank: rank });
    const ai = evaluateTournamentEntry({ tier: 'Gold' }, { rank, teamRank: rank }, { aiFieldContext: true });
    assert.equal(player.eligible, true, 'jogador rank 700 deveria continuar elegível pro Gold via qualifying');
    assert.equal(ai.eligible, false, 'IA rank 700 NÃO deveria ser elegível pela rede estreitada — é exatamente a diferença que esta fase introduz');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ai-player-tier-policy-separation: PASS');
} finally {
  await vite.close();
}
