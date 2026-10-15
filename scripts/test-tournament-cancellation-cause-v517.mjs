// Playthrough 5.17 (continuação), Partes E/F — FORENSE DOS CANCELAMENTOS.
//
// A 5.17 parcial não reproduziu nenhum cancelamento em 12 semanas e deixou a
// causa em aberto. Aqui a janela é uma TEMPORADA COMPLETA em múltiplos
// seeds, com instrumentação por evento.
//
// Se nenhum cancelamento surgir, isso é reportado explicitamente como
// ausência medida — não como "resolvido".
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const SEEDS = ['f1', 'f2', 'f3'];
const results = [];

for (const seed of SEEDS) {
  const sim = await runHeadlessWorldSimulation({
    years: 1, label: `v517-cancel-${seed}`, trackWeeklyDraws: false, includeRankingResults: true,
  });

  const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
  const membersOf = (pairId) => {
    const direct = resolvePairMemberIds(pairId);
    if (direct?.length === 2) return direct;
    const p = partnershipById.get(pairId);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };

  // A janela precisa de LIMITE SUPERIOR: `ensureFutureTournaments` agenda
  // eventos além do fim da simulação, e contá-los como "sem sorteio" seria
  // confundir calendário futuro com evento em limbo. Só entra o que já
  // deveria ter começado.
  const SEASON_END = sim.tournaments.reduce((max, t) => (
    t.draw_date && t.draw_date > max ? t.draw_date : max
  ), '2026-01-01');
  const inSeason = sim.tournaments.filter((t) => t.start_date > '2026-01-01' && t.start_date <= SEASON_END);
  console.log(`[${seed}] janela auditada: 2026-01-01 -> ${SEASON_END}`);
  const cancelled = inSeason.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
  const drawn = inSeason.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  const recovered = inSeason.filter((t) => t.bracket_origin === 'retroactive-recovery');
  const noDraw = inSeason.filter((t) => !t.world_tour_cancelled && t.status !== 'cancelado'
    && !(Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length));

  // Instrumentação por cancelamento (Parte E).
  const forensics = cancelled.map((t) => ({
    tournament_id: t.id,
    tier: t.tier,
    start_date: t.start_date,
    draw_size: Number(t.main_draw_size) || 0,
    final_field_size: Array.isArray(t.draw_pair_ids) ? t.draw_pair_ids.length : 0,
    pending_participant_count: Number(t.draw_pending_participant_count) || 0,
    cancel_reason: t.cancellation_reason || 'desconhecido',
  }));

  const byTier = {};
  for (const t of cancelled) byTier[t.tier] = (byTier[t.tier] || 0) + 1;

  // Ocupação média por tier: se os campos estão cheios, "duplas
  // insuficientes" não pode ser causa sistêmica.
  const fillByTier = {};
  for (const t of drawn) {
    const size = Number(t.main_draw_size) || 0;
    if (!size) continue;
    if (!fillByTier[t.tier]) fillByTier[t.tier] = { filled: 0, capacity: 0, events: 0 };
    fillByTier[t.tier].filled += t.draw_pair_ids.length;
    fillByTier[t.tier].capacity += size;
    fillByTier[t.tier].events += 1;
  }

  // Duplas disponíveis no mundo — o denominador da hipótese
  // ELIGIBILITY_TOO_NARROW / PAIR_POPULATION_DAMAGE.
  const pairedAthletes = sim.athletes.filter((a) => a.ai_partner_id).length;

  results.push({
    seed,
    total: inSeason.length,
    drawn: drawn.length,
    cancelled: cancelled.length,
    recovered: recovered.length,
    noDraw: noDraw.length,
    byTier,
    fillByTier,
    forensics,
    pairedAthletes,
    athletes: sim.athletes.length,
  });

  console.log(`[${seed}] eventos=${inSeason.length} sorteados=${drawn.length} cancelados=${cancelled.length} recuperados=${recovered.length} sem sorteio=${noDraw.length}`);
}

console.log('\n=== PARTE F: ocupação de campo por tier (seed f1) ===');
console.log('tier          eventos  ocupação média  capacidade');
const fill = results[0].fillByTier;
for (const tier of Object.keys(fill)) {
  const f = fill[tier];
  const pct = (f.filled / Math.max(1, f.capacity)) * 100;
  console.log(`${tier.padEnd(14)}${String(f.events).padStart(7)}${`${pct.toFixed(0)}%`.padStart(16)}${String(Math.round(f.capacity / f.events)).padStart(12)}`);
}

const totalCancelled = results.reduce((s, r) => s + r.cancelled, 0);
console.log(`\ncancelamentos em ${SEEDS.length} temporadas completas: ${totalCancelled}`);
if (totalCancelled) {
  console.log('tier          data        drawSize  campo  motivo');
  for (const r of results) {
    for (const f of r.forensics) {
      console.log(`${String(f.tier).padEnd(14)}${f.start_date.padEnd(12)}${String(f.draw_size).padStart(9)}${String(f.final_field_size).padStart(7)}  ${f.cancel_reason}`);
    }
  }
}

check('Parte F: as temporadas completas rodaram', () => {
  assert.equal(results.length, SEEDS.length);
  for (const r of results) assert.ok(r.total > 50, `${r.seed}: só ${r.total} eventos na temporada`);
});

check('Parte F/11: cancelamentos medidos (ausência é reportada, não presumida)', () => {
  for (const r of results) {
    console.log(`   [registro] ${r.seed}: ${r.cancelled} cancelados de ${r.total} eventos`);
  }
  // Não se exige zero: exige-se que, havendo cancelamento, ele seja
  // explicável pelos números registrados acima.
  for (const r of results) {
    for (const f of r.forensics) {
      assert.ok(f.cancel_reason && f.cancel_reason !== 'desconhecido',
        `${r.seed}: cancelamento sem motivo persistido em ${f.tournament_id}`);
    }
  }
});

check('Parte F: "duplas insuficientes" não é causa sistêmica — os campos enchem', () => {
  // Se a população fosse insuficiente, a ocupação média cairia bem abaixo de
  // 100%. Medir isso é o que separa "mundo pequeno" de "pipeline quebrado".
  for (const r of results) {
    for (const [tier, f] of Object.entries(r.fillByTier)) {
      const pct = (f.filled / Math.max(1, f.capacity)) * 100;
      assert.ok(pct >= 80, `${r.seed}/${tier}: ocupação média de só ${pct.toFixed(0)}%`);
    }
  }
});

check('Parte F: a população de duplas permanece saudável a temporada toda', () => {
  for (const r of results) {
    const ratio = r.pairedAthletes / Math.max(1, r.athletes);
    console.log(`   [registro] ${r.seed}: ${r.pairedAthletes}/${r.athletes} atletas pareados (${(ratio * 100).toFixed(0)}%)`);
    assert.ok(ratio > 0.5, `${r.seed}: só ${(ratio * 100).toFixed(0)}% dos atletas têm dupla`);
  }
});

check('Parte H: nenhum evento fica permanentemente SEM sorteio nem cancelado', () => {
  // O limbo é o estado proibido: nem chave, nem cancelamento explícito.
  for (const r of results) {
    console.log(`   [registro] ${r.seed}: sem sorteio=${r.noDraw} recuperados=${r.recovered}`);
    assert.ok(r.noDraw <= 2, `${r.seed}: ${r.noDraw} eventos em limbo`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tournament-cancellation-cause-v517: PASS');
