// CLOUD-7B2C — agrega os JSON do benchmark A/B (medianas/p95 sobre todas as amostras das repetições alternadas).
// Uso: node scripts/summarize-cloud-7b2c-ab.mjs <dir-com-json> [--output=<arquivo>]
import fs from 'node:fs';
const dir = process.argv[2];
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; };
const groups = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  (groups[`${r.saveFile}|${r.storage}|${r.strategy}`] ||= []).push(r);
}
const out = {};
for (const [k, g] of Object.entries(groups).sort()) {
  const days = g.flatMap((r) => r.dayMs.samples);
  out[k] = {
    runs: g.length, samples: days.length, saveBytes: g[0].saveBytes, endSaveBytes: Math.round(med(g.map((r) => r.endSaveBytes))),
    dayMedianMs: Math.round(med(days)), dayP95Ms: Math.round(p95(days)), loadMedianMs: Math.round(med(g.flatMap((r) => r.loadMs.samples))),
    writeMedianMs: Math.round(med(g.flatMap((r) => r.writeMs.samples))), firstDayMs: Math.round(med(g.map((r) => r.firstDayMs))), heapMB: Math.round(med(g.map((r) => r.heapMB))),
    ...(g[0].incrementalStats?.packs ? { incremental: g[0].incrementalStats } : {}),
  };
}
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.table(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, incremental: v.incremental ? `${v.incremental.materializations} mat / ${v.incremental.views} views` : '' }])));
