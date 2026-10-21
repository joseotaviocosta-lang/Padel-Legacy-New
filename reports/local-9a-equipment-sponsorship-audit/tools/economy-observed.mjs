// LOCAL-9A — economia OBSERVADA em execuções já existentes do harness 5.26/5.27
// (scripts/sim-progression-economy-v526.mjs, perfil "normal"). Só lê JSONs versionados em reports/.
// Agrega o ledger mensal por ano de carreira: receitas e despesas por categoria, participação do
// patrocínio, gasto com equipamento, caixa e meses negativos. Não executa o jogo.
// Uso: node reports/local-9a-equipment-sponsorship-audit/tools/economy-observed.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = [
  { id: '527j-normal-003', file: 'reports/rebalance-527j/seed3-527h-config/normal-003.json', note: 'preset 5.27 (moedas iniciais 900) — economia atual' },
  { id: '526c-normal-008', file: 'reports/progression-clean-526c/repro-resign/normal-008.json', note: 'anterior à 5.27 (moedas iniciais 100, patrocínio sem redutor) — referência histórica' },
  { id: '526b-normal-001', file: 'reports/progression-integrity-526b/freeze-after/normal-001.json', note: 'anterior à 5.27 — referência histórica' },
];

const result = { generatedBy: 'LOCAL-9A economy-observed', runs: [] };
for (const run of RUNS) {
  const raw = JSON.parse(readFileSync(run.file, 'utf8'));
  const out = raw.out || raw;
  const months = Object.keys(out.ledger || {}).sort();
  const start = Number(String(out.startDate).slice(0, 4));
  const years = {};
  for (const m of months) {
    const row = out.ledger[m];
    const y = `ano ${Number(m.slice(0, 4)) - start + 1}`;
    const acc = (years[y] ||= { months: 0, income: {}, expense: {}, incomeTotal: 0, expenseTotal: 0, closing: null, minClosing: Infinity, negativeMonths: 0 });
    acc.months += 1;
    for (const [k, v] of Object.entries(row.income || {})) { acc.income[k] = (acc.income[k] || 0) + v; acc.incomeTotal += v; }
    for (const [k, v] of Object.entries(row.expense || {})) { acc.expense[k] = (acc.expense[k] || 0) + v; acc.expenseTotal += v; }
    acc.closing = row.closing;
    acc.minClosing = Math.min(acc.minClosing, row.closing);
    if (row.closing < 0) acc.negativeMonths += 1;
  }
  for (const acc of Object.values(years)) {
    const sponsor = (acc.income.sponsor_monthly || 0) + (acc.income.sponsor_signing || 0);
    acc.sponsorSharePct = acc.incomeTotal ? Math.round((sponsor / acc.incomeTotal) * 100) : 0;
    acc.prizeSharePct = acc.incomeTotal ? Math.round(((acc.income.prize || 0) / acc.incomeTotal) * 100) : 0;
    acc.equipmentSharePct = acc.expenseTotal ? Math.round(((acc.expense.equipment || 0) / acc.expenseTotal) * 100) : 0;
    acc.net = acc.incomeTotal - acc.expenseTotal;
  }
  const weekly = out.weekly || [];
  const at = (day) => weekly.reduce((best, w) => (Math.abs(w.day - day) < Math.abs((best?.day ?? 1e9) - day) ? w : best), null);
  const snapshots = [0, 180, 365, 545, 730].filter((d) => d <= (weekly.at(-1)?.day ?? 0)).map((d) => { const w = at(d); return w && { day: w.day, date: w.date, ovr: w.ovr, rank: w.rank, coins: w.coins, sponsors: w.sponsors, sponsorMonthly: w.sponsorMonthly, coachSalary: w.coachSalary, staffMonthly: w.staffMonthly, gearOwned: w.gearOwned, gearEquipped: w.gearEquipped, shopUnlockedRarity: w.shopUnlockedRarity, careerLevel: w.careerLevel, reputation: w.reputation }; }).filter(Boolean);
  const purchases = out.purchases || [];
  const byRarity = {};
  for (const p of purchases) { const r = (byRarity[p.rarity] ||= { n: 0, spent: 0, firstDay: p.day }); r.n += 1; r.spent += p.price; }
  result.runs.push({
    ...run, days: out.days ?? weekly.at(-1)?.day, startDate: out.startDate, finalCoins: out.finalCoins ?? weekly.at(-1)?.coins,
    years, snapshots,
    purchases: { count: purchases.length, spent: purchases.reduce((s, p) => s + p.price, 0), byRarity, maxShareOfCash: purchases.length ? Math.max(...purchases.map((p) => +(p.price / Math.max(1, p.coins)).toFixed(3))) : null },
    sponsors: { signed: (out.sponsors || []).length, byTier: (out.sponsors || []).reduce((a, s) => ((a[s.tier] = (a[s.tier] || 0) + 1), a), {}), firstDay: out.sponsors?.[0]?.day ?? null, firstPrataDay: out.sponsors?.find((s) => s.tier === 'Prata')?.day ?? null, firstOuroDay: out.sponsors?.find((s) => s.tier === 'Ouro')?.day ?? null },
    investments: (out.investments || []).length, coaches: (out.coaches || []).length, staff: (out.staff || []).length,
  });
}
writeFileSync(resolve(OUT, 'economy-observed.json'), JSON.stringify(result, null, 1));
for (const r of result.runs) {
  console.log(`\n== ${r.id} (${r.note}) dias=${r.days} caixa final=${r.finalCoins}`);
  for (const [y, a] of Object.entries(r.years)) console.log(`  ${y} (${a.months}m): receita ${a.incomeTotal} [patroc ${a.sponsorSharePct}% · prêmio ${a.prizeSharePct}%] despesa ${a.expenseTotal} [equip ${a.equipmentSharePct}%] líquido ${a.net} caixa fim ${a.closing} mín ${a.minClosing} meses<0 ${a.negativeMonths}`);
  console.log('  compras', JSON.stringify(r.purchases), '\n  patrocínios', JSON.stringify(r.sponsors));
  for (const s of r.snapshots) console.log('  ', JSON.stringify(s));
}
