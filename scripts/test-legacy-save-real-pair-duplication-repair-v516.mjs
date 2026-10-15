// Playthrough 5.16, Partes P/Q/S — um atleta real aparecendo em DUAS duplas.
//
// É a patologia que mais distorce o Masters: se Coello está simultaneamente
// na dupla curada e numa dupla fantasma, o campo passa a "conter" um atleta
// que não existe duas vezes, e a dupla legítima disputa espaço com uma cópia
// dela mesma. Depois do reparo só pode restar a dupla canônica.
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/ranking');

const ctx = await bootstrapLegacyWorld('DupRealV516');
const { vite, mod } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');
const { computeCanonicalTeamRankingPoints } = await mod('/src/lib/teamRankingFormula.js');

const injected = await injectLegacyPathologies(ctx, { ghostPairs: 20, inflatedPairs: 0 });
const before = await measurePopulation(ctx);

console.log(`atletas reais envolvidos em duplicação: ${new Set(injected.duplicatedReal).size}`);
console.log(`duplicatedReal antes = ${before.duplicatedReal}`);

await check('pré-condição: o save legado tem atleta real em mais de uma dupla', () => {
  assert.ok(before.duplicatedReal > 0, 'nenhuma duplicação foi injetada — o teste seria vazio');
});

await repairLegacyTeamRankings();
const after = await measurePopulation(ctx);

console.log(`duplicatedReal antes=${before.duplicatedReal} depois=${after.duplicatedReal}`);

await check('Parte S/17: depois do reparo, atleta real duplicado = 0', () => {
  assert.equal(after.duplicatedReal, 0,
    `${after.duplicatedReal} atletas reais ainda aparecem em mais de uma dupla`);
});

await check('Parte S: cada atleta real sobrevive na sua dupla CANÔNICA', () => {
  // Não basta remover: o atleta precisa continuar existindo na dupla que ele
  // próprio declara. Remover as duas seria "limpar" destruindo a elite.
  const declaredPairsPresent = after.teams.filter((t) => {
    if (!after.isReal(t.player1_id) || !after.isReal(t.player2_id)) return false;
    return after.byId.get(t.player1_id)?.ai_partner_id === t.player2_id
      || after.byId.get(t.player2_id)?.ai_partner_id === t.player1_id;
  });
  const survivors = new Set();
  for (const t of declaredPairsPresent) { survivors.add(t.player1_id); survivors.add(t.player2_id); }
  const lost = [...new Set(injected.duplicatedReal)].filter((id) => !survivors.has(id));
  console.log(`   [registro] reais na dupla canônica: ${survivors.size} | perdidos: ${lost.length}`);
  assert.equal(lost.length, 0, `${lost.length} atletas reais ficaram SEM dupla após o reparo`);
});

await check('Parte Q/6: o reparo nunca somou pontos ao fundir', () => {
  // Somar era o bug original da 5.10. Nenhuma linha pode ter pontos acima do
  // teto canônico possível para seus membros.
  const offenders = after.teams.filter((t) => {
    const a = after.byId.get(t.player1_id);
    const b = after.byId.get(t.player2_id);
    if (!a || !b) return false;
    const canonical = computeCanonicalTeamRankingPoints(
      Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0,
    );
    return Number(t.ranking_points) > canonical + 1;
  });
  console.log(`   [registro] linhas acima do canônico: ${offenders.length}`);
  assert.equal(offenders.length, 0, `${offenders.length} linhas com pontos somados/inflados`);
});

await vite.close();
finish('test-legacy-save-real-pair-duplication-repair-v516');
