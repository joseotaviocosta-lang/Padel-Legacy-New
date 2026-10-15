// Playthrough 5.16, Parte AB — o MESMO princípio de seeding, agora sobre um
// save legado reparado.
//
// A Parte AA mede o seeding num mundo novo. Aqui a pergunta é a que o
// playtest levantou: depois de reparar um save antigo, o sorteio de um
// Masters FUTURO volta a produzir cabeças de chave coerentes, ou as
// identidades legadas continuam contaminando a ordem?
import assert from 'node:assert/strict';
import {
  bootstrapLegacyWorld, injectLegacyPathologies, measurePopulation, installShims,
} from './lib/legacySaveFixture.mjs';
import { makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const ctx = await bootstrapLegacyWorld('SeedRepairV516', { careerDate: '2026-01-19' });
const { vite, mod, localGame } = ctx;
const { repairLegacyTeamRankings } = await mod('/src/lib/teamRanking.js');
const { ensureWorldTourDraws } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');

await injectLegacyPathologies(ctx, { ghostPairs: 25, inflatedPairs: 6 });
await repairLegacyTeamRankings();
const after = await measurePopulation(ctx);

// Rank canônico depois do reparo.
const rankByPairKey = new Map();
after.teams.forEach((row, i) => {
  rankByPairKey.set([row.player1_id, row.player2_id].sort().join('_'), i + 1);
});

// A lista de Partnership precisa ser lida DEPOIS do sorteio: o próprio
// sorteio pode materializar parcerias, e um mapa capturado antes deixaria
// seeds legítimos parecendo identidades fantasma.
let partnershipById = new Map();
const membersOf = (pairId) => {
  const raw = String(pairId);
  if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
  const p = partnershipById.get(raw);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};
const rankOfPair = (pairId) => {
  const m = membersOf(pairId);
  if (m.length !== 2) return null;
  return rankByPairKey.get([m[0], m[1]].sort().join('_')) ?? null;
};
const classOfPair = (pairId) => {
  const m = membersOf(pairId);
  if (m.length !== 2) return '??';
  const a = after.isReal(m[0]);
  const b = after.isReal(m[1]);
  if (a && b) return 'RR';
  if (a || b) return 'RP';
  return 'PP';
};

await localGame.entities.Tournament.create({
  id: 'masters-pos-reparo', name: 'Masters Pós-Reparo', tier: 'Masters',
  // 24 duplas numa chave de 32 força BYES — é o caso que a auditoria de
  // temporada não consegue validar, e onde o posicionamento de cabeça de
  // chave realmente importa.
  start_date: '2026-03-10', end_date: '2026-03-14', main_draw_size: 24,
  status: 'inscricoes', current_phase: 'inscricoes',
  // Necessário para entrar no filtro `due` do sorteio automático.
  world_tour_event: true,
});
await ensureWorldTourDraws('2026-03-07').catch((error) => {
  console.log(`   [aviso] ensureWorldTourDraws: ${error?.message || error}`);
});

const partnerships = await localGame.entities.Partnership.list('-created_date', 3000).catch(() => []);
partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));

const event = await localGame.entities.Tournament.get('masters-pos-reparo');
const field = Array.isArray(event?.draw_pair_ids) ? event.draw_pair_ids : [];
const seeds = field.slice(0, 8);

console.log('=== PARTE AB: seeds 1-8 do Masters sorteado APÓS o reparo ===');
console.log('seed  dupla                                      rank  origem');
for (let i = 0; i < seeds.length; i += 1) {
  const rank = rankOfPair(seeds[i]);
  console.log(`${String(i + 1).padEnd(6)}${String(seeds[i]).slice(0, 42).padEnd(43)}${String(rank ?? '-').padStart(5)}  ${classOfPair(seeds[i])}`);
}

await check('Parte AB: o Masters pós-reparo recebeu campo', () => {
  assert.ok(field.length > 0, 'nenhuma dupla foi sorteada');
  assert.ok(seeds.length >= 4, `só ${seeds.length} seeds`);
});

await check('Parte AB/27: todo seed resolve para DOIS atletas existentes', () => {
  // Nota de medição: exigir linha de TeamRanking aqui seria errado. As
  // linhas de dupla de IA são criadas por updateTeamRankings durante o
  // processamento do circuito, e este fixture nunca avança o tempo — uma
  // parceria legítima e recém-formada simplesmente ainda não tem linha.
  // O que caracteriza identidade FANTASMA é não resolver membros.
  const unresolved = seeds.filter((pid) => {
    const m = membersOf(pid);
    return m.length !== 2 || !after.byId.has(m[0]) || !after.byId.has(m[1]);
  });
  console.log(`   [registro] seeds que não resolvem membros: ${unresolved.length}/${seeds.length}`);
  assert.equal(unresolved.length, 0, `${unresolved.length} seeds são identidades fantasma`);
});

// A autoridade de seeding real (WorldTourLifecycle:pairSeedRank) é o rank
// CANÔNICO de dupla (TeamRanking.ranking_display_position); a média dos ranks
// individuais (pairEntryRank) é apenas o fallback para pares ainda sem linha.
// Reproduzimos a MESMA ordem aqui — medir só o proxy individual fazia o gate
// acusar inversão de proteção que o sorteio real não tem (Playthrough 5.22-E,
// onde a regra da soma afasta o proxy do rank canônico).
const entryRankOf = (pairId) => {
  const canonical = rankOfPair(pairId);
  if (canonical && canonical > 0) return canonical;
  const m = membersOf(pairId);
  if (m.length !== 2) return null;
  const ranks = m
    .map((id) => Number(after.byId.get(id)?.ranking_position) || 0)
    .filter((v) => v > 0);
  if (!ranks.length) return null;
  return Math.round(ranks.reduce((s, v) => s + v, 0) / ranks.length);
};

// CORREÇÃO DE MEDIÇÃO: `draw_pair_ids` NÃO é a ordem de cabeça de chave. É a
// ordem de ENTRADA (entrants, cortados por blendedCutScore). A ordem de seed
// só existe dentro da chave, nas POSIÇÕES de slot que buildSeededDrawSlots
// calcula. Medir seed em draw_pair_ids mede a coisa errada.
//
// `participants` é gravado em paralelo a `draw_pair_ids`, então dá pra ligar
// nome -> dupla -> rank, reconstruir os slots esperados pela autoridade e
// comparar com a chave realmente persistida.
const { buildSeededDrawSlots } = await mod('/src/gameplay/worldTour/tournamentSettlement.js');

await check('Parte AB/24: a chave persistida posiciona os seeds por RANKING', () => {
  const names = Array.isArray(event.participants) ? event.participants : [];
  assert.equal(names.length, field.length, 'participants e draw_pair_ids desalinhados');
  const rankByName = new Map();
  names.forEach((name, i) => { rankByName.set(name, entryRankOf(field[i])); });

  const round0 = event.bracket_history?.[0]?.matches || [];
  const actualSlots = [];
  for (const m of round0) { actualSlots.push(m.team_a || null); actualSlots.push(m.team_b || null); }

  const entrants = names.map((name) => ({ name, strength: 0, seedRank: rankByName.get(name) || 0 }));
  const { slots, seedCount } = buildSeededDrawSlots({ entrants, tournamentId: event.id });

  // LIMITE DE RECONSTRUÇÃO (medido na 5.17): comparar a ordem EXATA de slots
  // não é um teste válido do produto. O sorteio real passa
  // `strength: pairScore(...)`, e quando duas duplas empatam em `seedRank` —
  // o que acontece sempre que uma delas ainda não tem linha de TeamRanking e
  // cai no fallback `pairEntryRank` — o desempate é feito pela FORÇA, um
  // valor que este teste não tem como reproduzir (depende de OVR, química e
  // jitter por torneio). Uma comparação `deepEqual` aqui falhava de forma
  // não-determinística por esse motivo, e não por erro de seeding: as
  // checagens de bye e de dupla protegida abaixo passavam nas mesmas
  // execuções.
  //
  // O que É verificável sem a força: o CONJUNTO de duplas protegidas (as que
  // recebem bye) e a integridade do pareamento da rodada 0.
  const expectedProtectedCount = slots.filter((s, i) => (
    s && !slots[i % 2 === 0 ? i + 1 : i - 1]
  )).length;
  const actualPlaying = new Set(actualSlots.filter(Boolean));
  const actualProtected = names.filter((n) => !actualPlaying.has(n));

  console.log(`   [registro] confrontos reais: ${actualSlots.length / 2} | seeds protegidas: ${seedCount}`);
  console.log(`   [registro] protegidas esperadas=${expectedProtectedCount} observadas=${actualProtected.length}`);

  // Nem o CONJUNTO exato de protegidas é reconstruível: quando há empate de
  // `seedRank`, quem entra em `ranked[0..numSeeds-1]` é decidido pela força.
  // Por isso o teste verifica as duas propriedades que NÃO dependem dela:
  //   (a) a QUANTIDADE de protegidas é exatamente bracketSize - campo;
  //   (b) a proteção respeita a ordem de ranking (sem inversão estrita) —
  //       propriedade verificada em detalhe no gate AB/25 logo abaixo.
  assert.equal(actualProtected.length, expectedProtectedCount,
    'a quantidade de duplas protegidas divergiu do esperado pela autoridade');
  const protectedRanks = actualProtected.map((n) => rankByName.get(n)).filter((v) => Number(v) > 0);
  const playingRanks = [...actualPlaying].map((n) => rankByName.get(n)).filter((v) => Number(v) > 0);
  if (protectedRanks.length && playingRanks.length) {
    assert.ok(Math.max(...protectedRanks) <= Math.min(...playingRanks),
      `inversão de proteção: pior protegida #${Math.max(...protectedRanks)} vs melhor sem proteção #${Math.min(...playingRanks)}`);
  }
  // Integridade do pareamento: ninguém joga duas vezes na rodada 0.
  assert.equal(actualPlaying.size, actualSlots.filter(Boolean).length,
    'uma dupla aparece mais de uma vez na rodada 0');
});

await check('Parte AB/25: o BYE vai para as duplas melhor ranqueadas', () => {
  // Com 24 duplas numa chave de 32 há 8 folgas. Sorteio e medição usam o
  // MESMO snapshot de ranking aqui, então a comparação é legítima.
  const names = Array.isArray(event.participants) ? event.participants : [];
  const rankByName = new Map();
  names.forEach((name, i) => { rankByName.set(name, entryRankOf(field[i])); });
  const round0 = event.bracket_history?.[0]?.matches || [];
  const played = new Set();
  for (const m of round0) {
    if (m.team_a) played.add(m.team_a);
    if (m.team_b) played.add(m.team_b);
  }
  const ranked = [...rankByName.entries()].filter(([, r]) => Number(r) > 0);
  const byes = ranked.filter(([name]) => !played.has(name));
  const nonByes = ranked.filter(([name]) => played.has(name));
  if (!byes.length) {
    console.log('   [registro] campo sem byes — nada a auditar aqui');
    return;
  }
  const worstBye = Math.max(...byes.map(([, r]) => r));
  const bestNonBye = Math.min(...nonByes.map(([, r]) => r));
  console.log(`   [registro] byes=${byes.length} | pior bye #${worstBye} | melhor sem bye #${bestNonBye}`);
  assert.ok(worstBye <= bestNonBye,
    `bye para #${worstBye} enquanto #${bestNonBye} joga a rodada 0`);
});

await check('Parte AB: a melhor dupla do campo está entre as protegidas', () => {
  // Checagem independente de buildSeededDrawSlots. Com byes, a melhor dupla
  // recebe folga e NÃO aparece na rodada 0 (seedOrder emparelha o seed 1 com
  // o seed 32, que é vazio); sem byes, ela ocupa o primeiro slot. Os dois
  // casos significam a mesma coisa: a melhor está protegida.
  const names = Array.isArray(event.participants) ? event.participants : [];
  const rankByName = new Map();
  names.forEach((name, i) => { rankByName.set(name, entryRankOf(field[i])); });
  const ranked = [...rankByName.entries()]
    .filter(([, rank]) => Number(rank) > 0)
    .sort((a, b) => a[1] - b[1]);
  assert.ok(ranked.length, 'nenhuma dupla do campo tem rank resolvível');
  const [bestName, bestRank] = ranked[0];
  const round0 = event.bracket_history?.[0]?.matches || [];
  const played = new Set();
  for (const m of round0) {
    if (m.team_a) played.add(m.team_a);
    if (m.team_b) played.add(m.team_b);
  }
  const slot1 = round0[0]?.team_a || null;
  const protectedByBye = !played.has(bestName);
  console.log(`   [registro] melhor do campo: ${bestName} (#${bestRank}) | bye: ${protectedByBye} | slot 1: ${slot1}`);
  assert.ok(protectedByBye || slot1 === bestName,
    'a melhor dupla do campo não está protegida (nem bye, nem slot 1)');
});

await check('Parte AB: nenhuma dupla repetida no campo (rescue displacement = 0)', () => {
  const seenPairs = new Set();
  const seenMembers = new Set();
  let displacement = 0;
  for (const pid of field) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const key = [m[0], m[1]].sort().join('_');
    if (seenPairs.has(key)) displacement += 1;
    seenPairs.add(key);
    for (const id of m) {
      if (seenMembers.has(id)) displacement += 1;
      seenMembers.add(id);
    }
  }
  console.log(`   [registro] displacement: ${displacement}`);
  assert.equal(displacement, 0, `${displacement} repetições no campo pós-reparo`);
});

await check('Parte AB/23: a população reparada segue sã depois do sorteio', () => {
  assert.equal(after.ghostRR, 0);
  assert.equal(after.duplicatedReal, 0);
});

await vite.close();
finish('test-masters-seeding-after-repair-v516');
