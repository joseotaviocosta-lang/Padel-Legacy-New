// Playthrough 5.27-J — evidência do fix de saída da parceria a partir das
// carreiras reais: limbo antes (5.27-H/5.27-I) × depois (smoke, save/reload,
// seed 3 histórica), smoke competitivo/econômico e save/reload.
//   node scripts/analyze-lifecycle-v527j.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, outcomeHash } from './lib/v527dJobs.mjs';
import { dist, pct, winPct, CLASS, at } from './lib/v527hMetrics.mjs';
import { illegitimateRegistrations, limboDecomposition } from './lib/v527jTestKit.mjs';

const OUT = 'reports/rebalance-527j';
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const write = (n, d) => writeFileSync(join(OUT, n), typeof d === 'string' ? d : `${JSON.stringify(d, null, 2)}\n`);
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
const smoke = readdirSync(join(OUT, 'smoke/baseline/normal-730d')).filter((f) => f.endsWith('.json')).map((f) => readJson(join(OUT, 'smoke/baseline/normal-730d', f))).sort((a, b) => a.seed - b.seed);
const before527i = [1, 2, 3, 4, 5].map((s) => readJson(`reports/rebalance-527i/runs/balanced-e-normal-seed00${s}-2y.json`).result);
const reloaded = readJson(join(OUT, 'reload-weekly/normal-003.json'));
const hist = existsSync(join(OUT, 'seed3-527h-config/normal-003.json')) ? readJson(join(OUT, 'seed3-527h-config/normal-003.json')) : null;
const hist527h = readJson('reports/rebalance-527h/runs/balanced-e-normal-seed003-2y.json').result;

// ── Limbo "antes" (runs sem estado de parceria por inscrição): recusa do harness/parceiro → troca.
function limboBeforeFromRenewals(r) {
  const lastByT = {};
  for (const m of r.matches) lastByT[m.tournamentId] = Math.max(lastByT[m.tournamentId] ?? -1, dayOf(r, m.date));
  const contracts = new Map();
  for (const d of r.renewalDecisions || []) { if (!contracts.has(d.partnershipId)) contracts.set(d.partnershipId, []); contracts.get(d.partnershipId).push(d); }
  const out = [];
  for (const [id, ds] of contracts) {
    if (ds.at(-1).renew) continue;
    const dec = ds.find((d) => !d.renew && !ds.some((x) => x.day > d.day && x.renew)).day;
    const change = (r.partners || []).find((p) => p.day > dec)?.day ?? null;
    const pre = r.registrations.filter((g) => g.day < dec);
    const newAfter = r.registrations.filter((g) => g.day >= dec && (change == null || g.day < change));
    const lastLegit = Math.max(dec, ...pre.map((g) => lastByT[g.tournamentId] ?? -1));
    out.push({ partnershipId: id, decisionDay: dec, newPartnerDay: change, newCommitmentsAfterDecision: newAfter.length, lastLegitimateDay: lastLegit, limboDays: change == null ? null : change - dec, legitimateDays: lastLegit - dec, illegitimateDays: change == null ? null : Math.max(0, change - lastLegit) });
  }
  return out;
}

// ── commitment-lifecycle.csv (+ resumo)
const rows = [['phase', 'seed', 'partnershipId', 'decisionDay', 'preexisting', 'newAfterExit', 'illegitimateAfterExit', 'lastLegitimateDay', 'scheduledSeparationDay', 'scheduleHistory', 'newPartnerDay', 'limboDays', 'legitimateDays', 'extensionDays']];
const after = [];
for (const r of smoke) for (const d of limboDecomposition(r)) { after.push(d); rows.push(['after', r.seed, d.partnershipId, d.decisionDay, d.preexisting, d.newAfterExit, d.illegitimateAfterExit, d.lastLegitimateDay, d.scheduledSeparationDay, (d.scheduleHistory || []).join(' > '), d.newPartnerDay, d.limboDays, d.legitimateDays, d.extensionDays]); }
const before = [];
for (const r of before527i) for (const d of limboBeforeFromRenewals(r)) { before.push(d); rows.push(['before-527i', r.seed, d.partnershipId, d.decisionDay, '', d.newCommitmentsAfterDecision, '', d.lastLegitimateDay, '', '', d.newPartnerDay, d.limboDays, d.legitimateDays, d.illegitimateDays]); }
write('commitment-lifecycle.csv', `${rows.map((r) => r.join(',')).join('\n')}\n`);
const summary = {
  before: { source: 'reports/rebalance-527i/runs balanced-e normal (recusa do harness → troca)', exits: before.length, newCommitmentsAfterDecision: before.reduce((s, d) => s + d.newCommitmentsAfterDecision, 0), limboDays: dist(before.map((d) => d.limboDays)), illegitimateDays: dist(before.map((d) => d.illegitimateDays)) },
  after: { source: 'smoke 5 seeds (estado do jogo por inscrição)', exits: after.length, illegitimateRegistrations: smoke.reduce((s, r) => s + illegitimateRegistrations(r).length, 0), limboDays: dist(after.map((d) => d.limboDays)), legitimateDays: dist(after.map((d) => d.legitimateDays)), maxExtensionDays: Math.max(0, ...after.map((d) => d.extensionDays ?? 0)), schedulePushes: after.filter((d) => (d.scheduleHistory || []).length > 1).length },
};
write('commitment-lifecycle-summary.json', summary);

// ── Seed 3 histórica (config da 5.27-H: Silver 25%, política v3) antes × depois.
// Antes: a decisão de saída do jogo é a RECUSA DO PARCEIRO (renewPartnerContract →
// nao_renovara, dia 49); a recusa do harness (dia 63) veio depois.
const histBefore = (() => {
  const b = limboBeforeFromRenewals(hist527h)[0];
  const refusedDay = hist527h.renewals.find((x) => x.outcome === 'refused')?.day ?? b.decisionDay;
  const lastByT = {};
  for (const m of hist527h.matches) lastByT[m.tournamentId] = Math.max(lastByT[m.tournamentId] ?? -1, dayOf(hist527h, m.date));
  const pre = hist527h.registrations.filter((g) => g.day < refusedDay);
  const lastLegit = Math.max(refusedDay, ...pre.map((g) => lastByT[g.tournamentId] ?? -1));
  const newAfter = hist527h.registrations.filter((g) => g.day >= refusedDay && g.day < b.newPartnerDay).length;
  return { ...b, decisionDay: refusedDay, harnessRefusalDay: b.decisionDay, newCommitmentsAfterDecision: newAfter, lastLegitimateDay: lastLegit, limboDays: b.newPartnerDay - refusedDay, legitimateDays: lastLegit - refusedDay, illegitimateDays: b.newPartnerDay - lastLegit };
})();
let histAfter = null;
if (hist) {
  const d = limboDecomposition(hist)[0] || null;
  const viaRenewals = limboBeforeFromRenewals(hist)[0] || null;
  histAfter = d ? { decisionDay: d.decisionDay, gameExitStatus: d.status, newCommitmentsAfterDecision: illegitimateRegistrations(hist).length, registrationsAfterHarnessRefusal: viaRenewals?.newCommitmentsAfterDecision ?? null, lastLegitimateDay: d.lastLegitimateDay, scheduledSeparationDay: d.scheduledSeparationDay, actualChangeDay: d.newPartnerDay, limboDays: d.limboDays, legitimateDays: d.legitimateDays, extensionDays: d.extensionDays, illegitimateDays: Math.max(0, d.extensionDays ?? 0), harnessRefusalDay: viaRenewals?.decisionDay ?? null } : null;
}
write('seed3-before-after.json', {
  config: 'balanced-e · Normal · seed 3 · política v3 · silverFieldOffsetPct 0.25 (= 5.27-H)',
  before: { source: 'reports/rebalance-527h/runs/balanced-e-normal-seed003-2y.json', ...histBefore, actualChangeDay: histBefore.newPartnerDay, decision: hist527h.renewals[0] },
  after: histAfter, note: 'Antes: o "dia da decisão" é a recusa do parceiro (renewPartnerContract → nao_renovara). Depois: idem, lido do estado do jogo gravado por inscrição.',
});

// ── Save/reload
const cont = smoke.find((r) => r.seed === 3);
const keys = ['registrations', 'exitEvents', 'partners', 'matches', 'renewalDecisions', 'tournaments'];
write('save-reload-results.json', {
  career: 'balanced-e · Normal · seed 3 · 730 dias', reloadEvery: 7, segments: Number(readFileSync(join(OUT, 'reload-weekly/segments.txt'), 'utf8')), checkpoints: reloaded.checkpoints,
  equalByField: Object.fromEntries(keys.map((k) => [k, canonical(reloaded[k]) === canonical(cont[k])])),
  outcomeHash: { continuous: outcomeHash(cont), reloaded: outcomeHash(reloaded) }, continuousEqualsReloaded: outcomeHash(cont) === outcomeHash(reloaded),
  exitStatePreserved: canonical(reloaded.exitEvents) === canonical(cont.exitEvents), commitmentSetPreserved: canonical(reloaded.registrations) === canonical(cont.registrations),
  separationDatePreserved: canonical((reloaded.exitEvents || []).map((e) => e.separationScheduled)) === canonical((cont.exitEvents || []).map((e) => e.separationScheduled)),
  reloadReopenedRegistration: illegitimateRegistrations(reloaded).length > 0, limbo: limboDecomposition(reloaded),
  // Reload DIÁRIO sobre janelas com limbo (seed 3: dias 49–66; seed 4: dias 77–95, com torneio de 4 partidas).
  daily: [['seed3', 'reload-daily', 'cont-110', 'normal-003.json'], ['seed4', 'reload-daily-s4', 'cont-100-s4', 'normal-004.json']].map(([label, d, c, f]) => {
    if (!existsSync(join(OUT, d, f)) || !existsSync(join(OUT, c, f))) return { label, missing: true };
    const a = readJson(join(OUT, d, f)); const b = readJson(join(OUT, c, f));
    return { label, days: a.days, reloads: Number(readFileSync(join(OUT, d, 'segments.txt'), 'utf8')), equal: outcomeHash(a) === outcomeHash(b), limbo: limboDecomposition(a), illegitimate: illegitimateRegistrations(a).length };
  }),
});

// ── Smoke competitivo/econômico (mesmas 5 seeds × Normal × 2a) × 5.27-I
function comp(list) {
  const M = list.flatMap((r) => r.matches);
  const main = (t) => M.filter((m) => m.tier === t && m.stage !== 'qualifying');
  const pq = (r, mark) => (r.partnerQuality || []).find((q) => q.mark === mark)?.partnerOvr ?? null;
  return {
    careers: list.length, easy: winPct(M.filter((m) => CLASS[m.tier] === 'easy')), medium: winPct(M.filter((m) => CLASS[m.tier] === 'medium')), hard: winPct(M.filter((m) => CLASS[m.tier] === 'hard')),
    r1: winPct(M.filter((m) => m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0)), bronze: winPct(main('Bronze')), silver: winPct(main('Silver')), gold: winPct(main('Gold')), platinum: winPct(main('Platinum')),
    partnerOvr1y: dist(list.map((r) => pq(r, 365))).median, partnerOvr2y: dist(list.map((r) => pq(r, 730))).median,
    rank1y: dist(list.map((r) => at(r.weekly, 365)?.rank)).median, rank2y: dist(list.map((r) => at(r.weekly, 730)?.rank)).median,
    titlesY1: dist(list.map((r) => r.tournaments.filter((t) => t.day < 365 && t.status === 'champion').length)).median, titlesY2Cum: dist(list.map((r) => r.tournaments.filter((t) => t.status === 'champion').length)).median,
  };
}
const cb = comp(before527i); const ca = comp(smoke);
const delta = Object.fromEntries(Object.keys(ca).filter((k) => typeof ca[k] === 'number' && typeof cb[k] === 'number').map((k) => [k, Math.round((ca[k] - cb[k]) * 10) / 10]));
write('competitive-smoke.json', { config: 'balanced-e · Normal · seeds 1–5 · 730 dias · v4 · Silver 15%', before: { source: '5.27-I Stage 1', ...cb }, after: ca, delta, hardRegressionSignal: ['easy', 'medium', 'r1'].filter((k) => Math.abs(delta[k] ?? 0) > 10) });
function econ(list) {
  const share = (r, keys) => { const ms = Object.entries(r.ledger || {}).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12); let p = 0; let t = 0; for (const [, L] of ms) { p += keys.reduce((s, k) => s + (L.income?.[k] || 0), 0); t += Object.values(L.income || {}).reduce((s, v) => s + v, 0); } return t ? pct(p, t) : null; };
  const severance = (r) => (r.dismissals || []).reduce((s, d) => s + Math.round((d.monthly || 0) * 0.5), 0);
  return { careers: list.length, sponsorY1Median: dist(list.map((r) => share(r, ['sponsor_monthly', 'sponsor_signing']))).median, prizeY1Median: dist(list.map((r) => share(r, ['prize']))).median, debtPct: pct(list.filter((r) => r.weekly.some((w) => w.coins < 0)).length, list.length), severanceCost: list.reduce((s, r) => s + severance(r), 0), finalCoinsMedian: dist(list.map((r) => r.finalCoins)).median };
}
write('economy-smoke.json', { before: econ(before527i), after: econ(smoke) });
write('ai-partnership-results.json', { finding: 'IA não tinha o bug', why: ['dissolução imediata (status encerrada_parceiro no mesmo passo mensal; sem estado de saída pendente)', 'admissão do mundo usa só parcerias ativas (buildCanonicalPairs: status === "ativa")', 'IA não escreve TournamentRegistration; identidade já sorteada fica em draw_pair_ids/snapshot (5.26-D)'], test: 'scripts/test-ai-partnership-exit-registration-v527j.mjs', changed: false });

console.log('limbo antes', JSON.stringify(summary.before.limboDays), 'ilegítimo', JSON.stringify(summary.before.illegitimateDays));
console.log('limbo depois', JSON.stringify(summary.after.limboDays), 'inscrições ilegítimas', summary.after.illegitimateRegistrations, 'extensão máx', summary.after.maxExtensionDays);
console.log('seed3', JSON.stringify({ before: histBefore, after: histAfter }));
console.log('smoke', JSON.stringify({ before: cb, after: ca, delta }));
