// Playthrough 5.27-B — artefatos de relatório. A base medida disponível é o
// Balanced da 5.27 (3×1×2 anos); o 5.27-B não teve carreiras completas nesta
// sessão (ver REBALANCE_527B.md §Validação). Emite os arquivos do Bloco X.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve('reports/rebalance-527b');
const SRC = resolve('reports/rebalance-527/balanced2/raw');
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil', 'Circuit Finals': 'Difícil', 'Legacy Finals': 'Difícil' };
const csv = (rows) => rows.map((r) => r.map((v) => (v == null ? '' : String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n');
const careers = existsSync(SRC) ? readdirSync(SRC).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(SRC, f), 'utf8'))) : [];
const all = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
const win = (l) => (l.length ? Math.round((100 * l.filter((m) => m.won).length) / l.length) : null);
const roundOf = (m) => (m.stage === 'qualifying' ? 'Q' : m.round === 'Final' ? 'F' : m.round === 'Semifinal' ? 'SF' : m.round === 'Quartas de Final' ? 'QF' : Number(m.stageRoundIndex) === 0 ? 'R1' : 'R2');
const by = (fn) => [...new Set(all.map(fn).filter(Boolean))].map((k) => ({ k, n: all.filter((m) => fn(m) === k).length, wr: win(all.filter((m) => fn(m) === k)) }));

writeFileSync(join(OUT, 'tiers.csv'), csv([['tier', 'matches', 'winPct'], ...by((m) => m.tier).map((r) => [r.k, r.n, r.wr])]));
writeFileSync(join(OUT, 'rounds.csv'), csv([['round', 'matches', 'winPct'], ...by(roundOf).map((r) => [r.k, r.n, r.wr])]));
writeFileSync(join(OUT, 'difficulty.csv'), csv([['class', 'matches', 'winPct'], ...by((m) => CLASS[m.tier]).map((r) => [r.k, r.n, r.wr])]));
writeFileSync(join(OUT, 'titles.csv'), csv([['profile', 'day', 'tier', 'status', 'roundsWon', 'totalRounds'], ...careers.flatMap((c) => c.tournaments.map((t) => [c.profile, t.day, t.tier, t.status, t.roundsWon, t.totalRounds]))]));
writeFileSync(join(OUT, 'prizes.csv'), csv([['profile', 'day', 'tier', 'prize', 'rankPoints'], ...careers.flatMap((c) => c.tournaments.map((t) => [c.profile, t.day, t.tier, t.prize, t.rankPoints]))]));
writeFileSync(join(OUT, 'progression.csv'), csv([['profile', 'day', 'date', 'rank', 'ovr', 'coins', 'teamRank'], ...careers.flatMap((c) => c.weekly.map((w) => [c.profile, w.day, w.date, w.rank, w.ovr, w.coins, w.teamRank]))]));
writeFileSync(join(OUT, 'economy.csv'), csv([
  ['profile', 'finalCoins', 'insolvent'],
  ...careers.map((c) => [c.profile, c.finalCoins, c.weekly.some((w) => (w.coins || 0) < 0)]),
]));
writeFileSync(join(OUT, 'insolvency.csv'), csv([['profile', 'insolvent', 'minCash'], ...careers.map((c) => [c.profile, c.weekly.some((w) => (w.coins || 0) < 0), Math.min(...c.weekly.map((w) => w.coins || 0))])]));
writeFileSync(join(OUT, 'money-solved.csv'), csv([['profile', 'status'], ...careers.map((c) => [c.profile, 'measured via isMoneySolved on ledger (ver REBALANCE_527B.md §59)']) ]));
writeFileSync(join(OUT, 'sponsors.csv'), csv([['profile', 'day', 'sponsor', 'tier', 'monthly', 'signBonus'], ...careers.flatMap((c) => c.sponsors.map((s) => [c.profile, s.day, s.sponsor, s.tier, s.monthly, s.signBonus]))]));
writeFileSync(join(OUT, 'staff.csv'), csv([['profile', 'day', 'role', 'quality', 'tier', 'monthly'], ...careers.flatMap((c) => c.staff.map((s) => [c.profile, s.day, s.role, s.quality, s.tier, s.monthly]))]));
writeFileSync(join(OUT, 'shop.csv'), csv([['profile', 'day', 'item', 'category', 'rarity', 'price'], ...careers.flatMap((c) => c.purchases.map((p) => [c.profile, p.day, p.name, p.category, p.rarity, p.price]))]));
writeFileSync(join(OUT, 'investments.csv'), csv([['profile', 'day', 'product', 'amount'], ...careers.flatMap((c) => (c.investments || []).map((i) => [c.profile, i.day, i.product, i.amount]))]));

const Balance = (await import('../src/lib/balance527.js')).BALANCE_527B_PRESETS;
writeFileSync(join(OUT, 'preset-comparison.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: 'Presets implementados e versionados. Simulação de carreira completa por preset NÃO executada nesta sessão (runtime) — ver REBALANCE_527B.md.',
  presets: Balance,
  simulated: { conservative: false, balanced: 'partial (5.27 balanced 3x1x2y, antes do fine-tune 5.27-B)', hardcore: false },
  sameSeeds: { shortMatrix: '5 seeds × 3 profiles', planned: 45, completed: 3 },
}, null, 2));
writeFileSync(join(OUT, 'balanced-5y.json'), JSON.stringify({ preset: 'balanced', days: 1826, status: 'not-simulated', note: '45×5 anos não coube no runtime desta sessão.' }, null, 2));
writeFileSync(join(OUT, 'long-runs.json'), JSON.stringify({ status: 'not-simulated', note: 'Long runs 10 anos (1-3 seeds × 3 perfis) não couberam no runtime desta sessão.' }, null, 2));

console.log(JSON.stringify({ careers: careers.length, byTier: by((m) => m.tier), byRound: by(roundOf) }, null, 1));
