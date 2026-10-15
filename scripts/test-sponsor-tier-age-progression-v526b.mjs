// Playthrough 5.26-B — com idade, ranking e reputação corretos, os
// patrocinadores passam do Bronze PELAS REGRAS EXISTENTES (estágio do mercado
// em sportsEconomyV26.js + canSign em sponsors.js). Nenhum threshold mudou.
import { makeSuite, bootModules, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-sponsor-tier-age-progression-v526b');
const m = await bootModules();
try {
  const sponsors = await m.load('/src/lib/sponsors.js');
  const econ = await m.load('/src/lib/sportsEconomyV26.js');
  const catalog = sponsors.SPONSOR_CATALOG;
  const signableTiersOverYear = (profile, year) => {
    const tiers = new Set();
    for (let month = 1; month <= 12; month += 1) {
      const p = { ...profile, career_date: `${year}-${String(month).padStart(2, '0')}-01` };
      for (const s of econ.getMonthlySponsorMarket(p, catalog).sponsors) if (sponsors.canSign(s, p).ok) tiers.add(s.tier);
    }
    return tiers;
  };
  const veteran = { id: 'p', birth_date: '2010-01-01', xp: 60000, fan_appeal: 100, career_level: 30, ranking_position: 60, reputation: 40, tournaments_won: 3 };

  await check('estágio do mercado sai de "regional" quando ranking e reputação existem', () => {
    assert.equal(econ.getCareerEconomyStage({ ...veteran, ranking_position: null, reputation: 0, fan_appeal: 0 }), 'regional');
    assert.equal(econ.getCareerEconomyStage(veteran), 'international');
  });
  await check('aos 16 (2026) nenhum Prata/Ouro disponível no catálogo aceita (idade mínima 17/18)', () => {
    const tiers = signableTiersOverYear(veteran, 2026);
    assert.ok(!tiers.has('Prata') && !tiers.has('Ouro'), [...tiers].join(','));
  });
  await check('aos 18 (2028) Prata fica assinável pelas regras atuais', () => assert.ok(signableTiersOverYear(veteran, 2028).has('Prata')));
  await check('Ouro assinável quando estágio, idade, XP, fãs e títulos satisfazem o catálogo', () => assert.ok(signableTiersOverYear(veteran, 2029).has('Ouro')));
  await check('thresholds do catálogo inalterados (amostra: Red Bull e Garmin)', () => {
    const rb = catalog.find((s) => s.name === 'Red Bull'); const gm = catalog.find((s) => s.name === 'Garmin');
    assert.deepEqual([rb.min_xp, rb.min_titles, rb.min_fan_appeal, rb.base_monthly_value], [4200, 2, 72, 11500]);
    assert.deepEqual([gm.min_xp, gm.min_fan_appeal, gm.base_monthly_value, gm.min_age, gm.max_age], [1400, 45, 4200, 18, 38]);
  });
} finally {
  await m.close();
}
finish();
