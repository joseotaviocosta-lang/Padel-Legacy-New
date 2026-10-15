// Playthrough 5.27-G, Blocos A/B — auditoria da escolha de parceiro.
// Lê os mercados gravados pelo harness (PL527G_PARTNER_DUMP: vitrine inicial e
// Busca), reproduz a escolha atual e avalia fórmulas candidatas para o Normal.
//   node scripts/analyze-partner-markets-v527g.mjs --dump=<dir> [--out=reports/rebalance-527g]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const DUMP = resolve(arg('dump', 'reports/rebalance-527g/partner-dump'));
const OUT = resolve(arg('out', 'reports/rebalance-527g'));
const TAG = arg('tag', 'baseline');

// OVR pela autoridade da UI/motor (attributes.js:baseOverallRating = média de
// atributos, gravada como attrOvr); o `overall_rating` declarado do catálogo
// fictício chega a +17 acima da força real e NÃO é o que a tela mostra.
export const markets = readdirSync(DUMP).flatMap((f) => readFileSync(join(DUMP, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .map((m) => ({ ...m, candidates: m.candidates.map((c) => ({ ...c, declaredOvr: c.ovr, ovr: c.attrOvr || c.ovr })) }));
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * Componentes 0–100 (mesmos usados pela política do harness, scripts/lib/v527gPartnerScore.mjs):
 *  compatibility: o número que a tela mostra;
 *  strength: OVR do candidato (escala absoluta — "força importa", não "relativa ao melhor");
 *  rankingFit: pontos de ranking relativos ao melhor do mercado;
 *  affordability: meses de salário que o caixa cobre (6 meses = 100) menos a
 *    perda de divisão de prêmio acima de 50%.
 */
export function components(c, market) {
  const maxPts = Math.max(1, ...market.candidates.map((x) => x.worldPoints || 0));
  const monthsCovered = c.salary ? (market.coins || 0) / c.salary : 12;
  return {
    compatibility: clamp(c.compatibility),
    strength: clamp(c.ovr),
    // Força relativa ao próprio nível: só penaliza parceiro ABAIXO do jogador
    // (o Normal quer alguém do seu nível, não o melhor do mercado).
    levelFitK4: clamp(100 - 4 * Math.max(0, (market.playerOvr || 0) - c.ovr)),
    levelFitK3: clamp(100 - 3 * Math.max(0, (market.playerOvr || 0) - c.ovr)),
    rankingFit: clamp((100 * (c.worldPoints || 0)) / maxPts),
    affordability: clamp((100 * monthsCovered) / 6 - Math.max(0, (c.prizeSplit ?? 50) - 50) * 2),
  };
}
export const FORMULAS = {
  CURRENT_COMPAT: { compatibility: 1, strength: 0, rankingFit: 0, affordability: 0 },
  NORMAL_A: { compatibility: 0.5, strength: 0.3, rankingFit: 0.1, affordability: 0.1 },
  NORMAL_B: { compatibility: 0.4, strength: 0.4, rankingFit: 0.1, affordability: 0.1 },
  NORMAL_C: { compatibility: 0.35, strength: 0.45, rankingFit: 0.1, affordability: 0.1 },
  NORMAL_D: { compatibility: 0.5, levelFitK4: 0.4, affordability: 0.1 },
  NORMAL_E: { compatibility: 0.45, levelFitK3: 0.45, affordability: 0.1 },
  OPTIMIZER_STRONGEST: null, // seletor atual do otimizador (pontos, senão OVR)
};
const score = (w, comp) => Object.entries(w).reduce((s, [k, v]) => s + v * comp[k], 0);
function pick(name, market) {
  const cands = market.candidates;
  if (name === 'OPTIMIZER_STRONGEST') return [...cands].sort((a, b) => ((b.worldPoints || 0) || b.attrOvr || 0) - ((a.worldPoints || 0) || a.attrOvr || 0))[0];
  const w = FORMULAS[name];
  return [...cands].map((c) => ({ c, s: score(w, components(c, market)) })).sort((a, b) => b.s - a.s)[0].c;
}
const med = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

const searches = markets.filter((m) => String(m.kind).startsWith('search'));
const all = markets;
const rows = [['market', 'kind', 'date', 'playerOvr', 'coins', 'candidateId', 'name', 'ovr', 'worldPoints', 'compatibility', 'salary', 'prizeSplit', 'side', 'age', 'chosenNow', 'scoreCompatibility', 'scoreStrength', 'scoreRanking', 'scoreCost', 'scoreA', 'scoreB', 'scoreC']];
all.forEach((m, i) => {
  for (const c of [...m.candidates].sort((a, b) => b.ovr - a.ovr)) {
    const comp = components(c, m);
    rows.push([i, m.kind, m.date, m.playerOvr, m.coins, c.id, `"${String(c.name || '').replace(/"/g, '')}"`, c.ovr, c.worldPoints, c.compatibility, c.salary, c.prizeSplit, c.side, c.age, c.chosen, comp.compatibility.toFixed(1), comp.strength.toFixed(1), comp.rankingFit.toFixed(1), comp.affordability.toFixed(1), score(FORMULAS.NORMAL_A, comp).toFixed(1), score(FORMULAS.NORMAL_B, comp).toFixed(1), score(FORMULAS.NORMAL_C, comp).toFixed(1)]);
  }
});
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `partner-score-${TAG}.csv`), `${rows.map((r) => r.join(',')).join('\n')}\n`);

// Desempenho de cada fórmula sobre os mercados de Busca (e vitrine, à parte).
function evaluate(set) {
  const out = {};
  for (const name of Object.keys(FORMULAS)) {
    const res = set.map((m) => {
      const best = Math.max(...m.candidates.map((c) => c.ovr));
      const bestCompat = Math.max(...m.candidates.map((c) => c.compatibility));
      const p = pick(name, m);
      const opt = pick('OPTIMIZER_STRONGEST', m);
      return { chosenOvr: p.ovr, best, ratio: p.ovr / best, gap: best - p.ovr, compat: p.compatibility, compatLoss: bestCompat - p.compatibility, salaryShareOfCash: m.coins ? p.salary / m.coins : null, sameAsOptimizer: p.id === opt.id };
    });
    out[name] = {
      markets: res.length, chosenOvrMedian: med(res.map((r) => r.chosenOvr)), bestOvrMedian: med(res.map((r) => r.best)),
      ovrRatioMedian: med(res.map((r) => +r.ratio.toFixed(3))), ovrGapMedian: med(res.map((r) => r.gap)),
      compatMedian: med(res.map((r) => r.compat)), compatLossMedian: med(res.map((r) => r.compatLoss)),
      salaryShareOfCashMedian: med(res.map((r) => (r.salaryShareOfCash == null ? null : +r.salaryShareOfCash.toFixed(3)))),
      sameAsOptimizerPct: Math.round((100 * res.filter((r) => r.sameAsOptimizer).length) / Math.max(1, res.length)),
    };
  }
  return out;
}
const summary = { tag: TAG, markets: all.length, searchMarkets: searches.length, initialMarkets: all.length - searches.length, search: evaluate(searches), initial: evaluate(all.filter((m) => !String(m.kind).startsWith('search'))) };
writeFileSync(join(OUT, `partner-selection-${TAG}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`mercados: ${all.length} (busca ${searches.length})`);
for (const [k, v] of Object.entries(summary.search)) console.log(`busca ${k.padEnd(20)} OVR escolhido ${v.chosenOvrMedian} / melhor ${v.bestOvrMedian} (razão ${v.ovrRatioMedian}) · compat ${v.compatMedian} (perda ${v.compatLossMedian}) · salário/caixa ${v.salaryShareOfCashMedian} · = otimizador ${v.sameAsOptimizerPct}%`);
