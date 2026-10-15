// Playthrough 5.27-I, Bloco E (itens 25/26) — Gold+ é controle: bandas,
// fit, corte, qualifying, pontos e tabelas de Gold/Platinum/Masters/Elite/Crown
// idênticos ao congelado antes da fase; Bronze idem; presets antigos com a
// janela Silver de sempre.
import { makeSuite, assert, bootModules } from './lib/v526bTestKit.mjs';
import { computeFrozenConfig } from './lib/v527hFreeze.mjs';
import { fileHash } from './lib/v527dJobs.mjs';
import { report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-no-gold-change-v527i');
try {
  const before = report('frozen-before.json');
  await check('circuitCatalog.js (fit/bandas/pontos de Gold+) idêntico ao frozen-before', () => {
    assert.equal(fileHash('src/lib/circuitCatalog.js'), before.goldPlusRules.tierFitSourceHash);
  });
  await check('blocos ranking/tactics/balance/partnerPolicy iguais ao frozen-before', async () => {
    const now = await computeFrozenConfig();
    for (const k of ['ranking', 'tactics', 'balance', 'partnerPolicy', 'engine', 'commitment']) assert.equal(now.blockHashes[k], before.blockHashes[k], k);
  });
  await check('fit e config de Gold+/Bronze iguais entre baseline e o preset escolhido (Vite real)', async () => {
    const m = await bootModules();
    try {
      const cat = await m.load('/src/lib/circuitCatalog.js');
      const sample = (tier) => [50, 150, 250, 350, 450, 600, 800, 1000].map((r) => cat.getTierRankingFit(tier, r));
      const cfg = (tier) => JSON.stringify(cat.getTournamentTierConfig(tier));
      globalThis.__PL527_PRESET = 'balanced-e';
      const now = Object.fromEntries(['Bronze', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'].map((t) => [t, [sample(t), cfg(t)]]));
      globalThis.__PL527E_COMPETITION_OVERRIDE = { silverPeakLow: 900, silverFieldOffsetPct: 0.25 };
      const base = Object.fromEntries(['Bronze', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'].map((t) => [t, [sample(t), cfg(t)]]));
      delete globalThis.__PL527E_COMPETITION_OVERRIDE;
      assert.deepEqual(now, base);
    } finally { await m.close(); }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
