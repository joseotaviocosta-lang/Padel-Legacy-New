// Playthrough 5.27-K — análise da validação rápida de release: 3–5 carreiras
// Normal (Balanced-E, 2 anos), smoke Casual (1 ano) e smoke Otimizador v4
// (1 ano). Só detecta desequilíbrio grosseiro e bloqueadores; não é pesquisa.
//   node scripts/analyze-release-527k.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { at, CLASS, dist, pct, winPct, dayOfDate, debtEvents } from './lib/v527hMetrics.mjs';
import { illegitimateRegistrations, limboDecomposition } from './lib/v527jTestKit.mjs';

const ROOT = 'reports/release-validation-527k';
const RUNS = join(ROOT, 'runs', 'baseline');
const load = (dir) => (existsSync(join(RUNS, dir)) ? readdirSync(join(RUNS, dir)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(RUNS, dir, f), 'utf8'))).sort((a, b) => a.seed - b.seed) : []);
const write = (n, d) => writeFileSync(join(ROOT, n), `${JSON.stringify(d, null, 2)}\n`);
// Gates de release (prompt 5.27-K): bloqueio duro e faixa aceitável.
export const RELEASE = { block: { easyMin: 35, mediumMin: 25, hardMax: 60, r1Min: 30 }, accept: { easy: [45, 75], medium: [30, 60], hard: [15, 50], hardTolerance: 55, r1Min: 40, r1Tolerance: 35, sponsorY1Max: 60, prizeY1Min: 10 } };

function months(r) {
  return Object.entries(r.ledger || {}).sort(([a], [b]) => a.localeCompare(b)).map(([month, L], idx) => ({ month, idx, year: Math.floor(idx / 12) + 1, L, income: Object.values(L.income || {}).reduce((s, v) => s + v, 0), expense: Object.values(L.expense || {}).reduce((s, v) => s + v, 0) }));
}
function career(r) {
  const M = r.matches.map((m) => ({ ...m, day: dayOfDate(r.startDate, m.date) }));
  const wr = (f) => ({ wr: winPct(M.filter(f)), n: M.filter(f).length });
  const main = (t) => (m) => m.tier === t && m.stage !== 'qualifying';
  const ms = months(r);
  const y1 = ms.filter((m) => m.year === 1);
  const inc = y1.reduce((s, m) => s + m.income, 0);
  const share = (keys) => (inc ? pct(y1.reduce((s, m) => s + keys.reduce((a, k) => a + (m.L.income?.[k] || 0), 0), 0), inc) : null);
  const exp = ms.reduce((s, m) => s + m.expense, 0);
  const firstRank = (lim) => r.weekly.find((w) => w.rank && w.rank <= lim)?.day ?? null;
  const pq = (mark) => (r.partnerQuality || []).find((q) => q.mark === mark) || null;
  const titles = (y) => r.tournaments.filter((t) => t.day < 365 * y && t.status === 'champion').length;
  const limbo = limboDecomposition(r);
  return {
    seed: r.seed, profile: r.profile, days: r.days,
    easy: wr((m) => CLASS[m.tier] === 'easy'), medium: wr((m) => CLASS[m.tier] === 'medium'), hard: wr((m) => CLASS[m.tier] === 'hard'), r1: wr((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0),
    bronze: wr(main('Bronze')), silver: wr(main('Silver')), gold: wr(main('Gold')), platinum: wr(main('Platinum')),
    rank: { '6m': at(r.weekly, 182)?.rank ?? null, '1y': at(r.weekly, 365)?.rank ?? null, '2y': r.days >= 730 ? at(r.weekly, 730)?.rank ?? null : null },
    firstTop100Day: firstRank(100), firstTop10Day: firstRank(10), firstNo1Day: firstRank(1),
    titlesY1: titles(1), titlesY2Cum: r.days >= 730 ? titles(2) : null, finals: M.filter((m) => m.round === 'Final').length,
    partnerOvr: { '6m': pq(180)?.partnerOvr ?? null, '1y': pq(365)?.partnerOvr ?? null, '2y': pq(730)?.partnerOvr ?? null }, bestAttainable1y: pq(365)?.bestAttainableOvr ?? null,
    teamOvrMedian: dist(M.map((m) => m.teamStrength)).median, energyAtMatchMedian: dist(M.map((m) => m.energy)).median,
    sponsorShareY1: share(['sponsor_monthly', 'sponsor_signing']), prizeShareY1: share(['prize']),
    cash: { '6m': at(r.weekly, 182)?.coins ?? null, '1y': at(r.weekly, 365)?.coins ?? null, '2y': r.days >= 730 ? at(r.weekly, 730)?.coins ?? null : null },
    debtEvents: debtEvents({ weekly: r.weekly, months: ms, start: r.startDate, dismissals: r.dismissals || [] }).length,
    staffCostShare: exp ? pct(ms.reduce((s, m) => s + (m.L.expense?.staff || 0) + (m.L.expense?.coach || 0), 0), exp) : null,
    lifecycle: { exitDecisions: (r.exitEvents || []).filter((e) => e.revertedDay == null).length, limboDays: limbo.map((d) => d.limboDays), registrationsBlockedAfterExit: Object.entries(r.registrationFailures || {}).filter(([k]) => k.includes('PARTNERSHIP_EXIT_PENDING')).reduce((s, [, v]) => s + v, 0), illegitimateRegistrations: illegitimateRegistrations(r).length, maxExtensionDays: Math.max(0, ...limbo.map((d) => d.extensionDays ?? 0)) },
    health: { errors: (r.errors || []).length, advanceFailures: (r.advanceFailures || []).length, softLock: r.softLock?.fires || 0, forfeits: r.forfeits || 0, registrations: (r.registrations || []).length, matches: M.length, resignLoop: r.resignLoopEvents || 0 },
  };
}
function pooled(careers, list) {
  const M = list.flatMap((r) => r.matches);
  const w = (f) => ({ wr: winPct(M.filter(f)), n: M.filter(f).length });
  const main = (t) => (m) => m.tier === t && m.stage !== 'qualifying';
  return { easy: w((m) => CLASS[m.tier] === 'easy'), medium: w((m) => CLASS[m.tier] === 'medium'), hard: w((m) => CLASS[m.tier] === 'hard'), r1: w((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0), bronze: w(main('Bronze')), silver: w(main('Silver')), gold: w(main('Gold')), platinum: w(main('Platinum')),
    rank1y: dist(careers.map((c) => c.rank['1y'])), rank2y: dist(careers.map((c) => c.rank['2y'])), titlesY1: dist(careers.map((c) => c.titlesY1)), titlesY2Cum: dist(careers.map((c) => c.titlesY2Cum)),
    sponsorShareY1: dist(careers.map((c) => c.sponsorShareY1)), prizeShareY1: dist(careers.map((c) => c.prizeShareY1)), debtCareers: careers.filter((c) => c.debtEvents > 0).length };
}

const normalRaw = load('normal-730d');
const normal = normalRaw.map(career);
const agg = pooled(normal, normalRaw);
const A = RELEASE.accept; const B = RELEASE.block;
const blockers = [];
if (agg.easy.wr < B.easyMin) blockers.push(`Easy ${agg.easy.wr} < ${B.easyMin}`);
if (agg.medium.wr < B.mediumMin) blockers.push(`Medium ${agg.medium.wr} < ${B.mediumMin}`);
if (agg.hard.wr != null && agg.hard.wr > B.hardMax) blockers.push(`Hard ${agg.hard.wr} > ${B.hardMax}`);
if (agg.r1.wr < B.r1Min) blockers.push(`R1 ${agg.r1.wr} < ${B.r1Min}`);
if (normal.filter((c) => c.rank['1y'] != null && c.rank['1y'] <= 10).length >= 2) blockers.push('Top10 rotineiro @1a');
if (normal.filter((c) => c.rank['2y'] === 1).length >= 2) blockers.push('#1 rotineiro @2a');
if (normal.filter((c) => c.debtEvents >= 2).length >= 2) blockers.push('insolvência recorrente no Normal');
if (normal.some((c) => c.health.softLock > 0)) blockers.push('soft-lock');
if (normal.some((c) => c.lifecycle.illegitimateRegistrations > 0 || c.lifecycle.maxExtensionDays > 0)) blockers.push('regressão de lifecycle');
const warnings = [];
if (agg.easy.wr < A.easy[0] || agg.easy.wr > A.easy[1]) warnings.push(`Easy ${agg.easy.wr} fora de ${A.easy.join('–')}`);
if (agg.medium.wr < A.medium[0] || agg.medium.wr > A.medium[1]) warnings.push(`Medium ${agg.medium.wr} fora de ${A.medium.join('–')}`);
if (agg.hard.wr != null && (agg.hard.wr < A.hard[0] || agg.hard.wr > A.hard[1])) warnings.push(`Hard ${agg.hard.wr} fora de ${A.hard.join('–')}${agg.hard.wr <= A.hardTolerance ? ' (dentro da tolerância 55)' : ''}`);
if (agg.r1.wr < A.r1Min) warnings.push(`R1 ${agg.r1.wr} < ${A.r1Min}${agg.r1.wr >= A.r1Tolerance ? ' (tolerância 35–40)' : ''}`);
if (agg.rank1y.median != null && agg.rank1y.median <= 100) warnings.push(`rank @1a mediana ${agg.rank1y.median} (top100)`);
if (agg.rank2y.median != null && agg.rank2y.median <= 30) warnings.push(`rank @2a mediana ${agg.rank2y.median} (rápido)`);
if (agg.titlesY1.median != null && agg.titlesY1.median > 5) warnings.push(`títulos Y1 mediana ${agg.titlesY1.median}`);
if (agg.sponsorShareY1.median > A.sponsorY1Max) warnings.push(`sponsor Y1 ${agg.sponsorShareY1.median} > ${A.sponsorY1Max}`);
if (agg.prizeShareY1.median < A.prizeY1Min) warnings.push(`prize Y1 ${agg.prizeShareY1.median} < ${A.prizeY1Min}`);
write('normal-fast-runs.json', { config: 'balanced-e · Normal · v4 · Silver 15% · lifecycle 5.27-J · 2 anos', seeds: normal.map((c) => c.seed), careers: normal, aggregate: agg, release: RELEASE, blockers, warnings });

const casual = load('casual-365d').map(career);
const opt = load('optimizer-365d');
write('casual-smoke.json', { config: 'balanced-e · Casual · 1 ano', careers: casual, blockers: casual.flatMap((c) => [c.health.softLock > 0 && 'soft-lock', c.health.registrations === 0 && 'nenhuma inscrição', c.health.matches === 0 && 'nenhuma partida', c.health.advanceFailures > 0 && `falhas de avanço ${c.health.advanceFailures}`, c.partnerOvr['6m'] == null && 'sem parceiro', c.debtEvents >= 3 && 'dívida recorrente'].filter(Boolean)) });
const optOut = opt.map((r) => {
  const marks = (r.partnerQuality || []).filter((q) => q.mark > 0);
  let first = null; let worst = 0;
  for (const q of marks) { const bad = (q.bestAttainableOvr ?? 0) - (q.partnerOvr ?? 0) > 30; if (bad && first == null) first = q.day; if (!bad) first = null; if (first != null) worst = Math.max(worst, q.day - first); }
  return { ...career(r), partnerTimeline: (r.partners || []).map((p) => `${p.day}:${p.partnerOvr}`), partnerMarks: marks.map((q) => ({ day: q.day, partner: q.partnerOvr, best: q.bestAttainableOvr })), longestGapOver30Days: worst, gate: worst <= 180 };
});
write('optimizer-smoke.json', { config: 'balanced-e · Otimizador v4 · 1 ano', careers: optOut, pass: optOut.every((c) => c.gate) });

for (const c of normal) console.log(`seed ${c.seed}: E ${c.easy.wr} M ${c.medium.wr} H ${c.hard.wr}(${c.hard.n}) R1 ${c.r1.wr} | Br ${c.bronze.wr} Si ${c.silver.wr} Go ${c.gold.wr} Pl ${c.platinum.wr} | rank ${c.rank['6m']}/${c.rank['1y']}/${c.rank['2y']} | títulos ${c.titlesY1}/${c.titlesY2Cum} | sp ${c.sponsorShareY1} pr ${c.prizeShareY1} | dívida ${c.debtEvents} | limbo ${c.lifecycle.limboDays.join(',')} ilegítimas ${c.lifecycle.illegitimateRegistrations}`);
console.log('AGREGADO', JSON.stringify({ easy: agg.easy, medium: agg.medium, hard: agg.hard, r1: agg.r1, rank1y: agg.rank1y.median, rank2y: agg.rank2y.median, titlesY1: agg.titlesY1.median, titlesY2: agg.titlesY2Cum.median }));
console.log('bloqueios', JSON.stringify(blockers), 'avisos', JSON.stringify(warnings));
console.log('casual', JSON.stringify(casual.map((c) => ({ health: c.health, partner: c.partnerOvr, cash: c.cash, debt: c.debtEvents }))));
console.log('otimizador', JSON.stringify(optOut.map((c) => ({ partners: c.partnerTimeline, gap: c.longestGapOver30Days, gate: c.gate }))));
