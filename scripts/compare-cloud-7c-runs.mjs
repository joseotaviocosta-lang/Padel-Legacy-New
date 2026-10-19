// CLOUD-7C — compara duas execuções do harness long-career: primeiro checkpoint (dia) e entidades divergentes,
// equivalência do estado final e métricas por temporada lado a lado.
// Uso: node scripts/compare-cloud-7c-runs.mjs <dirA> <dirB> [--output=<json>]
import fs from 'node:fs';
const [dirA, dirB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
// --ignoreEntities=AnnualCareerReport: ignora entidades que só carregam telemetria de tempo real (generation.durationMs)
const IGNORE = new Set((process.argv.find((a) => a.startsWith('--ignoreEntities='))?.slice(17) || '').split(',').filter(Boolean));
const differs = (pa, pb) => Object.keys(pa).filter((k) => !IGNORE.has(k) && pa[k] !== pb[k]);
const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const hashesA = readLines(`${dirA}/hashes.jsonl`); const hashesB = readLines(`${dirB}/hashes.jsonl`);
const n = Math.min(hashesA.length, hashesB.length);
let first = null;
for (let i = 0; i < n; i += 1) {
  const d = differs(hashesA[i].parts, hashesB[i].parts);
  if (d.length) {
    first = { checkpointIndex: i, day: hashesA[i].day, date: hashesA[i].date, diffEntities: d };
    break;
  }
}
// divergências que persistem: entidades diferentes no último checkpoint comum
const last = n ? { day: hashesA[n - 1].day, diffEntities: differs(hashesA[n - 1].parts, hashesB[n - 1].parts) } : null;
const sumA = readJson(`${dirA}/summary.json`); const sumB = readJson(`${dirB}/summary.json`);
const seasonsA = readLines(`${dirA}/seasons.jsonl`); const seasonsB = readLines(`${dirB}/seasons.jsonl`);
const seasons = seasonsA.map((a, i) => {
  const b = seasonsB[i];
  return b ? { season: a.season, saveBytes: [a.saveBytes, b.saveBytes], dayMedian: [a.dayMs.median, b.dayMs.median], dayP95: [a.dayMs.p95, b.dayMs.p95], loadMs: [a.loadMs, b.loadMs], writeMs: [a.writeMs, b.writeMs], cloneMs: [a.cloneMs, b.cloneMs], heapMB: [a.heapMB, b.heapMB], worldRank: [a.worldRank, b.worldRank], tournamentsPlayed: [a.seasonCounters.tournamentsPlayed, b.seasonCounters.tournamentsPlayed], matches: [a.seasonCounters.tournamentMatches, b.seasonCounters.tournamentMatches] } : null;
}).filter(Boolean);
const result = {
  dirA, dirB, checkpointsCompared: n, identicalThroughout: first === null && n > 0, firstDivergence: first, lastCommonCheckpoint: last,
  ignoredEntities: [...IGNORE],
  finalWholeEqual: sumA && sumB ? differs(sumA.parts, sumB.parts).length === 0 : null,
  finalPartsDiff: sumA && sumB ? differs(sumA.parts, sumB.parts) : null,
  countersEqual: sumA && sumB ? JSON.stringify(sumA.counters) === JSON.stringify(sumB.counters) : null, seasons,
};
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, seasons: undefined }, null, 1));
