// Playthrough 5.27-I — MICRO dos candidatos Silver (Bloco D) e do Otimizador v4
// (Bloco A): simulador real, contínuo, até 2 em paralelo. Cada candidato é só
// um conjunto de variáveis de ambiente; nada é editado entre execuções.
//   node scripts/run-micro-v527i.mjs --candidates=baseline,SILVER_A --seeds=1-5 --profile=normal --days=365
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CANDIDATES } from './lib/v527iCandidates.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ROOT = resolve(arg('root', 'reports/rebalance-527i/micro'));
const [S0, S1] = arg('seeds', '1-5').split('-').map(Number);
const PROFILE = arg('profile', 'normal');
const DAYS = Number(arg('days', 365));
const PARALLEL = Math.min(2, Number(arg('parallel', 2)));
const BASE = { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v4', PL527H_PARTNER_QUALITY: '1', PL527I_FIELD_DIAG: '1' };

const names = arg('candidates', 'baseline').split(',');
const jobs = [];
for (const c of names) for (let s = S0; s <= S1; s += 1) jobs.push({ c, seed: s, out: join(ROOT, c, `${PROFILE}-${DAYS}d`) });
const file = (j) => join(j.out, `${PROFILE}-${String(j.seed).padStart(3, '0')}.json`);
const pending = jobs.filter((j) => !existsSync(file(j)));
console.log(`micro 5.27-I: ${jobs.length} carreiras (${pending.length} pendentes) · ${names.join(', ')} · seeds ${S0}-${S1} · ${PROFILE} · ${DAYS} dias`);
async function worker() {
  while (pending.length) {
    const j = pending.shift();
    mkdirSync(j.out, { recursive: true });
    const env = { ...process.env, ...BASE, ...CANDIDATES[j.c], PL527D_FASTCLONE: '1', PL527D_ISOLATE_VITE_RNG: '1' };
    delete env.PL526_SHIM; delete env.PL527D_ROOT;
    if (!CANDIDATES[j.c].PL527E_COMPETITION) delete env.PL527E_COMPETITION;
    const t0 = Date.now();
    const code = await new Promise((r) => {
      const ch = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/sim-progression-economy-v526.mjs', `--profile=${PROFILE}`, `--seeds=${j.seed}-${j.seed}`, `--days=${DAYS}`, `--out=${j.out}`], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let err = ''; ch.stderr.on('data', (b) => { err = (err + b).slice(-800); });
      ch.on('close', (c) => { if (c !== 0) console.log(`  ${j.c} seed ${j.seed} FALHOU (${c}): ${err.slice(-300)}`); r(c); });
    });
    console.log(`  ${j.c} ${PROFILE} seed ${j.seed}: ${code === 0 ? 'ok' : 'falha'} em ${Math.round((Date.now() - t0) / 60000)} min`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
