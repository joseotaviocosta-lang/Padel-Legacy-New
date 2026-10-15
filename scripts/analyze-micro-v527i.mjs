// Playthrough 5.27-I, Blocos B/D/H — baseline e candidatos Silver no micro
// (Normal, 1 ano): composição do campo por tier (quantis de OVR/rank/fit/força
// do campo montado), WR por tier (qualifying × main), R1 por tier e o micro-gate.
//   node scripts/analyze-micro-v527i.mjs [--root=reports/rebalance-527i/micro] [--candidates=baseline,SILVER_A,...]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CLASS, dist, wl } from './lib/v527hMetrics.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ROOT = resolve(arg('root', 'reports/rebalance-527i/micro'));
const OUT = resolve(arg('out', 'reports/rebalance-527i'));
const PROFILE = arg('profile', 'normal');
const DAYS = Number(arg('days', 365));
const names = arg('candidates', 'baseline,SILVER_A,SILVER_B,SILVER_C,SILVER_D').split(',').filter((c) => existsSync(join(ROOT, c, `${PROFILE}-${DAYS}d`)));
// Micro-gate (item 33) e materialidade Silver × Gold (item 40), pré-registrados.
export const MICRO_GATE = { easyMin: 40, mediumMin: 28, r1Min: 35 };
export const SILVER_VS_GOLD_MATERIAL_PP = 5; // falha estrutural: Silver WR + 5 < Gold WR
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

const load = (c) => {
  const dir = join(ROOT, c, `${PROFILE}-${DAYS}d`);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
};
export function summarize(careers) {
  const M = careers.flatMap((r) => r.matches);
  const main = (t) => M.filter((m) => m.tier === t && m.stage !== 'qualifying');
  const fd = careers.flatMap((r) => r.fieldDiag || []);
  const fieldOf = (t) => {
    const f = fd.filter((x) => x.tier === t);
    const med = (k, p) => dist(f.map((x) => x[k]?.[p])).median;
    return { fields: f.length, ovr: { p10: med('ovr', 'p10'), p25: med('ovr', 'p25'), p50: med('ovr', 'p50'), p75: med('ovr', 'p75'), p90: med('ovr', 'p90') }, rank: { p10: med('rank', 'p10'), p25: med('rank', 'p25'), p50: med('rank', 'p50'), p75: med('rank', 'p75'), p90: med('rank', 'p90') }, fit: { p10: med('fit', 'p10'), p50: med('fit', 'p50'), p90: med('fit', 'p90') }, strength: { p10: med('strength', 'p10'), p50: med('strength', 'p50'), p90: med('strength', 'p90') }, offset: dist(f.map((x) => x.offset)).median, orderedSize: dist(f.map((x) => x.orderedSize)).median, preferredSize: dist(f.map((x) => x.preferredSize)).median, preferredInField: dist(f.map((x) => x.preferredInField)).median };
  };
  const faced = (t) => { const ms = M.filter((m) => m.tier === t); return { opp: dist(ms.map((m) => m.oppStrength)).median, team: dist(ms.map((m) => m.teamStrength)).median }; };
  const s = {
    careers: careers.length, matches: M.length,
    easy: wl(M.filter((m) => CLASS[m.tier] === 'easy')), medium: wl(M.filter((m) => CLASS[m.tier] === 'medium')), hard: wl(M.filter((m) => CLASS[m.tier] === 'hard')),
    r1: wl(M.filter((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0)),
    tiers: Object.fromEntries(TIERS.map((t) => [t, { all: wl(M.filter((m) => m.tier === t)), main: wl(main(t)), qualifying: wl(M.filter((m) => m.tier === t && m.stage === 'qualifying')), r1: wl(main(t).filter((m) => Number(m.stageRoundIndex) === 0)), faced: faced(t), field: fieldOf(t) }])),
  };
  const sv = s.tiers.Silver.main.wr; const go = s.tiers.Gold.main.wr; const br = s.tiers.Bronze.main.wr;
  s.order = { bronzeGtSilver: br != null && sv != null ? br >= sv : null, silverNotMateriallyHarderThanGold: sv == null || go == null || sv + SILVER_VS_GOLD_MATERIAL_PP >= go };
  s.microGate = { easy: s.easy.wr >= MICRO_GATE.easyMin, medium: s.medium.wr >= MICRO_GATE.mediumMin, r1: s.r1.wr >= MICRO_GATE.r1Min, silverVsGold: s.order.silverNotMateriallyHarderThanGold };
  s.microGate.pass = Object.values(s.microGate).every(Boolean);
  return s;
}

const summary = Object.fromEntries(names.map((c) => [c, summarize(load(c))]));
writeFileSync(join(OUT, `micro-${PROFILE}-${DAYS}d.json`), `${JSON.stringify({ at: new Date().toISOString(), profile: PROFILE, days: DAYS, gate: MICRO_GATE, silverVsGoldMaterialPp: SILVER_VS_GOLD_MATERIAL_PP, summary }, null, 2)}\n`);
const W = (x) => `${x.wr ?? ''}`;
const rows = [['candidate', 'careers', 'easyWR', 'mediumWR', 'hardWR', 'r1WR', 'bronzeMainWR', 'silverMainWR', 'goldMainWR', 'goldQualWR', 'platinumMainWR', 'bronzeR1', 'silverR1', 'goldR1', 'platinumR1', 'silverFieldOvrP25', 'silverFieldOvrP50', 'silverFieldOvrP75', 'bronzeFieldOvrP50', 'goldFieldOvrP50', 'silverFacedOpp', 'silverTeam', 'silverMatches', 'microGatePass']];
for (const [c, s] of Object.entries(summary)) {
  const T = s.tiers;
  rows.push([c, s.careers, W(s.easy), W(s.medium), W(s.hard), W(s.r1), W(T.Bronze.main), W(T.Silver.main), W(T.Gold.main), W(T.Gold.qualifying), W(T.Platinum.main), W(T.Bronze.r1), W(T.Silver.r1), W(T.Gold.r1), W(T.Platinum.r1), T.Silver.field.ovr.p25, T.Silver.field.ovr.p50, T.Silver.field.ovr.p75, T.Bronze.field.ovr.p50, T.Gold.field.ovr.p50, T.Silver.faced.opp, T.Silver.faced.team, T.Silver.all.n, s.microGate.pass]);
  console.log(`${c.padEnd(9)} E ${W(s.easy)} M ${W(s.medium)} H ${W(s.hard)} R1 ${W(s.r1)} | main Br ${W(T.Bronze.main)} Si ${W(T.Silver.main)} (${T.Silver.main.n}) Go ${W(T.Gold.main)} | campo Si P50 ${T.Silver.field.ovr.p50} [${T.Silver.field.ovr.p25}–${T.Silver.field.ovr.p75}] Br ${T.Bronze.field.ovr.p50} Go ${T.Gold.field.ovr.p50} | gate ${s.microGate.pass ? 'PASS' : 'FAIL'}`);
}
writeFileSync(join(OUT, `micro-results-${DAYS}d.csv`), `${rows.map((r) => r.join(',')).join('\n')}\n`);
if (DAYS === 365) writeFileSync(join(OUT, 'micro-results.csv'), `${rows.map((r) => r.join(',')).join('\n')}\n`);

// silver-baseline.csv (item 12/15): por seed do baseline — campo e WR por tier, qualifying × main.
if (DAYS === 365 && names.includes('baseline')) {
  const out = [['seed', 'tier', 'fieldOvrP50', 'fieldRankP50', 'facedOppOvr', 'teamOvr', 'mainWR', 'mainN', 'qualifyingWR', 'qualifyingN', 'r1WR', 'r1N']];
  for (const r of load('baseline')) {
    const s = summarize([r]);
    for (const t of TIERS) { const x = s.tiers[t]; out.push([r.seed, t, x.field.ovr.p50, x.field.rank.p50, x.faced.opp, x.faced.team, x.main.wr, x.main.n, x.qualifying.wr, x.qualifying.n, x.r1.wr, x.r1.n]); }
  }
  writeFileSync(join(OUT, 'silver-baseline.csv'), `${out.map((r) => r.join(',')).join('\n')}\n`);
}
// silver-candidates.csv (item 15/22): distribuição do campo Silver (P10–P90 de OVR, TeamRank, tierFit, força) por candidato.
{
  const out = [['candidate', 'days', 'fields', 'offsetMedian', 'orderedSize', 'preferredSize', ...['ovr', 'rank'].flatMap((k) => ['p10', 'p25', 'p50', 'p75', 'p90'].map((p) => `${k}_${p}`)), 'fit_p10', 'fit_p50', 'fit_p90', 'strength_p10', 'strength_p50', 'strength_p90', 'silverMainWR', 'silverR1WR', 'bronzeMainWR', 'goldMainWR', 'easyWR', 'mediumWR', 'r1WR']];
  for (const [c, s] of Object.entries(summary)) {
    const f = s.tiers.Silver.field;
    out.push([c, DAYS, f.fields, f.offset, f.orderedSize, f.preferredSize, ...['ovr', 'rank'].flatMap((k) => ['p10', 'p25', 'p50', 'p75', 'p90'].map((p) => f[k][p])), f.fit.p10, f.fit.p50, f.fit.p90, f.strength.p10, f.strength.p50, f.strength.p90, s.tiers.Silver.main.wr, s.tiers.Silver.r1.wr, s.tiers.Bronze.main.wr, s.tiers.Gold.main.wr, s.easy.wr, s.medium.wr, s.r1.wr]);
  }
  writeFileSync(join(OUT, `silver-candidates-${DAYS}d.csv`), `${out.map((r) => r.join(',')).join('\n')}\n`);
}
