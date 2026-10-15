// Playthrough 5.27-H — funções PURAS de métrica do Stage 1 (usadas pelo
// analisador analyze-rebalance-527h.mjs e pelos testes *-v527h). Só leitura.

export const PRESETS = ['conservative-e', 'balanced-e', 'hardcore-e'];
export const PROFILES = ['casual', 'normal', 'optimizer'];
export const CLASS = { Bronze: 'easy', Silver: 'easy', Gold: 'medium', Platinum: 'medium', Masters: 'hard', Elite: 'hard', Crown: 'hard', 'Circuit Finals': 'hard', 'Legacy Finals': 'hard' };
export const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
export const ROUNDS = ['R1', 'R2', 'QF', 'SF', 'F'];
export const CHECKPOINTS = [['start', 0], ['3m', 90], ['6m', 180], ['9m', 270], ['1y', 365], ['18m', 545], ['2y', 730]];
// Bloco K — gates oficiais (Balanced-E; competição no perfil Normal, item 59).
export const GATES = {
  competition: { easyMin: 45, mediumMin: 30, hardMax: 50, r1Min: 40 },
  preferred: { easy: [55, 75], medium: [40, 60], hard: [20, 40] },
  economy: { sponsorY1Max: 60, prizeY1Min: 10, casualDebtMax: 20, normalDebtMax: 10 },
};
// Referências (sinalizar, não reprovar): itens 32 e 35.
export const TARGETS = { normalRank1y: [500, 700], normalRank2y: [150, 300], titlesY1Median: [0, 1], titlesY2CumMedian: [1, 3] };
// "Materialmente" (item 21 e DECISÃO SOBRE COMMITMENT), fixado ANTES da matriz:
// WR em pontos percentuais, OVR de dupla vs campo, nº de seeds e dias de limbo.
export const MATERIAL = { wrPp: 10, teamOvrPts: 5, minSeeds: 3, limboDays: 30 };

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
export const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
export const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
/** Item 57: mean, median, P25, P75, min, max, std. */
export function dist(values) {
  const v = values.map(num).filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, median: null, p25: null, p75: null, min: null, max: null, std: null };
  const mean = sum(v) / v.length;
  const std = Math.sqrt(sum(v.map((x) => (x - mean) ** 2)) / v.length);
  return { n: v.length, mean: round1(mean), median: round1(quantile(v, 0.5)), p25: round1(quantile(v, 0.25)), p75: round1(quantile(v, 0.75)), min: v[0], max: v.at(-1), std: round1(std) };
}
export const pct = (part, total) => (total ? Math.round((1000 * part) / total) / 10 : null);
export const winPct = (ms) => (ms.length ? pct(ms.filter((m) => m.won).length, ms.length) : null);
export const wl = (ms) => ({ wr: winPct(ms), n: ms.length, w: ms.filter((m) => m.won).length });
export const inBand = (v, [lo, hi]) => v != null && v >= lo && v <= hi;

export function dayOfDate(start, date) { return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000); }
export function monthIndex(start, month) { const [sy, sm] = start.split('-').map(Number); const [y, m] = month.split('-').map(Number); return (y - sy) * 12 + (m - sm); }
export function at(weekly, day) { let best = null; for (const w of weekly) { if (w.day <= day) best = w; else break; } return best; }
/** R1 = 1ª rodada da chave principal; R2 = 2ª; QF/SF/F pelo nome (prevalecem sobre o índice). Qualifying fora. */
export function roundBucket(m) {
  if (m.stage === 'qualifying') return 'Q';
  if (m.round === 'Final') return 'F';
  if (m.round === 'Semifinal') return 'SF';
  if (m.round === 'Quartas de Final') return 'QF';
  const i = Number(m.stageRoundIndex);
  return i === 0 ? 'R1' : i === 1 ? 'R2' : 'R3+';
}

// ── Bloco D — estado da parceria (A/B/C) ───────────────────────────────────
/**
 * Recusa de renovação = decisão "não renovar" de um contrato que não foi
 * renovado depois (o harness reavalia toda semana enquanto o contrato está na
 * janela). Troca efetiva = 1ª entrada de `partners` a partir da recusa.
 */
export function partnershipTimeline(r) {
  const byContract = new Map();
  for (const d of r.renewalDecisions || []) {
    const k = d.partnershipId || `day${d.day}`;
    if (!byContract.has(k)) byContract.set(k, []);
    byContract.get(k).push(d);
  }
  const changes = (r.partners || []).filter((p) => p.day > 0).map((p) => p.day).sort((a, b) => a - b);
  const refusals = [];
  for (const [k, ds] of byContract) {
    if (ds.at(-1).renew) continue;
    const firstRefusal = ds.find((d) => !d.renew && !ds.some((x) => x.day > d.day && x.renew));
    const change = changes.find((c) => c >= firstRefusal.day) ?? null;
    refusals.push({ partnershipId: k, refusalDay: firstRefusal.day, reason: firstRefusal.reason, partnerOvr: firstRefusal.partnerOvr, playerOvr: firstRefusal.playerOvr, changeDay: change, limboDays: change == null ? null : change - firstRefusal.day, censoredAt: change == null ? r.days : null });
  }
  return refusals.sort((a, b) => a.refusalDay - b.refusalDay);
}
/** Estado de uma partida do 1º ano: A antes da 1ª recusa; B entre recusa e troca; C depois da troca. */
export function stateOf(day, firstRefusal) {
  if (!firstRefusal || day < firstRefusal.refusalDay) return 'A';
  if (firstRefusal.changeDay == null || day < firstRefusal.changeDay) return 'B';
  return 'C';
}

/** Item 38: eventos de dívida = trechos contíguos de semanas com caixa < 0. */
export function debtEvents({ weekly = [], months = [], start, dismissals = [] }) {
  const events = [];
  let cur = null;
  for (const w of weekly) {
    if ((w.coins || 0) < 0) {
      if (!cur) cur = { startDay: w.day, endDay: w.day, peakDebt: 0 };
      cur.endDay = w.day; cur.peakDebt = Math.max(cur.peakDebt, -(w.coins || 0));
    } else if (cur) { events.push(cur); cur = null; }
  }
  if (cur) { cur.open = true; events.push(cur); }
  for (const e of events) {
    // Motivo: rescisão na mesma semana, senão a maior despesa do mês em que a dívida começou.
    const month = start ? months.find((m) => dayOfDate(start, `${m.month}-01`) <= e.startDay && dayOfDate(start, `${m.month}-01`) + 31 > e.startDay) : null;
    const top = month ? Object.entries(month.L?.expense || {}).sort((a, b) => b[1] - a[1])[0] : null;
    const dismissal = dismissals.find((d) => Math.abs(d.day - e.startDay) <= 7);
    e.durationDays = e.endDay - e.startDay + 7;
    e.reason = dismissal ? `rescisão (${dismissal.type || 'staff'})` : top ? `despesa ${top[0]}` : 'desconhecido';
  }
  return events;
}

/** Bloco L: hard gates de um preset a partir do resumo Normal/Casual. */
export function presetGates({ normal: n, casual: cs }, { silverVsGoldPp = null } = {}) {
  const G = GATES;
  // 5.27-I (pré-registrado antes da matriz): falha estrutural se Silver main + pp < Gold main (Normal).
  const silverGate = silverVsGoldPp == null ? [] : [['Silver × Gold (main, Normal)', n.tiers?.Silver?.main?.wr, n.tiers?.Silver?.main?.wr == null || n.tiers?.Gold?.main?.wr == null || n.tiers.Silver.main.wr + silverVsGoldPp >= n.tiers.Gold.main.wr, `Silver + ${silverVsGoldPp} ≥ Gold (${n.tiers?.Gold?.main?.wr})`]];
  const checks = [
    ['Easy (Normal, 2a)', n.competition.easy.wr, n.competition.easy.wr != null && n.competition.easy.wr >= G.competition.easyMin, `>= ${G.competition.easyMin}%`],
    ['Medium (Normal, 2a)', n.competition.medium.wr, n.competition.medium.wr != null && n.competition.medium.wr >= G.competition.mediumMin, `>= ${G.competition.mediumMin}%`],
    ['Hard (Normal, 2a)', n.competition.hard.wr, n.competition.hard.wr == null || n.competition.hard.wr <= G.competition.hardMax, `<= ${G.competition.hardMax}%`],
    ['R1 (Normal, 2a)', n.competition.r1.wr, n.competition.r1.wr != null && n.competition.r1.wr >= G.competition.r1Min, `>= ${G.competition.r1Min}%`],
    ['Sponsor Y1 (mediana Normal)', n.sponsorY1.median, n.sponsorY1.median != null && n.sponsorY1.median <= G.economy.sponsorY1Max, `<= ${G.economy.sponsorY1Max}%`],
    ['Prize Y1 (mediana Normal)', n.prizeY1.median, n.prizeY1.median != null && n.prizeY1.median >= G.economy.prizeY1Min, `>= ${G.economy.prizeY1Min}%`],
    ['Dívida Casual', cs.debtPct, cs.debtPct != null && cs.debtPct <= G.economy.casualDebtMax, `<= ${G.economy.casualDebtMax}%`],
    ['Dívida Normal', n.debtPct, n.debtPct != null && n.debtPct <= G.economy.normalDebtMax, `<= ${G.economy.normalDebtMax}%`],
    ...silverGate,
  ].map(([gate, value, pass, rule]) => ({ gate, value, pass, rule }));
  const preferred = { easy: inBand(n.competition.easy.wr, G.preferred.easy), medium: inBand(n.competition.medium.wr, G.preferred.medium), hard: n.competition.hard.wr == null ? null : inBand(n.competition.hard.wr, G.preferred.hard) };
  // Distância às faixas preferidas + pressão econômica (menor = mais equilibrado).
  const off = (v, [lo, hi]) => (v == null ? 0 : v < lo ? lo - v : v > hi ? v - hi : 0);
  const balanceScore = off(n.competition.easy.wr, G.preferred.easy) + off(n.competition.medium.wr, G.preferred.medium) + (n.competition.hard.wr == null ? 0 : off(n.competition.hard.wr, G.preferred.hard))
    + Math.max(0, (n.sponsorY1.median ?? 0) - 50) / 2 + Math.max(0, 15 - (n.prizeY1.median ?? 0)) / 2;
  return { checks, allHardPass: checks.every((x) => x.pass), preferred, balanceScore: round1(balanceScore) };
}
/** Bloco L: REJECT (falhou hard gate) · VIABLE · PREFERRED (VIABLE mais equilibrado; empate → Balanced-E). */
export function classifyPresets(gatesByPreset) {
  const viable = Object.keys(gatesByPreset).filter((p) => gatesByPreset[p].allHardPass);
  const preferred = viable.length ? [...viable].sort((a, b) => (gatesByPreset[a].balanceScore - gatesByPreset[b].balanceScore) || (a === 'balanced-e' ? -1 : b === 'balanced-e' ? 1 : 0))[0] : null;
  return { viable, preferred, classification: Object.fromEntries(Object.keys(gatesByPreset).map((p) => [p, !gatesByPreset[p].allHardPass ? 'REJECT' : p === preferred ? 'PREFERRED' : 'VIABLE'])) };
}
/** Decisão sobre commitment: só recomenda fase nova se as 4 condições forem verdade ao mesmo tempo. */
export function commitmentDecision(conditions) {
  const proven = ['renewalRefused', 'delaysMaterially', 'wrDuringLimboMateriallyWorse', 'repeatsAcrossSeeds'].every((k) => conditions[k] === true);
  return { proven, recommendation: proven ? 'candidato a fase de commitment lifecycle' : 'do not touch commitment lifecycle' };
}
