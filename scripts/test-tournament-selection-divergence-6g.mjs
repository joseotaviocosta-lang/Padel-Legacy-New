// CLOUD-6G — testes de caracterização do fluxo de inscrição e das divergências harness × jogo.
// Somente leitura: carrega módulos reais de produção via Vite SSR; nenhum arquivo de src/ é alterado.
// Os valores abaixo FIXAM o comportamento atual (inclusive o que o relatório classifica como lacuna).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const check = async (label, fn) => { try { await fn(); passed += 1; console.log(`✓ ${label}`); } catch (e) { failed += 1; console.log(`✗ ${label}\n   ${e.message}`); } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { evaluateTournamentEntry, buildAthleteEntryContext, resolveEntryRank } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const Catalog = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { buildSeededDrawSlots } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const gameEntry = (tier, teamRank, profile = {}) => evaluateTournamentEntry({ tier }, buildAthleteEntryContext(profile, teamRank, { tier }));
  // filtro do harness (scripts/sim-progression-economy-v526.mjs:596): rank INDIVIDUAL <= minRanking
  const harnessVisible = (tier, indRank) => { const min = Number(Catalog.getTournamentTierConfig(tier)?.minRanking) || 0; return !min || ((indRank || 9999) <= min); };

  await check('jogo: Gold é acessível por qualifying com rank da dupla 451–900 (Platinum até 640, Masters até 460)', () => {
    for (const r of [451, 600, 900]) assert.deepEqual([gameEntry('Gold', r).eligible, gameEntry('Gold', r).path], [true, 'qualifying']);
    assert.equal(gameEntry('Gold', 901).eligible, false);
    assert.equal(gameEntry('Platinum', 640).path, 'qualifying'); assert.equal(gameEntry('Platinum', 641).eligible, false);
    assert.equal(gameEntry('Masters', 460).path, 'qualifying'); assert.equal(gameEntry('Masters', 461).eligible, false);
  });
  await check('DIVERGÊNCIA: harness esconde o Gold-qualifying que o jogo oferece (rank individual > 450, dupla 451–900)', () => {
    assert.equal(gameEntry('Gold', 600).eligible, true);
    assert.equal(harnessVisible('Gold', 600), false);
  });
  await check('DIVERGÊNCIA: rank individual e rank da dupla podem cair em lados opostos do 450 (individual 437, dupla 462)', () => {
    assert.equal(harnessVisible('Gold', 437), true); assert.equal(gameEntry('Gold', 462).path, 'qualifying');
  });
  await check('jogo: rank da dupla manda; com teamRank ausente/0 o contexto recai no rank INDIVIDUAL (world_ranking)', () => {
    assert.equal(buildAthleteEntryContext({ world_ranking: 700 }, 380, {}).rank, 380);
    assert.equal(buildAthleteEntryContext({ world_ranking: 700 }, 0, {}).rank, 700);
    assert.equal(buildAthleteEntryContext({ world_ranking: 700 }, null, {}).rank, 700);
    assert.equal(resolveEntryRank({ world_ranking: 700 }), 700);
  });
  await check('OBSERVAÇÃO: dupla sem ranking (teamRank 0) com individual 380 é tratada como rank 380 e barrada do Silver', () => {
    const e = gameEntry('Silver', 0, { world_ranking: 380 });
    assert.equal(e.eligible, false); assert.equal(e.overqualified, true);
  });
  await check('jogo: com rank da dupla ≤ 400 só existem Gold (direto) e tiers acima (qualifying) — nenhum campo intermediário', () => {
    for (const r of [400, 380, 300]) {
      const open = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'].filter((t) => gameEntry(t, r).eligible);
      assert.ok(!open.includes('Bronze') && !open.includes('Silver') && open.includes('Gold'), `rank ${r}: ${open}`);
    }
  });
  await check('jogo: janela de prioridade (vencer qualifying) concede entrada fora de qualquer corte e do teto da base', () => {
    const e = evaluateTournamentEntry({ tier: 'Gold' }, { rank: 900, teamRank: 900, priorityWindowRemaining: 4 });
    assert.deepEqual([e.eligible, e.path], [true, 'priority_window']);
    assert.equal(evaluateTournamentEntry({ tier: 'Bronze' }, { rank: 100, teamRank: 100, priorityWindowRemaining: 1 }).eligible, true);
  });
  await check('UI: a "chance de título" do treinador depende só do rank (fit), não da força do campo — Gold com rank 443 = 40%', () => {
    const gold = Catalog.getTournamentChoiceProfile({ tier: 'Gold' }, 443);
    const bronze = Catalog.getTournamentChoiceProfile({ tier: 'Bronze' }, 443);
    assert.equal(gold.titleChance, 40); // medido pelo motor real na 6G: ~0% de vitória na 1ª rodada contra OVR ~75
    assert.ok(gold.titleChance > 0 && bronze.titleChance > 0);
    // a função só recebe (torneio, rank): não há OVR da dupla nem do campo na assinatura
    assert.deepEqual(Object.keys(Catalog.getTournamentChoiceProfile({ tier: 'Gold' }, 443)).sort(), ['expectedNet', 'expectedPoints', 'exposure', 'prestige', 'risk', 'titleChance']);
  });
  await check('chave do jogador: playerRank é limitado ao tamanho da chave; com ranks reais > tamanho o jogador vira cabeça nº 1', () => {
    const field = Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, strength: 70, seedRank: 250 + i * 5 }));
    const player = { id: 'me', name: 'Me', strength: 0, seedRank: Math.min(443, 32), isPlayer: true };
    const { ranked } = buildSeededDrawSlots({ entrants: [...field, player], tournamentId: 'g6-seed' });
    assert.equal(ranked[0].isPlayer, true);
  });
} finally { await vite.close(); }
console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
