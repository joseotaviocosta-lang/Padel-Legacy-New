// LOCAL-9E.1 — consolida as carreiras brutas do simulador em evidências leves.
//
// Lê <raw>/<perfil>-d<dias>-s<seed>.json e grava em
// reports/local-9e1-decision-simulator/: summary.json (métricas por carreira e
// por perfil × horizonte) e summary.md (tabelas do relatório).
//
// Uso: node scripts/analyze-local-9e1-decisions.mjs --raw=<dir>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const RAW = resolve(arg('raw', 'reports/local-9e1-decision-simulator/raw'));
const OUT = resolve('reports/local-9e1-decision-simulator');
mkdirSync(OUT, { recursive: true });

const PROFILES = ['economico', 'equilibrado', 'competitivo'];
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const addInto = (acc, o) => { for (const [k, v] of Object.entries(o || {})) acc[k] = (acc[k] || 0) + (Number(v) || 0); return acc; };

function metrics(o) {
  const w0 = o.weekly[0] || {}; const w = o.weekly.at(-1) || {};
  const income = {}; const expense = {}; const transfer = {}; let unattributed = 0;
  for (const m of Object.values(o.ledger || {})) { addInto(income, m.income); addInto(expense, m.expense); addInto(transfer, m.transfer); unattributed += m.unattributed || 0; }
  const wins = o.matches.filter((m) => m.won).length;
  const coinsSeries = o.weekly.map((x) => x.coins);
  const byRarity = {}; for (const p of o.purchases) byRarity[p.rarity] = (byRarity[p.rarity] || 0) + 1;
  const tiers = {}; for (const t of o.tournaments) tiers[t.tier] = (tiers[t.tier] || 0) + 1;
  const sponsorTiers = {}; for (const s of o.sponsors) sponsorTiers[s.tier] = (sponsorTiers[s.tier] || 0) + 1;
  const ranks = o.weekly.map((x) => x.rank).filter(Boolean);
  const totalIncome = sum(income); const totalExpense = sum(expense);
  return {
    profile: o.profile, seed: o.seed, days: o.days, resultHash: o.resultHash, seconds: Math.round(o.ms / 1000), saveMB: o.saveMB,
    sport: {
      ovrBaseStart: w0.ovrBase, ovrBaseEnd: w.ovrBase, ovrBaseGain: r1(w.ovrBase - w0.ovrBase), ovrEffectiveEnd: w.ovrEffective, equipApplied: w.equipApplied,
      rankEnd: w.rank, rankBest: ranks.length ? Math.min(...ranks) : null, careerLevel: w.careerLevel, fans: w.fans,
      matches: o.matches.length, wins, winRate: o.matches.length ? r1((100 * wins) / o.matches.length) : null,
      tournaments: o.tournaments.length, titles: o.tournaments.filter((t) => t.status === 'champion').length, tournamentsByTier: tiers,
      registrations: o.registrations.length, forfeits: o.forfeits,
      trainingSessions: o.trainings.sessions, trainingByIntensity: o.trainings.byIntensity, taperDays: o.trainings.taperDays || 0, trainingSkippedForCash: o.trainings.skippedForCash || 0,
      injuredWeeks: o.weekly.filter((x) => x.injured).length,
    },
    finance: {
      startCoins: o.startCoins, finalCoins: o.finalCoins, invested: w.invested || 0, netWorth: (o.finalCoins || 0) + (w.invested || 0),
      minCoins: Math.min(...coinsSeries), negativeWeeks: coinsSeries.filter((c) => c < 0).length,
      totalIncome, totalExpense, income, expense, transfer,
      purchases: o.purchases.length, equipmentSpend: expense.equipamento || 0, purchasesByRarity: byRarity,
      equipmentGainPerPurchase: o.purchases.length ? r1(o.purchases.reduce((s, p) => s + p.gain, 0) / o.purchases.length) : null,
      coinsPerEffectivePoint: o.purchases.reduce((s, p) => s + p.gain, 0) ? Math.round((expense.equipamento || 0) / o.purchases.reduce((s, p) => s + p.gain, 0)) : null,
      sponsorsSigned: o.sponsors.length, sponsorTiers, sponsorRenewals: o.sponsorRenewals.filter((r) => r.renew).length, sponsorMonthlyEnd: w.sponsorMonthly,
      coachHires: o.coaches.length, coachSalaryEnd: w.coachSalary, staffHires: o.staff.length, staffMonthlyEnd: w.staffMonthly,
      partnerChanges: o.partners.length, partnerRenewals: o.partnerRenewals.filter((r) => r.renew).length, partnerSalaryEnd: w.partnerSalary,
      investments: o.investments.length, investedAmount: o.investments.reduce((s, i) => s + i.amount, 0), dismissals: o.dismissals.length,
      trainingShareOfExpense: totalExpense ? r1((100 * (expense.treino || 0)) / totalExpense) : null,
      equipmentShareOfExpense: totalExpense ? r1((100 * (expense.equipamento || 0)) / totalExpense) : null,
    },
    integrity: {
      errors: o.errors.length, errorSamples: o.errors.slice(0, 5), violations: o.integrity.violations.length, violationSamples: o.integrity.violations.slice(0, 5), checks: o.integrity.checks,
      unattributed, saveLoadIdentical: o.saveLoad.identical, saveLoadMismatches: o.saveLoad.mismatches, advanceFailures: o.advanceFailures.length,
      legacyContracts: o.legacyContracts || null,
    },
  };
}

const runs = readdirSync(RAW).filter((f) => /-d\d+-s\d+\.json$/.test(f)).map((f) => metrics(JSON.parse(readFileSync(join(RAW, f), 'utf8'))));
const horizons = [...new Set(runs.map((r) => r.days))].sort((a, b) => a - b);
const stat = (vals) => { const v = vals.filter((x) => x != null && Number.isFinite(x)); return v.length ? { mean: r1(v.reduce((s, x) => s + x, 0) / v.length), min: r1(Math.min(...v)), max: r1(Math.max(...v)) } : null; };
const groups = [];
for (const days of horizons) for (const profile of PROFILES) {
  const g = runs.filter((r) => r.days === days && r.profile === profile);
  if (!g.length) continue;
  const pick = (f) => stat(g.map(f));
  groups.push({
    days, profile, seeds: g.map((r) => r.seed),
    ovrBaseEnd: pick((r) => r.sport.ovrBaseEnd), ovrBaseGain: pick((r) => r.sport.ovrBaseGain), ovrEffectiveEnd: pick((r) => r.sport.ovrEffectiveEnd), equipApplied: pick((r) => r.sport.equipApplied),
    rankEnd: pick((r) => r.sport.rankEnd), rankBest: pick((r) => r.sport.rankBest), matches: pick((r) => r.sport.matches), winRate: pick((r) => r.sport.winRate), titles: pick((r) => r.sport.titles), tournaments: pick((r) => r.sport.tournaments),
    trainingSessions: pick((r) => r.sport.trainingSessions), forfeits: pick((r) => r.sport.forfeits),
    finalCoins: pick((r) => r.finance.finalCoins), netWorth: pick((r) => r.finance.netWorth), minCoins: pick((r) => r.finance.minCoins), negativeWeeks: pick((r) => r.finance.negativeWeeks),
    totalIncome: pick((r) => r.finance.totalIncome), totalExpense: pick((r) => r.finance.totalExpense),
    equipmentSpend: pick((r) => r.finance.equipmentSpend), purchases: pick((r) => r.finance.purchases), coinsPerEffectivePoint: pick((r) => r.finance.coinsPerEffectivePoint),
    trainingShareOfExpense: pick((r) => r.finance.trainingShareOfExpense), equipmentShareOfExpense: pick((r) => r.finance.equipmentShareOfExpense),
    sponsorsSigned: pick((r) => r.finance.sponsorsSigned), sponsorMonthlyEnd: pick((r) => r.finance.sponsorMonthlyEnd), sponsorRenewals: pick((r) => r.finance.sponsorRenewals),
    coachHires: pick((r) => r.finance.coachHires), staffHires: pick((r) => r.finance.staffHires), investedAmount: pick((r) => r.finance.investedAmount),
    errors: g.reduce((s, r) => s + r.integrity.errors, 0), violations: g.reduce((s, r) => s + r.integrity.violations, 0), unattributed: g.reduce((s, r) => s + r.integrity.unattributed, 0),
    saveLoadAllIdentical: g.every((r) => r.integrity.saveLoadIdentical), advanceFailures: g.reduce((s, r) => s + r.integrity.advanceFailures, 0),
    income: Object.fromEntries(Object.entries(g.reduce((acc, r) => addInto(acc, r.finance.income), {})).map(([k, v]) => [k, Math.round(v / g.length)]).sort((a, b) => b[1] - a[1])),
    expense: Object.fromEntries(Object.entries(g.reduce((acc, r) => addInto(acc, r.finance.expense), {})).map(([k, v]) => [k, Math.round(v / g.length)]).sort((a, b) => b[1] - a[1])),
  });
}

writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({ generatedBy: 'scripts/analyze-local-9e1-decisions.mjs', runs: runs.length, horizons, groups, careers: runs }, null, 1)}\n`);

// ── Markdown ────────────────────────────────────────────────────────────────
const fmt = (s) => (s ? (s.min === s.max ? `${s.mean}` : `${s.mean} (${s.min}–${s.max})`) : '—');
const lines = ['# LOCAL-9E.1 — resumo das carreiras simuladas', '', `Gerado por \`scripts/analyze-local-9e1-decisions.mjs\` a partir de ${runs.length} carreiras. Valores: média (mín–máx) entre seeds.`, ''];
for (const days of horizons) {
  const gs = groups.filter((g) => g.days === days);
  lines.push(`## ${days} dias`, '', `| Métrica | ${gs.map((g) => `${g.profile} (seeds ${g.seeds.join(',')})`).join(' | ')} |`, `|---|${gs.map(() => '---:').join('|')}|`);
  const row = (label, key) => lines.push(`| ${label} | ${gs.map((g) => fmt(g[key])).join(' | ')} |`);
  row('OVR base final', 'ovrBaseEnd'); row('Ganho de OVR base', 'ovrBaseGain'); row('OVR efetivo final', 'ovrEffectiveEnd'); row('Pontos de equipamento aplicados', 'equipApplied');
  row('Ranking final', 'rankEnd'); row('Melhor ranking', 'rankBest'); row('Partidas', 'matches'); row('Vitórias (%)', 'winRate'); row('Torneios concluídos', 'tournaments'); row('Títulos', 'titles');
  row('Sessões de treino', 'trainingSessions'); row('W.O. (energia/lesão)', 'forfeits');
  row('Caixa final', 'finalCoins'); row('Patrimônio (caixa + investido)', 'netWorth'); row('Caixa mínimo semanal', 'minCoins'); row('Semanas com caixa negativo', 'negativeWeeks');
  row('Receita total', 'totalIncome'); row('Despesa total', 'totalExpense'); row('Gasto com equipamento', 'equipmentSpend'); row('Compras', 'purchases'); row('Moedas por ponto efetivo', 'coinsPerEffectivePoint');
  row('Treino (% da despesa)', 'trainingShareOfExpense'); row('Equipamento (% da despesa)', 'equipmentShareOfExpense');
  row('Patrocínios assinados', 'sponsorsSigned'); row('Renovações de patrocínio', 'sponsorRenewals'); row('Salário de patrocínio/mês (final)', 'sponsorMonthlyEnd');
  row('Treinadores contratados', 'coachHires'); row('Staff contratado', 'staffHires'); row('Investido', 'investedAmount');
  lines.push(`| Erros · violações · resíduo de caixa | ${gs.map((g) => `${g.errors} · ${g.violations} · ${g.unattributed}`).join(' | ')} |`);
  lines.push(`| Save/load idêntico | ${gs.map((g) => (g.saveLoadAllIdentical ? 'sim' : 'NÃO')).join(' | ')} |`, '');
  lines.push('Receitas e despesas médias por categoria:', '');
  for (const g of gs) lines.push(`- **${g.profile}** — receitas: ${Object.entries(g.income).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}; despesas: ${Object.entries(g.expense).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`);
  lines.push('');
}
writeFileSync(join(OUT, 'summary.md'), `${lines.join('\n').trimEnd()}\n`);
console.log(`LOCAL-9E.1: ${runs.length} carreiras · horizontes ${horizons.join(', ')} → ${OUT}`);
