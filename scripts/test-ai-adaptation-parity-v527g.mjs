// Playthrough 5.27-G, Bloco I — adaptação tática da IA: medida com as táticas
// já neutralizadas (times idênticos, lado A estático em Equilibrado × lado B
// adaptativo). Só pode voltar a ser padrão se a vantagem for <= 5 pp E o
// jogador tiver autoridade equivalente; senão fica desligada.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-ai-adaptation-parity-v527g');
try {
  const report = JSON.parse(readFileSync('reports/rebalance-527g/ai-adaptation.json', 'utf8'));
  await check('medição feita em 4 níveis de OVR com >= 4.000 partidas cada', () => {
    assert.deepEqual(report.cells.map((c) => c.ovr), [35, 50, 65, 80]);
    for (const c of report.cells) assert.ok(c.n >= 4000);
  });
  await check(`vantagem estrutural da IA adaptativa registrada (máx. ${report.maxAdvantagePp} pp)`, () => {
    assert.equal(typeof report.maxAdvantagePp, 'number');
  });
  await check('decisão coerente com o gate: padrão continua DESLIGADO (jogador sem autoridade equivalente)', () => {
    const src = readFileSync('src/engine/match/MatchEngine.js', 'utf8');
    assert.match(src, /opponentAdaptive: options\.opponentAdaptive === true/);
    assert.equal(report.defaultEnabled, false);
    assert.ok(report.reason && report.reason.length > 20);
  });
} finally {
  finish();
}
