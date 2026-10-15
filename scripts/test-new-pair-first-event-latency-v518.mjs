// Playthrough 5.18-F, Partes A/G/H — LATÊNCIA ATÉ O PRIMEIRO EVENTO.
//
// A 5.18-E corrigiu o mercado inerte (uma dupla se forma em 1 mês, não em
// 8,5) mas registrou a dívida: a dupla formada seguia 12 meses com 0 torneios.
// A hipótese era "o ciclo pontos->rank->seleção segue fechado". Este teste
// mede isso sobre a POPULAÇÃO REAL, não sobre um fixture: toda dupla que
// nasce durante a simulação é acompanhada da semana em que passa a existir
// até a semana em que aparece num sorteio pela primeira vez.
//
// Por que não um fixture injetado: um par artificial responde só pelo seu
// próprio caso e não distingue "esta dupla é fraca" de "toda dupla nova fica
// presa". O censo separa as duas leituras por faixa de OVR (Parte H).
import assert from 'node:assert/strict';
import { runPipelineInstrumentedRun } from './lib/selectionPipelineHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runPipelineInstrumentedRun({ label: 'first-event', years: 1, cohortSize: 10, census: true });
const weeks = run.weekly.filter((w) => Array.isArray(w.census));
assert.ok(weeks.length > 0, 'censo vazio — instrumentação cega');

// --- monta o histórico de cada dupla ---------------------------------------
const pairsSeen = new Map(); // pid -> { firstWeekIndex, weeksAlive, firstPlayedIndex, ... }
weeks.forEach((snap, idx) => {
  for (const c of snap.census) {
    let rec = pairsSeen.get(c.pid);
    if (!rec) {
      rec = {
        pid: c.pid, key: c.key, name: c.name, firstIdx: idx, lastIdx: idx,
        weeksAlive: 0, firstPlayedIdx: null, events: 0,
        ovrAtBirth: c.ovr, ageAtBirth: c.age, rankedMembersAtBirth: c.ranked_members,
        entryRankAtBirth: c.entry_rank, teamPointsAtBirth: c.team_points,
        teamMatchesAtBirth: c.team_matches ?? 0, teamOriginAtBirth: c.team_origin || null,
        statsSourceAtBirth: c.team_stats_source || null,
        memberPointsAtBirth: (c.member_points_a ?? 0) + (c.member_points_b ?? 0),
      };
      pairsSeen.set(c.pid, rec);
    }
    rec.lastIdx = idx;
    rec.weeksAlive += 1;
    if (c.played) {
      rec.events += 1;
      if (rec.firstPlayedIdx === null) rec.firstPlayedIdx = idx;
    }
  }
});

// Duplas NOVAS = as que não existiam na primeira semana observada (as do
// primeiro snapshot são o seed do mundo, não nascem durante a run).
const newPairs = [...pairsSeen.values()].filter((p) => p.firstIdx > 0);
const seedPairs = [...pairsSeen.values()].filter((p) => p.firstIdx === 0);

console.log(`\n=== Censo: ${pairsSeen.size} duplas | ${seedPairs.length} do seed | ${newPairs.length} formadas durante a run ===\n`);

const latency = (p) => (p.firstPlayedIdx === null ? null : p.firstPlayedIdx - p.firstIdx);
const withEvent = newPairs.filter((p) => p.firstPlayedIdx !== null);
const withoutEvent = newPairs.filter((p) => p.firstPlayedIdx === null);
// Só conta como "presa" quem teve tempo real de jogar: >=20 semanas de vida.
const matureWithout = withoutEvent.filter((p) => p.weeksAlive >= 20);

const lat = withEvent.map(latency).sort((a, b) => a - b);
const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);

console.log('Latência até o primeiro sorteio (duplas novas que chegaram a jogar):');
console.log(`  n=${lat.length} | mediana=${pct(lat, 0.5)} sem | p90=${pct(lat, 0.9)} sem | máx=${lat[lat.length - 1]} sem`);
console.log(`Duplas novas SEM nenhum evento: ${withoutEvent.length} (com >=20 semanas de vida: ${matureWithout.length})\n`);

// --- Parte H: por faixa de OVR e de ranking --------------------------------
const buckets = [
  { label: 'OVR <70 (baixo)', test: (p) => p.ovrAtBirth < 70 },
  { label: 'OVR 70-79 (médio)', test: (p) => p.ovrAtBirth >= 70 && p.ovrAtBirth < 80 },
  { label: 'OVR >=80 (alto)', test: (p) => p.ovrAtBirth >= 80 },
  { label: 'jovens (idade <=23)', test: (p) => p.ageAtBirth <= 23 },
  { label: 'veteranos (idade >=32)', test: (p) => p.ageAtBirth >= 32 },
  { label: 'ambos sem rank individual', test: (p) => p.rankedMembersAtBirth === 0 },
  { label: 'um rankeado + um sem rank', test: (p) => p.rankedMembersAtBirth === 1 },
  { label: 'ambos rankeados', test: (p) => p.rankedMembersAtBirth === 2 },
];
console.log('Parte H — estreia por perfil (só duplas com >=20 semanas de vida):');
for (const b of buckets) {
  const pool = newPairs.filter((p) => b.test(p) && p.weeksAlive >= 20);
  const played = pool.filter((p) => p.firstPlayedIdx !== null);
  const l = played.map(latency).sort((a, b2) => a - b2);
  console.log(`  ${b.label.padEnd(30)} n=${String(pool.length).padStart(3)} estrearam=${String(played.length).padStart(3)} (${pool.length ? Math.round((played.length / pool.length) * 100) : 0}%) mediana=${pct(l, 0.5) ?? '—'} sem`);
}
console.log('');

check('Parte G: o censo observou duplas formadas durante a simulação', () => {
  note(`duplas novas observadas=${newPairs.length}`);
  assert.ok(newPairs.length >= 10, `só ${newPairs.length} duplas novas — amostra insuficiente para concluir`);
});

check('Parte A/G: dupla nova madura (>=20 semanas) estreia no circuito', () => {
  const mature = newPairs.filter((p) => p.weeksAlive >= 20);
  const stuck = mature.filter((p) => p.firstPlayedIdx === null);
  const rate = mature.length ? stuck.length / mature.length : 0;
  note(`duplas novas com >=20 semanas de vida=${mature.length} | nunca estrearam=${stuck.length} (${Math.round(rate * 100)}%)`);
  for (const p of stuck.slice(0, 8)) {
    note(`  presa: ${p.name} | OVR ${p.ovrAtBirth} | entryRank ${p.entryRankAtBirth} | ${p.weeksAlive} semanas viva`);
  }
  // Gate derivado do significado: "limbo algorítmico" é uma dupla que existe
  // por 20+ semanas e nunca é sorteada. Tolera-se uma minoria (o circuito tem
  // mais duplas que vagas — nem toda dupla joga toda semana), mas não a
  // maioria. O corte é a distribuição, não um alvo escolhido a posteriori.
  assert.ok(rate <= 0.5, `${Math.round(rate * 100)}% das duplas novas maduras nunca estrearam`);
});

check('Parte Z item 5: nenhuma dupla nova ativa fica o ano inteiro com 0 eventos', () => {
  const fullYear = newPairs.filter((p) => p.weeksAlive >= 40 && p.firstPlayedIdx === null);
  note(`duplas com >=40 semanas de vida e 0 eventos: ${fullYear.length}`);
  for (const p of fullYear.slice(0, 10)) {
    note(`  ${p.name} | OVR ${p.ovrAtBirth} | entryRank ${p.entryRankAtBirth} | ${p.weeksAlive} sem`);
  }
  assert.equal(fullYear.length, 0, `${fullYear.length} duplas com ano inteiro de vida e 0 eventos`);
});

check('Parte C: a estreia não vem de pontos artificiais', () => {
  // A 1ª versão desta asserção contava toda dupla nova com pontos>0 antes do
  // primeiro evento e acusava 29 casos. Estava errada: ela confundia
  // "parceria nova" com "dupla nova". Dois atletas que já foram parceiros,
  // separaram e voltaram a jogar juntos reencontram a MESMA linha de
  // TeamRanking, com os pontos que eles próprios conquistaram — herança
  // legítima, não inflação.
  //
  // Esta asserção errou TRÊS vezes antes de eu ler o modelo de dados, e as
  // três leituras erradas estão registradas porque cada uma media uma coisa
  // que não era ponto artificial:
  //   1ª: "pontos>0 ao nascer" -> 29 casos. Contava dupla RE-formada, que
  //       reencontra a própria linha com os pontos que ela conquistou.
  //   2ª: "+ matches_played===0" -> 57 casos. Contava as 500 linhas do SEED,
  //       que nascem com pontos e 0 partidas: é a posição de largada.
  //   3ª: "+ sem origem de seed" -> 39 casos. Contava a FÓRMULA CANÔNICA
  //       (circuitLifecycle.js): a dupla de IA recebe a SOMA dos pontos
  //       INDIVIDUAIS dos membros (regra vigente desde a 5.22-E; antes era a
  //       média geométrica), marcada `stats_source: 'unavailable'` — pontos
  //       que traçam para resultados reais deles.
  //
  // A propriedade que de fato interessa, e que nenhuma das três media: uma
  // dupla cujos DOIS membros não têm ponto nenhum não pode ter pontos. É o
  // único caso em que não há resultado real em lugar algum da cadeia.
  const seeded = (p) => String(p.teamOriginAtBirth || '').startsWith('seed');
  const withPoints = newPairs.filter((p) => p.teamPointsAtBirth > 0);
  const fromLedger = withPoints.filter((p) => p.teamMatchesAtBirth > 0);
  const fromSeed = withPoints.filter((p) => p.teamMatchesAtBirth === 0 && seeded(p));
  // Sob a soma, `memberPointsAtBirth > 0` basta: 0 + x = x, então um único
  // membro com resultado real já justifica os pontos da dupla.
  const fromFormula = withPoints.filter((p) => p.teamMatchesAtBirth === 0 && !seeded(p) && p.memberPointsAtBirth > 0);
  const artificial = withPoints.filter((p) => (
    p.teamMatchesAtBirth === 0 && !seeded(p) && p.memberPointsAtBirth === 0
  ));
  note(`duplas novas com pontos>0 ao nascer: ${withPoints.length}`);
  note(`  ledger próprio da dupla (partidas>0): ${fromLedger.length}`);
  note(`  posição de largada do mundo (origin seed): ${fromSeed.length}`);
  note(`  fórmula canônica sobre pontos reais dos membros: ${fromFormula.length}`);
  note(`  SEM resultado em lugar nenhum da cadeia (artificiais): ${artificial.length}`);
  for (const p of artificial.slice(0, 8)) {
    note(`  ARTIFICIAL: ${p.name} | ${p.teamPointsAtBirth} pts | membros somam 0 pts | stats_source=${p.statsSourceAtBirth}`);
  }
  assert.equal(artificial.length, 0, `${artificial.length} duplas com pontos sem nenhum resultado na cadeia`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
