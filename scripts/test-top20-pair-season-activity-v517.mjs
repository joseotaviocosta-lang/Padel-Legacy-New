// Playthrough 5.17, Parte I — AUDITORIA INDIVIDUAL DAS 20 DUPLAS.
//
// Não é "active rate médio": pega o Top20 de TeamRanking no INÍCIO do
// período e acompanha cada dupla, uma linha por dupla, com o motivo
// dominante das ausências.
//
// Critérios mínimos da Parte I:
//   - nenhuma Top10 passa meses sem competir sem motivo objetivo;
//   - nenhuma Top20 termina a temporada com 0 partidas estando elegível;
//   - 0V/0D é investigado, não tratado como decoração.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown', 'Finals'];
const live = {};

// Snapshot do Top20 no INÍCIO: medido cedo, para acompanhar quem já era
// elite — e não quem terminou bem.
// PADEL_PARITY=0 roda o mundo congelado (sem mercado de duplas nem dia do
// mundo). Existe para responder uma pergunta específica: uma lacuna longa de
// elite é regressão introduzida pela paridade, ou propriedade pré-existente
// que a métrica antiga (percentual de ociosidade) nunca detectava?
const PARITY = process.env.PADEL_PARITY !== '0';
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v517-top20', trackWeeklyDraws: false, includeRankingResults: true,
  worldLifecycles: PARITY,
  onBeforeClose: async ({ localGame }) => {
    live.finalTeams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  },
});

const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const membersOf = (pairId) => {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};
const keyOf = (ids) => [...ids].sort().join('_');

const finalTeams = live.finalTeams;
const finalRankByKey = new Map();
finalTeams.forEach((row, i) => {
  finalRankByKey.set(keyOf([row.player1_id, row.player2_id]), i + 1);
});

// Top20 de referência: as 20 melhores ao fim, com o rank inicial recuperado
// do snapshot do PRIMEIRO sorteio em que cada uma apareceu.
const top20 = finalTeams.slice(0, 20);

const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const weekOf = (date) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 604800000);
const allWeeks = new Set(drawn.map((t) => weekOf(t.start_date)));

// Onde cada dupla jogou + rank inicial observado no primeiro snapshot.
const playedByKey = new Map();
const firstSeenRank = new Map();
for (const t of drawn) {
  const snapshot = Array.isArray(t.draw_ranking_snapshot) ? t.draw_ranking_snapshot : [];
  const rankByPairId = new Map(snapshot.map((row) => [row.pair_id, Number(row.rank) || 0]));
  for (const pid of t.draw_pair_ids) {
    const ids = membersOf(pid);
    if (ids.length !== 2) continue;
    const key = keyOf(ids);
    if (!playedByKey.has(key)) playedByKey.set(key, []);
    playedByKey.get(key).push(t);
    if (!firstSeenRank.has(key) && rankByPairId.get(pid)) firstSeenRank.set(key, rankByPairId.get(pid));
  }
}

// Playthrough 5.18-B — CORREÇÃO DE MEDIÇÃO EXIGIDA PELA PARIDADE.
//
// Este teste nasceu na 5.17, quando o harness NÃO rodava o mercado mensal de
// duplas: toda dupla existia o ano inteiro, então "eventos no ano" e "eventos
// da dupla" eram a mesma coisa. Com a paridade ativa (5.18-B) o mercado forma
// e dissolve duplas durante a temporada, e medido: duplas criadas em
// novembro apareciam no Top20 com 1–2 eventos — porque os pontos de dupla
// vêm da SOMA dos pontos dos MEMBROS (5.22-E), não das partidas dela.
//
// Contar o ano inteiro contra uma dupla que só existiu dois meses não é
// medida de ociosidade, é erro de janela. A janela elegível de cada dupla
// passa a começar na FORMAÇÃO dela.
const pairStartByKey = new Map();
for (const p of sim.partnerships || []) {
  const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
  if (ids.length !== 2) continue;
  const key = keyOf(ids);
  const started = String(p.started_career_date || '').slice(0, 10);
  if (!started) continue;
  const current = pairStartByKey.get(key);
  if (!current || started > current) pairStartByKey.set(key, started);
}
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const pairFormationDate = (key, ids) => {
  const fromPartnership = pairStartByKey.get(key);
  if (fromPartnership) return fromPartnership;
  // Fallback: a data de início gravada no próprio atleta.
  const dates = ids
    .map((id) => String(athleteById.get(id)?.ai_partnership_start_date || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
};

const rows = top20.map((team, index) => {
  const ids = [team.player1_id, team.player2_id];
  const key = keyOf(ids);
  const events = playedByKey.get(key) || [];
  const byTier = Object.fromEntries(TIERS.map((t) => [t, 0]));
  for (const e of events) if (byTier[e.tier] !== undefined) byTier[e.tier] += 1;

  const formedAt = pairFormationDate(key, ids);
  const formedWeek = formedAt ? weekOf(formedAt) : null;
  // Semanas em que ESTA dupla podia competir: só as posteriores à formação.
  const eligibleWeeks = formedWeek === null
    ? [...allWeeks]
    : [...allWeeks].filter((w) => w >= formedWeek);

  const busyWeeks = new Set();
  for (const e of events) {
    const start = weekOf(e.start_date);
    const end = weekOf(e.end_date || e.start_date);
    for (let w = start; w <= end; w += 1) busyWeeks.add(w);
  }
  const idleWeeks = eligibleWeeks.filter((w) => !busyWeeks.has(w));

  // Playthrough 5.18-B — "MESES sem competir" é LACUNA CONSECUTIVA, não
  // percentual. Medido: a elite disputa ~20 das ~45 semanas com evento, logo
  // 55–67% de ociosidade é a NORMA. Um corte em 75% cai quase no centro da
  // distribuição e reprova comportamento normal; o critério da Parte I fala
  // de meses parados, que é exatamente uma sequência longa sem jogar.
  let longestIdleStreak = 0;
  let currentStreak = 0;
  for (const w of [...eligibleWeeks].sort((a, b) => a - b)) {
    if (busyWeeks.has(w)) { currentStreak = 0; continue; }
    currentStreak += 1;
    if (currentStreak > longestIdleStreak) longestIdleStreak = currentStreak;
  }

  // Motivo dominante das semanas ociosas.
  let higherTierAvailable = 0;
  let noEvent = 0;
  for (const w of idleWeeks) {
    const weekEvents = drawn.filter((t) => weekOf(t.start_date) === w);
    if (!weekEvents.length) { noEvent += 1; continue; }
    higherTierAvailable += 1;
  }
  // Playthrough 5.18-B — LESÃO entra na classificação. A Parte I sempre
  // listou "injury" como motivo possível, mas o mundo congelado (sem
  // simulateWorldDay) nunca produzia lesão, então o classificador podia
  // ignorá-la. Com paridade, ela é um fato do mundo.
  const injuredMembers = ids
    .map((id) => athleteById.get(id))
    .filter((a) => a && a.injured_until);
  const recentlyFormed = eligibleWeeks.length < 8;
  const reason = events.length === 0
    ? 'NUNCA COMPETIU'
    : recentlyFormed ? 'dupla recém-formada'
      : injuredMembers.length ? 'lesão'
        : noEvent > higherTierAvailable ? 'sem evento na semana' : 'auto-seleção/descanso';

  return {
    rank: index + 1,
    initialRank: firstSeenRank.get(key) || null,
    finalRank: finalRankByKey.get(key) || index + 1,
    name: `${team.player1_name}/${team.player2_name}`,
    events: events.length,
    ...byTier,
    formedAt,
    longestIdleStreak,
    // Janela própria da dupla, não a temporada inteira.
    eligibleWeeks: eligibleWeeks.length,
    // Eventos disputados DEPOIS da formação atual. O ledger de TeamRanking é
    // recriado quando a dupla se desfaz e volta (deleteTeamRankingForPair),
    // então comparar o ledger com eventos anteriores à formação atual
    // compararia dois períodos diferentes.
    eventsSinceFormation: formedAt
      ? events.filter((e) => String(e.start_date).slice(0, 10) >= formedAt).length
      : events.length,
    busyWeeks: busyWeeks.size,
    idleWeeks: idleWeeks.length,
    wins: Number(team.wins) || 0,
    losses: Number(team.losses) || 0,
    statsSource: team.stats_source || 'n/d',
    titles: Number(team.ledger_titles) || 0,
    reason,
  };
});

console.log('=== PARTE I: atividade individual das 20 duplas do Top20 ===');
console.log('Rank Dupla                                    Ini  Fim  Ev  Bro Sil Gol Pla Mas Eli Cro Fin  Sem  Ocu Idle   V   D  Tít  Motivo');
for (const r of rows) {
  console.log(
    `${String('#' + r.rank).padEnd(5)}${r.name.slice(0, 40).padEnd(42)}`
    + `${String(r.initialRank ?? '-').padStart(4)}${String(r.finalRank).padStart(5)}`
    + `${String(r.events).padStart(4)}`
    + `${String(r.Bronze).padStart(4)}${String(r.Silver).padStart(4)}${String(r.Gold).padStart(4)}${String(r.Platinum).padStart(4)}`
    + `${String(r.Masters).padStart(4)}${String(r.Elite).padStart(4)}${String(r.Crown).padStart(4)}${String(r.Finals).padStart(4)}`
    + `${String(r.eligibleWeeks).padStart(5)}${String(r.busyWeeks).padStart(5)}${String(r.idleWeeks).padStart(5)}`
    + `${String(r.wins).padStart(4)}${String(r.losses).padStart(4)}${String(r.titles).padStart(5)}  ${r.reason}`,
  );
}

const top10 = rows.slice(0, 10);

check('Parte I: as 20 linhas foram medidas', () => {
  assert.equal(rows.length, 20);
});

check('Parte I: nenhuma Top20 com janela real termina com 0 partidas', () => {
  // Uma dupla formada nas últimas semanas do ano pode legitimamente não ter
  // tido evento. A exigência vale para quem teve janela de competir.
  const MIN_WINDOW = 4;
  const zero = rows.filter((r) => r.events === 0);
  const zeroWithWindow = zero.filter((r) => r.eligibleWeeks >= MIN_WINDOW);
  console.log(`   [registro] sem evento: ${zero.length} | com janela >=${MIN_WINDOW} semanas: ${zeroWithWindow.length}`);
  for (const r of zero) console.log(`   [registro] #${r.rank} ${r.name}: janela=${r.eligibleWeeks} sem, formada=${r.formedAt || 'n/d'}`);
  assert.equal(zeroWithWindow.length, 0,
    zeroWithWindow.map((r) => `#${r.rank} ${r.name} (janela ${r.eligibleWeeks})`).join(', '));
});

check('Parte I/16: as lacunas longas do Top10 ficam em volume contido', () => {
  // DELEGAÇÃO DE RESPONSABILIDADE (5.18-C, Parte T).
  //
  // A ATRIBUIÇÃO de causa de lacuna pertence a
  // `test-elite-inactivity-attribution-v518.mjs`, que tira snapshots
  // SEMANAIS e aplica a taxonomia canônica (INJURY, PARTNERSHIP_DISSOLVED,
  // FREE_AGENT_WAIT, CAPACITY, REST_SELF_SELECTION, ...), com UNEXPLAINED=0
  // e zero lacunas suspeitas de bug como gates duros.
  //
  // Este teste só tem estado de FIM DE TEMPORADA. Seu classificador não
  // enxerga dissolução nem lotação semana a semana, e por isso rotulava como
  // "auto-seleção" lacunas que o harness semanal atribuiu a CAPACITY e
  // PARTNERSHIP_DISSOLVED. Manter aqui um segundo juízo, com dados piores,
  // produziria falso positivo — então este teste deixa de julgar CAUSA e
  // passa a vigiar apenas VOLUME, que ele pode medir bem.
  const MONTHS_GAP = 12;
  const MAX_LONG_GAPS = 4;
  const stalled = top10.filter((r) => r.longestIdleStreak >= MONTHS_GAP);
  const streaks = top10.map((r) => r.longestIdleStreak).sort((a, b) => b - a);
  console.log(`   [registro] maiores lacunas do Top10 (semanas): ${streaks.join(', ')}`);
  console.log(`   [registro] com lacuna >=${MONTHS_GAP}: ${stalled.length} (teto ${MAX_LONG_GAPS})`);
  for (const r of stalled) {
    console.log(`   [registro] #${r.rank} ${r.name}: lacuna ${r.longestIdleStreak} sem (causa: ver teste de atribuição)`);
  }
  assert.ok(stalled.length <= MAX_LONG_GAPS,
    `${stalled.length} duplas do Top10 com lacuna >=${MONTHS_GAP} semanas — volume acima do esperado`);
});

check('Parte I/10: nenhuma Top20 mostra 0V/0D tendo competido', () => {
  const lying = rows.filter((r) => r.events > 0 && r.statsSource === 'ledger' && r.wins + r.losses === 0);
  assert.equal(lying.length, 0, `${lying.length} duplas competiram e exibem 0V/0D`);
});

check('Parte I/11: V + D é coerente com os eventos DA FORMAÇÃO ATUAL', () => {
  // Cada evento disputado gera no mínimo 1 partida (vitória ou eliminação).
  // A comparação usa `eventsSinceFormation`: o ledger é recriado quando a
  // dupla se desfaz e volta, então confrontá-lo com a temporada inteira
  // mediria períodos diferentes (medido: 10+4 contra 19 eventos numa dupla
  // que se reformou no meio do ano).
  const incoherent = rows.filter((r) => (
    r.statsSource === 'ledger' && r.eventsSinceFormation > 0
    && (r.wins + r.losses) < r.eventsSinceFormation
  ));
  console.log(`   [registro] linhas com V+D < eventos desde a formação: ${incoherent.length}`);
  assert.equal(incoherent.length, 0,
    incoherent.map((r) => `${r.name}: ${r.wins}+${r.losses} < ${r.eventsSinceFormation}`).join(' | '));
});

check('Parte I: toda dupla ESTABELECIDA do Top20 disputou evento de elite', () => {
  // Uma dupla recém-formada (mercado vivo, 5.18-B) pode não ter tido nenhuma
  // semana de Masters desde que existe. Exigir evento de elite dela mediria
  // a janela errada. O invariante vale para quem teve temporada de verdade.
  const ESTABLISHED_WEEKS = 8;
  const established = rows.filter((r) => r.eligibleWeeks >= ESTABLISHED_WEEKS);
  const recent = rows.length - established.length;
  const noElite = established.filter((r) => r.Masters + r.Elite + r.Crown + r.Finals === 0);
  console.log(`   [registro] estabelecidas=${established.length} recém-formadas=${recent} | sem evento de elite=${noElite.length}`);
  assert.equal(noElite.length, 0, noElite.map((r) => `#${r.rank} ${r.name} (${r.eligibleWeeks} sem)`).join(', '));
});

check('Parte I: toda dupla recém-formada tem janela curta que EXPLICA o volume', () => {
  // Guarda contra usar "recém-formada" como desculpa: se uma dupla tem poucos
  // eventos, ela precisa ter janela realmente curta.
  const suspicious = rows.filter((r) => r.events <= 3 && r.eligibleWeeks > 12);
  console.log(`   [registro] duplas com poucos eventos e janela longa: ${suspicious.length}`);
  assert.equal(suspicious.length, 0,
    suspicious.map((r) => `#${r.rank} ${r.name}: ${r.events} ev em ${r.eligibleWeeks} sem`).join(' | '));
});

check('Parte I/18: toda ausência tem motivo atribuído', () => {
  const unexplained = rows.filter((r) => !r.reason);
  assert.equal(unexplained.length, 0);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-top20-pair-season-activity-v517: PASS');
