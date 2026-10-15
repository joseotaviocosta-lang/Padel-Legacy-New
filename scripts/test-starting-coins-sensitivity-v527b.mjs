// Playthrough 5.27-B, Bloco D — starting coins vêm da config central e existem
// para evitar insolvência ARTIFICIAL (não para mascarar economia quebrada).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-starting-coins-sensitivity-v527b');
const { rt, profile } = await bootDrawCareer('starting-coins-527b', { warmDays: 0 });
try {
  const Balance = await rt.load('/src/lib/balance527.js');
  const expected = Balance.getBalance527().startingCoins;

  await check('config central define startingCoins (candidatos 500/700/900 documentados)', () => {
    assert.ok([500, 700, 900].includes(expected), `startingCoins=${expected}`);
  });

  await check('o perfil novo nasce com o startingCoins da config (não 100 fixo)', () => {
    assert.equal(Number(profile.coins), expected);
  });

  await check('startingCoins não é infinito nem "dinheiro fácil"', () => {
    assert.ok(expected >= 500 && expected <= 1000, `valor fora de faixa: ${expected}`);
  });

  await check('a config versiona a mudança (rastreável)', () => {
    assert.ok(Balance.BALANCE_527B_PRESETS.balanced.version.startsWith('5.27'));
  });
} finally {
  await rt.close();
}
finish();
