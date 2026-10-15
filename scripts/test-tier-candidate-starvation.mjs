// Playthrough 5.2, Parte W — mede, POR TORNEIO (a unidade real de
// "semana" nesta simulação — cada torneio resolvido é um evento datado
// específico), idealCandidates/requiredSlots. Exemplo do prompt: "Gold:
// 24 vagas, 11 ideais → starvation severa". Não falha o teste por
// starvation existir (é o achado central, já documentado) — só confirma
// que o dado é coletável e reporta a métrica claramente pra quem for
// decidir a próxima fase de capacidade.
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_STARV_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'starvation', trackWeeklyDraws: false });
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { isRankInTierDiagnosticCore } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
  const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));

  function canonicalPairRank(partnership) {
    const ranks = [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean)
      .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
    return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
  }

  const starvationByTier = {};
  for (const tier of tiers) {
    const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
    const ratios = [];
    for (const tournament of resolved) {
      let ideal = 0;
      for (const pairId of tournament.draw_pair_ids) {
        const partnership = partnershipById.get(pairId);
        if (!partnership) continue;
        const rank = canonicalPairRank(partnership);
        if (rank > 0 && isRankInTierDiagnosticCore(rank, tier)) ideal += 1;
      }
      ratios.push({ tournamentId: tournament.id, ideal, requiredSlots: tournament.draw_pair_ids.length, ratio: ideal / tournament.draw_pair_ids.length });
    }
    const avgRatio = ratios.length ? ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length : null;
    const severeCount = ratios.filter((r) => r.ratio < 0.5).length;
    starvationByTier[tier] = { samples: ratios.length, avgRatio, severeCount, examples: ratios.slice(0, 2) };
  }

  console.log('=== idealCandidates/requiredSlots por torneio (Parte W) ===');
  for (const tier of tiers) {
    const s = starvationByTier[tier];
    if (!s.samples) { console.log(`${tier}: sem amostra`); continue; }
    console.log(`${tier}: amostras=${s.samples} razão_média=${s.avgRatio?.toFixed(2)} torneios_com_starvation_severa(<50%)=${s.severeCount}/${s.samples}`);
    for (const ex of s.examples) console.log(`   ex.: ${ex.ideal} ideais / ${ex.requiredSlots} vagas = ${(ex.ratio * 100).toFixed(0)}%`);
  }

  check('dado coletável pra todos os tiers com amostra', () => {
    const withSample = tiers.filter((t) => starvationByTier[t].samples > 0);
    for (const t of withSample) {
      if (starvationByTier[t].avgRatio == null) throw new Error(`${t} sem razão média calculável`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-candidate-starvation: PASS (dado coletado — ver relatório da fase pra interpretação)');
} finally {
  await vite.close();
}
