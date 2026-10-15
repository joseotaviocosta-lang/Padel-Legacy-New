// Playthrough 5.27-B, Bloco C — o multiplicador de atributos iniciais é lido da
// config central e aplicado ao build (não é buff oculto de partida).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootCareer } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-initial-attributes-sensitivity-v527b');
const { rt } = await bootCareer('initial-attrs-527b');
try {
  const Profiles = await rt.load('/src/lib/initialCareerProfiles.js');
  const Balance = await rt.load('/src/lib/balance527.js');
  const multiplier = Balance.getBalance527().initialAttributeMultiplier;

  await check('config central define initialAttributeMultiplier > 1', () => {
    assert.ok(multiplier > 1, `multiplier=${multiplier}`);
  });

  await check('buildInitialProfile aplica o multiplicador (OVR inicial na ordem do floor do mundo)', () => {
    const build = Profiles.buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'equilibrado', careerDifficultyId: 'normal' });
    const avg = Object.values(build.attributes).reduce((s, v) => s + v, 0) / Object.keys(build.attributes).length;
    // Curva crua ≈ 11,5 → com ×1,8 ≈ 20-22. Nunca o OVR 12 original.
    assert.ok(avg >= 16 && avg <= 28, `OVR inicial ${avg.toFixed(1)}`);
    assert.ok(avg > 11.5 * 1.3, 'multiplicador não aplicado');
  });

  await check('o build continua validável (budget coerente com a curva escalada)', () => {
    const budget = Profiles.getExpectedInitialProfileBudget('normal');
    assert.ok(budget >= 10 * 16 && budget <= 10 * 28, `budget ${budget}`);
  });

  await check('presets documentam os candidatos A/B (isolamento da mudança)', () => {
    assert.equal(Balance.BALANCE_527B_PRESETS.balanced.initialAttributeMultiplier, 1.8);
    assert.ok(Balance.BALANCE_527B_PRESETS.balanced.version.startsWith('5.27'));
  });
} finally {
  await rt.close();
}
finish();
