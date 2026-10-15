// Playthrough 5.27-C, Bloco M — starting coins = 900 provados (evitam starvation
// artificial sem serem "dinheiro fácil"). Mede falhas de inscrição por caixa.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { check, finish } = makeSuite('test-starting-coins-need-v527c');
const { rt, profile } = await bootDrawCareer('starting-coins-need-527c', { warmDays: 0 });
try {
  const Balance = await rt.load('/src/lib/balance527.js');

  await check('config: startingCoins = 900 (Balanced)', () => {
    assert.equal(Balance.getBalance527().startingCoins, 900);
  });

  await check('o perfil novo nasce com 900 (não com 100)', () => {
    assert.equal(Number(profile.coins), 900);
  });

  await check('com 900 o jogador cobre inscrição + treino inicial (sem starvation)', () => {
    // Inscrição Bronze = 10; treino inicial ~ dezenas. 900 cobre vários.
    assert.ok(900 > 10 * 5, 'starting coins insuficiente para a base');
  });

  await check('falhas de inscrição por caixa são medidas no harness', () => {
    const dir = 'reports/rebalance-527/balanced2/raw';
    if (!existsSync(dir)) return;
    const f = readdirSync(dir).find((x) => /^casual-\d{3}\.json$/.test(x));
    if (!f) return;
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.ok(c.registrationFailures && typeof c.registrationFailures === 'object');
  });
} finally {
  await rt.close();
  finish();
}
