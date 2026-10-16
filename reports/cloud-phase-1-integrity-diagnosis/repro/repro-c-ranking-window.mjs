// CLOUD-1 / Investigação C — linha do tempo da janela móvel do ranking para o
// cenário 4C.1 de scripts/test-ranking-rolling-window-fase4.mjs.
//
// NÃO DESTRUTIVA e PURA: usa só as funções reais de src/game-core/rankingWindow.js
// (effectiveResultPoints, computeRollingPoints, isResultExpired), sem storage.
//
// Cenário (o mesmo do teste):
//  - "top10-inactive": âncora legada de 6000 pts datada na 1ª semana do
//    circuito (2025-12-29), nunca mais joga;
//  - 25 "fillers" que ganham 100 pts toda semana (Silver, r16).
// Compara a regra ATUAL (âncora decai linearmente — 5.26-C) com a regra que o
// teste espera (âncora a valor cheio até expirar — Fase 4 original).
//
// Uso: node reports/cloud-phase-1-integrity-diagnosis/repro/repro-c-ranking-window.mjs [--out=<arquivo.json>]
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
let report;
try {
  const W = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');
  const START = '2025-12-29';
  const anchor = W.buildLegacySeedRow('top10-inactive', 6000, START);
  const fillerRows = [];
  const timeline = [];
  // Mesmo laço do teste: semana k é processada na data START + 7*(k-1);
  // o resultado do filler da semana k é datado nessa mesma data.
  for (let week = 1; week <= 60; week += 1) {
    const date = addDays(START, 7 * (week - 1));
    fillerRows.push({ id: `f:${week}`, date, points: 100, finish: 'r16', tier: 'Silver' });
    const ageDays = W.careerDaysBetween ? W.careerDaysBetween(START, date) : 7 * (week - 1);
    const current = W.computeRollingPoints([anchor], [], date);
    const legacyRule = W.isResultExpired(anchor, date) ? 0 : anchor.points; // regra esperada pelo teste
    const filler = W.computeRollingPoints(fillerRows, [], date);
    timeline.push({
      week, date, anchorAgeDays: ageDays,
      anchorExpired: W.isResultExpired(anchor, date),
      inactivePoints_currentRule: current,
      inactivePoints_testExpectation: legacyRule,
      fillerPoints: filler,
      inactiveAheadOfFillers_currentRule: current > filler,
    });
  }
  const firstBehind = timeline.find((t) => !t.inactiveAheadOfFillers_currentRule);
  report = {
    source: 'src/game-core/rankingWindow.js (RANKING_WINDOW_DAYS=364, RANKING_BEST_N=22, effectiveResultPoints linear para legacy_seed desde 5.26-C)',
    gateUnderTest: '(4C.1) na semana 52, o total do inativo ainda é o valor cheio da âncora (6000)',
    week52: timeline.find((t) => t.week === 52),
    week53: timeline.find((t) => t.week === 53),
    week54: timeline.find((t) => t.week === 54),
    firstWeekInactiveFallsBehindFillers_currentRule: firstBehind ? { week: firstBehind.week, date: firstBehind.date, inactive: firstBehind.inactivePoints_currentRule, filler: firstBehind.fillerPoints } : null,
    sample: timeline.filter((t) => [1, 2, 10, 13, 20, 26, 39, 52, 53, 54, 60].includes(t.week)),
    timeline,
  };
} finally {
  await vite.close();
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
const { timeline, ...head } = report;
console.log(JSON.stringify(head, null, 2));
