// Playthrough 5.27-I, Bloco A — antes/depois do OTIMIZADOR nos marcos 3m–24m:
// OVR jogador/parceiro/melhor alcançável, decisão de renovação, troca na Busca,
// caixa, salário sustentável (meses de caixa) e compromissos pendentes.
//   node scripts/analyze-optimizer-v527i.mjs --in=<runs dir|micro dir> --out=reports/rebalance-527i/optimizer-baseline.csv [--envelopes]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { at, dayOfDate } from './lib/v527hMetrics.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const IN = arg('in'); const OUT = arg('out');
const MARKS = [['3m', 90], ['6m', 180], ['9m', 270], ['12m', 365], ['18m', 545], ['24m', 730]];
// Marcos da sonda de qualidade (dias fixos 0/90/180/270/365/545/730).
const PQ_DAY = { '3m': 90, '6m': 180, '9m': 270, '12m': 365, '18m': 545, '24m': 730 };

const files = readdirSync(IN).filter((f) => /optimizer.*\.json$/.test(f) && !f.includes('.dup-'));
const careers = files.map((f) => { const j = JSON.parse(readFileSync(join(IN, f), 'utf8')); return { file: f, r: j.result || j, preset: j.preset || 'balanced-e' }; });

export function optimizerRows({ file, r, preset }) {
  const tourDays = new Map();
  for (const m of r.matches) { const d = dayOfDate(r.startDate, m.date); const prev = tourDays.get(m.tournamentId); tourDays.set(m.tournamentId, { first: Math.min(prev?.first ?? d, d), last: Math.max(prev?.last ?? d, d) }); }
  return MARKS.map(([k, day]) => {
    const q = (r.partnerQuality || []).find((x) => x.mark === PQ_DAY[k]);
    const w = at(r.weekly, day);
    const lastDecision = (r.renewalDecisions || []).filter((d) => d.day <= day).at(-1) || null;
    const lastChange = (r.partners || []).filter((p) => p.day <= day && p.day > 0).at(-1) || null;
    // Compromisso pendente: inscrito antes do marco e com partida no/depois do marco.
    const commitments = (r.registrations || []).filter((g) => g.day <= day && (tourDays.get(g.tournamentId)?.last ?? -1) >= day).length;
    const salary = q?.salary || null;
    return {
      file, preset, seed: r.seed, mark: k, day, playerOvr: q?.playerOvr ?? w?.ovr ?? null, partnerOvr: q?.partnerOvr ?? w?.partnerOvr ?? null, bestAttainableOvr: q?.bestAttainableOvr ?? null,
      gap: q?.bestAttainableOvr != null && q?.partnerOvr != null ? q.bestAttainableOvr - q.partnerOvr : null,
      lastRenewalDecision: lastDecision ? `${lastDecision.day}:${lastDecision.renew ? 'renew' : `refuse(${lastDecision.reason})`}` : null,
      lastSearchChange: lastChange ? `${lastChange.day}:${lastChange.partnerOvr}` : null,
      cash: w?.coins ?? null, salary, salaryMonthsCovered: salary ? Math.round(((w?.coins ?? 0) / salary) * 10) / 10 : null, commitments,
    };
  });
}

const rows = careers.flatMap(optimizerRows);
const cols = ['file', 'preset', 'seed', 'mark', 'day', 'playerOvr', 'partnerOvr', 'bestAttainableOvr', 'gap', 'lastRenewalDecision', 'lastSearchChange', 'cash', 'salary', 'salaryMonthsCovered', 'commitments'];
if (OUT) writeFileSync(OUT, `${[cols.join(','), ...rows.map((r) => cols.map((c) => r[c] ?? '').join(','))].join('\n')}\n`);
// Item 42: gap > 30 por > 180 dias (pelos marcos de 90 dias da sonda) sem causa de custo/compromisso.
for (const c of careers) {
  const q = (c.r.partnerQuality || []).filter((x) => x.mark > 0);
  let run = 0; let worst = 0;
  for (const x of q) { run = (x.bestAttainableOvr ?? 0) - (x.partnerOvr ?? 0) > 30 ? run + (x.mark <= 365 ? 90 : 180) : 0; worst = Math.max(worst, run); }
  console.log(`${c.file} seed ${c.r.seed}: parceiro @6m ${q.find((x) => x.mark === 180)?.partnerOvr} @12m ${q.find((x) => x.mark === 365)?.partnerOvr} @18m ${q.find((x) => x.mark === 545)?.partnerOvr ?? '-'} @24m ${q.find((x) => x.mark === 730)?.partnerOvr ?? '-'} · maior trecho gap>30 ≈ ${worst} dias · trocas ${(c.r.partners || []).filter((p) => p.day > 0).map((p) => `${p.day}:${p.partnerOvr}`).join(' ')}`);
}
if (!existsSync(IN)) process.exitCode = 1;
