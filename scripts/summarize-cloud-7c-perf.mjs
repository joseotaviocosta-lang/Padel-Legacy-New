// CLOUD-7C — agrega o benchmark sequencial (rodadas alternadas) em saves de carreira longa com jogador ativo.
// Uso: node scripts/summarize-cloud-7c-perf.mjs <dir> [--output=<json>]
import fs from 'node:fs';
const dir = process.argv[2]; const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; };
const groups = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const season = f.match(/^s(\d+)-/)[1];
  (groups[`${season}|${r.strategy}`] ||= []).push(r);
}
const out = {};
for (const [k, g] of Object.entries(groups).sort((a, b) => Number(a[0].split('|')[0]) - Number(b[0].split('|')[0]) || a[0].localeCompare(b[0]))) {
  const days = g.flatMap((r) => r.dayMs.samples);
  out[k] = { runs: g.length, samples: days.length, saveMB: Number((g[0].saveBytes / 1048576).toFixed(1)), endSaveMB: Number((med(g.map((r) => r.endSaveBytes)) / 1048576).toFixed(1)),
    dayMedianMs: Math.round(med(days)), dayP95Ms: Math.round(p95(days)), loadMedianMs: Math.round(med(g.flatMap((r) => r.loadMs.samples))), writeMedianMs: Math.round(med(g.flatMap((r) => r.writeMs.samples))),
    firstDayMs: Math.round(med(g.map((r) => r.firstDayMs))), heapMB: Math.round(med(g.map((r) => r.heapMB))), dayRangeAcrossRoundsMs: g.map((r) => Math.round(r.dayMs.median)).join('/') };
}
const delta = {};
for (const s of ['1', '5', '10']) { const a = out[`${s}|off`]; const b = out[`${s}|incremental`]; if (a && b) delta[`season${s}`] = { daily_median_pct: Number((100 * (b.dayMedianMs - a.dayMedianMs) / a.dayMedianMs).toFixed(1)), daily_p95_pct: Number((100 * (b.dayP95Ms - a.dayP95Ms) / a.dayP95Ms).toFixed(1)), load_pct: Number((100 * (b.loadMedianMs - a.loadMedianMs) / a.loadMedianMs).toFixed(1)), write_pct: Number((100 * (b.writeMedianMs - a.writeMedianMs) / a.writeMedianMs).toFixed(1)), heap_pct: Number((100 * (b.heapMB - a.heapMB) / a.heapMB).toFixed(1)), endSave_pct: Number((100 * (b.endSaveMB - a.endSaveMB) / a.endSaveMB).toFixed(1)) }; }
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ groups: out, deltaIncrementalVsOffPct: delta }, null, 2));
console.table(out); console.log(JSON.stringify(delta, null, 1));
