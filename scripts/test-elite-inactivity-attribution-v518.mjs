// Playthrough 5.18-C, Partes C/D/E/G — ATRIBUIÇÃO DAS LACUNAS DA ELITE.
//
// A 5.18-B encontrou duas duplas Top10 com 13 e 15 semanas consecutivas sem
// competir e não conseguiu dizer por quê: `injured_until` no snapshot final
// não explica uma lesão de abril. Aqui cada semana ociosa recebe UMA causa
// primária, a partir de snapshots semanais reais.
//
// Regra de ouro desta fase: NENHUM sistema é retunado antes da atribuição.
// UNEXPLAINED é falha do teste, não desculpa.
import assert from 'node:assert/strict';
import {
  runInstrumentedSeason, classifyIdleWeek, findIdleGaps, IDLE_CAUSES, weekOf, pairKey,
} from './lib/eliteInactivityHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const GAP_THRESHOLD = 12;

const sim = await runInstrumentedSeason({ label: 'attrib', years: 1, cohortSize: 20 });

// Eventos sorteados por semana.
const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const cancelled = sim.tournaments.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
const eventsByWeek = new Map();
for (const t of drawn) {
  const w = weekOf(t.start_date);
  if (!eventsByWeek.has(w)) eventsByWeek.set(w, []);
  eventsByWeek.get(w).push(t);
}
const cancelledWeeks = new Set(cancelled.map((t) => weekOf(t.start_date)));

// Resolve membros de um pair id do draw.
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const membersOf = (pid) => {
  const raw = String(pid);
  if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
  const p = partnershipById.get(raw);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};

// Semanas em que cada dupla efetivamente competiu (ocupação por janela).
const busyByKey = new Map();
for (const t of drawn) {
  for (const pid of t.draw_pair_ids) {
    const ids = membersOf(pid);
    if (ids.length !== 2) continue;
    const key = pairKey(ids[0], ids[1]);
    if (!busyByKey.has(key)) busyByKey.set(key, new Set());
    const s = weekOf(t.start_date);
    const e = weekOf(t.end_date || t.start_date);
    for (let w = s; w <= e; w += 1) busyByKey.get(key).add(w);
  }
}

// Monta a linha do tempo semanal de cada dupla do cohort inicial (Parte E,
// Cohort A — sem survivor bias).
const timelines = sim.cohortStart.map((entry) => {
  const busy = busyByKey.get(entry.key) || new Set();
  const weeks = sim.weeklySnapshots.map((snap) => {
    const obs = snap.cohortStart.find((o) => o.key === entry.key);
    const observation = obs ? { ...obs, week: snap.week } : null;
    const weekEvents = eventsByWeek.get(snap.week) || [];
    const rank = observation?.team_rank || 9999;
    const eligibleEvents = weekEvents.filter((t) => {
      try { return sim.evaluateTournamentEntry(t, { rank, teamRank: rank }).eligible; }
      catch { return false; }
    });
    const played = busy.has(snap.week);
    return {
      week: snap.week,
      date: snap.date,
      played,
      observation,
      cause: played ? null : classifyIdleWeek({
        observation,
        weekEvents,
        eligibleEvents,
        cancelledThatWeek: cancelledWeeks.has(snap.week),
      }),
    };
  });
  return { ...entry, weeks, gaps: findIdleGaps(weeks) };
});

// --- Agregado de causas ----------------------------------------------------
const causeTotals = {};
for (const t of timelines) {
  for (const w of t.weeks) {
    if (w.played || !w.cause) continue;
    causeTotals[w.cause] = (causeTotals[w.cause] || 0) + 1;
  }
}

console.log('=== PARTE B: causas de semana ociosa (Top20 inicial, temporada) ===');
const totalIdle = Object.values(causeTotals).reduce((a, b) => a + b, 0);
for (const [cause, n] of Object.entries(causeTotals).sort((a, b) => b[1] - a[1])) {
  console.log(`${cause.padEnd(26)}${String(n).padStart(5)}  (${((n / Math.max(1, totalIdle)) * 100).toFixed(0)}%)`);
}

// --- Lacunas longas -------------------------------------------------------
const longGaps = [];
for (const t of timelines) {
  for (const g of t.gaps) {
    if (g.length >= GAP_THRESHOLD) longGaps.push({ pair: t, gap: g });
  }
}

console.log(`\n=== PARTE C: lacunas >= ${GAP_THRESHOLD} semanas ===`);
console.log(`total: ${longGaps.length}`);
for (const { pair, gap } of longGaps) {
  const causes = {};
  for (const w of gap.weeks) causes[w.cause] = (causes[w.cause] || 0) + 1;
  const dominant = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
  console.log(`\n#${pair.initialRank} ${pair.name} — lacuna de ${gap.length} semanas`);
  console.log(`  causas: ${Object.entries(causes).map(([c, n]) => `${c}×${n}`).join(', ')}`);
  console.log(`  dominante: ${dominant[0]} (${dominant[1]}/${gap.length})`);
  // Linha do tempo compacta (Parte C pede a timeline).
  const timeline = gap.weeks.map((w) => {
    const o = w.observation || {};
    const flags = [
      o.partnership_active ? 'P' : '-',
      (o.member_a_injured || o.member_b_injured) ? 'I' : '-',
      (o.free_agent_a || o.free_agent_b) ? 'F' : '-',
    ].join('');
    return `W${w.week % 1000}:${flags}`;
  });
  console.log(`  timeline (P=parceria I=lesão F=livre): ${timeline.join(' ')}`);
}

// --- Parte E: Cohort B (Top10 observado por semana) -----------------------
let cohortBIdle = 0;
let cohortBWeeks = 0;
for (const [week, keys] of sim.weeklyTopN) {
  const top10 = keys.slice(0, 10);
  for (const key of top10) {
    cohortBWeeks += 1;
    const busy = busyByKey.get(key) || new Set();
    if (!busy.has(week)) cohortBIdle += 1;
  }
}
console.log(`\n=== PARTE E: Cohort B (Top10 por semana) ===`);
console.log(`semanas-dupla observadas=${cohortBWeeks} ociosas=${cohortBIdle} (${((cohortBIdle / Math.max(1, cohortBWeeks)) * 100).toFixed(0)}%)`);

check('Parte A: a instrumentação semanal produziu snapshots', () => {
  console.log(`   [registro] snapshots=${sim.weeklySnapshots.length} duplas no cohort=${sim.cohortStart.length}`);
  assert.ok(sim.weeklySnapshots.length >= 50, `só ${sim.weeklySnapshots.length} snapshots semanais`);
  assert.equal(sim.cohortStart.length, 20);
});

check('Parte B: TODA semana ociosa recebeu causa primária', () => {
  let missing = 0;
  for (const t of timelines) {
    for (const w of t.weeks) {
      if (!w.played && !w.cause) missing += 1;
    }
  }
  assert.equal(missing, 0, `${missing} semanas ociosas sem causa`);
});

check('Parte B/8: nenhuma semana ociosa é UNEXPLAINED', () => {
  const n = causeTotals[IDLE_CAUSES.UNEXPLAINED] || 0;
  console.log(`   [registro] UNEXPLAINED=${n} de ${totalIdle} semanas ociosas`);
  assert.equal(n, 0, `${n} semanas sem explicação`);
});

check('Parte B: OTHER não é depósito genérico', () => {
  const n = causeTotals[IDLE_CAUSES.OTHER] || 0;
  assert.ok(n / Math.max(1, totalIdle) < 0.05, `${n} semanas em OTHER (${((n / totalIdle) * 100).toFixed(0)}%)`);
});

check('Parte C/G: nenhuma lacuna longa fica sem causa dominante atribuída', () => {
  const unattributed = longGaps.filter(({ gap }) => {
    const causes = {};
    for (const w of gap.weeks) causes[w.cause] = (causes[w.cause] || 0) + 1;
    const dominant = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
    return !dominant || dominant[0] === IDLE_CAUSES.UNEXPLAINED;
  });
  console.log(`   [registro] lacunas >=${GAP_THRESHOLD}: ${longGaps.length} | sem causa dominante: ${unattributed.length}`);
  assert.equal(unattributed.length, 0);
});

check('Parte G: nenhuma lacuna longa é BUG (dupla ativa+saudável+evento+vaga)', () => {
  // Critério da Parte G: só é bug se, durante parte SUBSTANCIAL da lacuna, a
  // dupla estava ativa, saudável, com evento elegível e vaga — ou seja,
  // REST_SELF_SELECTION repetido por muitas semanas sem nenhuma restrição.
  const SUBSTANTIAL = 0.6;
  const suspicious = longGaps.filter(({ gap }) => {
    const selfSelected = gap.weeks.filter((w) => w.cause === IDLE_CAUSES.REST_SELF_SELECTION).length;
    return selfSelected / gap.length >= SUBSTANTIAL;
  });
  for (const { pair, gap } of suspicious) {
    const n = gap.weeks.filter((w) => w.cause === IDLE_CAUSES.REST_SELF_SELECTION).length;
    console.log(`   [SUSPEITO] #${pair.initialRank} ${pair.name}: ${n}/${gap.length} semanas de auto-seleção pura`);
  }
  console.log(`   [registro] lacunas suspeitas de bug: ${suspicious.length}/${longGaps.length}`);
  assert.equal(suspicious.length, 0,
    suspicious.map(({ pair, gap }) => `#${pair.initialRank} ${pair.name} (${gap.length}sem)`).join(' | '));
});

check('Parte D: dupla dissolvida NÃO acumula idle como se existisse', () => {
  // A janela de atividade é [partnership_start, partnership_end]. Semanas em
  // que a dupla não existe são classificadas como dissolução/free agent, não
  // como ociosidade da dupla.
  const dissolvedCauses = (causeTotals[IDLE_CAUSES.PARTNERSHIP_DISSOLVED] || 0)
    + (causeTotals[IDLE_CAUSES.FREE_AGENT_WAIT] || 0);
  console.log(`   [registro] semanas atribuídas a dissolução/espera: ${dissolvedCauses}`);
  // Se o mercado roda, é esperado que exista massa aqui — isso prova que o
  // classificador não está creditando essas semanas à dupla como descanso.
  assert.ok(dissolvedCauses > 0, 'nenhuma semana atribuída a dissolução — o mercado não rodou?');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-elite-inactivity-attribution-v518: PASS');
