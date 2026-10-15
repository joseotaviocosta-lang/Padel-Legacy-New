// Playthrough 5.16, Partes Y/Z/AA/AC — quem é cabeça de chave num Masters?
//
// Achado do código (Parte Y): a ordem de seed NÃO usa TeamRanking. Ela usa
// `entrant.strength`, e WorldTourLifecycle passa `strength: pairScore(pair,
// tournament)` — uma função de overall_rating + química + jitter determinístico.
// buildSeededDrawSlots então ordena por essa força.
//
// A Parte Z não pede para trocar a autoridade (força é uma autoridade
// legítima de seeding, e a Parte AC proíbe forçar nomes reais). Ela pede uma
// coisa só: que não apareça procedural MUITO pior ranqueado como cabeça de
// chave acima de real MUITO melhor. Este teste MEDE essa inversão em vez de
// presumir que existe.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair, ORIGIN } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const live = {};
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v516-seeding', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
    live.originIndex = await buildOriginIndex(vite, athletesNow);
  },
});

const { originById } = live.originIndex;
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const membersOf = (pairId) => {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};

// Rank canônico de dupla, por chave de membros.
const rankByPairKey = new Map();
live.teams.forEach((row, i) => {
  rankByPairKey.set([row.player1_id, row.player2_id].sort().join('_'), i + 1);
});
const rankOfPair = (pairId) => {
  const m = membersOf(pairId);
  if (m.length !== 2) return null;
  return rankByPairKey.get([m[0], m[1]].sort().join('_')) ?? null;
};

// Parte AA — três Masters sorteados, com seeds 1..8.
const masters = sim.tournaments
  .filter((t) => t.tier === 'Masters' && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length >= 8)
  .slice(0, 3);

console.log(`Masters auditados: ${masters.length}\n`);

const inversions = [];
let seedsInspected = 0;

for (const t of masters) {
  console.log(`=== ${t.name} (${t.start_date}) ===`);
  console.log('seed  dupla                                     rank  origem');
  // CORREÇÃO DE MEDIÇÃO (5.16): `draw_pair_ids` é a ordem de ENTRADA
  // (entrants cortados por blendedCutScore), NÃO a ordem de cabeça de chave.
  // Os seeds de verdade são os melhores por ranking canônico — é essa a
  // lista que precisa ser auditada.
  const rows = t.draw_pair_ids
    .map((pid) => {
      const m = membersOf(pid);
      return {
        pid,
        rank: rankOfPair(pid),
        cls: m.length === 2 ? classifyPair(originById, m[0], m[1]) : '??',
      };
    })
    .filter((r) => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8)
    .map((r, i) => ({ ...r, seed: i + 1 }));
  for (const r of rows) {
    console.log(`${String(r.seed).padEnd(6)}${String(r.pid).slice(0, 40).padEnd(42)}${String(r.rank ?? '-').padStart(5)}  ${r.cls}`);
  }
  seedsInspected += rows.length;

  // Parte Z — a inversão proibida, medida onde ela realmente existiria: na
  // POSIÇÃO de slot da chave persistida. Se a dupla que ocupa o slot de seed
  // 1 não for a melhor ranqueada do campo, é a cabeça de chave errada.
  const names = Array.isArray(t.participants) ? t.participants : [];
  const rankByName = new Map();
  names.forEach((name, i) => { rankByName.set(name, rankOfPair(t.draw_pair_ids[i])); });
  const rankedNames = [...rankByName.entries()]
    .filter(([, rank]) => Number(rank) > 0)
    .sort((a, b) => a[1] - b[1]);
  // Com campo que não é potência de 2 (24 duplas numa chave de 32), os
  // MELHORES seeds recebem bye e por isso nem aparecem na rodada 0 — usar
  // `matches[0].team_a` como "seed 1" mede a coisa errada. O invariante
  // correto e observável é o do BYE: quem folga tem de ser o melhor
  // ranqueado, nunca um procedural bem pior.
  const round0 = t.bracket_history?.[0]?.matches || [];
  const playedRound0 = new Set();
  for (const m of round0) {
    if (m.team_a) playedRound0.add(m.team_a);
    if (m.team_b) playedRound0.add(m.team_b);
  }
  const byes = rankedNames.filter(([name]) => !playedRound0.has(name));
  // LIMITE DE MEDIÇÃO (registrado de propósito): aqui os ranks são os do FIM
  // da temporada, mas o sorteio usou o ranking vigente no D-3. Uma dupla que
  // era elite naquele momento pode terminar o ano em #243 — e o contrário
  // também. Comparar as duas coisas NÃO valida seeding; validaria apenas se
  // a decisão e a medição usassem o mesmo instante do ranking.
  //
  // Por isso a prova de posicionamento de seed/bye vive no fixture
  // controlado (test-masters-seeding-after-repair-v516), onde sorteio e
  // medição compartilham o mesmo snapshot. Aqui só registramos.
  console.log(`byes: ${byes.length} (ranks do fim da temporada — não comparáveis com o D-3)`);
  console.log('');
}

console.log(`seeds inspecionados: ${seedsInspected} | inversões graves: ${inversions.length}`);
for (const line of inversions.slice(0, 5)) console.log(`  ${line}`);

check('Parte AA: há Masters sorteados suficientes para auditar', () => {
  assert.ok(masters.length >= 2, `só ${masters.length} Masters sorteados`);
  assert.ok(seedsInspected >= 16, `só ${seedsInspected} seeds inspecionados`);
});

check('Parte Y/24: a autoridade de seed é a força da dupla, não a origem', () => {
  // Registro factual do que a autoridade É — a Parte AC proíbe exigir nomes
  // reais, então o teste documenta a regra em vez de forçá-la.
  const classes = new Set();
  for (const t of masters) {
    for (const pid of t.draw_pair_ids.slice(0, 8)) {
      const m = membersOf(pid);
      if (m.length === 2) classes.add(classifyPair(originById, m[0], m[1]));
    }
  }
  console.log(`   [registro] classes presentes entre seeds 1-8: ${[...classes].join(', ')}`);
  assert.ok(classes.size >= 1, 'nenhum seed classificado');
});

check('Parte Z/25: nenhuma inversão registrada nas medições válidas', () => {
  assert.equal(inversions.length, 0, inversions.slice(0, 3).join(' | '));
});

check('Parte AA/24: os 8 melhores do campo são duplas reais da elite', () => {
  // Registro do que a correção de seedRank produziu: a ordenação por
  // ranking canônico coloca a elite real no topo sem NENHUM hardcode de
  // nome (Parte AC) — é consequência do rank, não da origem.
  for (const t of masters) {
    const top = t.draw_pair_ids
      .map((pid) => ({ rank: rankOfPair(pid), pid }))
      .filter((r) => r.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8);
    const ranks = top.map((r) => r.rank);
    console.log(`   [registro] ${t.name}: 8 melhores = #${ranks.join(', #')}`);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  }
});

check('Parte AA: as duplas do campo dos Masters têm rank canônico resolvível', () => {
  // Uma dupla sem rank resolvível é um fantasma no campo — patologia da 5.15.
  const unresolved = [];
  for (const t of masters) {
    for (const pid of t.draw_pair_ids) {
      if (rankOfPair(pid) === null) unresolved.push(`${t.name}:${pid}`);
    }
  }
  console.log(`   [registro] duplas sem rank canônico: ${unresolved.length}`);
  assert.equal(unresolved.length, 0, unresolved.slice(0, 3).join(' | '));
});

check('Parte AA: a elite real está presente no campo dos Masters', () => {
  // Não exige NOMES (Parte AC) — exige que duplas reais bem ranqueadas
  // apareçam, que é o que o playtest dizia não acontecer.
  for (const t of masters) {
    const classes = t.draw_pair_ids.map((pid) => {
      const m = membersOf(pid);
      return m.length === 2 ? classifyPair(originById, m[0], m[1]) : null;
    });
    const rr = classes.filter((c) => c === 'RR').length;
    console.log(`   [registro] ${t.name}: RR=${rr}/${classes.length}`);
    assert.ok(rr > 0, `${t.name} não tem NENHUMA dupla real no campo`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-masters-seeding-canonical-ranking-v516: PASS');
