// Playthrough 5.27-G, Bloco B (itens 10, 13, 14) — com a pontuação equilibrada o
// Normal não escolhe mais parceiro muito fraco quando há parceiro claramente
// superior e alcançável (o pool da Busca só traz quem tem interest.available).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bestOvr, loadSearchMarkets, median, pickCompat, pickNormal } from './lib/v527gMarketKit.mjs';

const { check, finish } = makeSuite('test-normal-partner-strength-floor-v527g');
try {
  const markets = loadSearchMarkets();
  await check(`>= 20 mercados de Busca (${markets.length})`, () => assert.ok(markets.length >= 20));

  await check('antes (só compatibilidade): reproduz a escolha fraca — OVR mediano <= 50% do melhor disponível', () => {
    const ratio = median(markets.map((m) => pickCompat(m).uiOvr / bestOvr(m)));
    assert.ok(ratio <= 0.5, ratio.toFixed(3));
  });

  await check('depois: OVR escolhido mediano >= 85% do melhor alcançável', () => {
    const ratio = median(markets.map((m) => pickNormal(m).uiOvr / bestOvr(m)));
    assert.ok(ratio >= 0.85, ratio.toFixed(3));
  });

  await check('piso: nunca abaixo de jogador−15 quando existe candidato do nível do jogador', () => {
    for (const m of markets) {
      if (!m.candidates.some((c) => c.uiOvr >= m.playerOvr)) continue;
      assert.ok(pickNormal(m).uiOvr >= m.playerOvr - 15, `${m.kind}: jogador ${m.playerOvr} → ${pickNormal(m).uiOvr}`);
    }
  });
} finally {
  finish();
}
