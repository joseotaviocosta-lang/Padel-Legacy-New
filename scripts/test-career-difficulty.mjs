// Testes de unidade do sistema de dificuldade de carreira: config central,
// contrato de fallback neutro, e integração com os atributos iniciais.
// Roda em Node puro (sem Vite), por isso os módulos testados não podem
// depender do alias `@/...`.
import assert from 'node:assert/strict';
import {
  ALLOWED_CAREER_DIFFICULTIES,
  DIFFICULTY_CONFIG,
  DEFAULT_NEW_CAREER_DIFFICULTY,
  DEFAULT_MIGRATED_CAREER_DIFFICULTY,
  normalizeCareerDifficulty,
  getDifficultyModifier,
} from '../src/gameplay/difficulty/difficultyConfig.js';
import { detectPeakSeason, evaluateCareerPeak } from '../src/gameplay/difficulty/careerPeak.js';
import {
  buildInitialProfile,
  calculateInitialProfileBudget,
  getExpectedInitialProfileBudget,
  validatePlayerBuildProfile,
  INITIAL_PROFILE_BUDGET,
} from '../src/lib/initialCareerProfiles.js';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

// ── 1. hard fica perto do neutro, com ajuste leve apenas em treino/XP ─────
// (o jogo atual, sem ajuste nenhum, ultrapassava a meta de 8-10 temporadas —
// o espec permite explicitamente "aumentar principalmente training; XP; de
// forma leve" para o Difícil, ver §46 do plano.)
check('hard stays neutral on every axis except training/XP, and only a light bump there', () => {
  const NEUTRAL_EXCEPT = new Set(['trainingGainMultiplier', 'careerXpMultiplier']);
  for (const key of Object.keys(DIFFICULTY_CONFIG.hard)) {
    const value = DIFFICULTY_CONFIG.hard[key];
    if (!NEUTRAL_EXCEPT.has(key)) {
      const expected = key === 'initialAttributeBonusPct' ? 0 : 1;
      assert.equal(value, expected, `hard.${key} deveria permanecer neutro (${expected})`);
    } else {
      assert(value >= 1 && value <= 1.3, `hard.${key} deveria ser um ajuste leve (1.0-1.3), veio ${value}`);
    }
  }
});

check('the true neutral fallback never changes even though hard is calibrated away from 1.0', () => {
  assert.equal(getDifficultyModifier(undefined, 'trainingGainMultiplier'), 1, 'sem dificuldade definida, treino deve ficar em 1.0 mesmo com hard em 1.10');
  assert.equal(getDifficultyModifier(undefined, 'careerXpMultiplier'), 1, 'sem dificuldade definida, XP deve ficar em 1.0 mesmo com hard em 1.05');
  assert.notEqual(getDifficultyModifier('hard', 'trainingGainMultiplier'), getDifficultyModifier(undefined, 'trainingGainMultiplier'), 'hard explícito deve poder diferir do fallback neutro');
});

check('normal and easy differ from hard on every key', () => {
  for (const key of Object.keys(DIFFICULTY_CONFIG.hard)) {
    assert.notEqual(DIFFICULTY_CONFIG.normal[key], DIFFICULTY_CONFIG.hard[key], `normal.${key} deveria diferir de hard`);
    assert.notEqual(DIFFICULTY_CONFIG.easy[key], DIFFICULTY_CONFIG.hard[key], `easy.${key} deveria diferir de hard`);
  }
});

// ── 2. contrato de fallback neutro (compatibilidade retroativa) ───────────
check('getDifficultyModifier is neutral for unset sources', () => {
  const keys = Object.keys(DIFFICULTY_CONFIG.hard);
  for (const key of keys) {
    const neutral = key === 'initialAttributeBonusPct' ? 0 : 1;
    assert.equal(getDifficultyModifier(undefined, key), neutral);
    assert.equal(getDifficultyModifier(null, key), neutral);
    assert.equal(getDifficultyModifier({}, key), neutral);
    assert.equal(getDifficultyModifier('', key), neutral);
    assert.equal(getDifficultyModifier({ career_difficulty: 'lendario' }, key), neutral, 'id desconhecido deve cair no neutro');
  }
  // Uma chave totalmente desconhecida sempre cai no neutro multiplicativo (1),
  // pois DIFFICULTY_CONFIG.hard não a define — independente de qual chave
  // real está sendo iterada acima.
  assert.equal(getDifficultyModifier({ career_difficulty: 'easy' }, 'chave_inexistente'), 1, 'chave desconhecida deve cair no neutro');
});

check('getDifficultyModifier agrees across string/profile/career sources', () => {
  for (const difficulty of ALLOWED_CAREER_DIFFICULTIES) {
    for (const key of Object.keys(DIFFICULTY_CONFIG[difficulty])) {
      const expected = DIFFICULTY_CONFIG[difficulty][key];
      assert.equal(getDifficultyModifier(difficulty, key), expected);
      assert.equal(getDifficultyModifier({ career_difficulty: difficulty }, key), expected);
      assert.equal(getDifficultyModifier({ metadata: { career_difficulty: difficulty } }, key), expected);
    }
  }
});

check('default constants are valid difficulty ids', () => {
  assert(ALLOWED_CAREER_DIFFICULTIES.includes(DEFAULT_NEW_CAREER_DIFFICULTY));
  assert(ALLOWED_CAREER_DIFFICULTIES.includes(DEFAULT_MIGRATED_CAREER_DIFFICULTY));
  assert.equal(DEFAULT_NEW_CAREER_DIFFICULTY, 'normal', 'novas carreiras devem sugerir Médio por padrão');
  assert.equal(DEFAULT_MIGRATED_CAREER_DIFFICULTY, 'hard', 'saves antigos devem migrar para Difícil');
});

check('normalizeCareerDifficulty rejects invalid input', () => {
  assert.equal(normalizeCareerDifficulty('EASY'), 'easy', 'deve normalizar caixa');
  assert.equal(normalizeCareerDifficulty('lendario'), null);
  assert.equal(normalizeCareerDifficulty(42), null);
  assert.equal(normalizeCareerDifficulty({ career_difficulty: 'normal' }), 'normal');
});

// ── 3. atributos iniciais escalados por dificuldade ────────────────────────
check('buildInitialProfile with hard preserves today\'s exact budget (115)', () => {
  assert.equal(INITIAL_PROFILE_BUDGET, 115);
  const build = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle', careerDifficultyId: 'hard' });
  assert.equal(calculateInitialProfileBudget(build), 115);
  assert.equal(getExpectedInitialProfileBudget('hard'), 115);
  assert(validatePlayerBuildProfile(build, 'hard').valid, validatePlayerBuildProfile(build, 'hard').errors.join(', '));
});

check('buildInitialProfile without careerDifficultyId defaults to hard (backward compatible)', () => {
  const build = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle' });
  assert.equal(calculateInitialProfileBudget(build), 115);
});

check('normal and easy grant a real but modest attribute bonus, budget stays internally consistent', () => {
  for (const difficulty of ['normal', 'easy']) {
    const build = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle', careerDifficultyId: difficulty });
    const expected = getExpectedInitialProfileBudget(difficulty);
    assert.equal(calculateInitialProfileBudget(build), expected, `${difficulty}: soma real deve bater com o orçamento esperado`);
    assert(expected > 115, `${difficulty}: bônus deve ser positivo (orçamento ${expected} > 115)`);
    assert(expected < 115 * 1.2, `${difficulty}: bônus não deve inflar o build de forma exagerada`);
    assert(validatePlayerBuildProfile(build, difficulty).valid, validatePlayerBuildProfile(build, difficulty).errors.join(', '));
  }
  const easyBudget = getExpectedInitialProfileBudget('easy');
  const normalBudget = getExpectedInitialProfileBudget('normal');
  assert(easyBudget > normalBudget, 'easy deve conceder um bônus inicial maior que normal');
});

check('difficulty bonus does not distort a build validated against the wrong tier', () => {
  const easyBuild = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle', careerDifficultyId: 'easy' });
  assert(!validatePlayerBuildProfile(easyBuild, 'hard').valid, 'um build fácil não deve validar contra o orçamento difícil');
});

check('difficulty preserves build identity (order/archetype unaffected)', () => {
  const hardBuild = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle', careerDifficultyId: 'hard' });
  const easyBuild = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle', careerDifficultyId: 'easy' });
  assert.equal(hardBuild.archetype_id, easyBuild.archetype_id);
  assert.equal(hardBuild.id, easyBuild.id);
  assert.deepEqual(hardBuild.strengths, easyBuild.strengths);
  assert.deepEqual(hardBuild.weaknesses, easyBuild.weaknesses);
  // Nenhum atributo individual deve mais que dobrar (evita "10 virar 30").
  for (const key of Object.keys(hardBuild.attributes)) {
    assert(easyBuild.attributes[key] <= hardBuild.attributes[key] * 1.3, `${key}: bônus fácil não deve inflar o atributo de forma exagerada`);
    assert(easyBuild.attributes[key] >= hardBuild.attributes[key], `${key}: fácil deve ser sempre >= difícil`);
  }
});

// ── 4. detector de auge (peak) ─────────────────────────────────────────────
check('evaluateCareerPeak requires all three axes', () => {
  const base = { overall: 92, ceiling: 100, overallGainLastSeason: 0.5, rank: 10, careerLevel: 20 };
  assert.equal(evaluateCareerPeak(base), true);
  assert.equal(evaluateCareerPeak({ ...base, overall: 50 }), false, 'overall longe do teto não deve ser auge');
  assert.equal(evaluateCareerPeak({ ...base, overallGainLastSeason: 5 }), false, 'evolução ainda acelerada não deve ser auge');
  assert.equal(evaluateCareerPeak({ ...base, rank: 300 }), false, 'fora do Top 20 não deve ser auge');
  assert.equal(evaluateCareerPeak({ ...base, careerLevel: 2 }), false, 'sem maturidade de carreira não deve ser auge');
});

check('evaluateCareerPeak does not require being #1', () => {
  assert.equal(evaluateCareerPeak({ overall: 95, ceiling: 100, overallGainLastSeason: 0.2, rank: 15, careerLevel: 25 }), true);
});

check('detectPeakSeason returns the first qualifying season, or null', () => {
  const snapshots = [
    { season: 1, overall: 40, ceiling: 90, overallGain: 8, rank: 900, careerLevel: 3 },
    { season: 2, overall: 60, ceiling: 90, overallGain: 6, rank: 300, careerLevel: 8 },
    { season: 3, overall: 82, ceiling: 90, overallGain: 1.0, rank: 15, careerLevel: 14 },
    { season: 4, overall: 84, ceiling: 90, overallGain: 0.5, rank: 8, careerLevel: 18 },
  ];
  assert.equal(detectPeakSeason(snapshots), 3);
  assert.equal(detectPeakSeason(snapshots.slice(0, 2)), null);
});

// ── report ──────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length }, null, 2));
if (failed.length > 0) {
  process.exitCode = 1;
}
