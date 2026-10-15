// Playthrough 5.27-I — kit dos testes *-v527i: lê a evidência da fase
// (reports/rebalance-527i). Nada aqui altera o jogo.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as J from './v527dJobs.mjs';

export const ROOT = resolve('reports/rebalance-527i');
export const P = J.paths(ROOT);
export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const has = (name) => existsSync(join(ROOT, name));
export const report = (name) => readJson(join(ROOT, name));
export function csvRows(name) {
  const [head, ...lines] = readFileSync(join(ROOT, name), 'utf8').trim().split('\n');
  const cols = head.split(',');
  return lines.map((l) => {
    const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] === '' || cells[i] == null ? null : Number.isNaN(Number(cells[i])) ? cells[i] : Number(cells[i])]));
  });
}
export const manifest = () => J.loadManifest(ROOT);
export function runs() {
  if (!existsSync(P.runs)) return [];
  return readdirSync(P.runs).filter((f) => /^[a-z-]+-(casual|normal|optimizer)-seed\d{3}-2y\.json$/.test(f)).map((f) => ({ file: f, env: readJson(join(P.runs, f)) }));
}
/** Carreiras brutas do micro: micro/<candidato>/<perfil>-<dias>d/*.json */
export function microCareers(candidate, profile = 'normal', days = 365) {
  const dir = join(ROOT, 'micro', candidate, `${profile}-${days}d`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f)));
}
export function analyze() {
  return spawnSync(process.execPath, ['scripts/analyze-rebalance-527h.mjs', `--root=${ROOT}`], { encoding: 'utf8' });
}
