// Playthrough 5.26-C, Bloco A — janela do World: cada resultado expira pela
// PRÓPRIA data (364 dias), só os 22 melhores contam, e a âncora legada
// (pontos iniciais do mundo, sem data real) perde valor linearmente ao longo
// da janela em vez de cair inteira no último dia.
import { makeSuite, bootModules, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-ranking-expiration-window-v526c');
const rt = await bootModules();
try {
  const W = await rt.load('/src/game-core/rankingWindow.js');
  const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const real = (date, points, id = date) => ({ id, date, points, finish: 'champion' });
  const anchor = (date, points) => ({ id: 'a', date, points, finish: 'legacy_seed', is_legacy_seed: true });

  await check('janela = 364 dias, best-N = 22', () => {
    assert.equal(W.RANKING_WINDOW_DAYS, 364);
    assert.equal(W.RANKING_BEST_N, 22);
  });
  await check('resultado real vale 100% até o dia 364 e expira no 365 (pela própria data)', () => {
    const row = real('2026-03-10', 500);
    assert.equal(W.computeRollingPoints([row], [], add('2026-03-10', 0)), 500);
    assert.equal(W.computeRollingPoints([row], [], add('2026-03-10', 364)), 500);
    assert.equal(W.computeRollingPoints([row], [], add('2026-03-10', 365)), 0);
  });
  await check('virada do ano NÃO expira nada sozinha (01/01 não é data de corte)', () => {
    const row = real('2026-06-15', 300);
    assert.equal(W.computeRollingPoints([row], [], '2026-12-31'), 300);
    assert.equal(W.computeRollingPoints([row], [], '2027-01-01'), 300);
    assert.equal(W.computeRollingPoints([row], [], '2027-06-14'), 300);
    assert.equal(W.computeRollingPoints([row], [], '2027-06-15'), 0);
  });
  await check('datas diferentes expiram em dias diferentes (sem penhasco coletivo)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => real(add('2026-01-05', i * 7), 100, `r${i}`));
    const series = Array.from({ length: 80 }, (_, d) => W.computeRollingPoints(rows, [], add('2027-01-01', d)));
    const drops = series.slice(1).map((v, i) => series[i] - v);
    assert.ok(Math.max(...drops) <= 100, `queda máx ${Math.max(...drops)}`);
  });
  await check('só os 22 melhores contam', () => {
    const rows = Array.from({ length: 30 }, (_, i) => real('2026-05-01', i + 1, `b${i}`));
    const expected = Array.from({ length: 22 }, (_, i) => 30 - i).reduce((a, b) => a + b, 0);
    assert.equal(W.computeRollingPoints(rows, [], '2026-05-02'), expected);
  });
  await check('extraRows (resultado da própria chamada) entra antes do corte', () => {
    assert.equal(W.computeRollingPoints([real('2026-01-01', 10)], [real('2026-02-01', 40, 'x')], '2026-02-01'), 50);
  });
  await check('âncora legada: 100% ao nascer, ~50% na metade, 0 no fim da janela', () => {
    const a = anchor('2026-01-03', 1000);
    assert.equal(W.effectiveResultPoints(a, '2026-01-03'), 1000);
    assert.equal(W.effectiveResultPoints(a, add('2026-01-03', 182)), 500);
    assert.equal(W.effectiveResultPoints(a, add('2026-01-03', 364)), 0);
    assert.equal(W.computeRollingPoints([a], [], add('2026-01-03', 365)), 0);
  });
  await check('âncora decai sem degrau: maior queda diária ≤ 1/364 do valor (+arredondamento)', () => {
    const a = anchor('2026-01-03', 3640);
    const s = Array.from({ length: 366 }, (_, d) => W.computeRollingPoints([a], [], add('2026-01-03', d)));
    const drops = s.slice(1).map((v, i) => s[i] - v);
    assert.ok(Math.max(...drops) <= 11, `queda máx ${Math.max(...drops)}`);
    assert.ok(Math.min(...drops) >= 0);
  });
  await check('resultado real NÃO decai (só a âncora tem valor proporcional)', () => {
    const r = real('2026-01-03', 1000);
    assert.equal(W.effectiveResultPoints(r, add('2026-01-03', 300)), 1000);
  });
  await check('âncora ocupa 1 slot dos 22 e sai da soma quando há 22 resultados melhores', () => {
    const rows = [anchor('2026-01-03', 50), ...Array.from({ length: 22 }, (_, i) => real('2026-02-01', 100, `c${i}`))];
    assert.equal(W.computeRollingPoints(rows, [], '2026-02-02'), 2200);
  });
} finally {
  await rt.close();
}
finish();
