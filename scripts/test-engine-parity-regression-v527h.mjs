// Playthrough 5.27-H, Bloco G — proteções da 5.27-F/G rerodadas: times
// idênticos, side swap, sensibilidade à energia (aplicada uma vez) e
// neutralidade/side-swap tático. Hard rule: nenhuma regressão na paridade.
// Também confirma que as partidas da matriz usaram táticas estáticas (IA OFF).
import { spawnSync } from 'node:child_process';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-engine-parity-regression-v527h');
const SUITES = ['test-match-engine-identical-teams-v527f', 'test-match-engine-side-swap-v527f', 'test-energy-sensitivity-v527f', 'test-energy-single-application-v527f', 'test-tactic-neutrality-v527g', 'test-tactic-side-swap-v527g'];
try {
  for (const name of SUITES) {
    await check(`${name} verde`, () => {
      const r = spawnSync(process.execPath, [`scripts/${name}.mjs`], { encoding: 'utf8', timeout: 60 * 60 * 1000 });
      assert.equal(r.status, 0, (r.stdout || '').split('\n').filter((l) => l.startsWith('✗')).join('\n') || r.stderr);
    });
  }
  await check('matriz: nenhuma partida com adaptação da IA (tática B estática do início ao fim)', () => {
    for (const { file, env } of runs()) for (const m of env.result.matches) {
      assert.notEqual(m.opponentAdaptive, true, file);
      if (m.tacticB && m.tacticBFinal) assert.equal(m.tacticBFinal, m.tacticB, `${file} ${m.date}`);
    }
    assert.equal(report('stage1.json').tactics.aiAdaptedMatches, 0);
  });
  await check('táticas da matriz registradas com WR por confronto', () => {
    const d = report('stage1.json').tactics.distribution;
    assert.ok(Object.keys(d).length >= 1);
    for (const v of Object.values(d)) assert.ok(v.matches > 0 && v.wr != null);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
