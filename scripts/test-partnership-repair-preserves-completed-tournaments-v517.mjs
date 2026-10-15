// Playthrough 5.17, Parte N — nenhuma correção de população/dupla pode
// reescrever história já jogada.
//
// Vale tanto para o reparo legado de TeamRanking (5.16) quanto para o novo
// ledger de dupla (5.17): torneio concluído mantém campeão, vice, chave,
// placar e premiação. Só sorteios FUTUROS usam a população corrigida.
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const ctx = await bootstrapLegacyWorld('PreservaV517', { careerDate: '2026-01-19' });
const { vite, mod, localGame } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');

await injectLegacyPathologies(ctx, { ghostPairs: 15, inflatedPairs: 4 });

const teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
const ghostRows = teams.filter((t) => String(t.team_key || '').startsWith('legacy-ghost-'));
assert.ok(ghostRows.length >= 4, 'pré-condição: fantasmas insuficientes');

// Um torneio CONCLUÍDO cujo campo usa identidades que o reparo vai remover.
const HISTORIC = {
  id: 'historico-v517',
  name: 'Masters Histórico',
  tier: 'Masters',
  start_date: '2026-01-05',
  end_date: '2026-01-09',
  main_draw_size: 8,
  status: 'concluido',
  current_phase: 'concluido',
  champion: 'Campeão Fantasma A/Campeão Fantasma B',
  runner_up: 'Vice Fantasma A/Vice Fantasma B',
  bracket_schema_version: 2,
  bracket_history: [{
    round: 'Final',
    matches: [{
      team_a: 'Campeão Fantasma A/Campeão Fantasma B',
      team_b: 'Vice Fantasma A/Vice Fantasma B',
      score: '6-4 6-3',
      winner: 'Campeão Fantasma A/Campeão Fantasma B',
    }],
  }],
  draw_pair_ids: ghostRows.slice(0, 4).map((t) => `profile-pair:${t.player1_id}:${t.player2_id}`),
  prize_coins: 50000,
  world_tour_resolved: true,
};
await localGame.entities.Tournament.create(HISTORIC);

const before = await localGame.entities.Tournament.get(HISTORIC.id);
const snapshot = JSON.parse(JSON.stringify({
  champion: before.champion,
  runner_up: before.runner_up,
  bracket_history: before.bracket_history,
  draw_pair_ids: before.draw_pair_ids,
  prize_coins: before.prize_coins,
  status: before.status,
}));

const summary = await repairLegacyTeamRankings();
console.log(`reparo: ghostsRemoved=${summary.ghostsRemoved} pointsRecalculated=${summary.pointsRecalculated}`);

const after = await localGame.entities.Tournament.get(HISTORIC.id);

await check('Parte N/28: o CAMPEÃO do torneio concluído é preservado', () => {
  assert.equal(after.champion, snapshot.champion);
});

await check('Parte N: o VICE é preservado', () => {
  assert.equal(after.runner_up, snapshot.runner_up);
});

await check('Parte N: a CHAVE e o PLACAR são preservados', () => {
  assert.deepEqual(after.bracket_history, snapshot.bracket_history);
  assert.equal(after.bracket_history[0].matches[0].score, '6-4 6-3');
});

await check('Parte N: o CAMPO (draw_pair_ids) é preservado mesmo com identidades removidas', () => {
  // As duplas foram apagadas do ranking, mas o registro histórico de quem
  // disputou continua intacto — é isso que diferencia "corrigir o mundo" de
  // "reescrever o passado".
  assert.deepEqual(after.draw_pair_ids, snapshot.draw_pair_ids);
});

await check('Parte N: a PREMIAÇÃO e o status são preservados', () => {
  assert.equal(after.prize_coins, snapshot.prize_coins);
  assert.equal(after.status, snapshot.status);
});

await check('Parte N: o reparo REALMENTE mexeu no mundo (não é no-op trivial)', () => {
  // Sem isto, preservar o histórico seria trivial: bastaria o reparo não
  // fazer nada.
  assert.ok(summary.ghostsRemoved > 0, 'o reparo não removeu nada — o teste seria vazio');
});

await check('Parte N: rodar o reparo de novo continua preservando', async () => {
  await repairLegacyTeamRankings();
  const twice = await localGame.entities.Tournament.get(HISTORIC.id);
  assert.equal(twice.champion, snapshot.champion);
  assert.deepEqual(twice.bracket_history, snapshot.bracket_history);
});

await vite.close();
finish('test-partnership-repair-preserves-completed-tournaments-v517');
