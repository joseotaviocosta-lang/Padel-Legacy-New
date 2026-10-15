// Playthrough 5.27-I, Bloco K (item 42) — na matriz de 2 anos o Otimizador não
// fica com parceiro claramente obsoleto: gap (melhor alcançável − atual) > 30
// por > 180 dias só é aceito com causa de custo (sem alternativa sustentável).
// Também não inscreve torneio novo com o parceiro que decidiu deixar.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runs } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-optimizer-no-stale-partner-v527i');
try {
  const opt = runs().filter((r) => r.env.profile === 'optimizer');
  await check('15 carreiras do Otimizador na matriz', () => assert.equal(opt.length, 15));
  await check('nenhum trecho gap > 30 por > 180 dias sem causa de custo', () => {
    const bad = [];
    for (const { file, env } of opt) {
      const r = env.result;
      let first = null;
      for (const q of (r.partnerQuality || []).filter((x) => x.mark > 0)) {
        const stale = (q.bestAttainableOvr ?? 0) - (q.partnerOvr ?? 0) > 30;
        // Causa de custo: o jogo cobra salário; sem 3 meses de caixa para o melhor, a política não troca.
        const checks = (r.renewalMarketChecks || []).filter((c) => c.policy === 'optimizer-v4' && c.day <= q.day);
        const affordabilityCause = checks.length && checks.at(-1).affordable === 0;
        if (stale && !affordabilityCause && first == null) first = q.day;
        if (!stale || affordabilityCause) first = null;
        if (first != null && q.day - first > 180) bad.push(`${file}: ${first}→${q.day}`);
      }
    }
    assert.deepEqual(bad, []);
  });
  await check('decidiu deixar o parceiro → não inscreveu torneio novo com ele', () => {
    for (const { file, env } of opt) {
      const r = env.result;
      const leaving = r.optimizerLeavingPartnershipId;
      if (!leaving) continue;
      const refusal = (r.renewalDecisions || []).find((d) => d.partnershipId === leaving && !d.renew);
      const change = (r.partners || []).find((p) => p.day > (refusal?.day ?? Infinity));
      const regsBetween = (r.registrations || []).filter((g) => g.day > refusal.day && (!change || g.day < change.day));
      assert.equal(regsBetween.length, 0, `${file}: ${regsBetween.length} inscrições no limbo`);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
