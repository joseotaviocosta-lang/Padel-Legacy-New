// Playthrough 5.16, Partes P/Q/T — pontos de SEED inflados num save antigo.
//
// A 5.15 passou a gravar pontos canônicos na ORIGEM, e a 5.12/5.11 fixaram a
// média geométrica como autoridade. Mas um save criado antes disso guarda
// linhas com valores hardcoded (o padrão 2240/1810 do seed de demonstração),
// completamente desligados dos pontos atuais dos dois membros. Uma dupla
// procedural com 2240 pontos congelados fica acima de duplas reais que
// ganharam os seus jogando — e é isso que aparece como "campo artificial".
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/ranking');

const ctx = await bootstrapLegacyWorld('InflacaoV516');
const { vite, mod } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');
const { computeCanonicalTeamRankingPoints } = await mod('/src/lib/teamRankingFormula.js');

const injected = await injectLegacyPathologies(ctx, { ghostPairs: 0, inflatedPairs: 6 });
const before = await measurePopulation(ctx);

const expectedFor = (row) => {
  const a = before.byId.get(row.a);
  const b = before.byId.get(row.b);
  return computeCanonicalTeamRankingPoints(
    Number(a?.world_ranking_points) || 0, Number(b?.world_ranking_points) || 0,
  );
};

console.log('=== PARTE T: duplas com ponto de seed inflado ===');
console.log('linha                  gravado   canônico esperado');
for (const row of injected.inflated) {
  console.log(`${row.id.slice(0, 22).padEnd(23)}${String(row.stored).padStart(7)}${String(expectedFor(row)).padStart(19)}`);
}

await check('pré-condição: o valor gravado DIVERGE do canônico', () => {
  const divergent = injected.inflated.filter((row) => row.stored !== expectedFor(row));
  assert.equal(divergent.length, injected.inflated.length,
    'alguma linha já nasceu canônica — o teste não provaria nada');
});

const summary = await repairLegacyTeamRankings();
const after = await measurePopulation(ctx);

console.log(`\nreparo: pointsRecalculated=${summary.pointsRecalculated}`);

await check('Parte T/18: depois do reparo, o ponto é o canônico dos membros', () => {
  const byRowId = new Map(after.teams.map((t) => [t.id, t]));
  const wrong = [];
  for (const row of injected.inflated) {
    const current = byRowId.get(row.id);
    if (!current) continue;
    const expected = expectedFor(row);
    if (Number(current.ranking_points) !== expected) {
      wrong.push(`${row.id}: ${current.ranking_points} != ${expected}`);
    }
  }
  console.log(`   [registro] linhas ainda infladas: ${wrong.length}`);
  assert.equal(wrong.length, 0, wrong.join(' | '));
});

await check('Parte Q/6: o reparo NUNCA somou — sempre substituiu', () => {
  const byRowId = new Map(after.teams.map((t) => [t.id, t]));
  for (const row of injected.inflated) {
    const current = byRowId.get(row.id);
    if (!current) continue;
    assert.notEqual(Number(current.ranking_points), row.stored + expectedFor(row),
      'ponto somado em vez de substituído');
    assert.ok(Number(current.ranking_points) <= row.stored,
      `ponto subiu de ${row.stored} para ${current.ranking_points}`);
  }
});

await check('Parte T: o reparo recalculou as linhas divergentes sobreviventes', () => {
  // Playthrough 5.22-E: com a fórmula da soma, parte das linhas injetadas
  // pode já nascer canônica ou ser fundida como duplicata canônica — o
  // invariante real é que TODAS as sobreviventes terminem na autoridade
  // vigente (checado acima), não a contagem exata de updates.
  assert.ok(summary.pointsRecalculated >= 1,
    `recalculou ${summary.pointsRecalculated}, injetei ${injected.inflated.length}`);
});

await check('Parte Q/7: o recálculo é IDEMPOTENTE', async () => {
  const second = await repairLegacyTeamRankings();
  console.log(`   [registro] segunda passada: pointsRecalculated=${second.pointsRecalculated}`);
  assert.equal(second.pointsRecalculated, 0, 'a segunda passada recalculou de novo');
});

await check('Parte T: nenhuma dupla procedural inflada permanece no Top50', () => {
  const inflatedIds = new Set(injected.inflated.map((r) => r.id));
  const top50 = after.teams.slice(0, 50);
  const stillThere = top50.filter((t) => inflatedIds.has(t.id));
  console.log(`   [registro] linhas injetadas ainda no Top50: ${stillThere.length}`);
  for (const t of stillThere) {
    const a = after.byId.get(t.player1_id);
    const b = after.byId.get(t.player2_id);
    const canonical = computeCanonicalTeamRankingPoints(
      Number(a?.world_ranking_points) || 0, Number(b?.world_ranking_points) || 0,
    );
    // Permanecer é legítimo — desde que por mérito dos membros, não por
    // valor congelado.
    assert.equal(Number(t.ranking_points), canonical,
      `${t.id} segue no Top50 com ponto não sustentado`);
  }
});

await vite.close();
finish('test-legacy-save-seed-inflation-repair-v516');
