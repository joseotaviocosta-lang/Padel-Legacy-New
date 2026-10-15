// Playthrough 5.27-H — kit dos testes *-v527h: lê a evidência da matriz oficial
// (reports/rebalance-527h) e roda o analisador. Nada aqui altera o jogo.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as J from './v527dJobs.mjs';

export const ROOT = resolve('reports/rebalance-527h');
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
/** Roda o analisador (idempotente: só reescreve as saídas a partir dos runs). */
export function analyze() {
  return spawnSync(process.execPath, ['scripts/analyze-rebalance-527h.mjs', `--root=${ROOT}`], { encoding: 'utf8' });
}
