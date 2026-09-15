import assert from 'node:assert/strict';

// Hotfix — "sorteio coloca o jogador contra a própria dupla" (relato de
// playthrough: dupla "b & Alessio Romano", adversário na oitava de final
// "Alessio Romano & Diogo Correia" — mesmo NOME nos dois lados). Causa raiz
// não era a exclusão por id em generateTournamentOpponent/createDrawnRun
// (essa já funcionava — nenhuma entidade é sorteada duas vezes) — era o
// gerador de nomes fictícios (src/players/athleteGenerator.js) produzindo
// nomes duplicados entre ENTIDADES DIFERENTES (medido: só 24 nomes únicos
// entre 240 atletas antes da correção). Duas entidades diferentes (ids
// distintos, corretamente excluídas uma da outra) podiam ter o mesmo nome
// de exibição — a tela não distingue por id, só mostra o nome. Este teste
// reproduz o fluxo real de sorteio (mesma lógica de createDrawnRun,
// src/lib/tournamentDraw.js) pra um parceiro do tier Iniciante (o cenário
// exato do relato) e confirma que nenhum round da chave produz um
// adversário com o MESMO NOME do parceiro do jogador.
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { generateTournamentOpponent, getTournamentDifficulty, getTournamentRounds } = await vite.ssrLoadModule('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const profile = { id: 'test-player', sport_name: 'b', career_date: '2026-01-15' };
  const rank = { rank: 500, total: 900 };

  // Cenário exato do relato: torneio Silver, parceiro fraco (Iniciante).
  for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
    for (const partner of [BOTS_BY_DIFFICULTY.iniciante[0], BOTS_BY_DIFFICULTY.iniciante[10], BOTS_BY_DIFFICULTY.amador[0]]) {
      const tournament = { id: `draw-test-${tier}`, tier, start_date: '2026-01-15' };
      const mainRounds = getTournamentRounds(tournament);
      const usedIds = [partner.id];
      const drawnNames = [];
      mainRounds.forEach((round, roundIdx) => {
        let members = generateTournamentOpponent(tournament, profile, roundIdx, usedIds, rank.rank, 'main');
        if (members.length < 2) members = generateTournamentOpponent(tournament, profile, roundIdx, [partner.id], rank.rank, 'main');
        usedIds.push(...members.map((m) => m.id));
        members.forEach((m) => drawnNames.push({ roundIdx, name: m.name, id: m.id }));
      });
      const collision = drawnNames.find((entry) => entry.name === partner.name && entry.id !== partner.id);
      assert.equal(
        collision, undefined,
        `torneio ${tier}, parceiro "${partner.name}" (${partner.id}): adversário com o MESMO NOME apareceu no round ${collision?.roundIdx} (id diferente: ${collision?.id}) — mesmo bug do relato`,
      );
    }
  }

  console.log('tournament-draw-name-collision: nenhum torneio sorteou um adversário com o mesmo nome do parceiro do jogador — OK');
} finally {
  await vite.close();
}
