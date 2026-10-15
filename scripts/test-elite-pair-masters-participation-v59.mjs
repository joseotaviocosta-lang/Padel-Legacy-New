// Playthrough 5.9, BUG 6 + Partes 9/10 — "Galán/Chingotto, dupla #2, não
// estavam na chave do Toronto Champions Masters".
//
// O briefing é explícito: NÃO assumir bug. Este teste mede, numa temporada
// real, a taxa de participação de elite POR DISPONIBILIDADE:
//   eliteParticipationRate = eventosDisputados / eventosElegíveisEDisponíveis
// e, para cada Masters em que uma dupla do Top10 NÃO entrou, registra o
// motivo verificável (não elegível / comprometida em outro torneio na mesma
// janela / simplesmente preterida no corte de campo).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_ELITE59_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'elite-masters-v59', trackWeeklyDraws: false });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

const ELITE_TIERS = ['Masters', 'Elite', 'Crown'];
const resolved = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= (bEnd || bStart) && bStart <= (aEnd || aStart);
}
const endOf = (t) => t.end_date || t.start_date;

// Duplas nomeadas + Top10 por rank final.
const NAMED = [[/gal[aá]n/i, /chingotto/i], [/coello/i, /tapia/i], [/stupa/i, /yanguas/i]];
const namedPairs = NAMED.map(([ra, rb]) => {
  const a = sim.athletes.find((x) => ra.test(x.name || ''));
  const b = sim.athletes.find((x) => rb.test(x.name || ''));
  return a && b ? { label: `${a.name} & ${b.name}`, ids: [a.id, b.id] } : null;
}).filter(Boolean);

const top10Ids = new Set([...sim.athletes]
  .filter((a) => Number(a.ranking_position) > 0)
  .sort((a, b) => a.ranking_position - b.ranking_position)
  .slice(0, 10).map((a) => a.id));

function pairPlayed(tournament, ids) {
  return tournament.draw_pair_ids.some((pairId) => {
    const members = canonicalPairAthleteIds(pairId, partnershipById);
    return ids.every((id) => members.includes(id));
  });
}
function pairPlayedAnyOf(tournaments, ids) {
  return tournaments.filter((t) => pairPlayed(t, ids));
}

console.log(`=== Parte 9/10: participação de elite (${years} temporada(s), ${resolved.length} torneios resolvidos) ===\n`);

const eliteEvents = resolved.filter((t) => ELITE_TIERS.includes(t.tier));
const mastersEvents = resolved.filter((t) => t.tier === 'Masters');
console.log(`eventos de elite resolvidos: Masters=${mastersEvents.length} Elite=${resolved.filter((t) => t.tier === 'Elite').length} Crown=${resolved.filter((t) => t.tier === 'Crown').length}`);

// --- Auditoria nomeada (o caso do playtest) ---
for (const pair of namedPairs) {
  const playedElite = pairPlayedAnyOf(eliteEvents, pair.ids);
  const playedAll = pairPlayedAnyOf(resolved, pair.ids);
  const ranks = pair.ids.map((id) => athleteById.get(id)?.ranking_position).join('/');
  console.log(`\n${pair.label} (rank ${ranks}): ${playedAll.length} torneios no ano | ${playedElite.length}/${eliteEvents.length} eventos de elite`);

  const missed = eliteEvents.filter((t) => !pairPlayed(t, pair.ids));
  for (const event of missed.slice(0, 6)) {
    // Por que faltou? Estava comprometida em outro torneio na mesma janela?
    const conflicting = playedAll.find((other) => other.id !== event.id
      && overlaps(event.start_date, endOf(event), other.start_date, endOf(other)));
    const reason = conflicting
      ? `jogou ${conflicting.name} (${conflicting.tier}) na MESMA janela ${conflicting.start_date}..${endOf(conflicting)}`
      : 'sem torneio concorrente na janela — preterida no corte de campo ou não elegível';
    console.log(`   faltou: ${event.name} (${event.tier}, ${event.start_date}) -> ${reason}`);
  }
}

// --- Métrica agregada Top10 (Parte 10) ---
let eligibleAvailable = 0; let playedCount = 0;
const top10Pairs = new Map();
for (const tournament of resolved) {
  for (const pairId of tournament.draw_pair_ids) {
    const members = canonicalPairAthleteIds(pairId, partnershipById);
    if (members.some((id) => top10Ids.has(id))) top10Pairs.set(pairId, members);
  }
}
for (const [, members] of top10Pairs) {
  const playedAll = pairPlayedAnyOf(resolved, members);
  for (const event of eliteEvents) {
    const busy = playedAll.some((other) => other.id !== event.id && overlaps(event.start_date, endOf(event), other.start_date, endOf(other)));
    const didPlay = pairPlayed(event, members);
    if (didPlay) { playedCount += 1; eligibleAvailable += 1; continue; }
    if (!busy) eligibleAvailable += 1; // disponível e não jogou
  }
}
const rate = eligibleAvailable ? (playedCount / eligibleAvailable) * 100 : null;
console.log(`\n=== eliteParticipationRate (Top10) ===`);
console.log(`duplas Top10 identificadas: ${top10Pairs.size} | eventos de elite: ${eliteEvents.length}`);
console.log(`disputados=${playedCount} elegíveis&disponíveis=${eligibleAvailable} taxa=${rate?.toFixed(1)}%`);

check('amostra real (existem eventos de elite e duplas Top10 no mundo simulado)', () => {
  assert.ok(eliteEvents.length > 0, 'nenhum evento de elite resolvido');
  assert.ok(top10Pairs.size > 0, 'nenhuma dupla Top10 identificada');
});

check('Parte 10: eliteParticipationRate do Top10 NÃO é zero (detecta ausência sistemática)', () => {
  assert.ok(rate > 0, `taxa=${rate}`);
});

check('Parte 10: eliteParticipationRate do Top10 não é absurdamente baixa (piso de sanidade 40%)', () => {
  assert.ok(rate >= 40, `taxa=${rate?.toFixed(1)}% — elite estaria preterindo eventos de elite sistematicamente`);
});

check('Parte 9: cada dupla nomeada do topo participa de ao menos 1 evento de elite no ano', () => {
  for (const pair of namedPairs) {
    const playedElite = pairPlayedAnyOf(eliteEvents, pair.ids);
    assert.ok(playedElite.length > 0, `${pair.label} não jogou NENHUM evento de elite no ano`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-elite-pair-masters-participation-v59: PASS');
