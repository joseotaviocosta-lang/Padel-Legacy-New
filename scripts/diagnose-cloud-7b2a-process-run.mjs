// CLOUD-7B2A — executa UMA carreira num processo e grava checkpoints por dia (hash por coleção). Compare dois processos com diagnose-cloud-7b2a-compare.mjs.
// Uso: node scripts/diagnose-cloud-7b2a-process-run.mjs --days=60 --seed=7b2a --output=<json> [--dumpDays=1,20 --dumpDir=<dir>]
import fs from 'node:fs';
import { openServer, createRun } from './lib/cloud7b2aDeterminismKit.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const DAYS = Number(args.days ?? 60); const dump = new Set(String(args.dumpDays || '').split(',').filter(Boolean).map(Number));
const env = await openServer();
try {
  const run = await createRun(env, { seed: String(args.seed ?? '7b2a') });
  const cps = [run.checkpoint()];
  for (let d = 1; d <= DAYS; d += 1) {
    await run.advance(); cps.push(run.checkpoint());
    if (dump.has(d) && args.dumpDir) fs.writeFileSync(`${args.dumpDir}/${args.tag || 'run'}-day${d}.json`, run.saveText());
  }
  fs.writeFileSync(args.output, JSON.stringify({ days: DAYS, blocked: run.blocked, cps }));
  console.log('ok', DAYS, 'blocked', run.blocked.length);
} finally { await env.server.close(); }
