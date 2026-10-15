// Playthrough 5.2, Parte V — o resgate não pode ser o mecanismo normal.
// O motor não grava um flag explícito "este entrante veio do resgate" no
// Tournament (rescue só dispara quando o campo normal fica abaixo de
// minViableDraw, WorldTourLifecycle.js) — usa como proxy observável
// "torneio resolvido com menos entrantes que o drawSize completo"
// (rescue só preenche até o mínimo viável, não até o draw cheio, então
// um torneio que passou por resgate quase sempre fica abaixo do drawSize
// mesmo depois — aproximação documentada, não uma contagem exata).
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_RESCUE_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'rescue-utilization', trackWeeklyDraws: false });
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  const rescueByTier = {};
  for (const tier of tiers) {
    const config = getTournamentTierConfig(tier);
    const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
    const underfilled = resolved.filter((t) => t.draw_pair_ids.length < (t.main_draw_size || config.mainDrawSize));
    const totalSlotsFilled = resolved.reduce((s, t) => s + t.draw_pair_ids.length, 0);
    const totalSlotsShort = resolved.reduce((s, t) => s + Math.max(0, (t.main_draw_size || config.mainDrawSize) - t.draw_pair_ids.length), 0);
    rescueByTier[tier] = {
      tournaments: resolved.length,
      underfilled: underfilled.length,
      pctUnderfilled: resolved.length ? (underfilled.length / resolved.length) * 100 : null,
      totalSlotsFilled, totalSlotsShort,
    };
  }

  console.log('=== utilização de resgate (proxy: torneios que fecharam abaixo do drawSize completo) ===');
  for (const tier of tiers) {
    const r = rescueByTier[tier];
    if (!r.tournaments) { console.log(`${tier}: sem amostra`); continue; }
    console.log(`${tier}: torneios=${r.tournaments} abaixo_do_drawSize=${r.underfilled} (${r.pctUnderfilled?.toFixed(1)}%) vagas_preenchidas=${r.totalSlotsFilled} vagas_faltantes_acumuladas=${r.totalSlotsShort}`);
  }

  check('resgate não é o mecanismo NORMAL em nenhum tier (torneios abaixo do drawSize < 50%)', () => {
    for (const tier of tiers) {
      const r = rescueByTier[tier];
      if (!r.tournaments) continue;
      if (r.pctUnderfilled >= 50) throw new Error(`${tier}: ${r.pctUnderfilled.toFixed(1)}% dos torneios fecharam abaixo do drawSize completo`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-rescue-utilization: PASS');
} finally {
  await vite.close();
}
