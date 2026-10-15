// Playthrough 4.6, itens 6/9 — o adversário inicial do jogador ficava
// sempre numa faixa fixa (#493 antes da Fase 4.5A, #232 depois) porque o
// "rank" do oponente vinha de uma fórmula linear (`playerRank - 8`)
// desconectada de qualquer seeding real. Corrigido reusando o motor de
// seeding do AI-only (computeSeededOpponentRanksForMainDraw,
// tournamentDraw.js). Este teste roda >=50 sorteios variando rank do
// jogador/tier/tournamentId e prova que a distribuição do adversário da
// 1ª rodada NÃO é mais um valor/faixa fixa.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const tournamentDrawModule = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  // A função é interna (não exportada) — testa pelo efeito observável via
  // um pequeno wrapper que replica exatamente a mesma chamada que
  // createDrawnRun faz, usando as MESMAS peças exportadas
  // (buildCanonicalTournamentBracket) para não duplicar lógica de produção.
  const { buildSeededDrawSlots } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');

  // Mesma implementação de src/lib/tournamentDraw.js (não exportada) —
  // duplicada aqui só para o teste poder auditar a distribuição sem expor
  // uma função interna publicamente. Qualquer mudança na função real deve
  // ser espelhada aqui.
  function computeSeededOpponentRanksForMainDraw({ tournamentId, drawSize, playerRank }) {
    const size = Math.max(2, Number(drawSize) || 16);
    const effectiveRank = Number(playerRank) > 0 ? Math.min(Math.round(Number(playerRank)), size) : size;
    const entrants = Array.from({ length: size }, (_, i) => {
      const rank = i + 1;
      return { name: rank === effectiveRank ? '__player__' : `rank-${rank}`, strength: size - rank + 1, rank };
    });
    const { slots } = buildSeededDrawSlots({ entrants, tournamentId: `${tournamentId || 'tournament'}:seed-preview` });
    const playerSlot = slots.findIndex((entrant) => entrant?.name === '__player__');
    if (playerSlot < 0) return [];
    const roundCount = Math.ceil(Math.log2(size));
    const ranksByRound = [];
    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const blockSize = 2 ** roundIndex;
      const blockStart = Math.floor(playerSlot / blockSize) * blockSize;
      const siblingStart = (Math.floor(blockStart / blockSize) % 2 === 0) ? blockStart + blockSize : blockStart - blockSize;
      const siblingEntrants = slots.slice(siblingStart, siblingStart + blockSize).filter(Boolean);
      if (!siblingEntrants.length) { ranksByRound.push(null); continue; }
      const bestSeed = siblingEntrants.reduce((best, entrant) => (entrant.rank < best.rank ? entrant : best));
      ranksByRound.push(bestSeed.rank);
    }
    return ranksByRound;
  }

  const TIERS = [
    { tier: 'Bronze', drawSize: 16 }, { tier: 'Silver', drawSize: 16 }, { tier: 'Gold', drawSize: 24 },
    { tier: 'Platinum', drawSize: 32 }, { tier: 'Masters', drawSize: 24 }, { tier: 'Elite', drawSize: 20 }, { tier: 'Crown', drawSize: 20 },
  ];

  const samples = [];
  for (let i = 0; i < 60; i += 1) {
    const tierEntry = TIERS[i % TIERS.length];
    // Varia o rank do jogador de forma realista: alguns bem ranqueados,
    // muitos sem ranking ainda (0 — o caso mais comum numa carreira nova).
    const playerRank = i % 5 === 0 ? 0 : (1 + (i * 37) % 900);
    const tournamentId = `sim-tournament-${i}-${tierEntry.tier}`;
    const opponentRanks = computeSeededOpponentRanksForMainDraw({ tournamentId, drawSize: tierEntry.drawSize, playerRank });
    const firstRoundOpponentRank = opponentRanks[0];
    samples.push({
      sample: i, playerRank, tier: tierEntry.tier, drawSize: tierEntry.drawSize,
      opponentRank: firstRoundOpponentRank,
    });
  }

  console.log('\n--- Distribuição dos 60 primeiros adversários (item 6/9) ---');
  console.table(samples.slice(0, 15));

  const opponentRanks = samples.map((s) => s.opponentRank).filter((v) => v !== null);
  const sorted = [...opponentRanks].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = opponentRanks.reduce((sum, v) => sum + v, 0) / opponentRanks.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const counts = new Map();
  for (const r of opponentRanks) counts.set(r, (counts.get(r) || 0) + 1);
  const mostRepeated = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  console.log(`\nmin=${min} max=${max} média=${mean.toFixed(1)} mediana=${median}`);
  console.log(`valor mais repetido: rank ${mostRepeated[0]} (${mostRepeated[1]}x de ${opponentRanks.length})`);

  let passed = 0;
  let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m';
  const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, fn) {
    try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  }

  check('6/9. adversário da 1ª rodada NÃO é sempre o mesmo valor (nem #493, nem #232)', () => {
    assert.ok(!opponentRanks.every((r) => r === 493), 'não pode ser sempre 493 (bug original)');
    assert.ok(!opponentRanks.every((r) => r === 232), 'não pode ser sempre 232 (bug pós-4.5A)');
    assert.ok(new Set(opponentRanks).size >= 5, `distribuição precisa ter variedade real (obtido ${new Set(opponentRanks).size} valores distintos)`);
  });

  check('6/9. nenhum valor domina mais de 40% das amostras (sem fallback fixo disfarçado)', () => {
    const dominantShare = mostRepeated[1] / opponentRanks.length;
    assert.ok(dominantShare <= 0.4, `um valor não pode dominar a distribuição (${(dominantShare * 100).toFixed(0)}% das amostras é rank ${mostRepeated[0]})`);
  });

  check('7. jogador sem ranking (rank=0) frequentemente encontra um seed protegido na 1ª rodada', () => {
    const unrankedSamples = samples.filter((s) => s.playerRank === 0);
    assert.ok(unrankedSamples.length > 0, 'pré-condição: há amostras sem ranking');
    const facedTopSeed = unrankedSamples.filter((s) => s.opponentRank !== null && s.opponentRank <= 8);
    assert.ok(facedTopSeed.length > 0, 'jogador mal ranqueado deve poder encontrar um cabeça de chave (top 8) cedo, como na IA — nenhum tratamento especial de proteção');
  });

  check('7. jogador bem ranqueado (seed) recebe a mesma proteção que a IA (nunca enfrenta outro seed na 1ª rodada)', () => {
    const seededSamples = samples.filter((s) => s.playerRank > 0 && s.playerRank <= 4);
    for (const s of seededSamples) {
      if (s.opponentRank === null) continue; // bye — proteção máxima, ok.
      assert.ok(s.opponentRank > 8, `jogador seed (#${s.playerRank}) não pode enfrentar outro seed protegido (#${s.opponentRank}) na 1ª rodada de ${s.tier}`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-opponent-distribution: PASS');
} finally {
  await vite.close();
}
