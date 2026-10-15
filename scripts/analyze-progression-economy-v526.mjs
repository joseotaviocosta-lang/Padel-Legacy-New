// Playthrough 5.26 — análise das carreiras simuladas.
// Lê reports/progression-economy-526/raw*/ (um JSON por carreira, gravado pelo
// simulador a partir de snapshots VIVOS e do livro-razão incremental — nada
// é reconstruído do estado final) e gera:
//   summary.json, progression.csv, economy.csv, sponsors.csv, staff.csv,
//   shop.csv, tournaments.csv, difficulty.csv, outliers.json, matrices.json,
//   charts/*.svg (renderizados em PNG por render-charts-v526.mjs).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = resolve('reports/progression-economy-526');
// --out permite validar a análise sobre um lote de teste sem tocar no lote real.
const ROOT = resolve(arg('out', BASE));
const CHARTS = resolve(ROOT, 'charts');
mkdirSync(CHARTS, { recursive: true });
const inventory = JSON.parse(readFileSync(resolve(BASE, 'inventory.json'), 'utf8'));

function loadDir(dir, kind) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.save.json')).map((f) => ({ ...JSON.parse(readFileSync(resolve(dir, f), 'utf8')), kind }));
}
const main = loadDir(resolve(arg('raw', resolve(ROOT, 'raw'))), 'main');
const long = loadDir(resolve(ROOT, 'raw-long'), 'long');
const all = [...main, ...long];
const PROFILES = ['casual', 'normal', 'optimizer'];
const byProfile = (rows, p) => rows.filter((r) => r.profile === p);

// ── Estatística ─────────────────────────────────────────────────────────────
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
function quantile(values, q) {
  const v = values.map(num).filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
const mean = (values) => { const v = values.map(num).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r1 = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
function dist(values) {
  const v = values.map(num).filter((x) => x != null);
  const m = mean(v); const std = v.length > 1 ? Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / (v.length - 1)) : 0;
  return { n: v.length, mean: r1(m), std: r1(std), p10: r1(quantile(v, 0.1)), p25: r1(quantile(v, 0.25)), median: r1(quantile(v, 0.5)), p75: r1(quantile(v, 0.75)), p90: r1(quantile(v, 0.9)), min: r1(v.length ? Math.min(...v) : null), max: r1(v.length ? Math.max(...v) : null) };
}
// IC 95% da mediana por bootstrap (Monte Carlo sobre as carreiras).
function bootstrapMedianCI(values, iters = 2000) {
  const v = values.map(num).filter((x) => x != null);
  if (v.length < 3) return null;
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const meds = [];
  for (let i = 0; i < iters; i += 1) { const sample = v.map(() => v[Math.floor(rnd() * v.length)]); meds.push(quantile(sample, 0.5)); }
  return [r1(quantile(meds, 0.025)), r1(quantile(meds, 0.975))];
}
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set())];
  const esc = (v) => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ── Referências do jogo (do inventário, nunca copiadas à mão) ──────────────
const TIERS = Object.fromEntries(inventory.tiers.map((t) => [t.id, t]));
const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
// Rótulo de dificuldade exibido no card (Tournaments.jsx TIER_CONFIG.diffLabel).
const TIER_LABEL = { Bronze: 'Iniciante', Silver: 'Entrada Mundial', Gold: 'Acessível', Platinum: 'Competitivo', Masters: 'Difícil', Elite: 'Muito Difícil', Crown: 'Lendário' };
const RARITIES = Object.keys(inventory.shopProgression);
const MONTH_DAYS = 30.4375;
const MAIN_CHECKPOINTS = [3, 6, 12, 24, 36, 48, 60];
const LONG_CHECKPOINTS = [...MAIN_CHECKPOINTS, 72, 84, 96, 108, 120, 132, 144];
const MILESTONES = [1000, 500, 250, 100, 50, 25, 10, 1];
const RANK_BANDS = [[1, 10], [11, 50], [51, 100], [101, 250], [251, 500], [501, 1000], [1001, 99999]];
const bandOf = (rank) => { const b = RANK_BANDS.find(([lo, hi]) => rank >= lo && rank <= hi); return b ? (b[1] >= 99999 ? '>1000' : `${b[0]}-${b[1]}`) : 'sem rank'; };
const INCOME = ['prize', 'match_reward', 'sponsor_monthly', 'sponsor_signing', 'missions', 'achievements', 'investment_income', 'passive_income', 'other_income'];
const EXPENSE = ['coach', 'staff', 'club_fee', 'partner_salary', 'reward_overwrite', 'maintenance', 'training', 'equipment', 'entry_fee', 'coach_signing', 'staff_signing', 'other_expense'];
const RECURRING = ['prize', 'match_reward', 'sponsor_monthly', 'investment_income', 'passive_income'];

const snapAt = (career, day) => { let best = null; for (const w of career.weekly) { if (w.day <= day) best = w; else break; } return best; };
const monthsOf = (career) => Object.keys(career.ledger || {}).sort();
const sumObj = (o, keys) => keys.reduce((s, k) => s + (Number(o?.[k]) || 0), 0);

// ── Progressão ─────────────────────────────────────────────────────────────
const progressionRows = [];
for (const c of all) {
  for (const m of (c.kind === 'long' ? LONG_CHECKPOINTS : MAIN_CHECKPOINTS)) {
    const day = Math.round(m * MONTH_DAYS);
    if (day > c.days) continue;
    const w = snapAt(c, day);
    if (!w) continue;
    progressionRows.push({
      kind: c.kind, profile: c.profile, seed: c.seed, month: m, date: w.date, rank: w.rank, teamRank: w.teamRank, racePoints: w.racePoints, rankPoints: w.rankPoints,
      ovr: w.ovr, partnerOvr: w.partnerOvr, coins: w.coins, invested: w.invested, patrimony: (w.coins || 0) + (w.invested || 0), fans: w.fans, reputation: w.reputation,
      careerLevel: w.careerLevel, xp: w.xp, sponsors: w.sponsors, sponsorMonthly: w.sponsorMonthly, coachSalary: w.coachSalary, staff: w.staff, staffMonthly: w.staffMonthly,
      gearOwned: w.gearOwned, gearEquipped: w.gearEquipped, injured: w.injured, saveMB: w.saveMB ?? null,
    });
  }
}
function milestoneDays(c) {
  const out = {};
  for (const target of MILESTONES) { const w = c.weekly.find((s) => s.rank && s.rank <= target); out[target] = w ? w.day : null; }
  return out;
}
function progressionSummary(rows, careers, checkpoints) {
  const res = {};
  for (const m of checkpoints) {
    const at = rows.filter((r) => r.month === m);
    if (!at.length) continue;
    res[`m${m}`] = {
      rank: dist(at.map((r) => r.rank)), teamRank: dist(at.map((r) => r.teamRank)), racePoints: dist(at.map((r) => r.racePoints)),
      ovr: dist(at.map((r) => r.ovr)), partnerOvr: dist(at.map((r) => r.partnerOvr)), coins: dist(at.map((r) => r.coins)), patrimony: dist(at.map((r) => r.patrimony)),
      fans: dist(at.map((r) => r.fans)), careerLevel: dist(at.map((r) => r.careerLevel)), sponsorMonthly: dist(at.map((r) => r.sponsorMonthly)),
      saveMB: dist(at.map((r) => r.saveMB)),
      rankMedianCI95: bootstrapMedianCI(at.map((r) => r.rank)),
    };
  }
  const ms = careers.map(milestoneDays);
  res.milestones = Object.fromEntries(MILESTONES.map((t) => {
    const reached = ms.map((m) => m[t]).filter((d) => d != null);
    return [`top${t}`, { reachedPct: r1((reached.length / Math.max(1, careers.length)) * 100), daysAmongReached: dist(reached), monthsMedian: r1((quantile(reached, 0.5) ?? NaN) / MONTH_DAYS) }];
  }));
  return res;
}

// ── Torneios e dificuldade ─────────────────────────────────────────────────
const tournamentRows = [];
const difficultyRows = [];
for (const c of all) {
  for (const t of c.tournaments || []) {
    const reg = (c.registrations || []).find((r) => r.tournamentId === t.tournamentId);
    const tName = (c.matches || []).find((m) => m.tournamentId === t.tournamentId)?.tournamentName || null;
    tournamentRows.push({ kind: c.kind, profile: c.profile, seed: c.seed, date: t.date, tournamentId: t.tournamentId, tournamentName: tName, tier: t.tier, label: TIER_LABEL[t.tier] || t.tier, roundsWon: t.roundsWon, totalRounds: t.totalRounds, status: t.status, champion: t.status === 'champion', prize: t.prize, rankPoints: t.rankPoints, xp: t.xp, rankAtRegistration: reg?.rank ?? null, ovrAtRegistration: reg?.ovr ?? null, achievementsCoins: t.achievementsCoins || 0, rewardOverwritten: t.commit ? Math.max(0, t.commit.coinsBeforeCommit + (t.prize || 0) - t.commit.coinsAfterCommit) : 0 });
  }
  for (const m of c.matches || []) {
    const partnerDisplay = m.partnerDisplayOvr ?? m.partnerOvr;
    const oppDisplay = Array.isArray(m.oppDisplayOvr) && m.oppDisplayOvr.some((x) => x) ? m.oppDisplayOvr : [m.oppAOvr, m.oppBOvr];
    const teamDisplay = mean([m.playerOvr, partnerDisplay]);
    const oppDisplayAvg = mean(oppDisplay);
    difficultyRows.push({
      kind: c.kind, profile: c.profile, seed: c.seed, date: m.date, tier: m.tier, label: TIER_LABEL[m.tier] || m.tier, stage: m.stage, round: m.round, roundIndex: m.stageRoundIndex,
      playerOvr: m.playerOvr, partnerDisplayOvr: partnerDisplay, oppDisplayA: oppDisplay[0], oppDisplayB: oppDisplay[1], teamDisplay: r1(teamDisplay), oppDisplay: r1(oppDisplayAvg),
      displayDelta: teamDisplay != null && oppDisplayAvg != null ? r1(teamDisplay - oppDisplayAvg) : null,
      enginePlayer: m.engineOvr?.A?.[0] ?? null, enginePartner: m.engineOvr?.A?.[1] ?? null, engineOppA: m.engineOvr?.B?.[0] ?? null, engineOppB: m.engineOvr?.B?.[1] ?? null,
      engineDelta: r1(m.engineDelta), playerRank: m.playerRank, rankBand: bandOf(m.playerRank || 99999), teamRank: m.teamRank, oppTeamRank: m.oppTeamRank, won: m.won ? 1 : 0, score: m.score, energy: m.energy, coach: m.coach ? 1 : 0,
    });
  }
}
function winMatrix(rows, keyFn, order = null) {
  const groups = new Map();
  for (const r of rows) { const k = keyFn(r); if (k == null) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const keys = order ? order.filter((k) => groups.has(k)) : [...groups.keys()].sort();
  return keys.map((k) => { const g = groups.get(k); return { key: k, n: g.length, winPct: r1((g.reduce((s, r) => s + r.won, 0) / g.length) * 100), displayDelta: r1(mean(g.map((r) => r.displayDelta))), engineDelta: r1(mean(g.map((r) => r.engineDelta))), enginePartner: r1(mean(g.map((r) => r.enginePartner))), partnerDisplay: r1(mean(g.map((r) => r.partnerDisplayOvr))) }; });
}
const deltaBucket = (d) => (d == null ? null : d <= -15 ? '≤-15' : d <= -5 ? '-15..-5' : d < 5 ? '-5..+5' : d < 15 ? '+5..+15' : '≥+15');
const BUCKETS = ['≤-15', '-15..-5', '-5..+5', '+5..+15', '≥+15'];
const ROUND_ORDER = ['Qualifying', 'R64', 'R32', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'];

// "Rodada esperada" (o jogo não define uma): pela força exibida da dupla
// contra a mediana da força exibida dos adversários enfrentados em cada
// rodada daquele tier (dados de todas as carreiras). Rodada esperada = a
// última rodada consecutiva em que a dupla é ≥ a mediana daquela rodada.
const roundMedianOpp = {};
for (const r of difficultyRows.filter((x) => x.stage === 'main')) {
  const k = `${r.tier}|${r.roundIndex}`; (roundMedianOpp[k] ||= []).push(r.oppDisplay);
}
for (const k of Object.keys(roundMedianOpp)) roundMedianOpp[k] = quantile(roundMedianOpp[k], 0.5);
const expectedVsActual = [];
for (const t of tournamentRows) {
  const firstMatch = difficultyRows.find((d) => d.profile === t.profile && d.seed === t.seed && d.kind === t.kind && d.tier === t.tier && d.date <= t.date && d.stage === 'main' && d.roundIndex === 0 && d.date >= String(t.date).slice(0, 8));
  if (!firstMatch) continue;
  let expected = 0;
  for (let i = 0; i < t.totalRounds; i += 1) { const med = roundMedianOpp[`${t.tier}|${i}`]; if (med == null || firstMatch.teamDisplay < med) break; expected += 1; }
  expectedVsActual.push({ tier: t.tier, profile: t.profile, expected, actual: t.roundsWon, diff: t.roundsWon - expected });
}

// ── Economia ───────────────────────────────────────────────────────────────
const economyRows = [];
for (const c of all) {
  for (const month of monthsOf(c)) {
    const L = c.ledger[month];
    const inc = sumObj(L.income, INCOME); const exp = sumObj(L.expense, EXPENSE);
    economyRows.push({
      kind: c.kind, profile: c.profile, seed: c.seed, month, opening: L.opening, closing: L.closing,
      ...Object.fromEntries(INCOME.map((k) => [`in_${k}`, Number(L.income[k]) || 0])), ...Object.fromEntries(EXPENSE.map((k) => [`out_${k}`, Number(L.expense[k]) || 0])),
      income: inc, expense: exp, transfers: L.transfers || 0, net: inc - exp, reconciliation: (L.opening + inc - exp + (L.transfers || 0)) - L.closing,
    });
  }
}
// Último mês aberto: o simulador grava closing no virar do mês; o mês final
// fica sem fechamento — fora da reconciliação.
const reconciled = economyRows.filter((r) => r.closing != null);
const ledgerCheck = { months: reconciled.length, maxAbsReconciliation: Math.max(0, ...reconciled.map((r) => Math.abs(r.reconciliation || 0))), monthsWithResidual: reconciled.filter((r) => Math.abs(r.reconciliation || 0) > 0.5).length };

function careerYearTotals(c, yearIndex) {
  const months = monthsOf(c).slice(yearIndex * 12, yearIndex * 12 + 12);
  const income = {}; const expense = {};
  for (const m of months) { for (const k of INCOME) income[k] = (income[k] || 0) + (Number(c.ledger[m].income[k]) || 0); for (const k of EXPENSE) expense[k] = (expense[k] || 0) + (Number(c.ledger[m].expense[k]) || 0); }
  return { months: months.length, income, expense, incomeTotal: sumObj(income, INCOME), expenseTotal: sumObj(expense, EXPENSE) };
}
function economySummary(careers) {
  const years = Math.max(...careers.map((c) => Math.floor(monthsOf(c).length / 12)), 0);
  const perYear = [];
  for (let y = 0; y < Math.min(years, 12); y += 1) {
    const totals = careers.map((c) => careerYearTotals(c, y)).filter((t) => t.months >= 12);
    if (!totals.length) continue;
    const share = (k) => dist(totals.map((t) => (t.incomeTotal > 0 ? (t.income[k] / t.incomeTotal) * 100 : 0)));
    perYear.push({
      year: y + 1, careers: totals.length, income: dist(totals.map((t) => t.incomeTotal)), expense: dist(totals.map((t) => t.expenseTotal)), net: dist(totals.map((t) => t.incomeTotal - t.expenseTotal)),
      incomeByCategoryMedian: Object.fromEntries(INCOME.map((k) => [k, r1(quantile(totals.map((t) => t.income[k]), 0.5), 0)])),
      expenseByCategoryMedian: Object.fromEntries(EXPENSE.map((k) => [k, r1(quantile(totals.map((t) => t.expense[k]), 0.5), 0)])),
      sponsorSharePct: share('sponsor_monthly'), sponsorAllSharePct: dist(totals.map((t) => (t.incomeTotal > 0 ? ((t.income.sponsor_monthly + t.income.sponsor_signing) / t.incomeTotal) * 100 : 0))),
      prizeSharePct: dist(totals.map((t) => (t.incomeTotal > 0 ? ((t.income.prize + t.income.match_reward) / t.incomeTotal) * 100 : 0))),
      sponsorToPrizeRatio: dist(totals.map((t) => { const p = t.income.prize + t.income.match_reward; return p > 0 ? (t.income.sponsor_monthly + t.income.sponsor_signing) / p : null; })),
      achievementsLostToOverwrite: dist(totals.map((t) => t.expense.reward_overwrite)),
    });
  }
  // Estresse financeiro / insolvência (snapshots semanais + meses).
  const stress = careers.map((c) => {
    const ms = monthsOf(c).filter((m) => c.ledger[m].closing != null);
    const nets = ms.map((m) => sumObj(c.ledger[m].income, INCOME) - sumObj(c.ledger[m].expense, EXPENSE));
    const minCoins = Math.min(...c.weekly.map((w) => w.coins));
    const firstNegative = c.weekly.find((w) => w.coins < 0);
    const lowCash = c.weekly.filter((w) => w.coins < 100).length;
    return { negMonthsPct: ms.length ? (nets.filter((n) => n < 0).length / ms.length) * 100 : 0, minCoins, insolvent: minCoins < 0, firstNegativeDay: firstNegative?.day ?? null, lowCashWeeksPct: (lowCash / c.weekly.length) * 100, final: c.finalCoins + (c.invested || 0) };
  });
  // Índice de dificuldade econômica 0–100 (documentado no relatório):
  // 40 × fração de meses com saldo negativo + 30 × fração de semanas com
  // caixa < 100 + 30 × (1 − min(1, patrimônio final / 12 meses de despesa)).
  const difficultyScore = careers.map((c, i) => {
    const s = stress[i]; const lastYear = careerYearTotals(c, Math.max(0, Math.floor(monthsOf(c).length / 12) - 1));
    const monthlyExpense = lastYear.months ? lastYear.expenseTotal / lastYear.months : 1;
    return 40 * (s.negMonthsPct / 100) + 30 * (s.lowCashWeeksPct / 100) + 30 * (1 - Math.min(1, Math.max(0, s.final) / Math.max(1, monthlyExpense * 12)));
  });
  return {
    perYear, stress: { negMonthsPct: dist(stress.map((s) => s.negMonthsPct)), minCoins: dist(stress.map((s) => s.minCoins)), insolventPct: r1((stress.filter((s) => s.insolvent).length / Math.max(1, stress.length)) * 100), firstNegativeDay: dist(stress.map((s) => s.firstNegativeDay)), lowCashWeeksPct: dist(stress.map((s) => s.lowCashWeeksPct)) },
    economyDifficultyScore: dist(difficultyScore),
    finalPatrimony: dist(careers.map((c) => c.finalCoins + (c.invested || 0))), finalPatrimonyCI95: bootstrapMedianCI(careers.map((c) => c.finalCoins + (c.invested || 0))),
  };
}

// ── Patrocínio ─────────────────────────────────────────────────────────────
const sponsorRows = [];
for (const c of all) for (const s of c.sponsors || []) sponsorRows.push({ kind: c.kind, profile: c.profile, seed: c.seed, ...s, rankBand: bandOf(s.rank || 99999), value12m: (s.monthly || 0) * Math.min(12, s.duration || 0) + (s.signBonus || 0) });
function sponsorSummary(careers) {
  const firsts = careers.map((c) => (c.sponsors || [])[0]).filter(Boolean);
  const firstPrize = careers.map((c) => (c.tournaments || []).find((t) => t.prize > 0));
  const firstTitle = careers.map((c) => (c.tournaments || []).find((t) => t.status === 'champion'));
  const rows = sponsorRows.filter((r) => careers.some((c) => c.profile === r.profile && c.seed === r.seed && c.kind === r.kind));
  const byBand = {};
  for (const r of rows) (byBand[r.rankBand] ||= []).push(r);
  // ROI do patrocínio: receita de patrocínio / custos que ele "paga" (coach+staff).
  const roi = careers.map((c) => { const y = careerYearTotals(c, 0); const cost = y.expense.coach + y.expense.staff; return cost > 0 ? (y.income.sponsor_monthly + y.income.sponsor_signing) / cost : null; });
  return {
    firstSponsor: { day: dist(firsts.map((s) => s.day)), rank: dist(firsts.map((s) => s.rank)), ovr: dist(firsts.map((s) => s.ovr)), fans: dist(firsts.map((s) => s.fans)), monthly: dist(firsts.map((s) => s.monthly)), signBonus: dist(firsts.map((s) => s.signBonus)), withoutAnyMatchPct: r1((firsts.filter((s) => s.day === 0).length / Math.max(1, firsts.length)) * 100), sponsorsSeen: [...new Set(firsts.map((s) => s.sponsor))] },
    firstSponsorVsFirstPrize: { sponsorFirstPct: r1((careers.filter((c, i) => (c.sponsors || [])[0] && (!firstPrize[i] || c.sponsors[0].day <= firstPrize[i].day)).length / Math.max(1, careers.length)) * 100), firstTitleDay: dist(firstTitle.filter(Boolean).map((t) => t.day)), careersWithTitlePct: r1((firstTitle.filter(Boolean).length / Math.max(1, careers.length)) * 100) },
    signingsPerCareer: dist(careers.map((c) => (c.sponsors || []).length)),
    accessByRankBand: Object.fromEntries(Object.entries(byBand).map(([b, list]) => [b, { signings: list.length, monthly: dist(list.map((r) => r.monthly)), tiers: [...new Set(list.map((r) => r.tier))] }])),
    tierMix: Object.fromEntries([...new Set(rows.map((r) => r.tier))].map((t) => [t, rows.filter((r) => r.tier === t).length])),
    year1SponsorToCoachStaffROI: dist(roi),
  };
}

// ── Staff / treinador ──────────────────────────────────────────────────────
const staffRows = [];
for (const c of all) {
  for (const h of c.coaches || []) staffRows.push({ kind: c.kind, profile: c.profile, seed: c.seed, type: 'coach', day: h.day, date: h.date, id: h.coach, tier: h.tier, quality: h.overall, monthly: h.salary, rank: h.rank, ovr: h.ovr, coins: h.coins, incomeEst: h.incomeEst, affordabilityPct: h.incomeEst > 0 ? r1((h.salary / h.incomeEst) * 100) : null });
  for (const h of c.staff || []) staffRows.push({ kind: c.kind, profile: c.profile, seed: c.seed, type: h.role, day: h.day, date: h.date, id: h.role, tier: h.tier, quality: h.quality, monthly: h.monthly, rank: h.rank, ovr: h.ovr, coins: h.coins, incomeEst: h.incomeEst, affordabilityPct: h.incomeEst > 0 ? r1((h.monthly / h.incomeEst) * 100) : null });
}
const maxCoachSalary = Math.max(...inventory.coaches.map((c) => Number(c.salary) || 0));
// O inventário do mercado de staff não traz custo mensal: usa o MAIOR custo
// mensal observado por função nas contratações reais das carreiras.
const staffAllMonthly = Object.values(staffRows.filter((r) => r.type !== 'coach').reduce((best, r) => { if (!best[r.type] || r.monthly > best[r.type]) best[r.type] = Number(r.monthly) || 0; return best; }, {})).reduce((a, b) => a + b, 0);
function staffSummary(careers) {
  const first = careers.map((c) => (c.coaches || [])[0]).filter(Boolean);
  const eliteCoach = careers.map((c) => (c.coaches || []).find((h) => /elite|lend|mundial|world/i.test(String(h.tier)))).filter(Boolean);
  // "Payback" do treinador: ganho de OVR por mês nos 6 meses antes x depois da contratação.
  const payback = careers.map((c) => {
    const h = (c.coaches || [])[0]; if (!h) return null;
    const before = snapAt(c, Math.max(0, h.day - 180)); const at = snapAt(c, h.day); const after = snapAt(c, h.day + 180);
    if (!before || !at || !after || at.day === before.day) return null;
    return { ovrPerMonthBefore: (at.ovr - before.ovr) / ((at.day - before.day) / MONTH_DAYS), ovrPerMonthAfter: (after.ovr - at.ovr) / Math.max(1, (after.day - at.day) / MONTH_DAYS), costPerMonth: h.salary };
  }).filter(Boolean);
  const staffSolved = careers.map((c) => { const w = c.weekly.find((s) => (s.sponsorMonthly || 0) >= maxCoachSalary + staffAllMonthly); return w ? w.day : null; });
  return {
    firstCoach: { pctHired: r1((first.length / Math.max(1, careers.length)) * 100), day: dist(first.map((h) => h.day)), rank: dist(first.map((h) => h.rank)), salary: dist(first.map((h) => h.salary)), affordabilityPct: dist(first.map((h) => (h.incomeEst > 0 ? (h.salary / h.incomeEst) * 100 : null))), tiers: Object.fromEntries([...new Set(first.map((h) => h.tier))].map((t) => [t, first.filter((h) => h.tier === t).length])) },
    eliteCoach: { pct: r1((eliteCoach.length / Math.max(1, careers.length)) * 100), day: dist(eliteCoach.map((h) => h.day)) },
    staffHiresPerCareer: dist(careers.map((c) => (c.staff || []).length)),
    staffByRole: Object.fromEntries([...new Set(careers.flatMap((c) => (c.staff || []).map((h) => h.role)))].map((r) => [r, careers.flatMap((c) => c.staff || []).filter((h) => h.role === r).length])),
    coachOvrGain: { before: dist(payback.map((p) => p.ovrPerMonthBefore)), after: dist(payback.map((p) => p.ovrPerMonthAfter)) },
    staffSolvedPoint: { reference: `patrocínio mensal ≥ coach mais caro (${maxCoachSalary}) + staff completo (${staffAllMonthly})`, reachedPct: r1((staffSolved.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(staffSolved) },
  };
}

// ── Loja ───────────────────────────────────────────────────────────────────
const shopRows = [];
for (const c of all) {
  for (const p of c.purchases || []) {
    const monthIdx = Math.floor(p.day / MONTH_DAYS);
    const months = monthsOf(c).slice(Math.max(0, monthIdx - 3), monthIdx);
    const recurring = months.length ? months.reduce((s, m) => s + sumObj(c.ledger[m].income, RECURRING), 0) / months.length : 0;
    shopRows.push({ kind: c.kind, profile: c.profile, seed: c.seed, ...p, recurringIncome: Math.round(recurring), affordabilityIndex: recurring > 0 ? r1(p.price / recurring, 2) : null });
  }
}
function unlockedRarity(w) {
  let best = RARITIES[0];
  for (const r of RARITIES) { const g = inventory.shopProgression[r]; if ((w.careerLevel || 1) >= g.minCareerLevel && (!g.maxRanking || (w.rank && w.rank <= g.maxRanking)) && (w.reputation || 0) >= (g.minReputation || 0)) best = r; }
  return best;
}
function shopSummary(careers) {
  const rows = shopRows.filter((r) => careers.some((c) => c.profile === r.profile && c.seed === r.seed && c.kind === r.kind));
  const firstByRarity = Object.fromEntries(RARITIES.map((rar) => { const days = careers.map((c) => (c.purchases || []).find((p) => p.rarity === rar)?.day ?? null); return [rar, { boughtPct: r1((days.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(days) }]; }));
  const unlockByRarity = Object.fromEntries(RARITIES.map((rar) => { const days = careers.map((c) => c.weekly.find((w) => RARITIES.indexOf(unlockedRarity(w)) >= RARITIES.indexOf(rar))?.day ?? null); return [rar, { unlockedPct: r1((days.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(days) }]; }));
  // Ponto "equipamento resolvido": o piso de preço da raridade desbloqueada
  // mais alta cabe em ≤ 1 mês de receita recorrente.
  const gearSolved = careers.map((c) => {
    for (const w of c.weekly) {
      const monthIdx = Math.floor(w.day / MONTH_DAYS); const months = monthsOf(c).slice(Math.max(0, monthIdx - 3), monthIdx);
      const recurring = months.length ? months.reduce((s, m) => s + sumObj(c.ledger[m].income, RECURRING), 0) / months.length : 0;
      const floor = inventory.shopProgression[unlockedRarity(w)].priceFloor;
      if (monthIdx >= 3 && recurring >= floor && RARITIES.indexOf(unlockedRarity(w)) >= 2) return w.day;
    }
    return null;
  });
  const spendShare = careers.map((c) => { const t = monthsOf(c).reduce((s, m) => s + (Number(c.ledger[m].expense.equipment) || 0), 0); const inc = monthsOf(c).reduce((s, m) => s + sumObj(c.ledger[m].income, INCOME), 0); return inc > 0 ? (t / inc) * 100 : 0; });
  return {
    purchasesPerCareer: dist(careers.map((c) => (c.purchases || []).length)), affordabilityIndex: dist(rows.map((r) => r.affordabilityIndex)),
    firstPurchaseByRarity: firstByRarity, unlockByRarity, equipmentSpendSharePct: dist(spendShare),
    gearSolvedPoint: { definition: 'piso de preço da raridade desbloqueada mais alta (≥ raro) ≤ 1 mês de receita recorrente', reachedPct: r1((gearSolved.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(gearSolved) },
    bestRarityOwned: Object.fromEntries(RARITIES.map((rar) => [rar, careers.filter((c) => { const best = (c.purchases || []).reduce((b, p) => Math.max(b, RARITIES.indexOf(p.rarity)), -1); return best === RARITIES.indexOf(rar); }).length])),
  };
}

// ── Pontos "resolvidos" e dominância de patrocínio ─────────────────────────
function solvedPoints(careers) {
  const money = careers.map((c) => {
    const ms = monthsOf(c);
    for (let i = 3; i < ms.length; i += 1) {
      const last3 = ms.slice(i - 3, i);
      const rec = last3.reduce((s, m) => s + sumObj(c.ledger[m].income, RECURRING), 0) / 3;
      const exp = last3.reduce((s, m) => s + sumObj(c.ledger[m].expense, EXPENSE), 0) / 3;
      const closing = c.ledger[ms[i - 1]].closing;
      if (closing != null && rec >= exp && closing >= 12 * Math.max(1, exp)) return Math.round(i * MONTH_DAYS);
    }
    return null;
  });
  const dominance = careers.map((c) => {
    const ms = monthsOf(c);
    for (let i = 3; i <= ms.length; i += 1) {
      const last3 = ms.slice(i - 3, i);
      const sp = last3.reduce((s, m) => s + (Number(c.ledger[m].income.sponsor_monthly) || 0) + (Number(c.ledger[m].income.sponsor_signing) || 0), 0);
      const inc = last3.reduce((s, m) => s + sumObj(c.ledger[m].income, INCOME), 0);
      const pr = last3.reduce((s, m) => s + (Number(c.ledger[m].income.prize) || 0) + (Number(c.ledger[m].income.match_reward) || 0), 0);
      if (inc > 0 && sp / inc > 0.5 && sp > pr) return Math.round((i - 3) * MONTH_DAYS);
    }
    return null;
  });
  return {
    moneySolved: { definition: 'receita recorrente ≥ despesa (média 3 meses) e caixa ≥ 12 meses de despesa', reachedPct: r1((money.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(money) },
    sponsorDominance: { definition: 'patrocínio > 50% da receita (3 meses) e > prêmios', reachedPct: r1((dominance.filter((d) => d != null).length / Math.max(1, careers.length)) * 100), day: dist(dominance) },
  };
}

// ── Farming ────────────────────────────────────────────────────────────────
function farmingSummary(careers) {
  const rows = tournamentRows.filter((r) => careers.some((c) => c.profile === r.profile && c.seed === r.seed && c.kind === r.kind));
  // Título "de farm": Bronze/Silver vencido com ranking ≤ 300 (fora da faixa de entrada).
  const farmTitles = rows.filter((r) => r.champion && ['Bronze', 'Silver'].includes(r.tier) && r.rankAtRegistration && r.rankAtRegistration <= 300);
  const lowTierEntriesHighRank = rows.filter((r) => ['Bronze', 'Silver'].includes(r.tier) && r.rankAtRegistration && r.rankAtRegistration <= 300);
  return {
    titlesTotal: rows.filter((r) => r.champion).length, farmTitles: farmTitles.length, lowTierEntriesWhileTop300: lowTierEntriesHighRank.length,
    lowTierWinPctWhileTop300: lowTierEntriesHighRank.length ? r1((lowTierEntriesHighRank.filter((r) => r.champion).length / lowTierEntriesHighRank.length) * 100) : null,
    titlesByTier: Object.fromEntries(TIER_ORDER.map((t) => [t, rows.filter((r) => r.champion && r.tier === t).length])),
    entriesByTier: Object.fromEntries(TIER_ORDER.map((t) => [t, rows.filter((r) => r.tier === t).length])),
  };
}

// ── Montagem ───────────────────────────────────────────────────────────────
const reloadCheck = { careersWithReload: all.filter((c) => c.reloads > 0).length, reloads: all.reduce((t, c) => t + (c.reloads || 0), 0), mismatches: all.reduce((t, c) => t + (c.reloadMismatches || []).length, 0), examples: all.flatMap((c) => (c.reloadMismatches || []).map((m) => ({ profile: c.profile, seed: c.seed, ...m }))).slice(0, 10) };
const summary = { generatedFrom: { mainCareers: main.length, longCareers: long.length, perProfile: Object.fromEntries(PROFILES.map((p) => [p, { main: byProfile(main, p).length, long: byProfile(long, p).length }])) }, ledgerCheck, reloadCheck, profiles: {} };
for (const p of PROFILES) {
  const careersMain = byProfile(main, p); const careersLong = byProfile(long, p); const careersAll = byProfile(all, p);
  if (!careersAll.length) continue;
  const diffP = difficultyRows.filter((r) => r.profile === p);
  summary.profiles[p] = {
    careers: careersAll.length,
    progression: progressionSummary(progressionRows.filter((r) => r.profile === p && r.kind === 'main'), careersMain, MAIN_CHECKPOINTS),
    progressionLong: careersLong.length ? progressionSummary(progressionRows.filter((r) => r.profile === p && r.kind === 'long'), careersLong, LONG_CHECKPOINTS) : null,
    matches: { perCareer: dist(careersMain.map((c) => c.matches.length)), winPct: r1((diffP.reduce((s, r) => s + r.won, 0) / Math.max(1, diffP.length)) * 100), tournamentsPerCareer: dist(careersMain.map((c) => c.tournaments.length)), forfeitsPerCareer: dist(careersMain.map((c) => c.forfeits)), errorsPerCareer: dist(careersAll.map((c) => c.errors.length)) },
    economy: economySummary(careersMain), economyLong: careersLong.length ? economySummary(careersLong) : null,
    sponsors: sponsorSummary(careersMain), staff: staffSummary(careersMain), shop: shopSummary(careersMain), solved: solvedPoints(careersMain), farming: farmingSummary(careersAll),
    partners: { perCareer: dist(careersMain.map((c) => (c.partners || []).length)), viaSearchPct: r1((careersMain.flatMap((c) => c.partners || []).filter((p) => p.via === 'search').length / Math.max(1, careersMain.flatMap((c) => c.partners || []).length)) * 100), weeksWithoutPartnerPct: dist(careersMain.map((c) => (c.weekly.filter((w) => !w.partnerOvr).length / Math.max(1, c.weekly.length)) * 100)), partnerDisplayOvrAtSigning: dist(careersMain.flatMap((c) => (c.partners || []).map((p) => p.partnerOvr))),
      // Laço observado: o MESMO parceiro re-contratado ≥ 10 vezes (parceria renovada não reconhecida como ativa).
      resignLoop: (() => { const hits = careersMain.map((c) => { const n = {}; for (const p of c.partners || []) n[p.partnerId] = (n[p.partnerId] || 0) + 1; return Math.max(0, ...Object.values(n)); }); return { careersPct: r1((hits.filter((h) => h >= 10).length / Math.max(1, careersMain.length)) * 100), maxResigns: Math.max(0, ...hits) }; })() },
    dismissals: { perCareer: dist(careersMain.map((c) => (c.dismissals || []).length)), careersWithDismissalPct: r1((careersMain.filter((c) => (c.dismissals || []).length).length / Math.max(1, careersMain.length)) * 100), byType: Object.fromEntries([...new Set(careersMain.flatMap((c) => (c.dismissals || []).map((d) => d.type)))].map((t) => [t, careersMain.flatMap((c) => c.dismissals || []).filter((d) => d.type === t).length])) },
    press: { interviewsPerCareer: dist(careersMain.map((c) => (c.press || []).length)), fans100Day: dist(careersMain.map((c) => c.weekly.find((w) => (w.fans || 0) >= 100)?.day ?? null)), fans100ReachedPct: r1((careersMain.filter((c) => c.weekly.some((w) => (w.fans || 0) >= 100)).length / Math.max(1, careersMain.length)) * 100), firstInterviewFansJump: dist(careersMain.map((c) => (c.press || [])[0] ? c.press[0].fansAfter - c.press[0].fansBefore : null)), reputationPositivePct: r1((careersMain.filter((c) => c.weekly.some((w) => (w.reputation || 0) > 0)).length / Math.max(1, careersMain.length)) * 100), reputationEffectDeclaredPerCareer: dist(careersMain.map((c) => (c.press || []).reduce((t, p) => t + (p.effects?.reputation || 0), 0))) },
    registrationFailures: Object.entries(careersMain.reduce((acc, c) => { for (const [k, v] of Object.entries(c.registrationFailures || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 25),
    coachUpgrades: { perCareer: dist(careersMain.map((c) => (c.coaches || []).filter((h) => h.upgrade).length)), finalCoachTier: Object.fromEntries([...new Set(careersMain.map((c) => (c.coaches || []).at(-1)?.tier || 'nenhum'))].map((t) => [t, careersMain.filter((c) => ((c.coaches || []).at(-1)?.tier || 'nenhum') === t).length])) },
    playerRankingPositionFieldSetPct: r1((careersMain.filter((c) => c.weekly.some((w) => w.rankingPositionField != null)).length / Math.max(1, careersMain.length)) * 100),
    // Bug P0: dia em que o jogo REAL travaria (1º disparo do shim do harness).
    softLock: { affectedPct: r1((careersAll.filter((c) => c.softLock?.firstDate).length / careersAll.length) * 100), firstDay: dist(careersAll.map((c) => c.softLock?.firstDay)), firstDate: dist(careersAll.map((c) => (c.softLock?.firstDate ? Number(c.softLock.firstDate.slice(0, 4)) + (Number(c.softLock.firstDate.slice(5, 7)) - 1) / 12 : null))), firesPerCareer: dist(careersAll.map((c) => c.softLock?.fires || 0)), ids: [...new Set(careersAll.flatMap((c) => c.softLock?.ids || []))].slice(0, 30) },
    expectedVsActual: { diff: dist(expectedVsActual.filter((e) => e.profile === p).map((e) => e.diff)), underperformPct: r1((expectedVsActual.filter((e) => e.profile === p && e.diff < 0).length / Math.max(1, expectedVsActual.filter((e) => e.profile === p).length)) * 100) },
  };
}
function roundOrderFromData() {
  const idx = {};
  for (const r of difficultyRows.filter((x) => x.stage === 'main')) (idx[r.round] ||= []).push(Number(r.roundIndex) || 0);
  return Object.keys(idx).sort((a, b) => (mean(idx[a]) - mean(idx[b])) || a.localeCompare(b));
}
const matrices = {
  difficultyByTierLabel: winMatrix(difficultyRows, (r) => `${r.tier} · ${r.label}`, TIER_ORDER.map((t) => `${t} · ${TIER_LABEL[t]}`)),
  // Ordem das rodadas derivada dos dados (índice médio da rodada na chave) —
  // tiers maiores usam nomes de rodada além de Oitavas/Quartas/Semi/Final.
  difficultyByRound: winMatrix(difficultyRows.filter((r) => r.stage === 'main'), (r) => r.round, roundOrderFromData()),
  difficultyByRoundFromEnd: winMatrix(difficultyRows.filter((r) => r.stage === 'main'), (r) => r.round, ['Final', 'Semifinal', 'Quartas de Final', 'Oitavas de Final']),
  difficultyByStage: winMatrix(difficultyRows, (r) => r.stage),
  difficultyByRankBand: winMatrix(difficultyRows, (r) => r.rankBand, ['1-10', '11-50', '51-100', '101-250', '251-500', '501-1000', '>1000']),
  winByDisplayDelta: winMatrix(difficultyRows, (r) => deltaBucket(r.displayDelta), BUCKETS),
  winByEngineDelta: winMatrix(difficultyRows, (r) => deltaBucket(r.engineDelta), BUCKETS),
  difficultyByTierAndProfile: PROFILES.map((p) => ({ profile: p, rows: winMatrix(difficultyRows.filter((r) => r.profile === p), (r) => r.tier, TIER_ORDER) })),
  enginePartnerOvr: dist(difficultyRows.map((r) => r.enginePartner)), displayPartnerOvr: dist(difficultyRows.map((r) => r.partnerDisplayOvr)),
  engineOppVsDisplayOpp: { engine: dist(difficultyRows.map((r) => mean([r.engineOppA, r.engineOppB]))), display: dist(difficultyRows.map((r) => r.oppDisplay)) },
  sponsorship: PROFILES.map((p) => ({ profile: p, byBand: summary.profiles[p]?.sponsors.accessByRankBand || {} })),
  staff: PROFILES.map((p) => ({ profile: p, firstCoach: summary.profiles[p]?.staff.firstCoach || null, byRole: summary.profiles[p]?.staff.staffByRole || {} })),
  equipment: PROFILES.map((p) => ({ profile: p, firstPurchaseByRarity: summary.profiles[p]?.shop.firstPurchaseByRarity || {}, unlockByRarity: summary.profiles[p]?.shop.unlockByRarity || {} })),
  expectedRoundMethod: 'rodada esperada = rodadas consecutivas em que a força EXIBIDA da dupla ≥ mediana da força exibida dos adversários daquela rodada/tier',
};
summary.matrices = matrices;

// ── Outliers e seeds representativas ───────────────────────────────────────
const outliers = { representative: {}, extremes: {}, errors: all.filter((c) => c.errors.length).map((c) => ({ kind: c.kind, profile: c.profile, seed: c.seed, errors: c.errors.slice(0, 5) })) };
for (const p of PROFILES) {
  const cs = byProfile(main, p); if (!cs.length) continue;
  const fr = cs.map((c) => c.weekly.at(-1).rank || 9999); const fc = cs.map((c) => c.finalCoins + (c.invested || 0));
  const mr = quantile(fr, 0.5); const mc = quantile(fc, 0.5); const sr = Math.max(1, quantile(fr, 0.9) - quantile(fr, 0.1)); const sc = Math.max(1, quantile(fc, 0.9) - quantile(fc, 0.1));
  const scored = cs.map((c, i) => ({ seed: c.seed, finalRank: fr[i], finalPatrimony: fc[i], ovr: c.weekly.at(-1).ovr, titles: c.tournaments.filter((t) => t.status === 'champion').length, d: Math.abs(fr[i] - mr) / sr + Math.abs(fc[i] - mc) / sc })).sort((a, b) => a.d - b.d);
  outliers.representative[p] = scored.slice(0, 3);
  outliers.extremes[p] = { bestRank: [...scored].sort((a, b) => a.finalRank - b.finalRank).slice(0, 3), worstRank: [...scored].sort((a, b) => b.finalRank - a.finalRank).slice(0, 3), richest: [...scored].sort((a, b) => b.finalPatrimony - a.finalPatrimony).slice(0, 3), poorest: [...scored].sort((a, b) => a.finalPatrimony - b.finalPatrimony).slice(0, 3) };
}
// Parte 61 — outliers nomeados (todas as carreiras principais).
{
  const rows = main.map((c) => ({
    profile: c.profile, seed: c.seed,
    top100Day: c.weekly.find((w) => w.rank && w.rank <= 100)?.day ?? null,
    finalRank: c.weekly.at(-1).rank, finalPatrimony: c.finalCoins + (c.invested || 0),
    maxSponsorMonthly: Math.max(0, ...c.weekly.map((w) => w.sponsorMonthly || 0)),
    staffAtDay180: snapAt(c, 180)?.staff ?? 0, staffMonthlyAtDay180: snapAt(c, 180)?.staffMonthly ?? 0,
    titles: c.tournaments.filter((t) => t.status === 'champion').length,
  }));
  const top = (arr, key, dir = -1, n = 5) => [...arr].filter((r) => r[key] != null).sort((a, b) => dir * (a[key] - b[key])).slice(0, n);
  outliers.named = {
    fastestTop100: top(rows, 'top100Day', 1), slowestTop100: top(rows, 'top100Day', -1),
    richest: top(rows, 'finalPatrimony', -1), poorest: top(rows, 'finalPatrimony', 1),
    biggestSponsorship: top(rows, 'maxSponsorMonthly', -1), earliestStaff: top(rows, 'staffMonthlyAtDay180', -1),
  };
  // Parte 62 — seeds representativas (perfil normal): easy/median/hard/rich/poor.
  const normals = rows.filter((r) => r.profile === 'normal');
  const medRank = quantile(normals.map((r) => r.finalRank), 0.5);
  outliers.representativeRuns = {
    easy: top(normals, 'finalRank', 1, 1)[0] || null,
    median: [...normals].sort((a, b) => Math.abs(a.finalRank - medRank) - Math.abs(b.finalRank - medRank))[0] || null,
    hard: top(normals, 'finalRank', -1, 1)[0] || null,
    rich: top(rows, 'finalPatrimony', -1, 1)[0] || null,
    poor: top(rows, 'finalPatrimony', 1, 1)[0] || null,
  };
}

// ── Matrizes obrigatórias 72–75 (formato pedido) ───────────────────────────
const DIFF_CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil' };
matrices.required = {
  note: 'O jogo não tem Fácil/Médio/Difícil por partida; o card do torneio mostra um rótulo FIXO por tier. Agrupamento: Fácil = Bronze/Silver (Iniciante/Entrada Mundial), Médio = Gold/Platinum (Acessível/Competitivo), Difícil = Masters/Elite/Crown (Difícil/Muito Difícil/Lendário).',
  difficulty: ['Fácil', 'Médio', 'Difícil'].map((k) => {
    const g = difficultyRows.filter((r) => DIFF_CLASS[r.tier] === k);
    const rankDelta = g.filter((r) => r.teamRank && r.oppTeamRank).map((r) => r.oppTeamRank - r.teamRank);
    return { classe: k, partidas: g.length, winPct: r1((g.reduce((t, r) => t + r.won, 0) / Math.max(1, g.length)) * 100), ovrDeltaExibido: r1(mean(g.map((r) => r.displayDelta))), ovrDeltaMotor: r1(mean(g.map((r) => r.engineDelta))), rankingDeltaMediano: r1(quantile(rankDelta, 0.5)) };
  }),
};
{
  // 73 — patrocínio por faixa de ranking (no momento da assinatura / do mês).
  const BANDS = [['>1000', 1001, 99999], ['751–1000', 751, 1000], ['501–750', 501, 750], ['251–500', 251, 500], ['101–250', 101, 250], ['Top100', 1, 100]];
  const band = (rank) => (BANDS.find(([, lo, hi]) => rank >= lo && rank <= hi) || ['?'])[0];
  const careerYearsInBand = {}; const incomeInBand = {}; const sponsorInBand = {};
  for (const c of main) {
    for (const m of monthsOf(c)) {
      const w = c.weekly.find((x) => String(x.date).slice(0, 7) === m) || null; if (!w?.rank) continue;
      const b = band(w.rank); careerYearsInBand[b] = (careerYearsInBand[b] || 0) + 1 / 12;
      incomeInBand[b] = (incomeInBand[b] || 0) + sumObj(c.ledger[m].income, INCOME);
      sponsorInBand[b] = (sponsorInBand[b] || 0) + (Number(c.ledger[m].income.sponsor_monthly) || 0) + (Number(c.ledger[m].income.sponsor_signing) || 0);
    }
  }
  matrices.required.sponsorship = BANDS.map(([b]) => { const list = sponsorRows.filter((r) => r.kind === 'main' && band(r.rank || 99999) === b); return { faixa: b, assinaturasPorAno: r1(list.length / Math.max(0.01, careerYearsInBand[b] || 0), 2), valorMensalMedio: r1(mean(list.map((r) => r.monthly)), 0), rendaPatrocinioPct: r1(((sponsorInBand[b] || 0) / Math.max(1, incomeInBand[b] || 0)) * 100) }; });
  // 74/75 — staff e equipamento por faixa (snapshots semanais).
  const staffAgg = {}; const gearAgg = {};
  for (const c of main) {
    let cumIncome = 0; let cumGear = 0; let monthIdx = -1; const months = monthsOf(c);
    for (const w of c.weekly) {
      const mi = Math.floor(w.day / MONTH_DAYS);
      while (monthIdx < mi && monthIdx + 1 < months.length) { monthIdx += 1; const L = c.ledger[months[monthIdx]]; cumIncome += sumObj(L.income, INCOME); cumGear += Number(L.expense.equipment) || 0; }
      if (!w.rank) continue; const b = band(w.rank);
      const L = c.ledger[months[Math.min(monthIdx, months.length - 1)]]; const monthIncome = L ? sumObj(L.income, INCOME) : 0;
      (staffAgg[b] ||= []).push({ staff: w.staff || 0, cost: (w.staffMonthly || 0) + (w.coachSalary || 0), share: monthIncome > 0 ? (((w.staffMonthly || 0) + (w.coachSalary || 0)) / monthIncome) * 100 : null });
      const bestRarity = (c.purchases || []).filter((p) => p.day <= w.day).reduce((best, p) => Math.max(best, RARITIES.indexOf(p.rarity)), -1);
      (gearAgg[b] ||= []).push({ tier: bestRarity, cum: cumGear, share: cumIncome > 0 ? (cumGear / cumIncome) * 100 : null });
    }
  }
  matrices.required.staff = BANDS.map(([b]) => ({ faixa: b, staffMedio: r1(mean((staffAgg[b] || []).map((x) => x.staff))), custoMensalStaffMaisCoach: r1(quantile((staffAgg[b] || []).map((x) => x.cost), 0.5), 0), rendaPct: r1(quantile((staffAgg[b] || []).map((x) => x.share), 0.5)) }));
  matrices.required.equipment = BANDS.map(([b]) => { const g = gearAgg[b] || []; const t = quantile(g.map((x) => x.tier), 0.5); return { faixa: b, gearTierMediano: t == null || t < 0 ? 'nenhum' : RARITIES[Math.round(t)], custoAcumuladoMediano: r1(quantile(g.map((x) => x.cum), 0.5), 0), rendaAcumuladaPct: r1(quantile(g.map((x) => x.share), 0.5), 2) }; });
}
// 87–89 — eficiência por tier e torneios dominantes.
{
  const byTier = TIER_ORDER.map((tier) => {
    const ts = tournamentRows.filter((t) => t.kind === 'main' && t.tier === tier); if (!ts.length) return null;
    const fee = TIERS[tier]?.entryFee || 0; const winPct = (difficultyRows.filter((r) => r.tier === tier).reduce((t, r) => t + r.won, 0) / Math.max(1, difficultyRows.filter((r) => r.tier === tier).length));
    const difficulty = Math.max(0.05, 1 - winPct);
    const prizes = ts.map((t) => t.prize || 0); const pts = ts.map((t) => t.rankPoints || 0);
    const m = mean(prizes); const sd = Math.sqrt(prizes.reduce((acc, x) => acc + (x - m) ** 2, 0) / Math.max(1, prizes.length - 1));
    return { tier, entradas: ts.length, inscricao: fee, premioMedio: r1(m, 0), roiMedio: fee ? r1((m - fee) / fee, 2) : null, pontosMedios: r1(mean(pts), 1), winPct: r1(winPct * 100), rewardEfficiency: r1(m / difficulty, 0), rankingEfficiency: r1(mean(pts) / difficulty, 1), riskAdjusted: sd > 0 ? r1(m / sd, 2) : null, titulos: ts.filter((t) => t.champion).length, rodadaMediana: quantile(ts.map((t) => t.roundsWon), 0.5) };
  }).filter(Boolean);
  matrices.tierEfficiency = byTier;
  const byName = {};
  for (const t of tournamentRows.filter((x) => x.kind === 'main')) (byName[`${t.tournamentName || '?'} (${t.tier})`] ||= []).push(t);
  const fee = (tier) => TIERS[tier]?.entryFee || 0;
  matrices.topTournaments = Object.entries(byName).filter(([, l]) => l.length >= 10).map(([k, l]) => { const m = mean(l.map((t) => t.prize || 0)); const sd = Math.sqrt(l.reduce((acc, t) => acc + ((t.prize || 0) - m) ** 2, 0) / Math.max(1, l.length - 1)); return { torneio: k, entradas: l.length, roi: fee(l[0].tier) ? r1((m - fee(l[0].tier)) / fee(l[0].tier), 2) : null, rankingRoi: r1(mean(l.map((t) => t.rankPoints || 0)) / Math.max(1, fee(l[0].tier)), 3), riskAdjusted: sd > 0 ? r1(m / sd, 2) : null }; }).sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1)).slice(0, 10);
}

// ── Gravação ───────────────────────────────────────────────────────────────
writeFileSync(resolve(ROOT, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(resolve(ROOT, 'matrices.json'), JSON.stringify(matrices, null, 2));
writeFileSync(resolve(ROOT, 'outliers.json'), JSON.stringify(outliers, null, 2));
writeFileSync(resolve(ROOT, 'progression.csv'), toCsv(progressionRows));
writeFileSync(resolve(ROOT, 'economy.csv'), toCsv(economyRows));
writeFileSync(resolve(ROOT, 'sponsors.csv'), toCsv(sponsorRows));
writeFileSync(resolve(ROOT, 'staff.csv'), toCsv(staffRows));
writeFileSync(resolve(ROOT, 'shop.csv'), toCsv(shopRows));
writeFileSync(resolve(ROOT, 'tournaments.csv'), toCsv(tournamentRows));
writeFileSync(resolve(ROOT, 'difficulty.csv'), toCsv(difficultyRows));

// ── Gráficos (SVG; PNG via render-charts-v526.mjs) ─────────────────────────
const COLORS = { casual: '#f59e0b', normal: '#3b82f6', optimizer: '#10b981' };
function lineChart({ title, file, series, xLabel, yLabel, invertY = false, logY = false }) {
  const W = 900, H = 520, P = { l: 80, r: 30, t: 50, b: 60 };
  const pts = series.flatMap((s) => s.points.flatMap((p) => [p.y, p.lo, p.hi])).filter((v) => v != null && (!logY || v > 0));
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  if (!pts.length || !xs.length) return;
  const tf = (v) => (logY ? Math.log10(Math.max(1, v)) : v);
  let yMin = Math.min(...pts.map(tf)), yMax = Math.max(...pts.map(tf)); if (yMin === yMax) yMax = yMin + 1;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const X = (x) => P.l + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
  const Y = (y) => { const t = (tf(y) - yMin) / (yMax - yMin); return invertY ? P.t + t * (H - P.t - P.b) : H - P.b - t * (H - P.t - P.b); };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial" font-size="13"><rect width="100%" height="100%" fill="#fff"/><text x="${W / 2}" y="28" text-anchor="middle" font-size="17" font-weight="600">${title}</text>`;
  for (let i = 0; i <= 5; i += 1) { const v = yMin + ((yMax - yMin) * i) / 5; const val = logY ? 10 ** v : v; const y = invertY ? P.t + (i / 5) * (H - P.t - P.b) : H - P.b - (i / 5) * (H - P.t - P.b); svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="${P.l - 8}" y="${y + 4}" text-anchor="end" fill="#555">${Math.round(val)}</text>`; }
  for (const x of [...new Set(xs)].sort((a, b) => a - b)) svg += `<text x="${X(x)}" y="${H - P.b + 20}" text-anchor="middle" fill="#555">${x}</text>`;
  svg += `<text x="${W / 2}" y="${H - 15}" text-anchor="middle">${xLabel}</text><text transform="translate(18 ${H / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
  series.forEach((s, si) => {
    const band = s.points.filter((p) => p.lo != null && p.hi != null);
    if (band.length > 1) svg += `<path d="M${band.map((p) => `${X(p.x)},${Y(p.hi)}`).join(' L')} L${[...band].reverse().map((p) => `${X(p.x)},${Y(p.lo)}`).join(' L')} Z" fill="${s.color}" opacity="0.15"/>`;
    const line = s.points.filter((p) => p.y != null);
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="3" points="${line.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`;
    svg += `<rect x="${P.l + 10 + si * 170}" y="${P.t - 2}" width="14" height="4" fill="${s.color}"/><text x="${P.l + 30 + si * 170}" y="${P.t + 4}">${s.name}</text>`;
  });
  writeFileSync(resolve(CHARTS, `${file}.svg`), `${svg}</svg>`);
}
function barChart({ title, file, groups, yLabel, yMax = null }) {
  const W = 900, H = 520, P = { l: 70, r: 30, t: 60, b: 90 };
  const names = [...new Set(groups.flatMap((g) => g.bars.map((b) => b.name)))];
  const max = yMax ?? Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value || 0)));
  const gw = (W - P.l - P.r) / Math.max(1, groups.length); const bw = (gw * 0.8) / Math.max(1, names.length);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial" font-size="12"><rect width="100%" height="100%" fill="#fff"/><text x="${W / 2}" y="28" text-anchor="middle" font-size="17" font-weight="600">${title}</text>`;
  for (let i = 0; i <= 5; i += 1) { const y = H - P.b - (i / 5) * (H - P.t - P.b); svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="${P.l - 6}" y="${y + 4}" text-anchor="end" fill="#555">${Math.round((max * i) / 5)}</text>`; }
  groups.forEach((g, gi) => {
    g.bars.forEach((b) => { const bi = names.indexOf(b.name); const h = ((b.value || 0) / max) * (H - P.t - P.b); const x = P.l + gi * gw + gw * 0.1 + bi * bw; svg += `<rect x="${x}" y="${H - P.b - h}" width="${bw - 2}" height="${h}" fill="${b.color || '#3b82f6'}"/>${b.note ? `<text x="${x + bw / 2}" y="${H - P.b - h - 4}" text-anchor="middle" font-size="10">${b.note}</text>` : ''}`; });
    svg += `<text x="${P.l + gi * gw + gw / 2}" y="${H - P.b + 18}" text-anchor="middle">${g.label}</text>${g.sub ? `<text x="${P.l + gi * gw + gw / 2}" y="${H - P.b + 34}" text-anchor="middle" fill="#777" font-size="11">${g.sub}</text>` : ''}`;
  });
  const step = Math.min(160, (W - P.l - P.r) / Math.max(1, names.length));
  names.forEach((n, i) => { const color = groups.flatMap((g) => g.bars).find((b) => b.name === n)?.color || '#3b82f6'; svg += `<rect x="${P.l + 10 + i * step}" y="${P.t - 22}" width="12" height="12" fill="${color}"/><text x="${P.l + 26 + i * step}" y="${P.t - 12}" font-size="11">${n}</text>`; });
  svg += `<text transform="translate(18 ${H / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
  writeFileSync(resolve(CHARTS, `${file}.svg`), `${svg}</svg>`);
}
const seriesFor = (metric, kind = 'main', checkpoints = MAIN_CHECKPOINTS) => PROFILES.map((p) => ({ name: p, color: COLORS[p], points: checkpoints.map((m) => { const at = progressionRows.filter((r) => r.profile === p && r.kind === kind && r.month === m).map((r) => r[metric]); return at.length ? { x: m, y: quantile(at, 0.5), lo: quantile(at, 0.1), hi: quantile(at, 0.9) } : null; }).filter(Boolean) }));
lineChart({ title: 'Ranking mundial (mediana, faixa P10–P90)', file: 'rank-over-time', series: seriesFor('rank'), xLabel: 'meses de carreira', yLabel: 'posição (log)', invertY: true, logY: true });
lineChart({ title: 'Ranking mundial — carreiras longas (12 temporadas)', file: 'rank-over-time-long', series: seriesFor('rank', 'long', LONG_CHECKPOINTS), xLabel: 'meses de carreira', yLabel: 'posição (log)', invertY: true, logY: true });
lineChart({ title: 'OVR do jogador (mediana, P10–P90)', file: 'ovr-over-time', series: seriesFor('ovr'), xLabel: 'meses de carreira', yLabel: 'OVR' });
lineChart({ title: 'Patrimônio (moedas + investido)', file: 'patrimony-over-time', series: seriesFor('patrimony'), xLabel: 'meses de carreira', yLabel: 'moedas' });
lineChart({ title: 'Tamanho do save da carreira (MB) — carreiras longas', file: 'save-size-long', series: seriesFor('saveMB', 'long', LONG_CHECKPOINTS), xLabel: 'meses de carreira', yLabel: 'MB' });
lineChart({ title: 'Patrocínio mensal ativo', file: 'sponsor-monthly-over-time', series: seriesFor('sponsorMonthly'), xLabel: 'meses de carreira', yLabel: 'moedas/mês' });
barChart({ title: 'Vitória por tier (rótulo do card) — todas as partidas', file: 'win-by-tier-label', yLabel: '% de vitórias', yMax: 100, groups: TIER_ORDER.map((t) => ({ label: t, sub: TIER_LABEL[t], bars: PROFILES.map((p) => { const g = difficultyRows.filter((r) => r.profile === p && r.tier === t); return { name: p, color: COLORS[p], value: g.length ? (g.reduce((s, r) => s + r.won, 0) / g.length) * 100 : 0, note: g.length ? `n=${g.length}` : '' }; }) })) });
barChart({ title: 'Vitória x diferença de força: exibida (cards) vs motor', file: 'win-by-delta', yLabel: '% de vitórias', yMax: 100, groups: BUCKETS.map((b) => ({ label: b, bars: [
  { name: 'Δ exibido', color: '#6366f1', value: (matrices.winByDisplayDelta.find((r) => r.key === b)?.winPct) || 0, note: `n=${matrices.winByDisplayDelta.find((r) => r.key === b)?.n || 0}` },
  { name: 'Δ do motor', color: '#ef4444', value: (matrices.winByEngineDelta.find((r) => r.key === b)?.winPct) || 0, note: `n=${matrices.winByEngineDelta.find((r) => r.key === b)?.n || 0}` },
] })) });
const yearIncome = (p) => summary.profiles[p]?.economy.perYear || [];
barChart({ title: 'Receita mediana por origem — perfil normal', file: 'income-mix-normal', yLabel: 'moedas/ano', groups: yearIncome('normal').map((y) => ({ label: `Ano ${y.year}`, bars: [
  { name: 'Patrocínio', color: '#3b82f6', value: (y.incomeByCategoryMedian.sponsor_monthly || 0) + (y.incomeByCategoryMedian.sponsor_signing || 0) },
  { name: 'Prêmios+partidas', color: '#10b981', value: (y.incomeByCategoryMedian.prize || 0) + (y.incomeByCategoryMedian.match_reward || 0) },
  { name: 'Conquistas/missões', color: '#f59e0b', value: (y.incomeByCategoryMedian.achievements || 0) + (y.incomeByCategoryMedian.missions || 0) },
  { name: 'Investimento', color: '#8b5cf6', value: (y.incomeByCategoryMedian.investment_income || 0) + (y.incomeByCategoryMedian.passive_income || 0) },
] })) });
barChart({ title: 'Receita × despesa mediana por ano (por perfil)', file: 'income-vs-expense', yLabel: 'moedas/ano', groups: [1, 2, 3, 4, 5].map((yr) => ({ label: `Ano ${yr}`, bars: PROFILES.flatMap((p) => { const y = (summary.profiles[p]?.economy.perYear || []).find((r) => r.year === yr); return y ? [{ name: `${p} receita`, color: COLORS[p], value: y.income.median }, { name: `${p} despesa`, color: '#9ca3af', value: y.expense.median }] : []; }) })) });
barChart({ title: 'Custo de staff + treinador como % da renda mensal (mediana) por faixa', file: 'staff-cost-share', yLabel: '% da renda do mês', yMax: 100, groups: (matrices.required?.staff || []).map((r) => ({ label: r.faixa, bars: [{ name: 'staff+coach % renda', color: '#8b5cf6', value: r.rendaPct || 0, note: `${r.custoMensalStaffMaisCoach}/mês` }] })) });
barChart({ title: 'Rodadas vencidas por torneio (média) por tier', file: 'round-reached-by-tier', yLabel: 'rodadas vencidas (média)', groups: TIER_ORDER.map((t) => ({ label: t, sub: TIER_LABEL[t], bars: PROFILES.map((p) => { const ts = tournamentRows.filter((x) => x.kind === 'main' && x.profile === p && x.tier === t); return { name: p, color: COLORS[p], value: ts.length ? mean(ts.map((x) => x.roundsWon)) : 0, note: ts.length ? `n=${ts.length}` : '' }; }) })) });
barChart({ title: 'Marcos de ranking — % de carreiras que alcançam (5 temporadas)', file: 'milestones', yLabel: '% das carreiras', yMax: 100, groups: MILESTONES.map((t) => ({ label: `Top ${t}`, bars: PROFILES.map((p) => ({ name: p, color: COLORS[p], value: summary.profiles[p]?.progression.milestones[`top${t}`]?.reachedPct || 0 })) })) });

console.log(`carreiras: ${main.length} principais + ${long.length} longas · partidas ${difficultyRows.length} · torneios ${tournamentRows.length} · meses de livro-razão ${economyRows.length} (resíduo máx ${ledgerCheck.maxAbsReconciliation})`);
console.log(`→ ${ROOT}`);
