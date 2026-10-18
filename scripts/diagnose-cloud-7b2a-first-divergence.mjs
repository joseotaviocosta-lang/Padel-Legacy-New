// CLOUD-7B2A — duas carreiras independentes (mesma seed/relógio/UUID) no mesmo processo; checkpoints por dia; reporta o 1º dia/coleção divergente.
// Uso: node scripts/diagnose-cloud-7b2a-first-divergence.mjs [--days=60] [--seed=7b2a] [--output=<json>]
import fs from 'node:fs';
import { openServer, createRun, firstDiff } from './lib/cloud7b2aDeterminismKit.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const DAYS = Number(args.days ?? 60); const SEED = String(args.seed ?? '7b2a');
const env = await openServer();
try {
  const hist = [];
  for (const label of ['A', 'B']) {
    const run = await createRun(env, { seed: SEED }); const cps = [run.checkpoint()];
    for (let d = 1; d <= DAYS; d += 1) { await run.advance(); cps.push(run.checkpoint()); }
    hist.push({ run, cps }); console.log(`run ${label} ok, career=${run.careerId}, blocked=${run.blocked.length}`);
  }
  const [A, B] = hist; let first = null;
  for (let d = 0; d <= DAYS; d += 1) {
    const diff = firstDiff(A.cps[d], B.cps[d]).filter((k) => !/^career_id$|^id$/.test(k));
    if (diff.length) { first = { day: d, date: null, fields: diff.map((k) => ({ k, A: A.cps[d][k], B: B.cps[d][k] })) }; break; }
  }
  const out = { seed: SEED, days: DAYS, firstDivergence: first };
  console.log(JSON.stringify(out, null, 1));
  if (args.output) fs.writeFileSync(args.output, JSON.stringify(out, null, 2));
} finally { await env.server.close(); }
