// Playthrough 5.27-D — ANALISADOR INCREMENTAL da validação de balanceamento.
//
// Lê todos os jobs DONE de reports/rebalance-527d/runs/ (verificando hash de
// cada envelope), calcula as métricas dos Blocos H/K/L/M/N/O/P/Q e grava em
// reports/rebalance-527d/analysis/. Pode rodar a qualquer momento: enquanto um
// estágio não tiver todos os jobs, o relatório diz PARTIAL. NUNCA altera
// configuração do jogo — só recomenda (item 31).
//
//   node scripts/analyze-rebalance-527d.mjs [--root=reports/rebalance-527d]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';

const rootArg = process.argv.find((a) => a.startsWith('--root='))?.slice(7);
const ROOT = J.rootDir(rootArg);
const P = J.paths(ROOT);
const OUT = join(ROOT, 'analysis');
mkdirSync(OUT, { recursive: true });

// ── Critérios PRÉ-REGISTRADOS (gravados antes do 1º resultado do Stage 1) ──
// Os presets só diferem em economia (moedas iniciais, patrocínio, prêmio,
// staff, loja, investimento); a competição é a mesma. Por isso a
// classificação do Stage 1 é por economia + progressão; os gates absolutos de
// competição (Easy/Medium/Hard/R1) são aplicados no veredito final do Balanced
// (Stage 2, 5 anos), como na 5.27-C.
export const CRITERIA = Object.freeze({
  registeredAt: '2026-10-11T13:30:00Z',
  stage1: {
    reject: {
      sponsorShareY1MaxPct: 60, // mediana Normal
      prizeShareY1MinPct: 10, // mediana Normal
      normalInsolvencyMaxPct: 10,
      casualInsolvencyMaxPct: 20,
      normalRank2yMustBeBelow: 10, // mediana Normal top-10 em 2 anos = fácil demais
      normalRank2yMustBeAbove: 700, // mediana Normal pior que #700 em 2 anos = sem progressão
    },
    preference: {
      easyPct: [55, 75], mediumPct: [40, 60], hardPct: [20, 40], r1MinPct: 40,
      normalRank1y: [500, 700], normalRank2y: [150, 300],
      normalTitlesY1Median: [0, 1], normalTitlesY2CumMedian: [1, 3],
    },
    tieBreak: 'balanced (default atual: trocar o default exige evidência clara)',
  },
  final: {
    competition: { easyMinPct: 45, mediumMinPct: 30, hardMaxPct: 50, r1MinPct: 40 },
    competitionPreferred: { easyPct: [55, 75], mediumPct: [40, 60], hardPct: [20, 40] },
    progressionNormal: { rank1y: [500, 700], rank2y: [150, 300], rank3y: [60, 150], top10Before3yMaxPct: 20, numberOneMedianMustExceedYears: 3 },
    titlesNormal: { y1Median: [0, 1], y2CumMedian: [1, 3], noTitles3yAllCareersForbidden: true },
    economy: { sponsorY1MaxPct: 60, prizeY1MinPct: 10, normalInsolvencyMaxPct: 10, casualInsolvencyMaxPct: 20, moneySolvedMedianMinMonths: 24, moneySolvedPreferred: [30, 36] },
    investments: { passiveShareMaxPct: 33 },
    staff: { eliteStaffY1MaxPct: 20 },
    gear: { fullHighEndY1MaxPct: 20 },
  },
});

// ── Utilidades ─────────────────────────────────────────────────────────────
const CLASS = { Bronze: 'easy', Silver: 'easy', Gold: 'medium', Platinum: 'medium', Masters: 'hard', Elite: 'hard', Crown: 'hard', 'Circuit Finals': 'hard', 'Legacy Finals': 'hard' };
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const MILESTONES = [500, 250, 100, 50, 20, 10, 5, 1];
const RARITY = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];
const INCOME_RECURRING = ['sponsor_monthly', 'investment_income', 'passive_income'];
const EXPENSE_RECURRING = ['coach', 'staff', 'club_fee', 'partner_salary', 'maintenance'];
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
export function dist(values) {
  const v = values.map(num).filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return { n: 0, nullCount: values.length, mean: null, median: null, p10: null, p25: null, p75: null, p90: null, min: null, max: null, std: null };
  const mean = sum(v) / v.length;
  const std = Math.sqrt(sum(v.map((x) => (x - mean) ** 2)) / v.length);
  return { n: v.length, nullCount: values.length - v.length, mean: round1(mean), median: round1(quantile(v, 0.5)), p10: round1(quantile(v, 0.1)), p25: round1(quantile(v, 0.25)), p75: round1(quantile(v, 0.75)), p90: round1(quantile(v, 0.9)), min: v[0], max: v.at(-1), std: round1(std) };
}
const pct = (part, total) => (total ? Math.round((1000 * part) / total) / 10 : null);
const winPct = (matches) => (matches.length ? pct(matches.filter((m) => m.won).length, matches.length) : null);
const inBand = (v, [lo, hi]) => v != null && v >= lo && v <= hi;
const csv = (rows) => `${rows.map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n')}\n`;
const write = (name, data) => writeFileSync(join(OUT, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);

// ── Carga e integridade ────────────────────────────────────────────────────
const manifest = J.loadManifest(ROOT);
if (!manifest) { console.error('sem manifest'); process.exit(1); }
const integrity = { invalidHash: [], wrongCode: [], wrongBalance: [], notInManifestDone: [], manifestDoneWithoutFile: [], determinismFailures: manifest.determinismFailures.length };
const careers = [];
const runFiles = existsSync(P.runs) ? readdirSync(P.runs).filter((f) => /^[a-z]+-[a-z]+-seed\d{3}-\d+y\.json$/.test(f)) : [];
for (const f of runFiles) {
  const env = J.readJson(join(P.runs, f));
  if (J.envelopeHash(env) !== env.resultHash || J.outcomeHash(env.result) !== env.outcomeHash) { integrity.invalidHash.push(f); continue; }
  if (env.codeHash !== manifest.codeHash) integrity.wrongCode.push(f);
  if (env.balanceHash !== manifest.balanceHash) integrity.wrongBalance.push(f);
  const job = manifest.jobs.find((j) => j.id === env.jobId);
  if (!job || job.status !== 'DONE') integrity.notInManifestDone.push(f);
  careers.push(enrich(env));
}
for (const j of manifest.jobs.filter((x) => x.status === 'DONE')) if (!runFiles.includes(`${j.id}.json`)) integrity.manifestDoneWithoutFile.push(j.id);

function dayOfDate(start, date) { return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000); }
function monthIndex(start, month) { const [sy, sm] = start.split('-').map(Number); const [y, m] = month.split('-').map(Number); return (y - sy) * 12 + (m - sm); }
function at(c, day) { let best = null; for (const w of c.weekly) { if (w.day <= day) best = w; else break; } return best; }
function roundBucket(m) {
  if (m.stage === 'qualifying') return 'Q';
  if (m.round === 'Final') return 'F';
  if (m.round === 'Semifinal') return 'SF';
  if (m.round === 'Quartas de Final') return 'QF';
  return Number(m.stageRoundIndex) === 0 ? 'R1' : 'R2';
}

function enrich(env) {
  const r = env.result;
  const start = r.startDate;
  const matches = (r.matches || []).map((m) => { const day = dayOfDate(start, m.date); return { ...m, day, year: Math.floor(day / 365) + 1, cls: CLASS[m.tier] || 'other', bucket: roundBucket(m), isR1: m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0 }; });
  const tournaments = (r.tournaments || []).map((t) => ({ ...t, year: Math.floor(t.day / 365) + 1 }));
  const months = Object.entries(r.ledger || {}).sort(([a], [b]) => a.localeCompare(b)).map(([month, L]) => {
    const income = sum(Object.values(L.income || {})); const expense = sum(Object.values(L.expense || {}));
    return { month, idx: monthIndex(start, month), year: Math.floor(monthIndex(start, month) / 12) + 1, L, income, expense, opening: L.opening, closing: L.closing, net: income - expense,
      recurringIncome: sum(INCOME_RECURRING.map((k) => L.income?.[k])), recurringExpense: sum(EXPENSE_RECURRING.map((k) => L.expense?.[k])) };
  });
  return { env, id: env.jobId, stage: env.stage, preset: env.preset, profile: env.profile, seed: env.seed, years: env.targetYears, r, start, matches, tournaments, months, weekly: r.weekly || [] };
}

// ── Métricas por carreira ──────────────────────────────────────────────────
function shareByYear(c, keys, year) {
  const ms = c.months.filter((m) => m.year === year);
  const total = sum(ms.map((m) => m.income));
  return total ? pct(sum(ms.map((m) => sum(keys.map((k) => m.L.income?.[k])))), total) : null;
}
/** Money-solved canônico (item 48): receita recorrente >= despesa recorrente E caixa >= 12× despesa média, por 6 meses seguidos. */
export function moneySolved(months, { holdMonths = 6, includePrize = false } = {}) {
  let streak = 0;
  for (let i = 0; i < months.length; i += 1) {
    const window = months.slice(Math.max(0, i - 11), i + 1);
    const avgExpense = sum(window.map((m) => m.expense)) / window.length;
    const inc = months[i].recurringIncome + (includePrize ? Number(months[i].L?.income?.prize) || 0 : 0);
    const ok = months[i].recurringExpense > 0 && inc >= months[i].recurringExpense && months[i].closing >= 12 * avgExpense && avgExpense > 0;
    streak = ok ? streak + 1 : 0;
    if (streak >= holdMonths) { const first = months[i - holdMonths + 1]; return { month: first.month, monthsFromStart: first.idx + 1 }; }
  }
  return null;
}
function insolvency(c) {
  const cashZero = c.weekly.filter((w) => (w.coins || 0) <= 0);
  const debt = c.weekly.filter((w) => (w.coins || 0) < 0);
  const regMoney = Object.entries(c.r.registrationFailures || {}).filter(([k]) => /coin|moeda|insuf|saldo|fee|INSUFFICIENT/i.test(k)).reduce((s, [, v]) => s + v, 0);
  // Rescisão financiada por dívida (5.27-B): multa > caixa no momento da demissão.
  const severance = (c.r.dismissals || []).filter((d) => d.type !== 'coach').map((d) => {
    const penalty = Math.round((d.monthly || 0) * 0.5);
    const funded = penalty > (d.coins || 0);
    const after = c.weekly.filter((w) => w.day > d.day);
    const recovered = after.find((w) => (w.coins || 0) >= 0 && w.day > d.day + 7);
    return { day: d.day, penalty, fundedByDebt: funded, recoveredDay: recovered?.day ?? null, weeksToRecover: recovered ? Math.round((recovered.day - d.day) / 7) : null, laterDebt: after.some((w) => w.day > (recovered?.day ?? Infinity) && (w.coins || 0) < 0) };
  });
  return {
    insolvent: debt.length > 0, cashZeroOrLess: cashZero.length > 0, firstDebtDay: debt[0]?.day ?? null, debtWeeks: debt.length, minCash: Math.min(...c.weekly.map((w) => w.coins || 0)),
    registrationBlockedByMoney: regMoney, forcedCostReductions: (c.r.dismissals || []).length, dismissalBlocked: (c.r.dismissalBlocked || []).length, severance,
  };
}
function milestones(c) {
  const out = {};
  for (const m of MILESTONES) {
    const w = c.weekly.find((x) => x.rank && x.rank <= m);
    out[m === 1 ? '#1' : `top${m}`] = w ? { day: w.day, age: w.age ?? null, season: Number(String(w.date).slice(0, 4)), year: Math.floor(w.day / 365) + 1 } : null;
  }
  return out;
}
function staffGear(c, categories) {
  const coach = (c.r.coaches || [])[0];
  const staff = c.r.staff || [];
  const firstOf = (pred) => staff.find(pred)?.day ?? null;
  const purchases = c.r.purchases || [];
  const rarityIdx = (r) => RARITY.indexOf(r);
  const firstPurchase = (minRarity) => purchases.find((p) => rarityIdx(p.rarity) >= rarityIdx(minRarity))?.day ?? null;
  // Loadout: melhor raridade comprada por categoria (a política só compra upgrade e equipa).
  let fullHighEndDay = null;
  const best = {};
  for (const p of purchases) {
    if (rarityIdx(p.rarity) > (best[p.category] ?? -1)) best[p.category] = rarityIdx(p.rarity);
    if (fullHighEndDay == null && categories.length && categories.every((cat) => (best[cat] ?? -1) >= rarityIdx('epico'))) fullHighEndDay = p.day;
  }
  const fullStaffWeek = c.weekly.find((w) => (w.staff || 0) >= 7);
  const totalExpense = sum(c.months.map((m) => m.expense));
  return {
    firstCoachDay: coach?.day ?? null, firstCoachTier: coach?.tier ?? null,
    firstStaffDay: firstOf(() => true), highTierStaffDay: firstOf((s) => ['Profissional', 'Elite'].includes(s.tier)), eliteStaffDay: firstOf((s) => s.tier === 'Elite'),
    eliteCoachDay: (c.r.coaches || []).find((x) => ['elite', 'lendario'].includes(x.tier))?.day ?? null,
    fullStaffDay: fullStaffWeek?.day ?? null,
    recurringCostSharePct: totalExpense ? pct(sum(c.months.map((m) => (m.L.expense?.staff || 0) + (m.L.expense?.coach || 0))), totalExpense) : null,
    firstUpgradeDay: purchases[0]?.day ?? null, midTierDay: firstPurchase('raro'), highEndDay: firstPurchase('epico'), fullHighEndLoadoutDay: fullHighEndDay,
    gearPurchases: purchases.length,
  };
}

// ── Agregações ─────────────────────────────────────────────────────────────
const categoriesSeen = [...new Set(careers.flatMap((c) => (c.r.purchases || []).map((p) => p.category)))].sort();
for (const c of careers) {
  c.ins = insolvency(c);
  c.ms = moneySolved(c.months);
  c.msWithPrize = moneySolved(c.months, { includePrize: true });
  c.miles = milestones(c);
  c.sg = staffGear(c, categoriesSeen);
  c.titlesByYear = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => [y, c.tournaments.filter((t) => t.status === 'champion' && t.year === y).length]));
  c.titlesCum = (y) => c.tournaments.filter((t) => t.status === 'champion' && t.year <= y).length;
}
function competition(list, { year = null } = {}) {
  const ms = list.flatMap((c) => c.matches).filter((m) => year == null || m.year === year);
  return {
    matches: ms.length,
    easyWR: winPct(ms.filter((m) => m.cls === 'easy')), mediumWR: winPct(ms.filter((m) => m.cls === 'medium')), hardWR: winPct(ms.filter((m) => m.cls === 'hard')),
    easyN: ms.filter((m) => m.cls === 'easy').length, mediumN: ms.filter((m) => m.cls === 'medium').length, hardN: ms.filter((m) => m.cls === 'hard').length,
    r1WR: winPct(ms.filter((m) => m.isR1)), r1N: ms.filter((m) => m.isR1).length,
    tiers: Object.fromEntries(TIERS.map((t) => [t, { n: ms.filter((m) => m.tier === t).length, wr: winPct(ms.filter((m) => m.tier === t)) }])),
    rounds: Object.fromEntries(['Q', 'R1', 'R2', 'QF', 'SF', 'F'].map((b) => [b, { n: ms.filter((m) => m.bucket === b).length, wr: winPct(ms.filter((m) => m.bucket === b)) }])),
  };
}
function economyBlock(list, years) {
  const yrs = Array.from({ length: years }, (_, i) => i + 1);
  return {
    sponsorShareByYear: Object.fromEntries(yrs.map((y) => [`Y${y}`, dist(list.map((c) => shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], y)))])),
    prizeShareByYear: Object.fromEntries(yrs.map((y) => [`Y${y}`, dist(list.map((c) => shareByYear(c, ['prize'], y)))])),
    investmentShareByYear: Object.fromEntries(yrs.map((y) => [`Y${y}`, dist(list.map((c) => shareByYear(c, ['investment_income'], y)))])),
    passiveShareByYear: Object.fromEntries(yrs.map((y) => [`Y${y}`, dist(list.map((c) => shareByYear(c, ['investment_income', 'passive_income'], y)))])),
    insolvencyPct: pct(list.filter((c) => c.ins.insolvent).length, list.length),
    cashZeroOrLessPct: pct(list.filter((c) => c.ins.cashZeroOrLess).length, list.length),
    forcedCostReductionPct: pct(list.filter((c) => c.ins.forcedCostReductions > 0).length, list.length),
    registrationBlockedByMoneyCareers: list.filter((c) => c.ins.registrationBlockedByMoney > 0).length,
    minCash: dist(list.map((c) => c.ins.minCash)),
    endingCash: dist(list.map((c) => c.r.finalCoins)),
    moneySolvedObserved: list.filter((c) => c.ms).length,
    moneySolvedMonths: dist(list.map((c) => c.ms?.monthsFromStart ?? null)),
    moneySolvedCensoredMedian: censoredMedian(list.map((c) => c.ms?.monthsFromStart ?? null), years * 12),
    moneySolvedWithPrizeSensitivity: dist(list.map((c) => c.msWithPrize?.monthsFromStart ?? null)),
  };
}
/** Mediana com censura: se ≥50% nunca resolveram no horizonte, a mediana é "> horizonte". */
function censoredMedian(values, horizonMonths) {
  const n = values.length; if (!n) return null;
  const observed = values.filter((v) => v != null).sort((a, b) => a - b);
  if (observed.length < n / 2) return { median: null, censored: true, label: `> ${horizonMonths} meses (não observado em ${n - observed.length}/${n})` };
  return { median: observed[Math.ceil(n / 2) - 1], censored: false, label: `${observed[Math.ceil(n / 2) - 1]} meses` };
}
function progression(list, days) {
  return Object.fromEntries(days.map((d) => [`d${d}`, dist(list.map((c) => at(c, d)?.rank ?? null))]));
}

const stageStatus = (stage) => {
  const jobs = manifest.jobs.filter((j) => j.stage === stage && j.required);
  const done = jobs.filter((j) => j.status === 'DONE').length;
  return { done, required: jobs.length, complete: done === jobs.length, label: done === jobs.length ? 'COMPLETE' : 'PARTIAL', optionalDone: manifest.jobs.filter((j) => j.stage === stage && !j.required && j.status === 'DONE').length };
};
const S1 = stageStatus('1'); const S2 = stageStatus('2'); const SL = stageStatus('long');

// ── Stage 1 ────────────────────────────────────────────────────────────────
const s1 = careers.filter((c) => c.stage === '1');
const stage1 = { status: S1, presets: {} };
for (const preset of J.PRESETS) {
  const list = s1.filter((c) => c.preset === preset);
  const byProfile = {};
  for (const profile of ['all', ...J.PROFILES]) {
    const l = profile === 'all' ? list : list.filter((c) => c.profile === profile);
    byProfile[profile] = {
      careers: l.length, competition: competition(l),
      rank1y: dist(l.map((c) => at(c, 365)?.rank)), rank2y: dist(l.map((c) => at(c, 730)?.rank)),
      ovr2y: dist(l.map((c) => at(c, 730)?.ovr)),
      titlesY1: dist(l.map((c) => c.titlesByYear[1])), titles2y: dist(l.map((c) => c.titlesCum(2))),
      ...economyBlock(l, 2),
    };
  }
  stage1.presets[preset] = byProfile;
}
// Comparação pareada (mesma seed/perfil).
const paired = [];
for (const [a, b] of [['conservative', 'balanced'], ['balanced', 'hardcore']]) {
  for (const profile of J.PROFILES) for (let seed = 1; seed <= 5; seed += 1) {
    const ca = s1.find((c) => c.preset === a && c.profile === profile && c.seed === seed);
    const cb = s1.find((c) => c.preset === b && c.profile === profile && c.seed === seed);
    if (!ca || !cb) continue;
    const row = (c) => ({ rank2y: at(c, 730)?.rank ?? null, titles2y: c.titlesCum(2), finalCoins: c.r.finalCoins, wr: winPct(c.matches), insolvent: c.ins.insolvent, sponsorY1: shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], 1), prizeY1: shareByYear(c, ['prize'], 1) });
    paired.push({ pair: `${a}-vs-${b}`, profile, seed, [a]: row(ca), [b]: row(cb) });
  }
}
stage1.paired = {};
for (const pair of ['conservative-vs-balanced', 'balanced-vs-hardcore']) {
  const rows = paired.filter((p) => p.pair === pair); const [a, b] = pair.split('-vs-');
  stage1.paired[pair] = {
    pairs: rows.length,
    rank2yDelta: dist(rows.map((p) => (p[b].rank2y ?? 0) - (p[a].rank2y ?? 0))), // + = segundo preset pior colocado
    finalCoinsDelta: dist(rows.map((p) => p[b].finalCoins - p[a].finalCoins)),
    titlesDelta: dist(rows.map((p) => p[b].titles2y - p[a].titles2y)),
    secondBetterRank: rows.filter((p) => (p[b].rank2y ?? 9999) < (p[a].rank2y ?? 9999)).length,
    secondMoreCoins: rows.filter((p) => p[b].finalCoins > p[a].finalCoins).length,
  };
}

function classifyPresets() {
  const R = CRITERIA.stage1.reject; const Pf = CRITERIA.stage1.preference;
  const out = {};
  for (const preset of J.PRESETS) {
    const n = stage1.presets[preset].normal; const cs = stage1.presets[preset].casual; const all = stage1.presets[preset].all;
    const reasons = [];
    if (n.sponsorShareByYear.Y1.median != null && n.sponsorShareByYear.Y1.median > R.sponsorShareY1MaxPct) reasons.push(`sponsor Y1 Normal ${n.sponsorShareByYear.Y1.median}% > ${R.sponsorShareY1MaxPct}%`);
    if (n.prizeShareByYear.Y1.median != null && n.prizeShareByYear.Y1.median < R.prizeShareY1MinPct) reasons.push(`prize Y1 Normal ${n.prizeShareByYear.Y1.median}% < ${R.prizeShareY1MinPct}%`);
    if (n.insolvencyPct > R.normalInsolvencyMaxPct) reasons.push(`insolvência Normal ${n.insolvencyPct}% > ${R.normalInsolvencyMaxPct}%`);
    if (cs.insolvencyPct > R.casualInsolvencyMaxPct) reasons.push(`insolvência Casual ${cs.insolvencyPct}% > ${R.casualInsolvencyMaxPct}%`);
    if (n.rank2y.median != null && n.rank2y.median < R.normalRank2yMustBeBelow) reasons.push(`rank Normal @2y ${n.rank2y.median} (top-10: fácil demais)`);
    if (n.rank2y.median != null && n.rank2y.median > R.normalRank2yMustBeAbove) reasons.push(`rank Normal @2y ${n.rank2y.median} (sem progressão)`);
    const pref = {
      easy: inBand(all.competition.easyWR, Pf.easyPct), medium: inBand(all.competition.mediumWR, Pf.mediumPct), hard: inBand(all.competition.hardWR, Pf.hardPct),
      r1: all.competition.r1WR != null && all.competition.r1WR >= Pf.r1MinPct,
      rank1y: inBand(n.rank1y.median, Pf.normalRank1y), rank2y: inBand(n.rank2y.median, Pf.normalRank2y),
      titlesY1: inBand(n.titlesY1.median, Pf.normalTitlesY1Median), titlesY2: inBand(n.titles2y.median, Pf.normalTitlesY2CumMedian),
    };
    out[preset] = { classification: reasons.length ? 'REJECT' : 'VIABLE', rejectReasons: reasons, preference: pref, preferenceScore: Object.values(pref).filter(Boolean).length };
  }
  const viable = Object.entries(out).filter(([, v]) => v.classification === 'VIABLE');
  if (viable.length) {
    const best = Math.max(...viable.map(([, v]) => v.preferenceScore));
    const top = viable.filter(([, v]) => v.preferenceScore === best).map(([k]) => k);
    const winner = top.includes('balanced') ? 'balanced' : top[0];
    out[winner].classification = 'PREFERRED';
  }
  return out;
}
if (S1.complete) {
  stage1.classification = classifyPresets();
  const winner = Object.entries(stage1.classification).find(([, v]) => v.classification === 'PREFERRED')?.[0] ?? null;
  const decision = {
    at: new Date().toISOString(), complete: true, criteria: CRITERIA.stage1, classification: stage1.classification, winner,
    proceedToStage2: winner === 'balanced',
    reason: winner === 'balanced' ? 'Balanced PREFERRED → Stage 2 liberado' : winner ? `${winner} PREFERRED — parar antes do Stage 2; o default NÃO é trocado automaticamente` : 'nenhum preset VIABLE — parar antes do Stage 2',
    note: 'O analisador não altera configuração; apenas recomenda (item 31).',
  };
  J.atomicWrite(join(ROOT, 'stage1-decision.json'), `${JSON.stringify(decision, null, 2)}\n`);
  stage1.decision = decision;
} else {
  stage1.classification = 'PARTIAL — classificação só com 45/45';
}
write('stage1.json', stage1);

// ── Stage 2 (Balanced 5 anos) ──────────────────────────────────────────────
const s2 = careers.filter((c) => c.stage === '2');
const stage2 = { status: S2, byProfile: {} };
for (const profile of ['all', ...J.PROFILES]) {
  const l = profile === 'all' ? s2 : s2.filter((c) => c.profile === profile);
  stage2.byProfile[profile] = {
    careers: l.length,
    competition: competition(l),
    competitionByYear: Object.fromEntries([1, 2, 3, 4, 5].map((y) => [`Y${y}`, (({ easyWR, mediumWR, hardWR, r1WR, easyN, mediumN, hardN, r1N }) => ({ easyWR, mediumWR, hardWR, r1WR, easyN, mediumN, hardN, r1N }))(competition(l, { year: y }))])),
    rankCheckpoints: progression(l, [91, 182, 365, 730, 1095, 1460, 1826]),
    ovrCheckpoints: Object.fromEntries([91, 182, 365, 730, 1095, 1460, 1826].map((d) => [`d${d}`, dist(l.map((c) => at(c, d)?.ovr ?? null))])),
    milestones: Object.fromEntries(Object.keys(milestones(l[0] || { weekly: [] })).map((k) => [k, { reachedPct: pct(l.filter((c) => c.miles[k]).length, l.length), day: dist(l.map((c) => c.miles[k]?.day ?? null)), age: dist(l.map((c) => c.miles[k]?.age ?? null)), season: dist(l.map((c) => c.miles[k]?.season ?? null)) }])),
    titlesByYear: Object.fromEntries([1, 2, 3, 4, 5].map((y) => [`Y${y}`, dist(l.map((c) => c.titlesByYear[y]))])),
    titlesCumulative: Object.fromEntries([1, 2, 3, 4, 5].map((y) => [`Y${y}`, dist(l.map((c) => c.titlesCum(y)))])),
    titlesByTier: Object.fromEntries(TIERS.map((t) => [t, sum(l.map((c) => c.tournaments.filter((x) => x.status === 'champion' && x.tier === t).length))])),
    noTitles3yCareers: l.filter((c) => c.titlesCum(3) === 0).length,
    ...economyBlock(l, 5),
    staffGear: Object.fromEntries(Object.keys(staffGear(l[0] || { r: {}, weekly: [], months: [] }, categoriesSeen)).filter((k) => !['firstCoachTier'].includes(k)).map((k) => [k, dist(l.map((c) => c.sg[k]))])),
    eliteStaffY1Pct: pct(l.filter((c) => c.sg.eliteStaffDay != null && c.sg.eliteStaffDay < 365).length, l.length),
    fullHighEndY1Pct: pct(l.filter((c) => c.sg.fullHighEndLoadoutDay != null && c.sg.fullHighEndLoadoutDay < 365).length, l.length),
    severance: (() => { const ev = l.flatMap((c) => c.ins.severance); const funded = ev.filter((e) => e.fundedByDebt); return { dismissals: ev.length, fundedByDebt: funded.length, recovered: funded.filter((e) => e.recoveredDay != null).length, weeksToRecover: dist(funded.map((e) => e.weeksToRecover)), relapsedIntoDebt: funded.filter((e) => e.laterDebt).length }; })(),
  };
}
write('stage2.json', stage2);

// ── Long runs (10 anos) ────────────────────────────────────────────────────
const sl = careers.filter((c) => c.stage === 'long');
const longRuns = { status: SL, careers: sl.map((c) => {
  const ranked = c.weekly.filter((w) => w.rank);
  const peak = ranked.reduce((b, w) => (!b || w.rank < b.rank ? w : b), null);
  const weeksAt1 = ranked.filter((w) => w.rank === 1).length;
  const lastPurchase = (c.r.purchases || []).at(-1);
  const saveAt = (d) => at(c, d)?.saveMB ?? null;
  return {
    id: c.id, profile: c.profile, seed: c.seed, peakRank: peak?.rank ?? null, peakDay: peak?.day ?? null, ageAtPeak: peak?.age ?? null,
    titles: c.tournaments.filter((t) => t.status === 'champion').length, titlesByYear: c.titlesByYear,
    numberOneWeeks: weeksAt1, numberOneDays: weeksAt1 * 7,
    rankByYear: Object.fromEntries([1, 2, 3, 5, 7, 10].map((y) => [`Y${y}`, at(c, y * 365)?.rank ?? null])),
    economySaturation: { moneySolved: c.ms, endingCash: c.r.finalCoins, peakCash: Math.max(...c.weekly.map((w) => w.coins || 0)) },
    staffSaturation: { fullStaffDay: c.sg.fullStaffDay, eliteStaffDay: c.sg.eliteStaffDay, maxStaff: Math.max(...c.weekly.map((w) => w.staff || 0)) },
    gearSaturation: { highEndDay: c.sg.highEndDay, fullHighEndLoadoutDay: c.sg.fullHighEndLoadoutDay, lastPurchaseDay: lastPurchase?.day ?? null, maxRarityUnlocked: c.weekly.at(-1)?.shopUnlockedRarity ?? null },
    sponsorShareByYear: Object.fromEntries([1, 3, 5, 10].map((y) => [`Y${y}`, shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], y)])),
    investmentShareByYear: Object.fromEntries([1, 3, 5, 10].map((y) => [`Y${y}`, shareByYear(c, ['investment_income', 'passive_income'], y)])),
    saveMB: { Y1: saveAt(365), Y3: saveAt(1095), Y5: saveAt(1826), Y10: saveAt(3650) },
    errors: (c.r.errors || []).length,
  };
}) };
write('long.json', longRuns);

// ── Save size (Bloco P) ────────────────────────────────────────────────────
const saveRows = careers.flatMap((c) => [365, 1095, 1826, 3650].filter((d) => d <= c.r.days + 7).map((d) => [c.id, c.stage, c.profile, d, at(c, d)?.saveMB ?? null]));

// ── Performance do harness (Bloco Q) ───────────────────────────────────────
const perf = careers.map((c) => ({ id: c.id, stage: c.stage, years: c.years, runtimeSeconds: c.env.runtimeSeconds, segments: c.env.segments, attempts: c.env.attempts, seededFromDay: c.env.seededFrom?.day ?? null, simulatedDays: c.r.days - (c.env.seededFrom?.day ?? 0), secondsPerYear: c.env.runtimeSeconds ? Math.round(c.env.runtimeSeconds / ((c.r.days - (c.env.seededFrom?.day ?? 0)) / 365)) : null }));
const harness = { jobs: perf.length, minutesPerJob: dist(perf.map((p) => p.runtimeSeconds / 60)), secondsPerSimYear: dist(perf.map((p) => p.secondsPerYear)), byStage: Object.fromEntries(['1', '2', 'long'].map((s) => [s, { minutesPerJob: dist(perf.filter((p) => p.stage === s).map((p) => p.runtimeSeconds / 60)), secondsPerSimYear: dist(perf.filter((p) => p.stage === s).map((p) => p.secondsPerYear)) }])), retriedJobs: perf.filter((p) => p.attempts > 0).length, seededJobs: perf.filter((p) => p.seededFromDay != null).length };
write('harness.json', { harness, perJob: perf });

// ── Veredito de validação final (só com tudo completo) ─────────────────────
function finalGates() {
  const F = CRITERIA.final; const all = stage2.byProfile.all; const n = stage2.byProfile.normal; const cs = stage2.byProfile.casual;
  const g = [];
  const add = (block, name, value, pass, target) => g.push({ block, name, value, pass: Boolean(pass), target });
  add('competition', 'Easy WR', all.competition.easyWR, all.competition.easyWR >= F.competition.easyMinPct, `>= ${F.competition.easyMinPct}%`);
  add('competition', 'Medium WR', all.competition.mediumWR, all.competition.mediumWR >= F.competition.mediumMinPct, `>= ${F.competition.mediumMinPct}%`);
  add('competition', 'Hard WR', all.competition.hardWR, all.competition.hardWR != null && all.competition.hardWR <= F.competition.hardMaxPct, `<= ${F.competition.hardMaxPct}%`);
  add('competition', 'R1 WR', all.competition.r1WR, all.competition.r1WR >= F.competition.r1MinPct, `>= ${F.competition.r1MinPct}%`);
  const r = n.rankCheckpoints;
  add('progression', 'Normal rank @1y', r.d365.median, inBand(r.d365.median, F.progressionNormal.rank1y), `~#${F.progressionNormal.rank1y.join('–')}`);
  add('progression', 'Normal rank @2y', r.d730.median, inBand(r.d730.median, F.progressionNormal.rank2y), `~#${F.progressionNormal.rank2y.join('–')}`);
  add('progression', 'Normal rank @3y', r.d1095.median, inBand(r.d1095.median, F.progressionNormal.rank3y), `~#${F.progressionNormal.rank3y.join('–')}`);
  const top10Before3y = pct(stage2.byProfile.all.careers ? s2.filter((c) => c.profile === 'normal' && c.miles.top10 && c.miles.top10.day < 1095).length : 0, n.careers);
  add('progression', 'Normal Top10 antes de 3 anos (%)', top10Before3y, top10Before3y <= F.progressionNormal.top10Before3yMaxPct, `<= ${F.progressionNormal.top10Before3yMaxPct}% (não rotineiro)`);
  const no1 = n.milestones['#1'];
  add('progression', '#1 mediana > 3 anos', no1.reachedPct, !(no1.reachedPct >= 50 && no1.day.median != null && no1.day.median <= 1095), 'mediana do #1 não pode ser <= 3 anos');
  add('titles', 'Normal títulos Y1 (mediana)', n.titlesByYear.Y1.median, inBand(n.titlesByYear.Y1.median, F.titlesNormal.y1Median), '0–1');
  add('titles', 'Normal títulos Y2 cumulativo (mediana)', n.titlesCumulative.Y2.median, inBand(n.titlesCumulative.Y2.median, F.titlesNormal.y2CumMedian), '1–3');
  add('titles', 'nem todas as carreiras sem título em 3 anos', `${stage2.byProfile.all.noTitles3yCareers}/${all.careers}`, stage2.byProfile.all.noTitles3yCareers < all.careers, '< todas');
  add('economy', 'Sponsor Y1 (mediana, todas)', all.sponsorShareByYear.Y1.median, all.sponsorShareByYear.Y1.median <= F.economy.sponsorY1MaxPct, `<= ${F.economy.sponsorY1MaxPct}%`);
  add('economy', 'Prize Y1 (mediana, todas)', all.prizeShareByYear.Y1.median, all.prizeShareByYear.Y1.median >= F.economy.prizeY1MinPct, `>= ${F.economy.prizeY1MinPct}%`);
  add('economy', 'Insolvência Normal', n.insolvencyPct, n.insolvencyPct <= F.economy.normalInsolvencyMaxPct, `<= ${F.economy.normalInsolvencyMaxPct}%`);
  add('economy', 'Insolvência Casual', cs.insolvencyPct, cs.insolvencyPct <= F.economy.casualInsolvencyMaxPct, `<= ${F.economy.casualInsolvencyMaxPct}%`);
  const msMed = all.moneySolvedCensoredMedian;
  add('economy', 'Money-solved mediana (meses)', msMed?.label, msMed && (msMed.censored || msMed.median >= F.economy.moneySolvedMedianMinMonths), `>= ${F.economy.moneySolvedMedianMinMonths} (pref. ${F.economy.moneySolvedPreferred.join('–')})`);
  const passiveMax = Math.max(...[1, 2, 3, 4, 5].map((y) => all.passiveShareByYear[`Y${y}`].median ?? 0));
  add('investments', 'Renda passiva nunca domina (máx. mediana anual)', passiveMax, passiveMax <= F.investments.passiveShareMaxPct, `<= ${F.investments.passiveShareMaxPct}%`);
  add('staff', 'Staff elite no Y1 (%)', all.eliteStaffY1Pct, all.eliteStaffY1Pct <= F.staff.eliteStaffY1MaxPct, `<= ${F.staff.eliteStaffY1MaxPct}% (não trivial)`);
  add('gear', 'Loadout high-end completo no Y1 (%)', all.fullHighEndY1Pct, all.fullHighEndY1Pct <= F.gear.fullHighEndY1MaxPct, `<= ${F.gear.fullHighEndY1MaxPct}% (não rotina)`);
  return g;
}
const finalReady = S1.complete && S2.complete && SL.complete;
const final = finalReady ? { status: 'COMPLETE', gates: finalGates() } : { status: 'PARTIAL', note: `veredito final só com Stage1 45/45, Stage2 45/45 e long >= 3/3 (agora ${S1.done}/45, ${S2.done}/45, ${SL.done}/3)`, provisionalGates: S2.done ? finalGates() : null };
if (finalReady) final.allPass = final.gates.every((x) => x.pass);
write('final.json', final);

const summary = { generatedAt: new Date().toISOString(), stages: { 1: S1, 2: S2, long: SL }, integrity, careersLoaded: careers.length, categoriesSeen, criteria: CRITERIA, final: { status: final.status, allPass: final.allPass ?? null } };
write('summary.json', summary);

// ── CSVs ───────────────────────────────────────────────────────────────────
write('stage1-presets.csv', csv([['preset', 'profile', 'careers', 'easyWR', 'mediumWR', 'hardWR', 'r1WR', 'rank1yMedian', 'rank2yMedian', 'titles2yMedian', 'sponsorY1Median', 'prizeY1Median', 'insolvencyPct', 'endingCashMedian', 'moneySolved'],
  ...J.PRESETS.flatMap((p) => ['all', ...J.PROFILES].map((pr) => { const x = stage1.presets[p][pr]; return [p, pr, x.careers, x.competition.easyWR, x.competition.mediumWR, x.competition.hardWR, x.competition.r1WR, x.rank1y.median, x.rank2y.median, x.titles2y.median, x.sponsorShareByYear.Y1.median, x.prizeShareByYear.Y1.median, x.insolvencyPct, x.endingCash.median, x.moneySolvedCensoredMedian?.label]; }))]));
write('stage1-paired.csv', csv([['pair', 'profile', 'seed', 'aRank2y', 'bRank2y', 'aTitles', 'bTitles', 'aCoins', 'bCoins', 'aInsolvent', 'bInsolvent'], ...paired.map((p) => { const [a, b] = p.pair.split('-vs-'); return [p.pair, p.profile, p.seed, p[a].rank2y, p[b].rank2y, p[a].titles2y, p[b].titles2y, p[a].finalCoins, p[b].finalCoins, p[a].insolvent, p[b].insolvent]; })]));
write('difficulty-year.csv', csv([['profile', 'year', 'easyWR', 'easyN', 'mediumWR', 'mediumN', 'hardWR', 'hardN', 'r1WR', 'r1N'], ...['all', ...J.PROFILES].flatMap((pr) => [1, 2, 3, 4, 5].map((y) => { const x = stage2.byProfile[pr].competitionByYear[`Y${y}`]; return [pr, y, x.easyWR, x.easyN, x.mediumWR, x.mediumN, x.hardWR, x.hardN, x.r1WR, x.r1N]; }))]));
write('tiers.csv', csv([['profile', 'tier', 'matches', 'winPct'], ...['all', ...J.PROFILES].flatMap((pr) => TIERS.map((t) => [pr, t, stage2.byProfile[pr].competition.tiers[t].n, stage2.byProfile[pr].competition.tiers[t].wr]))]));
write('rounds.csv', csv([['profile', 'round', 'matches', 'winPct'], ...['all', ...J.PROFILES].flatMap((pr) => ['Q', 'R1', 'R2', 'QF', 'SF', 'F'].map((b) => [pr, b, stage2.byProfile[pr].competition.rounds[b].n, stage2.byProfile[pr].competition.rounds[b].wr]))]));
write('milestones.csv', csv([['job', 'profile', 'milestone', 'day', 'age', 'season'], ...s2.flatMap((c) => Object.entries(c.miles).map(([k, v]) => [c.id, c.profile, k, v?.day ?? null, v?.age ?? null, v?.season ?? null]))]));
write('titles.csv', csv([['job', 'stage', 'preset', 'profile', 'year', 'tier', 'day'], ...careers.flatMap((c) => c.tournaments.filter((t) => t.status === 'champion').map((t) => [c.id, c.stage, c.preset, c.profile, t.year, t.tier, t.day]))]));
write('cashflow.csv', csv([['job', 'stage', 'preset', 'profile', 'month', 'opening', 'income', 'expenses', 'net', 'closing', 'debt'], ...careers.flatMap((c) => c.months.map((m) => [c.id, c.stage, c.preset, c.profile, m.month, m.opening, m.income, m.expense, m.net, m.closing, Math.max(0, -m.closing)]))]));
write('shares.csv', csv([['job', 'stage', 'preset', 'profile', 'year', 'sponsorPct', 'prizePct', 'investmentPct', 'passivePct'], ...careers.flatMap((c) => Array.from({ length: c.years }, (_, i) => i + 1).map((y) => [c.id, c.stage, c.preset, c.profile, y, shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], y), shareByYear(c, ['prize'], y), shareByYear(c, ['investment_income'], y), shareByYear(c, ['investment_income', 'passive_income'], y)]))]));
write('staff-gear.csv', csv([['job', 'stage', 'preset', 'profile', ...Object.keys(careers[0]?.sg || {})], ...careers.map((c) => [c.id, c.stage, c.preset, c.profile, ...Object.values(c.sg)])]));
write('insolvency.csv', csv([['job', 'stage', 'preset', 'profile', 'insolvent', 'cashZeroOrLess', 'firstDebtDay', 'debtWeeks', 'minCash', 'registrationBlockedByMoney', 'forcedCostReductions', 'severanceFundedByDebt'], ...careers.map((c) => [c.id, c.stage, c.preset, c.profile, c.ins.insolvent, c.ins.cashZeroOrLess, c.ins.firstDebtDay, c.ins.debtWeeks, c.ins.minCash, c.ins.registrationBlockedByMoney, c.ins.forcedCostReductions, c.ins.severance.filter((s) => s.fundedByDebt).length])]));
write('money-solved.csv', csv([['job', 'stage', 'preset', 'profile', 'canonicalMonth', 'canonicalMonthsFromStart', 'withPrizeSensitivityMonthsFromStart'], ...careers.map((c) => [c.id, c.stage, c.preset, c.profile, c.ms?.month ?? null, c.ms?.monthsFromStart ?? null, c.msWithPrize?.monthsFromStart ?? null])]));
write('save-size.csv', csv([['job', 'stage', 'profile', 'day', 'saveMB'], ...saveRows]));
write('harness-perf.csv', csv([['job', 'stage', 'years', 'runtimeSeconds', 'segments', 'attempts', 'seededFromDay', 'simulatedDays', 'secondsPerYear'], ...perf.map((p) => [p.id, p.stage, p.years, p.runtimeSeconds, p.segments, p.attempts, p.seededFromDay, p.simulatedDays, p.secondsPerYear])]));

console.log(JSON.stringify({ stages: summary.stages, careers: careers.length, integrity, final: summary.final, stage1Decision: stage1.decision ? { winner: stage1.decision.winner, proceed: stage1.decision.proceedToStage2 } : 'PARTIAL' }, null, 1));
