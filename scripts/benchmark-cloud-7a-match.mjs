// CLOUD-7A — custo do motor de partida: preparação (createMatch), custo por ponto (playPoint) e
// como ele cresce com o número de pontos já jogados (clone/estatísticas incrementais), tamanho do
// estado em memória/JSON e verificação de determinismo (mesma seed => mesmo resultado).
// Somente medição; usa o motor de produção sem modificá-lo.
//
// Uso: node scripts/benchmark-cloud-7a-match.mjs [--matches=60] [--output=reports/cloud-phase-7a-performance-audit/data/match.json]
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const MATCHES = Number(args.matches) || 60;
const OUTPUT = args.output || 'reports/cloud-phase-7a-performance-audit/data/match.json';

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r3 = (n) => Number(n.toFixed(3));
const summary = (xs) => ({ n: xs.length, median: r3(pct(xs, 0.5)), p95: r3(pct(xs, 0.95)), max: r3(Math.max(0, ...xs)), total: r3(xs.reduce((a, b) => a + b, 0)) });

function athlete(id, name, side, boost = 0) {
  return { id, name, side, attributes: { serve: 62 + boost, forehand: 63 + boost, backhand: 61 + boost, volley: 60 + boost, smash: 64 + boost, lob: 59 + boost, speed: 61 + boost, stamina: 65 + boost, reflexes: 62 + boost, positioning: 61 + boost, consistency: 62 + boost, mental: 60 + boost } };
}
const teams = (boost) => [
  [athlete('p1', 'Jogador', 'right', 4 + boost), athlete('p2', 'Parceiro', 'left', 3 + boost)],
  [athlete('o1', 'Rival A', 'right'), athlete('o2', 'Rival B', 'left')],
];

function playFull(seed, boost) {
  const [a, b] = teams(boost);
  const tCreate = performance.now();
  let state = createMatch(a, b, { seed });
  const createMs = performance.now() - tCreate;
  const pointMs = [];
  let guard = 0;
  while (!state.finished && guard < 2000) {
    const t = performance.now();
    state = playPoint(state);
    pointMs.push(performance.now() - t);
    guard += 1;
  }
  return { state, createMs, pointMs };
}

const runs = [];
const byDecile = Array.from({ length: 10 }, () => []);
const digests = new Map();
let determinismMismatch = 0;
for (let i = 0; i < MATCHES; i += 1) {
  const boost = (i % 5) - 2;
  const seed = `7a-match-${i}`;
  const { state, createMs, pointMs } = playFull(seed, boost);
  const totalMs = pointMs.reduce((a, b) => a + b, 0);
  const jsonStart = performance.now();
  const json = JSON.stringify(state);
  const stringifyMs = performance.now() - jsonStart;
  const cloneStart = performance.now();
  structuredClone(state);
  const cloneMs = performance.now() - cloneStart;
  pointMs.forEach((ms, idx) => byDecile[Math.min(9, Math.floor((idx / pointMs.length) * 10))].push(ms));
  runs.push({ points: pointMs.length, createMs, totalMs, stateBytes: json.length, stringifyMs, cloneMs, firstHalfMs: pointMs.slice(0, pointMs.length >> 1).reduce((a, b) => a + b, 0) / Math.max(1, pointMs.length >> 1), secondHalfMs: pointMs.slice(pointMs.length >> 1).reduce((a, b) => a + b, 0) / Math.max(1, pointMs.length - (pointMs.length >> 1)) });
  digests.set(seed, createHash('sha256').update(JSON.stringify({ scores: state.setScores, winner: state.winner, points: pointMs.length, stats: state.stats?.points })).digest('hex'));
  // determinismo: repete a mesma seed em 1 a cada 6 partidas
  if (i % 6 === 0) {
    const again = playFull(seed, boost).state;
    const d2 = createHash('sha256').update(JSON.stringify({ scores: again.setScores, winner: again.winner, points: again.pointEvents?.length, stats: again.stats?.points })).digest('hex');
    const d1 = createHash('sha256').update(JSON.stringify({ scores: state.setScores, winner: state.winner, points: state.pointEvents?.length, stats: state.stats?.points })).digest('hex');
    if (d1 !== d2) determinismMismatch += 1;
  }
}

const allPoints = byDecile.flat();
const report = {
  environment: { node: process.version, platform: process.platform, matches: MATCHES, note: 'Node, CPU do contêiner; NÃO representa o Android' },
  perMatch: {
    points: summary(runs.map((r) => r.points)),
    createMatchMs: summary(runs.map((r) => r.createMs)),
    totalPlayMs: summary(runs.map((r) => r.totalMs)),
    stateJsonBytes: summary(runs.map((r) => r.stateBytes)),
    stringifyFinalStateMs: summary(runs.map((r) => r.stringifyMs)),
    structuredCloneFinalStateMs: summary(runs.map((r) => r.cloneMs)),
  },
  perPointMs: summary(allPoints),
  perPointMsByMatchDecile: byDecile.map((xs, idx) => ({ decile: idx + 1, ...summary(xs) })),
  firstHalfVsSecondHalfAvgPointMs: { first: r3(runs.reduce((a, r) => a + r.firstHalfMs, 0) / runs.length), second: r3(runs.reduce((a, r) => a + r.secondHalfMs, 0) / runs.length) },
  determinism: { repeatedSeeds: Math.ceil(MATCHES / 6), mismatches: determinismMismatch },
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
