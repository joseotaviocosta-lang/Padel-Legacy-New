// Playthrough 5.16, Partes P/Q/R — o save ANTIGO repara as duplas fantasma?
//
// Hipótese do playtest: Toronto Champions Masters continuava com campo
// artificial mesmo depois da 5.15 porque aquele save foi criado ANTES das
// correções. A 5.15 corrigiu a ORIGEM (quem nasce novo nasce limpo); este
// teste pergunta outra coisa — o único caminho que toca um save existente
// (repairLegacyTeamRankings) sabe consertar o que já está gravado?
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/ranking');

const ctx = await bootstrapLegacyWorld('GhostV516');
const { vite, mod, localGame } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');

const injected = await injectLegacyPathologies(ctx, { ghostPairs: 25, inflatedPairs: 0 });
const before = await measurePopulation(ctx);

console.log(`injetadas ${injected.ghosts.length} duplas fantasma | ghostRR medido antes = ${before.ghostRR}`);

await check('pré-condição: o save legado REALMENTE tem duplas fantasma', () => {
  // Sem isto, um reparo que não faz nada passaria trivialmente.
  assert.ok(before.ghostRR >= 25, `só ${before.ghostRR} fantasmas antes do reparo`);
});

const summary = await repairLegacyTeamRankings();
const after = await measurePopulation(ctx);

console.log(`reparo: ${JSON.stringify(summary)}`);
console.log(`ghostRR antes=${before.ghostRR} depois=${after.ghostRR}`);

await check('Parte R/15-16: depois do reparo, ghost RR = 0', () => {
  assert.equal(after.ghostRR, 0, `${after.ghostRR} duplas fantasma sobreviveram ao reparo`);
});

await check('Parte Q/2: duplas REAIS curadas (parceria declarada) foram preservadas', () => {
  // O reparo não pode "limpar" removendo a elite legítima junto.
  const curated = after.teams.filter((t) => {
    if (!after.isReal(t.player1_id) || !after.isReal(t.player2_id)) return false;
    return after.byId.get(t.player1_id)?.ai_partner_id === t.player2_id
      || after.byId.get(t.player2_id)?.ai_partner_id === t.player1_id;
  });
  console.log(`   [registro] duplas reais curadas preservadas: ${curated.length}`);
  assert.ok(curated.length >= 20, `só ${curated.length} duplas reais curadas restaram`);
});

await check('Parte Q/7 + Parte U: o reparo é IDEMPOTENTE', () => {
  assert.equal(summary.ghostsRemoved, injected.ghosts.length,
    `removeu ${summary.ghostsRemoved}, injetei ${injected.ghosts.length}`);
});

await check('Parte Q/7: rodar o reparo de novo é no-op', async () => {
  const second = await repairLegacyTeamRankings();
  const twice = await measurePopulation(ctx);
  console.log(`   [registro] segunda passada: ghostsRemoved=${second.ghostsRemoved} total=${twice.total}`);
  assert.equal(second.ghostsRemoved, 0, 'a segunda passada removeu linhas de novo');
  assert.equal(twice.total, after.total, 'a segunda passada mudou o tamanho da população');
});

await check('Parte Q: o reparo não zerou a população de duplas', () => {
  console.log(`   [registro] duplas antes=${before.total} depois=${after.total}`);
  assert.ok(after.total > before.total - injected.ghosts.length - 5,
    'o reparo removeu muito mais do que as fantasmas');
  assert.ok(after.total > 100, `restaram só ${after.total} duplas`);
});

await vite.close();
finish('test-legacy-save-ghost-rr-repair-v516');
