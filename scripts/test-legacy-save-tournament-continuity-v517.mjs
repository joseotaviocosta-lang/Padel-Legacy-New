// Playthrough 5.17 (continuação), Parte G — CONTINUIDADE DE TORNEIOS NUM
// SAVE LEGADO.
//
// A forense (Partes E/F) mediu 0 cancelamentos em 3 temporadas de mundo
// NOVO. Mas o playtest que gerou "evento cancelado por número insuficiente
// de duplas elegíveis" rodava sobre um save com meses de evolução e
// correções anteriores. Testar só mundo novo não responde àquela queixa.
//
// Aqui o mundo nasce com as patologias legadas conhecidas, passa pelo
// reparo, e só então avança 12–20 semanas.
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const ctx = await bootstrapLegacyWorld('ContinuidadeV517', { careerDate: '2026-01-19' });
const { vite, mod, localGame } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');
const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { ensureFutureTournaments } = await mod('/src/lib/career.js');

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// --- Patologias legadas + torneio concluído com identidades que somem -----
const injected = await injectLegacyPathologies(ctx, { ghostPairs: 25, inflatedPairs: 6 });
const before = await measurePopulation(ctx);

const ghostRows = before.teams.filter((t) => String(t.team_key || '').startsWith('legacy-ghost-'));
await localGame.entities.Tournament.create({
  id: 'legacy-concluido-v517',
  name: 'Masters Legado (concluído)',
  tier: 'Masters',
  start_date: '2026-01-05', end_date: '2026-01-09', main_draw_size: 8,
  status: 'concluido', current_phase: 'concluido',
  champion: 'Fantasma A/Fantasma B',
  bracket_schema_version: 2,
  bracket_history: [{ round: 'Final', matches: [{ team_a: 'Fantasma A/Fantasma B', team_b: 'X/Y', score: '6-3 6-4' }] }],
  draw_pair_ids: ghostRows.slice(0, 4).map((t) => `profile-pair:${t.player1_id}:${t.player2_id}`),
  world_tour_resolved: true,
});
const historicBefore = await localGame.entities.Tournament.get('legacy-concluido-v517');
const historicSnapshot = JSON.parse(JSON.stringify({
  champion: historicBefore.champion,
  bracket_history: historicBefore.bracket_history,
  draw_pair_ids: historicBefore.draw_pair_ids,
}));

console.log(`antes do reparo: ghostRR=${before.ghostRR} dupReal=${before.duplicatedReal} duplas=${before.total}`);

// --- Reparo (bootstrap 5.16/5.17) ----------------------------------------
const summary = await repairLegacyTeamRankings();
const afterRepair = await measurePopulation(ctx);
console.log(`reparo: ghostsRemoved=${summary.ghostsRemoved} pointsRecalculated=${summary.pointsRecalculated}`);
console.log(`depois do reparo: ghostRR=${afterRepair.ghostRR} dupReal=${afterRepair.duplicatedReal} duplas=${afterRepair.total}`);

await check('Parte G: o save legado foi reparado antes de avançar', () => {
  assert.ok(before.ghostRR > 0, 'o fixture não tinha patologia — o teste seria vazio');
  assert.equal(afterRepair.ghostRR, 0, `${afterRepair.ghostRR} fantasmas sobreviveram`);
  assert.equal(afterRepair.duplicatedReal, 0);
});

// --- Avança 16 semanas ----------------------------------------------------
await ensureFutureTournaments('2026-01-19');
let date = '2026-01-19';
const WEEKS = 16;
for (let i = 0; i < WEEKS * 7; i += 1) {
  date = addDays(date, 1);
  await ensureWorldTourDraws(date).catch(() => null);
  await resolveCompletedWorldTourEvents(date).catch(() => null);
}

const tournaments = await localGame.entities.Tournament.list('start_date', 5000);
const window = tournaments.filter((t) => t.start_date > '2026-01-19' && t.start_date <= date);
const drawn = window.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const cancelled = window.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
const recovered = drawn.filter((t) => t.bracket_origin === 'retroactive-recovery');
const noDraw = window.filter((t) => !t.world_tour_cancelled && t.status !== 'cancelado'
  && !(Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length));

const byTier = {};
for (const t of cancelled) byTier[t.tier] = (byTier[t.tier] || 0) + 1;

console.log(`\n=== PARTE G: ${WEEKS} semanas após o reparo ===`);
console.log(`eventos=${window.length} sorteados=${drawn.length} cancelados=${cancelled.length} recuperados=${recovered.length} sem sorteio=${noDraw.length}`);
if (cancelled.length) console.log(`cancelados por tier: ${JSON.stringify(byTier)}`);

await check('Parte G/14: o save legado continua sorteando normalmente', () => {
  console.log(`   [registro] sorteados: ${drawn.length}/${window.length}`);
  assert.ok(drawn.length > 0, 'nenhum torneio foi sorteado após o reparo');
  assert.ok(drawn.length >= window.length - 3, `${window.length - drawn.length} eventos sem chave`);
});

await check('Parte G: nenhum cancelamento por "duplas insuficientes" após o reparo', () => {
  const byPopulation = cancelled.filter((t) => String(t.cancellation_reason || '').includes('inscritos')
    || String(t.cancellation_reason || '').includes('sem_chave'));
  console.log(`   [registro] cancelados=${cancelled.length} por população=${byPopulation.length}`);
  assert.equal(byPopulation.length, 0,
    byPopulation.slice(0, 3).map((t) => `${t.name}(${t.tier}):${t.cancellation_reason}`).join(' | '));
});

await check('Parte G: o campo pós-reparo não usa identidades removidas', () => {
  const removed = new Set(ghostRows.map((t) => [t.player1_id, t.player2_id].sort().join('_')));
  let offenders = 0;
  for (const t of drawn) {
    for (const pid of t.draw_pair_ids) {
      const raw = String(pid);
      if (!raw.startsWith('profile-pair:')) continue;
      const ids = raw.slice('profile-pair:'.length).split(':').filter(Boolean);
      if (ids.length === 2 && removed.has([...ids].sort().join('_'))) offenders += 1;
    }
  }
  console.log(`   [registro] fantasmas ressuscitados no campo: ${offenders}`);
  assert.equal(offenders, 0, `${offenders} duplas removidas reapareceram`);
});

await check('Parte G: o torneio CONCLUÍDO do save legado segue intacto', async () => {
  const after = await localGame.entities.Tournament.get('legacy-concluido-v517');
  assert.equal(after.champion, historicSnapshot.champion);
  assert.deepEqual(after.bracket_history, historicSnapshot.bracket_history);
  assert.deepEqual(after.draw_pair_ids, historicSnapshot.draw_pair_ids);
});

await check('Parte G: settlement funciona no save legado', () => {
  const settled = drawn.filter((t) => t.champion);
  console.log(`   [registro] eventos com campeão: ${settled.length}/${drawn.length}`);
  assert.ok(settled.length > 0, 'nenhum evento foi resolvido no save legado');
});

await check('Parte G: a população segue sã depois de 16 semanas', async () => {
  const end = await measurePopulation(ctx);
  console.log(`   [registro] ghostRR=${end.ghostRR} dupReal=${end.duplicatedReal} duplas=${end.total}`);
  assert.equal(end.ghostRR, 0, 'fantasmas reapareceram durante a simulação');
  assert.equal(end.duplicatedReal, 0, 'atletas reais duplicados reapareceram');
});

await vite.close();
finish('test-legacy-save-tournament-continuity-v517');
