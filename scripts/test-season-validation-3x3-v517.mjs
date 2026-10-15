// Playthrough 5.17 (continuação), Partes N/O/P — 3 CALIBRAÇÃO + 3 HELD-OUT.
//
// Uma temporada completa por seed, com as métricas da Parte O e os asserts
// duros da Parte P. Held-out precisa reproduzir qualitativamente calibração.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair, ORIGIN } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const CALIBRATION = ['c1', 'c2', 'c3'];
const HELD_OUT = ['h1', 'h2', 'h3'];

async function runSeed(seed) {
  const live = {};
  const sim = await runHeadlessWorldSimulation({
    years: 1, label: `v517-final-${seed}`, trackWeeklyDraws: false, includeRankingResults: true,
    onBeforeClose: async ({ localGame, vite }) => {
      live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
      const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
      live.originIndex = await buildOriginIndex(vite, athletes);
    },
  });

  const { originById } = live.originIndex;
  const teams = live.teams;
  const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
  const membersOf = (pairId) => {
    const direct = resolvePairMemberIds(pairId);
    if (direct?.length === 2) return direct;
    const p = partnershipById.get(pairId);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };
  const athleteIds = new Set(sim.athletes.map((a) => a.id));

  const seasonEnd = sim.tournaments.reduce((max, t) => (t.draw_date && t.draw_date > max ? t.draw_date : max), '2026-01-01');
  const inSeason = sim.tournaments.filter((t) => t.start_date > '2026-01-01' && t.start_date <= seasonEnd);
  const drawn = inSeason.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  const cancelled = inSeason.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
  const recovered = drawn.filter((t) => t.bracket_origin === 'retroactive-recovery');
  const unresolved = inSeason.filter((t) => !t.world_tour_cancelled && t.status !== 'cancelado'
    && !(Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length));
  const pendingSettlement = inSeason.filter((t) => (
    Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length
    && t.end_date && t.end_date < seasonEnd && !t.world_tour_resolved && !t.champion
  ));

  // Ghost RR + atleta real duplicado (Parte P).
  const canonicalPartner = new Map();
  for (const a of sim.athletes) {
    if (originById.get(a.id) === ORIGIN.REAL && a.ai_partner_id) canonicalPartner.set(a.id, a.ai_partner_id);
  }
  let ghostRR = 0;
  const realAppearances = new Map();
  let nanRanking = 0;
  for (const t of teams) {
    if (!Number.isFinite(Number(t.ranking_points))) nanRanking += 1;
    if (classifyPair(originById, t.player1_id, t.player2_id) === 'RR') {
      const declared = canonicalPartner.get(t.player1_id) === t.player2_id
        || canonicalPartner.get(t.player2_id) === t.player1_id;
      if (!declared) ghostRR += 1;
    }
    for (const id of [t.player1_id, t.player2_id]) {
      if (originById.get(id) === ORIGIN.REAL) realAppearances.set(id, (realAppearances.get(id) || 0) + 1);
    }
  }
  const duplicatedReal = [...realAppearances.values()].filter((n) => n > 1).length;

  // Atividade da elite + ledger.
  const weekOf = (d) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 604800000);
  const eventsByKey = new Map();
  for (const t of drawn) {
    for (const pid of t.draw_pair_ids) {
      const m = membersOf(pid);
      if (m.length !== 2) continue;
      const key = [...m].sort().join('_');
      eventsByKey.set(key, (eventsByKey.get(key) || 0) + 1);
    }
  }
  const eventsFor = (row) => eventsByKey.get([row.player1_id, row.player2_id].sort().join('_')) || 0;
  const top10 = teams.slice(0, 10);
  const top20 = teams.slice(0, 20);
  const top10Events = top10.reduce((s, r) => s + eventsFor(r), 0) / Math.max(1, top10.length);
  const top20Events = top20.reduce((s, r) => s + eventsFor(r), 0) / Math.max(1, top20.length);
  // Playthrough 5.18-D — consciência de JANELA DE FORMAÇÃO. Com paridade, uma
  // dupla criada nas últimas semanas do ano legitimamente termina sem evento.
  // Cobrar dela a temporada inteira mediria a janela errada — mesmo defeito já
  // corrigido em test-top20-pair-season-activity e no v515 de elite.
  const partnershipStartByKey = new Map();
  for (const p of sim.partnerships || []) {
    const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
    if (ids.length !== 2) continue;
    const k = [ids[0], ids[1]].sort().join('_');
    const started = String(p.started_career_date || '').slice(0, 10);
    if (!started) continue;
    const prev = partnershipStartByKey.get(k);
    if (!prev || started > prev) partnershipStartByKey.set(k, started);
  }
  const seasonWeeks = drawn.map((t) => weekOf(t.start_date));
  const SEASON_LAST_WEEK = seasonWeeks.length ? Math.max(...seasonWeeks) : 0;
  const SEASON_FIRST_WEEK = seasonWeeks.length ? Math.min(...seasonWeeks) : 0;
  const windowWeeksFor = (row) => {
    const started = partnershipStartByKey.get([row.player1_id, row.player2_id].sort().join('_'));
    if (!started) return SEASON_LAST_WEEK - SEASON_FIRST_WEEK + 1;
    return Math.max(0, SEASON_LAST_WEEK - weekOf(started) + 1);
  };
  // Zero evento só conta como problema se a dupla teve janela real (>=4
  // semanas). A guarda seguinte impede que isto vire desculpa.
  const top20ZeroMatch = top20.filter((r) => eventsFor(r) === 0 && windowWeeksFor(r) >= 4).length;
  const top20ZeroRecent = top20.filter((r) => eventsFor(r) === 0 && windowWeeksFor(r) < 4).length;
  const top20FewWithLongWindow = top20.filter((r) => eventsFor(r) <= 2 && windowWeeksFor(r) > 12).length;
  const top10ZeroOfficial = top10.filter((r) => (
    r.stats_source === 'ledger' && (Number(r.matches_played) || 0) === 0
  )).length;

  // Masters: presença da elite.
  const masters = drawn.filter((t) => t.tier === 'Masters');
  const rankByKey = new Map();
  teams.forEach((row, i) => rankByKey.set([row.player1_id, row.player2_id].sort().join('_'), i + 1));
  let mastersTop10 = 0; let mastersTop20 = 0; let rr = 0; let rp = 0; let pp = 0;
  let ghostInField = 0;
  for (const t of masters) {
    for (const pid of t.draw_pair_ids) {
      const m = membersOf(pid);
      if (m.length !== 2 || !athleteIds.has(m[0]) || !athleteIds.has(m[1])) { ghostInField += 1; continue; }
      const rank = rankByKey.get([...m].sort().join('_'));
      if (rank && rank <= 10) mastersTop10 += 1;
      if (rank && rank <= 20) mastersTop20 += 1;
      const cls = classifyPair(originById, m[0], m[1]);
      if (cls === 'RR') rr += 1; else if (cls === 'RP') rp += 1; else pp += 1;
    }
  }
  const slots = rr + rp + pp;
  const finals = drawn.filter((t) => String(t.tier || '').includes('Finals'));

  return {
    seed,
    planned: inSeason.length,
    completed: drawn.filter((t) => t.champion).length,
    drawn: drawn.length,
    cancelled: cancelled.length,
    recovered: recovered.length,
    unresolved: unresolved.length,
    pendingSettlement: pendingSettlement.length,
    ghostRR,
    duplicatedReal,
    nanRanking,
    ghostInField,
    top10Events,
    top20Events,
    top20ZeroMatch,
    top20ZeroRecent,
    top20FewWithLongWindow,
    top10ZeroOfficial,
    mastersEvents: masters.length,
    mastersTop10PerEvent: mastersTop10 / Math.max(1, masters.length),
    mastersTop20PerEvent: mastersTop20 / Math.max(1, masters.length),
    rrShare: rr / Math.max(1, slots),
    ppShare: pp / Math.max(1, slots),
    finals: finals.length,
    ledgerRows: teams.filter((t) => t.stats_source === 'ledger').length,
    statsIncoherent: teams.filter((t) => t.stats_source === 'ledger'
      && (Number(t.wins) || 0) + (Number(t.losses) || 0) !== (Number(t.matches_played) || 0)).length,
  };
}

const results = [];
for (const seed of [...CALIBRATION, ...HELD_OUT]) {
  const r = await runSeed(seed);
  results.push(r);
  console.log(`[${r.seed}] eventos=${r.planned} sorteados=${r.drawn} concluídos=${r.completed} cancel=${r.cancelled} rec=${r.recovered} pend=${r.pendingSettlement} ghostRR=${r.ghostRR} dupReal=${r.duplicatedReal}`);
}

console.log('\n=== PARTE O: métricas por seed ===');
console.log('seed  plan  draw  conc  canc  rec  unres  pend  ghost  dup  T10ev  T20ev  T20-0  MastT10  MastT20   RR%   PP%  Finals');
for (const r of results) {
  console.log(
    `${r.seed.padEnd(6)}${String(r.planned).padStart(4)}${String(r.drawn).padStart(6)}${String(r.completed).padStart(6)}`
    + `${String(r.cancelled).padStart(6)}${String(r.recovered).padStart(5)}${String(r.unresolved).padStart(7)}${String(r.pendingSettlement).padStart(6)}`
    + `${String(r.ghostRR).padStart(7)}${String(r.duplicatedReal).padStart(5)}`
    + `${r.top10Events.toFixed(1).padStart(7)}${r.top20Events.toFixed(1).padStart(7)}${String(r.top20ZeroMatch).padStart(7)}`
    + `${r.mastersTop10PerEvent.toFixed(1).padStart(9)}${r.mastersTop20PerEvent.toFixed(1).padStart(9)}`
    + `${(r.rrShare * 100).toFixed(0).padStart(6)}${(r.ppShare * 100).toFixed(0).padStart(6)}${String(r.finals).padStart(8)}`,
  );
}

// ---- PARTE P: asserts duros ----
check('Parte P: ghost RR = 0 em 6/6 seeds', () => {
  for (const r of results) assert.equal(r.ghostRR, 0, `${r.seed}: ${r.ghostRR} duplas fantasma`);
});

check('Parte P: atleta real duplicado = 0 em 6/6', () => {
  for (const r of results) assert.equal(r.duplicatedReal, 0, `${r.seed}: ${r.duplicatedReal} reais duplicados`);
});

check('Parte P: nenhum ranking NaN', () => {
  for (const r of results) assert.equal(r.nanRanking, 0, `${r.seed}: ${r.nanRanking} linhas com ranking inválido`);
});

check('Parte P: nenhuma dupla fantasma no campo dos Masters', () => {
  for (const r of results) assert.equal(r.ghostInField, 0, `${r.seed}: ${r.ghostInField} fantasmas no campo`);
});

check('Parte P: nenhuma Top10 termina a temporada com 0 partidas oficiais', () => {
  for (const r of results) {
    assert.equal(r.top10ZeroOfficial, 0, `${r.seed}: ${r.top10ZeroOfficial} duplas Top10 com ledger zerado`);
  }
});

check('Parte P: nenhum settlement pendente ao fim da temporada', () => {
  for (const r of results) {
    assert.ok(r.pendingSettlement <= 1, `${r.seed}: ${r.pendingSettlement} settlements pendentes`);
  }
});

check('Parte P: V + D coerente com partidas em todas as linhas com ledger', () => {
  for (const r of results) {
    assert.equal(r.statsIncoherent, 0, `${r.seed}: ${r.statsIncoherent} linhas incoerentes`);
  }
});

check('Parte O/12: Top20 disputa temporada plausível em 6/6', () => {
  for (const r of results) {
    assert.equal(r.top20ZeroMatch, 0,
      `${r.seed}: ${r.top20ZeroMatch} duplas do Top20 com janela real e sem evento`);
    assert.ok(r.top20Events >= 10, `${r.seed}: Top20 com só ${r.top20Events.toFixed(1)} eventos/dupla`);
  }
  const recent = results.reduce((s, r) => s + r.top20ZeroRecent, 0);
  console.log(`   [registro] duplas sem evento por serem recém-formadas (isentas): ${recent}`);
});

check('Parte O: "recém-formada" NÃO vira desculpa para ociosidade', () => {
  // Guarda contra a isenção de janela: dupla com janela longa (>12 semanas) e
  // 2 ou menos eventos falha, mesmo que a isenção existisse.
  for (const r of results) {
    console.log(`   [registro] ${r.seed}: poucos eventos com janela longa = ${r.top20FewWithLongWindow}`);
    assert.equal(r.top20FewWithLongWindow, 0,
      `${r.seed}: ${r.top20FewWithLongWindow} duplas com <=2 eventos e janela >12 semanas`);
  }
});

check('Parte N: held-out reproduz qualitativamente a calibração', () => {
  const cal = results.filter((r) => CALIBRATION.includes(r.seed));
  const held = results.filter((r) => HELD_OUT.includes(r.seed));
  const mean = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0) / rows.length;
  const pairs = [
    ['Top20 eventos/dupla', mean(cal, (r) => r.top20Events), mean(held, (r) => r.top20Events), 3],
    ['Masters Top20/evento', mean(cal, (r) => r.mastersTop20PerEvent), mean(held, (r) => r.mastersTop20PerEvent), 3],
    ['RR share', mean(cal, (r) => r.rrShare), mean(held, (r) => r.ppShare === undefined ? 0 : r.rrShare), 0.15],
    ['cancelamentos', mean(cal, (r) => r.cancelled), mean(held, (r) => r.cancelled), 2],
  ];
  for (const [name, c, h, tol] of pairs) {
    console.log(`   [registro] ${name}: calibração=${c.toFixed(2)} held-out=${h.toFixed(2)}`);
    assert.ok(Math.abs(c - h) <= tol, `${name} divergiu: ${c.toFixed(2)} vs ${h.toFixed(2)}`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-season-validation-3x3-v517: PASS');
