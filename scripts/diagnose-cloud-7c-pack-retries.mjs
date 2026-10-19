// CLOUD-7C (somente diagnóstico) — quantifica as tentativas repetidas de compactação da 7B2C e o custo acumulado,
// a partir de seasons.jsonl da execução incremental (contadores acumulados) e, opcionalmente, da execução base (A/B).
// Uso: node scripts/diagnose-cloud-7c-pack-retries.mjs <dir-incremental> [<dir-base>] [--output=<json>]
import fs from 'node:fs';
const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const read = (d) => fs.readFileSync(`${d}/seasons.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const inc = read(dirs[0]); const base = dirs[1] ? read(dirs[1]) : null;
let prev = { packs: 0, packSkips: 0, packMs: 0, sweeps: 0 };
const seasons = inc.map((row, i) => {
  const s = row.incrementalStats;
  const d = { packs: s.packs - prev.packs, skips: s.packSkips - prev.packSkips, packMs: s.packMs - prev.packMs, sweeps: s.sweeps - prev.sweeps };
  prev = s;
  const meanA = base?.[i]?.dayMs.mean; const meanB = row.dayMs.mean;
  return {
    season: row.season, sweeps: d.sweeps, successfulPacks: d.packs, failedAttempts: d.skips, failedAttemptsPerSweep: Number((d.skips / d.sweeps).toFixed(1)),
    packSeconds: Number((d.packMs / 1000).toFixed(1)), packMsPerDay: Number((d.packMs / 365).toFixed(0)), msPerFailedAttempt: Number((d.packMs / Math.max(1, d.skips + d.packs)).toFixed(2)),
    dayMeanMs_incremental: meanB, dayMeanMs_base: meanA ?? null, dayMeanDeltaMs: meanA != null ? Number((meanB - meanA).toFixed(0)) : null,
    dayMeanDeltaSeasonSeconds: meanA != null ? Number(((meanB - meanA) * 365 / 1000).toFixed(1)) : null,
    settledButUnpackedInFile: null,
  };
});
const last = inc.at(-1).incrementalStats;
const totals = {
  sweeps: last.sweeps, successfulPacks: last.packs, failedAttempts: last.packSkips, packSecondsTotal: Number((last.packMs / 1000).toFixed(1)),
  attemptsPerSuccessfulPack: Number(((last.packSkips + last.packs) / last.packs).toFixed(1)),
  shareOfRunWallClockPct: Number((100 * last.packMs / inc.at(-1).elapsedMs).toFixed(1)), runWallClockMinutes: Number((inc.at(-1).elapsedMs / 60000).toFixed(1)),
  materializations: last.materializations, writeExpansions: last.writeExpansions, views: last.views,
};
const result = { incremental: dirs[0], base: dirs[1] || null, totals, seasons, note: 'packSkips = tentativas de packTournament que falharam no round-trip e foram repetidas a cada varredura (sem cache negativo); cada varredura ocorre em toda escrita de entidade.' };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(totals, null, 1)); console.table(seasons.map(({ settledButUnpackedInFile, ...r }) => r));
