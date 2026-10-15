// Playthrough 5.27 — gerador dos artefatos de relatório do rebalanceamento.
// Lê reports/rebalance-527/<preset>/raw e emite os JSON/CSV pedidos.
// Uso: node scripts/analyze-rebalance-527.mjs [preset=balanced2] [label=balanced]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PRESET_DIR = process.argv[2] || 'balanced2';
const LABEL = process.argv[3] || 'balanced';
const ROOT = resolve('reports/rebalance-527');
const RAW = resolve(ROOT, PRESET_DIR, 'raw');
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil', 'Circuit Finals': 'Difícil', 'Legacy Finals': 'Difícil' };
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown', 'Circuit Finals', 'Legacy Finals'];
const csv = (rows) => rows.map((r) => r.map((v) => (v == null ? '' : String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n');

const careers = existsSync(RAW) ? readdirSync(RAW).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => ({ ...JSON.parse(readFileSync(join(RAW, f), 'utf8')), file: f })) : [];
const allMatches = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
const win = (l) => (l.length ? Math.round((100 * l.filter((m) => m.won).length) / l.length) : null);
const byKey = (fn) => [...new Set(allMatches.map(fn).filter(Boolean))].map((k) => ({ key: k, n: allMatches.filter((m) => fn(m) === k).length, winPct: win(allMatches.filter((m) => fn(m) === k)) }));
const roundOf = (m) => (m.stage === 'qualifying' ? 'Q' : m.round === 'Final' ? 'F' : m.round === 'Semifinal' ? 'SF' : m.round === 'Quartas de Final' ? 'QF' : Number(m.stageRoundIndex) === 0 ? 'R1' : 'R2');

const summary = {
  generatedAt: new Date().toISOString(),
  preset: LABEL,
  careers: careers.length,
  days: 730,
  gates: {
    completed: careers.filter((c) => c.days === 730).length,
    shimFree: careers.filter((c) => c.shimEver === false).length,
    errors: careers.reduce((t, c) => t + (c.errors || []).length, 0),
    softLock: careers.reduce((t, c) => t + (c.softLock?.fires || 0), 0),
  },
  difficulty: { overall: win(allMatches), byClass: byKey((m) => CLASS[m.tier]), byTier: byKey((m) => m.tier), byRound: byKey(roundOf) },
  careers: Object.fromEntries(careers.map((c) => {
    let spon = 0; let tot = 0; let prize = 0; let staff = 0; let coach = 0; let equip = 0; let train = 0; let invest = 0;
    for (const [, L] of Object.entries(c.ledger || {})) {
      for (const [k, v] of Object.entries(L.income || {})) { tot += v; if (k.startsWith('sponsor')) spon += v; if (k === 'prize') prize += v; if (k === 'investment_income') invest += v; }
      for (const [k, v] of Object.entries(L.expense || {})) { if (k === 'staff') staff += v; if (k === 'coach') coach += v; if (k === 'equipment') equip += v; if (k === 'training') train += v; }
    }
    const last = c.weekly.at(-1) || {};
    return [c.profile, {
      matches: c.matches.length, finalRank: last.rank, finalOvr: last.ovr, finalCoins: c.finalCoins,
      titles: c.tournaments.filter((t) => t.status === 'champion').length,
      sponsorShare: tot ? Math.round((100 * spon) / tot) : null, prizeShare: tot ? Math.round((100 * prize) / tot) : null,
      income: tot, staffSpend: staff, coachSpend: coach, equipSpend: equip, trainingSpend: train, investmentIncome: invest,
      insolvent: c.weekly.some((w) => (w.coins || 0) < 0),
    }];
  })),
};
writeFileSync(resolve(ROOT, `${LABEL}.json`), JSON.stringify(summary, null, 2));

writeFileSync(resolve(ROOT, 'difficulty.csv'), csv([
  ['dimension', 'key', 'matches', 'winPct'],
  ['overall', 'all', allMatches.length, win(allMatches)],
  ...byKey((m) => CLASS[m.tier]).map((r) => ['class', r.key, r.n, r.winPct]),
  ...byKey((m) => m.tier).map((r) => ['tier', r.key, r.n, r.winPct]),
  ...byKey(roundOf).map((r) => ['round', r.key, r.n, r.winPct]),
]));

writeFileSync(resolve(ROOT, 'economy.csv'), csv([
  ['profile', 'income', 'sponsorShare', 'prizeShare', 'staff', 'coach', 'equip', 'training', 'investmentIncome', 'finalCoins', 'insolvent'],
  ...Object.entries(summary.careers).map(([p, c]) => [p, c.income, c.sponsorShare, c.prizeShare, c.staffSpend, c.coachSpend, c.equipSpend, c.trainingSpend, c.investmentIncome, c.finalCoins, c.insolvent]),
]));

writeFileSync(resolve(ROOT, 'progression.csv'), csv([
  ['profile', 'day', 'date', 'rank', 'ovr', 'coins', 'teamRank'],
  ...careers.flatMap((c) => c.weekly.map((w) => [c.profile, w.day, w.date, w.rank, w.ovr, w.coins, w.teamRank])),
]));

writeFileSync(resolve(ROOT, 'tournaments.csv'), csv([
  ['profile', 'day', 'tier', 'status', 'roundsWon', 'totalRounds', 'prize', 'rankPoints'],
  ...careers.flatMap((c) => c.tournaments.map((t) => [c.profile, t.day, t.tier, t.status, t.roundsWon, t.totalRounds, t.prize, t.rankPoints])),
]));

writeFileSync(resolve(ROOT, 'sponsors.csv'), csv([
  ['profile', 'day', 'sponsor', 'tier', 'monthly', 'signBonus', 'duration'],
  ...careers.flatMap((c) => c.sponsors.map((s) => [c.profile, s.day, s.sponsor, s.tier, s.monthly, s.signBonus, s.duration])),
]));

writeFileSync(resolve(ROOT, 'staff.csv'), csv([
  ['profile', 'day', 'role', 'quality', 'tier', 'monthly'],
  ...careers.flatMap((c) => c.staff.map((s) => [c.profile, s.day, s.role, s.quality, s.tier, s.monthly])),
]));

writeFileSync(resolve(ROOT, 'shop.csv'), csv([
  ['profile', 'day', 'item', 'category', 'rarity', 'price', 'bonusTotal'],
  ...careers.flatMap((c) => c.purchases.map((p) => [c.profile, p.day, p.name, p.category, p.rarity, p.price, p.bonusTotal])),
]));

writeFileSync(resolve(ROOT, 'investments.csv'), csv([
  ['profile', 'day', 'product', 'amount'],
  ...careers.flatMap((c) => (c.investments || []).map((i) => [c.profile, i.day, i.product, i.amount])),
]));

// comparison.md (5.26-D baseline × Balanced)
const base = existsSync(resolve(ROOT, 'baseline-summary-526d.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'baseline-summary-526d.json'), 'utf8')) : null;
const baseDiff = existsSync(resolve(ROOT, 'baseline-difficulty-526d.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'baseline-difficulty-526d.json'), 'utf8')) : null;
const b = baseDiff?.smoke?.all || {};
const line = (label, c, d) => `| ${label} | ${c ?? '—'} | ${d ?? '—'} |`;
writeFileSync(resolve(ROOT, 'comparison.md'), [
  '# 5.26-D → 5.27 Balanced', '',
  '> 5.26-D = 15 carreiras × 2 anos (n alto). Balanced = 3 carreiras × 2 anos (1 seed).',
  '> Comparação de DIREÇÃO, não de igualdade de n.', '',
  '| Métrica | 5.26-D | Balanced |', '|---|---|---|',
  line('Easy WR', b.byClass?.['Fácil']?.winPct, summary.difficulty.byClass.find((x) => x.key === 'Fácil')?.winPct),
  line('Medium WR', b.byClass?.['Médio']?.winPct, summary.difficulty.byClass.find((x) => x.key === 'Médio')?.winPct),
  line('Hard WR', b.byClass?.['Difícil']?.winPct, summary.difficulty.byClass.find((x) => x.key === 'Difícil')?.winPct),
  ...TIERS.map((t) => line(t, b.byTier?.[t]?.winPct, summary.difficulty.byTier.find((x) => x.key === t)?.winPct)),
  line('R1', b.byRound?.R1?.winPct, summary.difficulty.byRound.find((x) => x.key === 'R1')?.winPct),
  line('SF', b.byRound?.SF?.winPct, summary.difficulty.byRound.find((x) => x.key === 'SF')?.winPct),
  line('F', b.byRound?.F?.winPct, summary.difficulty.byRound.find((x) => x.key === 'F')?.winPct),
  line('Sponsor share Y1', '86–88%', Object.values(summary.careers).map((c) => c.sponsorShare + '%').join(' / ')),
  line('Prize share', '2–3%', Object.values(summary.careers).map((c) => c.prizeShare + '%').join(' / ')),
  '',
  `Baseline gates: ${JSON.stringify(base?.gates?.smoke || {})}`,
].join('\n'));

// placeholders explícitos para presets não simulados
for (const [id, status] of [['conservative', 'not-simulated'], ['hardcore', 'not-simulated']]) {
  if (!existsSync(resolve(ROOT, `${id}.json`))) writeFileSync(resolve(ROOT, `${id}.json`), JSON.stringify({ preset: id, status, note: 'Preset implementado em src/lib/balance527.js; carreira completa não simulada nesta sessão (runtime).' }, null, 2));
}

console.log(JSON.stringify({ preset: LABEL, careers: careers.length, overall: summary.difficulty.overall, byClass: summary.difficulty.byClass, byRound: summary.difficulty.byRound, careersSummary: summary.careers }, null, 1));
