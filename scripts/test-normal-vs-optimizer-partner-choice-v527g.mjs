// Playthrough 5.27-G, Bloco B (item 8) — Normal ≠ Otimizador: o Normal escolhe
// alguém do seu nível com boa compatibilidade; o Otimizador, o mais forte.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { loadSearchMarkets, median, pickNormal, pickOptimizer } from './lib/v527gMarketKit.mjs';

const { check, finish } = makeSuite('test-normal-vs-optimizer-partner-choice-v527g');
try {
  const markets = loadSearchMarkets();
  await check('Normal coincide com o Otimizador em <= 30% dos mercados', () => {
    const same = markets.filter((m) => pickNormal(m).id === pickOptimizer(m).id).length;
    assert.ok(same / markets.length <= 0.3, `${same}/${markets.length}`);
  });
  await check('Normal mantém compatibilidade mediana maior que a do Otimizador', () => {
    assert.ok(median(markets.map((m) => pickNormal(m).compatibility)) > median(markets.map((m) => pickOptimizer(m).compatibility)));
  });
  await check('Otimizador escolhe OVR mediano >= ao do Normal (o Normal não virou maximizador)', () => {
    assert.ok(median(markets.map((m) => pickOptimizer(m).uiOvr)) >= median(markets.map((m) => pickNormal(m).uiOvr)));
  });
} finally {
  finish();
}
