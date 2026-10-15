// Playthrough 5.27-I, Bloco A (itens 6/7/10) — o Otimizador v4 troca um
// parceiro muito abaixo do alcançável e sustentável, e só renova um inferior
// se a alternativa for inalcançável/cara. Regra pura + micro de 2 anos.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { optimizerShouldRenew, pickOptimizerPartner, OPTIMIZER_V4 } from './lib/v527iOptimizerScore.mjs';
import { microCareers } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-optimizer-partner-refresh-v527i');
const row = (ovr, salary, compatibility = 60, points = 0) => ({ candidate: { ovr, salary, world_ranking_points: points }, offer: { compatibility } });
const ctx = (coins) => ({ coins, ovrOf: (c) => c.ovr, termsOf: (c) => ({ monthlySalary: c.salary }) });
try {
  await check('parceiro 33 com 80+ alcançável e sustentável → NÃO renova (item 7)', () => {
    const v = optimizerShouldRenew({ currentOvr: 33, market: [row(82, 400), row(60, 200)], ...ctx(6000) });
    assert.equal(v.renew, false); assert.equal(v.bestAffordableOvr, 82);
  });
  await check('alternativa forte cara demais (< 3 meses de caixa) → renova (item 10)', () => {
    const v = optimizerShouldRenew({ currentOvr: 33, market: [row(82, 5000)], ...ctx(6000) });
    assert.equal(v.renew, true); assert.equal(v.affordableCount, 0);
  });
  await check(`atual a até ${OPTIMIZER_V4.renewMarginOvr} OVR do melhor sustentável → renova`, () => {
    assert.equal(optimizerShouldRenew({ currentOvr: 78, market: [row(85, 300)], ...ctx(6000) }).renew, true);
  });
  await check('Busca: escolhe a dupla mais forte que o caixa sustenta; compatibilidade só desempata', () => {
    const rows = [row(90, 5000, 90), row(84, 400, 40), row(84, 400, 90), row(70, 100, 100)];
    const pick = pickOptimizerPartner(rows, ctx(6000));
    assert.equal(pick.candidate.ovr, 84); assert.equal(pick.offer.compatibility, 90);
  });
  const careers = microCareers('baseline', 'optimizer', 730);
  await check('micro 2a (5 seeds): troca para parceiro forte dentro de 1 ano e nenhum trecho gap > 30 por > 180 dias (item 42)', () => {
    assert.equal(careers.length, 5);
    for (const r of careers) {
      const strong = (r.partners || []).find((p) => p.day > 0 && p.partnerOvr >= 70);
      assert.ok(strong && strong.day <= 365, `seed ${r.seed}: ${JSON.stringify((r.partners || []).map((p) => [p.day, p.partnerOvr]))}`);
      const marks = (r.partnerQuality || []).filter((q) => q.mark > 0);
      let first = null;
      for (const q of marks) {
        const bad = (q.bestAttainableOvr ?? 0) - (q.partnerOvr ?? 0) > 30;
        if (bad && first == null) first = q.day;
        if (!bad) first = null;
        assert.ok(first == null || q.day - first <= 180, `seed ${r.seed}: gap > 30 do dia ${first} ao ${q.day}`);
      }
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
