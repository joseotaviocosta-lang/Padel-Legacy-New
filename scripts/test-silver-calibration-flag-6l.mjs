// CLOUD-6L — flag experimental isolada: silverFieldOffsetPct 0,25 (default) × 0,15 (flag).
// Roda os módulos reais (Vite SSR) e um mundo real semeado; sem temporadas completas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-silver-calibration-flag-6l');
const SEEDS = ['6l-seed-a', '6l-seed-b'];
const OVRS = [22, 30, 40, 45];
const summary = { seeds: {}, ovrScenarios: {} };

// Um único Tournament por tier/semente: torneios extras na mesma janela "comprometem" duplas e alterariam o pool.
const tournamentOf = (E, profile, tier, id) => E.Tournament.create({ id, name: id, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', ...(tier === 'Gold' ? { main_draw_size: 24 } : {}) });
const fieldOf = async (W, E, profile, t, tier) => {
  let obs = null;
  globalThis.__PL527I_FIELD_OBSERVER = (o) => { obs = o; };
  const f = await W.buildPlayerTournamentField({ tournament: t, profile, playerRank: tier === 'Gold' ? 300 : 600, playerTeamName: 'Dupla', partnerAthleteId: profile.partner_id || null, qualifyingRoundCount: 0 });
  globalThis.__PL527I_FIELD_OBSERVER = undefined;
  const ovr = obs ? obs.field.reduce((s, x) => s + x.ovr, 0) / obs.field.length : null;
  return { ids: f.entrants.map((p) => p.id), offset: obs?.offset ?? null, ovr, n: obs?.field?.length ?? 0 };
};

try {
  // ── estáticos / catálogo ────────────────────────────────────────────────────
  const first = await bootDrawCareer(SEEDS[0], { warmDays: 8 });
  const { rt } = first;
  const B = await rt.load('/src/lib/balance527.js');
  const W = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const Catalog = await rt.load('/src/lib/circuitCatalog.js');

  await check('1. default desativado', () => {
    assert.equal(B.isSilverCalibrationExperiment6LEnabled(), false);
    assert.equal(B.getSilverCalibrationOffsetOverride6L(), null);
  });
  await check('2. default preserva 0,25 (preset balanced sem competition; fallback 0,25 no consumidor)', () => {
    assert.equal(B.getBalance527().id, 'balanced');
    assert.equal(B.getBalance527().competition, undefined);
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /silverFieldOffsetPct \?\? 0\.25/);
  });
  await check('3. flag ligada → 0,15; desligar reverte; só `true` estrito liga', () => {
    B.setSilverCalibrationExperiment6L(true);
    assert.equal(B.getSilverCalibrationOffsetOverride6L(), 0.15);
    B.setSilverCalibrationExperiment6L(false);
    assert.equal(B.getSilverCalibrationOffsetOverride6L(), null);
    for (const v of ['true', 1, {}, undefined]) { B.setSilverCalibrationExperiment6L(v); assert.equal(B.isSilverCalibrationExperiment6LEnabled(), false, String(v)); }
  });
  await check('4. isolamento: presets e demais parâmetros idênticos com a flag ligada', () => {
    const snap = () => JSON.stringify([B.BALANCE_527B_PRESETS, B.BALANCE_527E_PRESETS, B.getBalance527()]);
    const off = snap();
    B.setSilverCalibrationExperiment6L(true);
    const on = snap();
    B.setSilverCalibrationExperiment6L(false);
    assert.equal(on, off);
    assert.equal(B.BALANCE_527E_PRESETS['balanced-e'].competition.silverFieldOffsetPct, 0.15);
    assert.equal(B.BALANCE_527E_PRESETS['balanced-e'].competition.silverPeakLow, 900);
    assert.equal(B.BALANCE_527E_PRESETS['balanced-e'].competition.gatedFirstRoundLossPointsRatio, 0.01);
    assert.equal(B.BALANCE_527E_PRESETS['balanced-e'].competition.firstPartnerTargetOvr, 36);
    assert.equal(B.BALANCE_527E_PRESETS['balanced-e'].competition.firstPartnerRatingWeight, 0.45);
  });
  await check('4b. elegibilidade, bandas e pontos de ranking do catálogo não mudam com a flag', () => {
    const snap = () => JSON.stringify(['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'].map((t) => [t, Catalog.getTournamentTierConfig(t), Catalog.getRoundOutcomeTable?.(t)]));
    const off = snap();
    B.setSilverCalibrationExperiment6L(true);
    const on = snap();
    B.setSilverCalibrationExperiment6L(false);
    assert.equal(on, off);
  });
  await check('7a. flag não aparece em src/ fora de balance527.js e do consumidor (sem UI, sem save)', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync("grep -rlE 'SilverCalibration\\w*6L|SILVER_CALIBRATION_6L' src || true").toString().trim().split('\n').filter(Boolean).sort();
    assert.deepEqual(hits, ['src/gameplay/worldTour/WorldTourLifecycle.js', 'src/lib/balance527.js']);
  });
  await rt.close();

  // ── campos reais, por semente ──────────────────────────────────────────────
  for (const seed of SEEDS) {
    const ctx = await bootDrawCareer(seed, { warmDays: 8 });
    const E = ctx.rt.localGame.entities;
    const Bm = await ctx.rt.load('/src/lib/balance527.js');
    const Wm = await ctx.rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const rows = {};
    for (const tier of ['Bronze', 'Silver', 'Gold']) {
      const t = await tournamentOf(E, ctx.profile, tier, `${seed}-${tier}`);
      Bm.setSilverCalibrationExperiment6L(false);
      const off1 = await fieldOf(Wm, E, ctx.profile, t, tier);
      const off2 = await fieldOf(Wm, E, ctx.profile, t, tier);
      Bm.setSilverCalibrationExperiment6L(true);
      const on = await fieldOf(Wm, E, ctx.profile, t, tier);
      Bm.setSilverCalibrationExperiment6L(false);
      rows[tier] = { off: off1, repeatOff: off2, on };
    }
    summary.seeds[seed] = Object.fromEntries(Object.entries(rows).map(([t, r]) => [t, { offsetOff: r.off.offset, offsetOn: r.on.offset, ovrOff: r.off.ovr, ovrOn: r.on.ovr, n: r.off.n, sameField: JSON.stringify(r.off.ids) === JSON.stringify(r.on.ids) }]));

    await check(`[${seed}] determinismo com flag desligada (campo repetido idêntico)`, () => {
      for (const t of Object.keys(rows)) assert.deepEqual(rows[t].off.ids, rows[t].repeatOff.ids, t);
    });
    await check(`[${seed}] 5. Gold e Bronze idênticos com flag ligada`, () => {
      for (const t of ['Bronze', 'Gold']) { assert.deepEqual(rows[t].on.ids, rows[t].off.ids, t); assert.equal(rows[t].on.offset, rows[t].off.offset, t); }
    });
    await check(`[${seed}] Silver: offset reflete 25% (off) e 15% (on); campo mais fraco/igual`, () => {
      const s = rows.Silver; const need = s.off.n;
      assert.ok(s.off.offset >= need && s.on.offset >= need);
      assert.ok(s.on.offset < s.off.offset, `${s.on.offset} < ${s.off.offset}`);
      assert.equal(s.on.n, s.off.n);
      assert.ok(s.on.ovr <= s.off.ovr + 1e-9, `OVR on ${s.on.ovr} > off ${s.off.ovr}`);
    });
    await check(`[${seed}] 6. inicialização do catálogo/mundo ok com flag ligada (campo completo)`, () => {
      assert.equal(rows.Silver.on.ids.length, rows.Silver.off.ids.length);
      assert.equal(new Set(rows.Silver.on.ids).size, rows.Silver.on.ids.length);
    });

    if (seed === SEEDS[0]) {
      // 7. schema de saves: perfil/entidades persistidas iguais com flag ligada (não grava nada)
      await check('7. sem impacto no schema de saves (perfil/torneios não ganham campos da flag)', async () => {
        const before = JSON.stringify(await E.PlayerProfile.get(ctx.profile.id));
        Bm.setSilverCalibrationExperiment6L(true);
        await fieldOf(Wm, E, ctx.profile, await E.Tournament.get(`${seed}-Silver`), 'Silver');
        Bm.setSilverCalibrationExperiment6L(false);
        const after = JSON.stringify(await E.PlayerProfile.get(ctx.profile.id));
        assert.equal(after, before);
        assert.ok(!/SilverCalibration|SILVER_CALIBRATION/.test(after));
        const fnd = readFileSync('src/lib/saveFoundation.js', 'utf8');
        assert.doesNotMatch(fnd, /SilverCalibration|6L/);
      });
      // OVR 22/30/40/45: lacuna média campo Silver − OVR de referência (curto, sem temporada)
      for (const o of OVRS) {
        const r = rows.Silver;
        summary.ovrScenarios[o] = { fieldOvrOff: r.off.ovr, fieldOvrOn: r.on.ovr, gapOff: r.off.ovr - o, gapOn: r.on.ovr - o };
      }
      await check('OVR 22/30/40/45: lacuna campo×jogador menor ou igual com flag ligada', () => {
        for (const o of OVRS) assert.ok(summary.ovrScenarios[o].gapOn <= summary.ovrScenarios[o].gapOff + 1e-9, String(o));
      });
    }
    await ctx.rt.close();
  }
} finally {
  mkdirSync('reports/cloud-phase-6l-silver-calibration-flag', { recursive: true });
  writeFileSync('reports/cloud-phase-6l-silver-calibration-flag/results.json', JSON.stringify(summary, null, 2));
}
finish();
