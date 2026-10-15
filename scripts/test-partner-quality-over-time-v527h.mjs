// Playthrough 5.27-H, Bloco E — qualidade do parceiro por marco (início, 3m,
// 6m, 9m, 1a, 18m, 2a): OVR jogador/parceiro/melhor alcançável, compatibilidade,
// salário, OVR da dupla e gap; Normal continua diferente do Otimizador e sem
// padrão de parceiro obsoleto com alternativa forte (item 44).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { CHECKPOINTS } from './lib/v527hMetrics.mjs';
import { csvRows, report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-partner-quality-over-time-v527h');
try {
  await check('toda carreira tem os 7 marcos, cada um no 1º snapshot a partir do dia do marco', () => {
    for (const { file, env } of runs()) {
      const q = env.result.partnerQuality || [];
      assert.deepEqual(q.map((x) => x.mark), CHECKPOINTS.map(([, d]) => d), file);
      for (const x of q) { assert.ok(x.day >= x.mark && x.day < x.mark + 14, `${file} marco ${x.mark} no dia ${x.day}`); assert.ok(x.marketSize >= 0); }
    }
  });
  await check('partner-quality.csv: gap = melhor alcançável − parceiro atual', () => {
    const rows = csvRows('partner-quality.csv');
    assert.equal(rows.length, runs().length * CHECKPOINTS.length);
    for (const r of rows) if (r.bestAttainableOvr != null && r.partnerOvr != null) assert.equal(r.partnerGap, r.bestAttainableOvr - r.partnerOvr);
  });
  await check('Normal ≠ Otimizador (sequência de parceiros) em todos os presets', () => {
    const pb = report('stage1.json').partnerBehaviour;
    for (const [p, x] of Object.entries(pb)) assert.equal(x.normalDiffersFromOptimizer, true, `${p}: ${x.identicalPartnerSequences}/${x.of} iguais`);
  });
  await check('Normal sem padrão de ESCOLHA de parceiro obsoleto com alternativa forte (2 marcos seguidos)', () => {
    const pb = report('stage1.json').partnerBehaviour;
    for (const [p, x] of Object.entries(pb)) assert.deepEqual(x.obsoletePattern, [], p);
  });
  await check('marcos obsoletos restantes são todos de limbo (renovação já recusada), registrados', () => {
    const pb = report('stage1.json').partnerBehaviour;
    for (const [p, x] of Object.entries(pb)) for (const c of x.obsoleteDuringLimbo) assert.equal(c.cause, 'limbo', `${p} ${c.id}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
