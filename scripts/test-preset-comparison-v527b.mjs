// Playthrough 5.27-B, Bloco L — os três presets existem, são distintos e a
// seleção é centralizada/versionada (sem `if BALANCED` espalhado).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-preset-comparison-v527b');
const { load, close } = await bootModules();
try {
  const Balance = await load('/src/lib/balance527.js');

  await check('existem exatamente os 3 presets pedidos', () => {
    const keys = Object.keys(Balance.BALANCE_527B_PRESETS);
    assert.deepEqual(keys.sort(), ['balanced', 'conservative', 'hardcore']);
  });

  await check('Balanced fica ENTRE Conservative e Hardcore (economia)', () => {
    const { conservative: c, balanced: b, hardcore: h } = Balance.BALANCE_527B_PRESETS;
    assert.ok(c.sponsor.monthlyMultiplier > b.sponsor.monthlyMultiplier, 'conservative deveria pagar mais sponsor que balanced');
    assert.ok(b.sponsor.monthlyMultiplier > h.sponsor.monthlyMultiplier, 'balanced deveria pagar mais sponsor que hardcore');
    assert.ok(c.staffMultiplier <= b.staffMultiplier && b.staffMultiplier <= h.staffMultiplier, 'escada de staff');
  });

  await check('getBalance527 respeita o seletor global (harness compara sem recompilar)', () => {
    globalThis.__PL527_PRESET = 'hardcore';
    assert.equal(Balance.getBalance527().id, 'hardcore');
    globalThis.__PL527_PRESET = 'conservative';
    assert.equal(Balance.getBalance527().id, 'conservative');
    delete globalThis.__PL527_PRESET;
    assert.equal(Balance.getBalance527().id, 'balanced');
  });

  await check('alias retrocompatível BALANCE_527_PRESETS preservado', () => {
    assert.equal(Balance.BALANCE_527_PRESETS, Balance.BALANCE_527B_PRESETS);
  });

  await check('todos os presets versionados', () => {
    for (const p of Object.values(Balance.BALANCE_527B_PRESETS)) assert.ok(p.version.startsWith('5.27'));
  });
} finally {
  await close();
}
finish();
