// Playthrough 5.27-G — leitura das matrizes táticas (engine-parity-v527f.mjs
// --matrix=tactics|archetypes) gravadas em reports/rebalance-527g/.
import { readFileSync } from 'node:fs';

export const TACTICS = ['equilibrado', 'defensivo', 'tatico', 'agressivo', 'potencia'];
export function readMatrix(file) {
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], Number.isNaN(Number(v)) ? v : Number(v)])));
}
export const cell = (rows, ovr, a, b) => rows.find((r) => r.ovrA === ovr && r.tacticA === a && r.tacticB === b);
export const meanOf = (rows, ovr, a) => TACTICS.reduce((s, b) => s + cell(rows, ovr, a, b).winPctA, 0) / TACTICS.length;
