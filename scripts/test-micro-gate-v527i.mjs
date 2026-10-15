// Playthrough 5.27-I, Bloco H (itens 33/34) — micro-gate do candidato Silver
// escolhido: Easy ≥ 40, Medium ≥ 28, R1 ≥ 35 e Silver não materialmente mais
// difícil que Gold (Silver + 5 pp ≥ Gold). Stage 1 só depois disso.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { report } from './lib/v527iTestKit.mjs';

const { check, finish } = makeSuite('test-micro-gate-v527i');
try {
  // Gate no micro de 2 anos: no de 1 ano o Normal não joga Medium (silver-choice.json, protocolNote).
  const m = report('micro-normal-730d.json');
  const c = report('silver-choice.json').chosen;
  const s = m.summary[c];
  await check(`gate pré-registrado: Easy ≥ ${m.gate.easyMin}, Medium ≥ ${m.gate.mediumMin}, R1 ≥ ${m.gate.r1Min}, Silver+${m.silverVsGoldMaterialPp} ≥ Gold`, () => {
    assert.deepEqual(m.gate, { easyMin: 40, mediumMin: 28, r1Min: 35 });
    assert.equal(m.silverVsGoldMaterialPp, 5);
  });
  await check(`${c}: Easy ${s.easy.wr}`, () => assert.ok(s.easy.wr >= 40));
  await check(`${c}: Medium ${s.medium.wr}`, () => assert.ok(s.medium.wr >= 28));
  await check(`${c}: R1 ${s.r1.wr}`, () => assert.ok(s.r1.wr >= 35));
  await check(`${c}: Silver main ${s.tiers.Silver.main.wr} × Gold main ${s.tiers.Gold.main.wr}`, () => assert.equal(s.order.silverNotMateriallyHarderThanGold, true));
  await check('Stage 1 rodou depois do micro-gate (manifest criado após a escolha)', () => {
    const choice = report('silver-choice.json');
    const manifest = report('jobs-manifest.json');
    assert.ok(Date.parse(manifest.createdAt) >= Date.parse(choice.at), `${manifest.createdAt} < ${choice.at}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
