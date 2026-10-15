// Playthrough 5.27-C — gerador dos artefatos do Bloco R a partir das carreiras
// dos 3 presets (mesmas seeds). Rodar após o Stage 1.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMoneySolved, moneySolvedCrossing } from '../src/lib/balance527.js';

const ROOT = resolve('reports/rebalance-527c');
const PRESETS = ['conservative', 'balanced', 'hardcore'];
const PROFILES = ['casual', 'normal', 'optimizer'];
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil', 'Circuit Finals': 'Difícil', 'Legacy Finals': 'Difícil' };
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const csv = (rows) => rows.map((r) => r.map((v) => (v == null ? '' : String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n');
const q = (v, p) => { const s = v.map(Number).filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p; return Math.round((s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i))) * 10) / 10; };
const dist = (v) => ({ n: v.filter((x) => x != null).length, mean: q(v, 0.5), median: q(v, 0.5), p10: q(v, 0.1), p25: q(v, 0.25), p75: q(v, 0.75), p90: q(v, 0.9), min: q(v, 0), max: q(v, 1) });
const load = (preset) => {
  const dir = join(ROOT, preset, 'raw');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => ({ ...JSON.parse(readFileSync(join(dir, f), 'utf8')), file: f })) : [];
};
const win = (l) => (l.length ? Math.round((100 * l.filter((m) => m.won).length) / l.length) : null);
const roundOf = (m) => (m.stage === 'qualifying' ? 'Q' : m.round === 'Final' ? 'F' : m.round === 'Semifinal' ? 'SF' : m.round === 'Quartas de Final' ? 'QF' : Number(m.stageRoundIndex) === 0 ? 'R1' : 'R2');
const yearOf = (m) => (Number.isFinite(Number(m.day)) ? Math.floor(Number(m.day) / 365) + 1 : m.date ? Math.floor((new Date(`${m.date}T00:00:00Z`) - new Date('2026-01-01T00:00:00Z')) / (365 * 86400000)) + 1 : 1);
const share = (ledger, keys, yearFilter) => {
  let part = 0; let inc = 0;
  for (const [month, L] of Object.entries(ledger || {})) {
    if (yearFilter && !String(month).startsWith(yearFilter)) continue;
    part += keys.reduce((s, k) => s + (Number(L.income?.[k]) || 0), 0);
    inc += Object.values(L.income || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return inc ? Math.round((100 * part) / inc) : null;
};
const recurringOf = (c) => {
  const months = Object.entries(c.ledger || {}).map(([month, L]) => {
    const recInc = (Number(L.income?.sponsor_monthly) || 0) + (Number(L.income?.investment_income) || 0) + (Number(L.income?.passive_income) || 0);
    const recExp = Object.values(L.expense || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    return { month, recurringIncome: recInc, recurringExpense: recExp, cash: 0 };
  });
  // cash por mês a partir do weekly (fim do mês).
  for (const row of months) {
    const w = [...(c.weekly || [])].reverse().find((x) => String(x.date || '').slice(0, 7) <= row.month);
    row.cash = w?.coins ?? 0;
  }
  return months;
};

const presetMatrix = { generatedAt: new Date().toISOString(), seeds: [1], profiles: PROFILES, presets: {} };
const allByPreset = {};
for (const preset of PRESETS) {
  const careers = load(preset);
  allByPreset[preset] = careers;
  const perProfile = {};
  for (const profile of PROFILES) {
    const list = careers.filter((c) => c.profile === profile);
    const matches = list.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
    const at = (c, day) => { let b = null; for (const w of c.weekly || []) { if (w.day <= day) b = w; else break; } return b; };
    const solvedMonths = list.map((c) => moneySolvedCrossing(recurringOf(c))?.monthIndex ?? null);
    perProfile[profile] = {
      careers: list.length,
      easyWR: win(matches.filter((m) => CLASS[m.tier] === 'Fácil')),
      mediumWR: win(matches.filter((m) => CLASS[m.tier] === 'Médio')),
      hardWR: win(matches.filter((m) => CLASS[m.tier] === 'Difícil')),
      r1WR: win(matches.filter((m) => roundOf(m) === 'R1')),
      rank1y: dist(list.map((c) => at(c, 365)?.rank)),
      rank2y: dist(list.map((c) => at(c, 730)?.rank)),
      titles2y: dist(list.map((c) => (c.tournaments || []).filter((t) => t.status === 'champion' && t.day < 730).length)),
      sponsorShareY1: q(list.map((c) => share(c.ledger, ['sponsor_monthly', 'sponsor_signing'], '2026')), 0.5),
      prizeShareY1: q(list.map((c) => share(c.ledger, ['prize'], '2026')), 0.5),
      insolvent: list.filter((c) => (c.weekly || []).some((w) => (w.coins || 0) < 0)).length,
      moneySolvedMonthIndex: solvedMonths.filter((x) => x != null).length ? q(solvedMonths.filter((x) => x != null), 0.5) : null,
    };
  }
  presetMatrix.presets[preset] = { careers: careers.length, profiles: perProfile };
}
writeFileSync(join(ROOT, 'preset-matrix.json'), JSON.stringify(presetMatrix, null, 2));

const all = PRESETS.flatMap((p) => allByPreset[p]);
const allMatches = all.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));

// CSV por ano / tier / rodada (Balanced)
const balMatches = allByPreset.balanced.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
writeFileSync(join(ROOT, 'difficulty-year.csv'), csv([['year', 'class', 'matches', 'winPct'], ...[1, 2].flatMap((y) => ['Fácil', 'Médio', 'Difícil'].map((cl) => [y, cl, balMatches.filter((m) => yearOf(m) === y && CLASS[m.tier] === cl).length, win(balMatches.filter((m) => yearOf(m) === y && CLASS[m.tier] === cl))]))]));
writeFileSync(join(ROOT, 'difficulty-tier.csv'), csv([['tier', 'matches', 'winPct'], ...TIERS.map((t) => [t, balMatches.filter((m) => m.tier === t).length, win(balMatches.filter((m) => m.tier === t))])]));
writeFileSync(join(ROOT, 'rounds.csv'), csv([['round', 'matches', 'winPct'], ...['Q', 'R1', 'R2', 'QF', 'SF', 'F'].map((r) => [r, balMatches.filter((m) => roundOf(m) === r).length, win(balMatches.filter((m) => roundOf(m) === r))])]));
writeFileSync(join(ROOT, 'progression.csv'), csv([['profile', 'preset', 'day', 'date', 'rank', 'ovr', 'coins', 'teamRank'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.weekly || []).map((w) => [c.profile, p, w.day, w.date, w.rank, w.ovr, w.coins, w.teamRank])))]));
writeFileSync(join(ROOT, 'titles.csv'), csv([['preset', 'profile', 'day', 'tier', 'status', 'roundsWon', 'totalRounds'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.tournaments || []).map((t) => [p, c.profile, t.day, t.tier, t.status, t.roundsWon, t.totalRounds])))]));
const MILESTONES = [500, 250, 100, 50, 20, 10, 5, 1];
writeFileSync(join(ROOT, 'milestones.csv'), csv([['profile', 'milestone', 'reachedPct', 'medianDay'], ...PROFILES.flatMap((pr) => MILESTONES.map((m) => { const ds = allByPreset.balanced.filter((c) => c.profile === pr).map((c) => (c.weekly || []).find((w) => w.rank && w.rank <= m)?.day ?? null); return [pr, `top${m}`, ds.length ? Math.round((100 * ds.filter((x) => x != null).length) / ds.length) : 0, q(ds.filter((x) => x != null), 0.5)]; }))]));
writeFileSync(join(ROOT, 'economy.csv'), csv([['preset', 'profile', 'income', 'finalCoins', 'insolvent'], ...PRESETS.flatMap((p) => allByPreset[p].map((c) => [p, c.profile, Object.values(c.ledger || {}).reduce((s, L) => s + Object.values(L.income || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0), c.finalCoins, (c.weekly || []).some((w) => (w.coins || 0) < 0)]))]));
writeFileSync(join(ROOT, 'cashflow.csv'), csv([['preset', 'profile', 'month', 'income', 'expense'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => Object.entries(c.ledger || {}).map(([month, L]) => [p, c.profile, month, Object.values(L.income || {}).reduce((s, v) => s + (Number(v) || 0), 0), Object.values(L.expense || {}).reduce((s, v) => s + (Number(v) || 0), 0)])))]));
writeFileSync(join(ROOT, 'sponsors.csv'), csv([['preset', 'profile', 'day', 'sponsor', 'tier', 'monthly'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.sponsors || []).map((s) => [p, c.profile, s.day, s.sponsor, s.tier, s.monthly])))]));
writeFileSync(join(ROOT, 'prizes.csv'), csv([['preset', 'profile', 'day', 'tier', 'prize'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.tournaments || []).map((t) => [p, c.profile, t.day, t.tier, t.prize])))]));
writeFileSync(join(ROOT, 'staff.csv'), csv([['preset', 'profile', 'day', 'role', 'tier', 'monthly'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.staff || []).map((s) => [p, c.profile, s.day, s.role, s.tier, s.monthly])))]));
writeFileSync(join(ROOT, 'shop.csv'), csv([['preset', 'profile', 'day', 'item', 'rarity', 'price'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.purchases || []).map((x) => [p, c.profile, x.day, x.name, x.rarity, x.price])))]));
writeFileSync(join(ROOT, 'investments.csv'), csv([['preset', 'profile', 'day', 'product', 'amount'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.investments || []).map((i) => [p, c.profile, i.day, i.product, i.amount])))]));
writeFileSync(join(ROOT, 'debt.csv'), csv([['preset', 'profile', 'status'], ...PRESETS.flatMap((p) => allByPreset[p].map((c) => [p, c.profile, (c.weekly || []).some((w) => (w.coins || 0) < 0) ? 'debt-observed' : 'none']))]));
writeFileSync(join(ROOT, 'insolvency.csv'), csv([['preset', 'profile', 'insolvent', 'minCash'], ...PRESETS.flatMap((p) => allByPreset[p].map((c) => [p, c.profile, (c.weekly || []).some((w) => (w.coins || 0) < 0), Math.min(...(c.weekly || [{ coins: 0 }]).map((w) => w.coins || 0))]))]));
writeFileSync(join(ROOT, 'money-solved.csv'), csv([['preset', 'profile', 'monthIndex'], ...PRESETS.flatMap((p) => allByPreset[p].map((c) => [p, c.profile, moneySolvedCrossing(recurringOf(c))?.monthIndex ?? null]))]));
writeFileSync(join(ROOT, 'save-size.csv'), csv([['preset', 'profile', 'day', 'saveMB'], ...PRESETS.flatMap((p) => allByPreset[p].flatMap((c) => (c.weekly || []).map((w) => [p, c.profile, w.day, w.saveMB])))]));

console.log(JSON.stringify({ presets: Object.fromEntries(PRESETS.map((p) => [p, allByPreset[p].length])), balancedNormal: presetMatrix.presets.balanced?.profiles?.normal }, null, 1));
