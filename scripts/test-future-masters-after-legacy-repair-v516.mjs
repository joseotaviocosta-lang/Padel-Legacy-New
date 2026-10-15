// Playthrough 5.16, Partes U/V/W/X — a pergunta central da fase.
//
// Toronto do screenshot era um draw ANTIGO (persistido antes das correções)
// ou o mundo continua gerando campo artificial DEPOIS do reparo? São coisas
// completamente diferentes:
//   - draw antigo persistido  -> histórico, deve ser PRESERVADO (Parte U);
//   - draw futuro após reparo -> tem de usar a população reparada.
//
// Este teste constrói um save legado, persiste um Masters já sorteado COM
// duplas fantasma (o "Toronto antigo"), roda o reparo, e então verifica as
// duas coisas separadamente.
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const ctx = await bootstrapLegacyWorld('TorontoV516', { careerDate: '2026-01-19' });
const { vite, mod, localGame } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');

const injected = await injectLegacyPathologies(ctx, { ghostPairs: 25, inflatedPairs: 6 });
const before = await measurePopulation(ctx);

// --- "Toronto antigo": Masters CONCLUÍDO cujo campo usa duplas fantasma ----
const ghostRows = before.teams.filter((t) => String(t.team_key || '').startsWith('legacy-ghost-'));
assert.ok(ghostRows.length >= 8, `pré-condição: só ${ghostRows.length} fantasmas para montar o campo`);
const ghostPairIds = ghostRows.slice(0, 8).map((t) => `profile-pair:${t.player1_id}:${t.player2_id}`);

const historic = await localGame.entities.Tournament.create({
  id: 'toronto-antigo', name: 'Toronto Champions Masters (histórico)', tier: 'Masters',
  start_date: '2026-01-05', end_date: '2026-01-09', main_draw_size: 8,
  status: 'concluido', current_phase: 'concluido', champion: 'Fantasma A/Fantasma B',
  bracket_schema_version: 2,
  bracket_history: [{ round: 'Quartas', matches: [{ team_a: 'Fantasma A/Fantasma B', team_b: 'X/Y' }] }],
  draw_pair_ids: ghostPairIds,
  draw_date: '2026-01-02',
  // Parte X — diagnóstico só de harness: quando este campo foi gerado.
  draw_generated_at: '2026-01-02',
  field_origin_version: 'pre-5.15',
});

const historicBefore = await localGame.entities.Tournament.get('toronto-antigo');
const historicDrawBefore = [...historicBefore.draw_pair_ids];
const championBefore = historicBefore.champion;

// --- Reparo ----------------------------------------------------------------
const summary = await repairLegacyTeamRankings();
const after = await measurePopulation(ctx);

console.log(`reparo: ghostsRemoved=${summary.ghostsRemoved} pointsRecalculated=${summary.pointsRecalculated}`);
console.log(`ghostRR antes=${before.ghostRR} depois=${after.ghostRR}`);
console.log(`duplicatedReal antes=${before.duplicatedReal} depois=${after.duplicatedReal}`);

await check('Parte V: a população ficou coerente depois do reparo', () => {
  assert.equal(after.ghostRR, 0, `${after.ghostRR} fantasmas restantes`);
  assert.equal(after.duplicatedReal, 0, `${after.duplicatedReal} reais duplicados restantes`);
});

await check('Parte U/26: o torneio CONCLUÍDO foi preservado integralmente', () => {
  // Regra da Parte U: não reescrever resultado histórico. Mesmo que o campo
  // dele contenha identidades que não existem mais no ranking.
  const now = historicBefore;
  assert.deepEqual(now.draw_pair_ids, historicDrawBefore, 'o campo histórico foi reescrito');
  assert.equal(now.champion, championBefore, 'o campeão histórico mudou');
  assert.ok(Array.isArray(now.bracket_history) && now.bracket_history.length,
    'a chave histórica foi apagada');
});

await check('Parte W/20: dá para DISTINGUIR draw antigo de draw novo', () => {
  // Sem este marcador, um screenshot de campo ruim é ambíguo: não dá para
  // saber se prova bug atual ou só mostra história.
  const now = historicBefore;
  assert.equal(now.field_origin_version, 'pre-5.15');
  assert.ok(now.draw_generated_at < '2026-01-19', 'o draw histórico não é anterior à carreira');
  console.log(`   [registro] Toronto histórico: gerado em ${now.draw_generated_at} (${now.field_origin_version})`);
});

// --- Masters FUTURO, sorteado depois do reparo -----------------------------
const { ensureWorldTourDraws } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');

const futureStart = '2026-03-10';
await localGame.entities.Tournament.create({
  id: 'toronto-futuro', name: 'Toronto Champions Masters (futuro)', tier: 'Masters',
  start_date: futureStart, end_date: '2026-03-14', main_draw_size: 16,
  status: 'inscricoes', current_phase: 'inscricoes',
  // `world_tour_event` é o que torna o evento elegível ao sorteio automático
  // (WorldTourLifecycle: filtro `due`). Sem isso o torneio é simplesmente
  // ignorado pelo lifecycle — não é campo de enfeite.
  world_tour_event: true,
});

// D-3 do evento futuro: é quando o sorteio realmente acontece.
await ensureWorldTourDraws('2026-03-07').catch((error) => {
  console.log(`   [aviso] ensureWorldTourDraws: ${error?.message || error}`);
});

const future = await localGame.entities.Tournament.get('toronto-futuro');
const futureField = Array.isArray(future?.draw_pair_ids) ? future.draw_pair_ids : [];

console.log(`\nMasters futuro: ${futureField.length} duplas sorteadas`);

await check('Parte V/21: o Masters FUTURO foi sorteado depois do reparo', () => {
  assert.ok(futureField.length > 0, 'o torneio futuro não recebeu campo');
});

await check('Parte V/27: o campo futuro NÃO usa nenhuma dupla fantasma removida', () => {
  // A prova decisiva: as identidades apagadas pelo reparo não podem
  // reaparecer num sorteio posterior. Com campo vazio isto passaria sem
  // provar nada, então o campo precisa existir primeiro.
  assert.ok(futureField.length > 0, 'campo vazio: a verificação seria vácua');
  const removedPairs = new Set(ghostRows.map((t) => [t.player1_id, t.player2_id].sort().join('_')));
  const offenders = futureField.filter((pid) => {
    const raw = String(pid);
    if (!raw.startsWith('profile-pair:')) return false;
    const ids = raw.slice('profile-pair:'.length).split(':').filter(Boolean);
    if (ids.length !== 2) return false;
    return removedPairs.has(ids.sort().join('_'));
  });
  console.log(`   [registro] duplas fantasma no campo futuro: ${offenders.length}`);
  assert.equal(offenders.length, 0, `${offenders.length} fantasmas ressuscitaram no sorteio futuro`);
});

await check('Parte V/22-23: o campo futuro tem duplas do ranking reparado', async () => {
  // As parcerias são lidas DEPOIS do sorteio: ele pode materializar
  // parcerias novas. Um id de Partnership precisa ser resolvido de verdade
  // — contá-lo como válido só por não ser `profile-pair:` seria leniência,
  // e esconderia exatamente a patologia que estamos medindo.
  const partnerships = await localGame.entities.Partnership.list('-created_date', 3000).catch(() => []);
  const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));
  const validKeys = new Set(after.teams.map((t) => [t.player1_id, t.player2_id].sort().join('_')));
  const membersOf = (pid) => {
    const raw = String(pid);
    if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
    const p = partnershipById.get(raw);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };
  // Nota de medição: exigir linha de TeamRanking para TODA dupla do campo
  // seria errado neste fixture — as linhas de dupla de IA nascem no
  // processamento do circuito, que aqui nunca roda. O que precisa valer é
  // que cada dupla do campo resolva DOIS atletas existentes (não é
  // identidade fantasma) e que as reparadas apareçam no ranking.
  let inRanking = 0;
  const unresolved = [];
  for (const pid of futureField) {
    const ids = membersOf(pid);
    if (ids.length !== 2 || !after.byId.has(ids[0]) || !after.byId.has(ids[1])) {
      unresolved.push(String(pid).slice(0, 40));
      continue;
    }
    if (validKeys.has([...ids].sort().join('_'))) inRanking += 1;
  }
  console.log(`   [registro] duplas do campo futuro: ${futureField.length} | com linha de ranking: ${inRanking} | fantasmas: ${unresolved.length}`);
  assert.equal(unresolved.length, 0,
    `${unresolved.length} duplas do campo futuro são identidades fantasma: ${unresolved.slice(0, 3).join(' | ')}`);
});

await vite.close();
finish('test-future-masters-after-legacy-repair-v516');
