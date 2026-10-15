// Playthrough 5.27-G, Blocos A/B — pontuação de parceiro do Normal: componentes,
// pesos e uso da autoridade de OVR da tela/motor (inclusive na compatibilidade).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';
import { NORMAL_PARTNER_WEIGHTS, normalPartnerComponents, normalPartnerScore } from './lib/v527gPartnerScore.mjs';

const { check, finish } = makeSuite('test-normal-partner-score-v527g');
const { load, close } = await bootModules();
try {
  await check('pesos: compatibilidade 0,5 · nível 0,4 · custo 0,1 (somam 1)', () => {
    assert.deepEqual(NORMAL_PARTNER_WEIGHTS, { compatibility: 0.5, levelFit: 0.4, affordability: 0.1 });
    assert.equal(Object.values(NORMAL_PARTNER_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  });

  await check('nível: penaliza 4 pontos por OVR abaixo do jogador; acima do nível não ganha extra', () => {
    const c = (ovr) => normalPartnerComponents({ compatibility: 80, candidateOvr: ovr, playerOvr: 70, coins: 6000, salary: 300 }).levelFit;
    assert.equal(c(70), 100); assert.equal(c(91), 100); assert.equal(c(60), 60); assert.equal(c(40), 0);
  });

  await check('custo: 6 meses de salário no caixa = 100; divisão de prêmio acima de 50% desconta', () => {
    assert.equal(normalPartnerComponents({ compatibility: 0, candidateOvr: 0, playerOvr: 0, coins: 1800, salary: 300, prizeSplit: 50 }).affordability, 100);
    assert.equal(normalPartnerComponents({ compatibility: 0, candidateOvr: 0, playerOvr: 0, coins: 900, salary: 300, prizeSplit: 60 }).affordability, 30);
  });

  await check('score = soma ponderada dos componentes', () => {
    const input = { compatibility: 84, candidateOvr: 38, playerOvr: 59, coins: 4000, salary: 89, prizeSplit: 50 };
    const c = normalPartnerComponents(input);
    assert.equal(normalPartnerScore(input), 0.5 * c.compatibility + 0.4 * c.levelFit + 0.1 * c.affordability);
  });

  await check('simulador usa a mesma pontuação no seletor "balanced" da política v3', () => {
    const src = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(src, /import \{ normalPartnerScore \} from '\.\/lib\/v527gPartnerScore\.mjs';/);
    // 5.27-I: a v4 herda a v3 (POLICY_V3PLUS = v3 ou v4); o seletor do Normal é o mesmo.
    assert.match(src, /(POLICY_VERSION === 'v3'|POLICY_V3PLUS) \? pickers\.balanced\(rows\) : pickers\.compat\(rows\)/);
    assert.match(src, /const POLICY_V3PLUS = \['v3', 'v4'\]\.includes\(POLICY_VERSION\);/);
    assert.match(src, /candidateOvr: act\.ovrOf\(r\.candidate\)/);
  });

  await check('compatibilidade usa a autoridade de OVR da tela/motor (atributos), não o overall_rating declarado', async () => {
    const tc = await load('/src/players/teamCompatibility.js');
    const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
    const player = { id: 'p', preferred_side: 'direita', ...Object.fromEntries(KEYS.map((k) => [k, 63])) };
    const declaredHigh = { id: 'x', preferred_side: 'esquerda', overall_rating: 65, ...Object.fromEntries(KEYS.map((k) => [k, 38])) };
    const truly65 = { ...declaredHigh, id: 'y', ...Object.fromEntries(KEYS.map((k) => [k, 65])) };
    const a = tc.evaluatePartnerCompatibility(player, declaredHigh).breakdown.level;
    const b = tc.evaluatePartnerCompatibility(player, truly65).breakdown.level;
    assert.ok(a < b, `nível de um parceiro que joga como 38 (${a}) deve ser menor que o de um 65 real (${b})`);
    assert.equal(a, 100 - (63 - 38) * 2);
  });
} finally {
  await close();
  finish();
}
