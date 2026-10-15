// Playthrough 5.27-I, Blocos D/J (itens 23/24/40) — ordem dos tiers no Stage 1
// (Balanced-E Normal, chave principal): Silver não materialmente mais difícil
// que Gold (falha estrutural pré-registrada: Silver + 5 pp < Gold) e Bronze
// não mais difícil que Silver.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-silver-vs-gold-order-v527i');
try {
  const t = report('stage1.json').byPreset['balanced-e'].normal.tiers;
  await check('Silver main + 5 pp ≥ Gold main (Balanced-E Normal, 2a)', () => assert.ok(t.Silver.main.wr + 5 >= t.Gold.main.wr, `Silver ${t.Silver.main.wr} · Gold ${t.Gold.main.wr}`));
  await check('Bronze main ≥ Silver main', () => assert.ok(t.Bronze.main.wr >= t.Silver.main.wr, `Bronze ${t.Bronze.main.wr} · Silver ${t.Silver.main.wr}`));
  await check('nos 3 presets Silver deixa de ser estruturalmente pior que Gold (Normal)', () => {
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) {
      const x = report('stage1.json').byPreset[p].normal.tiers;
      assert.ok(x.Silver.main.wr + 5 >= x.Gold.main.wr, `${p}: Silver ${x.Silver.main.wr} · Gold ${x.Gold.main.wr}`);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
