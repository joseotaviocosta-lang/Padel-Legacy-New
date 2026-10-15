// Playthrough 5.27-F — roda o harness puro do motor (engine-parity-v527f.mjs)
// numa raiz temporária e devolve as linhas do CSV, para os testes estatísticos.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function runEngineMatrix({ matrix, n = 2000, workers = 6, ovrs = '35,50,75', tag, extra = [] }) {
  const r = spawnSync(process.execPath, ['scripts/engine-parity-v527f.mjs', `--matrix=${matrix}`, `--n=${n}`, `--workers=${workers}`, `--ovrs=${ovrs}`, `--tag=${tag}`, ...extra], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`engine-parity falhou: ${r.stderr.slice(-500)}`);
  const lines = readFileSync(`reports/rebalance-527f/engine-${matrix}-${tag}.csv`, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], Number.isNaN(Number(v)) ? v : Number(v)])));
}
