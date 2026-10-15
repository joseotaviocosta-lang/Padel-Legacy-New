// Playthrough 5.27-E, Bloco A (item 4) — composição REAL dos campos Bronze /
// Silver / Gold (todos os torneios do mundo, não só os do jogador), lida dos
// saves dos checkpoints arquivados. Só leitura.
//   node scripts/diag-entry-field-v527e.mjs [--ckpts=dir] [--out=reports/rebalance-527e/field-strength.csv]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const DIR = arg('ckpts', 'reports/rebalance-527d/seed-checkpoints');
const OUT = arg('out', 'reports/rebalance-527e/field-strength.csv');
const LIMIT = Number(arg('limit', 3));
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const q = (v, p) => { const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; return Math.round(s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] * 10) / 10; };
const files = readdirSync(DIR).filter((f) => f.endsWith('.ckpt')).slice(0, LIMIT);
const acc = Object.fromEntries(TIERS.map((t) => [t, { teamRank: [], memberOvr: [], pairOvr: [], fieldSize: [], events: 0 }]));
for (const f of files) {
  const text = readFileSync(join(DIR, f), 'utf8');
  const payload = JSON.parse(text.slice(0, text.lastIndexOf('\n#sha256:')));
  const save = JSON.parse(Object.entries(payload.files).find(([k]) => k.startsWith('careers/'))[1]);
  const ath = new Map((save.entities.AthleteProfile || []).map((a) => [a.id, Number(a.overall_rating ?? a.overall) || null]));
  for (const t of save.entities.Tournament || []) {
    if (!TIERS.includes(t.tier) || !Array.isArray(t.draw_ranking_snapshot) || !t.draw_ranking_snapshot.length) continue;
    const a = acc[t.tier]; a.events += 1; a.fieldSize.push(t.draw_ranking_snapshot.length);
    for (const pair of t.draw_ranking_snapshot) {
      if (Number(pair.rank) > 0) a.teamRank.push(Number(pair.rank));
      const ovrs = (pair.member_ids || []).map((id) => ath.get(id)).filter(Number.isFinite);
      a.memberOvr.push(...ovrs);
      if (ovrs.length === 2) a.pairOvr.push((ovrs[0] + ovrs[1]) / 2);
    }
  }
}
const rows = [['tier', 'events', 'fieldSizeMedian', 'pairOvrP10', 'pairOvrP25', 'pairOvrP50', 'pairOvrP75', 'pairOvrP90', 'teamRankP25', 'teamRankP50', 'teamRankP75', 'rankedShare']];
for (const t of TIERS) {
  const a = acc[t];
  rows.push([t, a.events, q(a.fieldSize, 0.5), q(a.pairOvr, 0.1), q(a.pairOvr, 0.25), q(a.pairOvr, 0.5), q(a.pairOvr, 0.75), q(a.pairOvr, 0.9), q(a.teamRank, 0.25), q(a.teamRank, 0.5), q(a.teamRank, 0.75), a.memberOvr.length ? Math.round((100 * a.teamRank.length) / Math.max(1, a.pairOvr.length)) : null]);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${rows.map((r) => r.join(',')).join('\n')}\n`);
console.log(`saves: ${files.join(', ')} (OVR atual dos membros no dia do checkpoint)`);
for (const r of rows) console.log(r.map((x) => String(x ?? '-').padStart(8)).join(''));
