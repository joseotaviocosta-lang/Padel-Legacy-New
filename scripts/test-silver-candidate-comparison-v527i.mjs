// Playthrough 5.27-I, Bloco D (itens 19–22/34) — ≥ 4 candidatos Silver, cada
// um mudando uma dimensão (faixa de rank OU janela; D = combinação), medidos no
// mesmo micro; o escolhido é o MENOR ajuste que corrige a ordem e passa o gate.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { CANDIDATES } from './lib/v527iCandidates.mjs';
import { csvRows, report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-silver-candidate-comparison-v527i');
try {
  await check('4 candidatos definidos, cada um só com faixa (silverPeakLow) e/ou janela (silverFieldOffsetPct)', () => {
    const silver = Object.entries(CANDIDATES).filter(([k]) => k.startsWith('SILVER_'));
    assert.ok(silver.length >= 4);
    for (const [k, v] of silver) {
      const keys = Object.keys(JSON.parse(v.PL527E_COMPETITION));
      assert.ok(keys.every((x) => ['silverPeakLow', 'silverFieldOffsetPct'].includes(x)), k);
      if (k !== 'SILVER_D') assert.equal(keys.length, 1, `${k} deve mudar uma dimensão`);
    }
  });
  await check('micro-results.csv tem baseline + candidatos rodados com 5 seeds', () => {
    const rows = csvRows('micro-results.csv');
    assert.ok(rows.find((r) => r.candidate === 'baseline'));
    assert.ok(rows.filter((r) => String(r.candidate).startsWith('SILVER_')).length >= 3);
    for (const r of rows) assert.equal(r.careers, 5, r.candidate);
  });
  await check('silver-choice.json: escolhido passa o micro-gate e é o menor ajuste eficaz', () => {
    const c = report('silver-choice.json');
    const s = report('micro-normal-730d.json').summary[c.chosen];
    assert.equal(s.microGate.pass, true);
    for (const smaller of c.smallerCandidatesRejected || []) assert.equal(report('micro-normal-730d.json').summary[smaller]?.microGate.pass, false, `${smaller} era menor e passava`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
