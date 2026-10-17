// CLOUD-5 — microbenchmarks determinísticos (entrada fixa, sem aleatoriedade).
// Uso: node scripts/benchmark-phase5-micro.mjs [--samples=7] [--pairs=60000]
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { resolveTeamCourtSides, evaluatePartnerCompatibility } from '../src/players/teamCompatibility.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SAMPLES = Number(args.samples) || 7;
const PAIRS = Number(args.pairs) || 60000;

// Gerador LCG fixo: mesma população em toda execução.
let seed = 123456789;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const sides = ['right', 'left', 'flex', 'direita', 'esquerda', undefined];
const athletes = Array.from({ length: 400 }, (_, i) => ({
  id: `a${i}`, name: `Atleta ${i}`, source_type: i % 3 === 0 ? 'real' : 'fictional',
  preferred_side: sides[Math.floor(rnd() * sides.length)], side_flexibility: rnd() < 0.2 ? undefined : rnd(),
  side_experience: rnd() < 0.3 ? undefined : { right: Math.round(rnd() * 100), left: Math.round(rnd() * 100) },
  overall_rating: 30 + Math.round(rnd() * 65), handedness: rnd() < 0.5 ? 'left' : 'right',
}));
const pairs = Array.from({ length: PAIRS }, () => [athletes[Math.floor(rnd() * 400)], athletes[Math.floor(rnd() * 400)]]);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const samples = [];
let digest = '';
for (let s = 0; s < SAMPLES + 1; s += 1) {
  const hash = createHash('sha256');
  const t0 = performance.now();
  for (const [a, b] of pairs) {
    const r = evaluatePartnerCompatibility(a, b);
    hash.update(`${r.total}|${r.sideResolution.assignments.playerA}|${r.sideResolution.penalties.total}|${r.sideResolution.explanation};`);
  }
  const ms = performance.now() - t0;
  if (s > 0) samples.push(ms); // descarta aquecimento
  digest = hash.digest('hex');
}
console.log(JSON.stringify({
  benchmark: 'evaluatePartnerCompatibility', pairs: PAIRS, node: process.version,
  samplesMs: samples.map((x) => Number(x.toFixed(1))), medianMs: Number(median(samples).toFixed(1)),
  outputSha256: digest,
}, null, 1));
