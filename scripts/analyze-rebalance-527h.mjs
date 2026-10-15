// Playthrough 5.27-H — ANALISADOR do Stage 1 completo (45 carreiras).
// Só lê reports/rebalance-527h/runs/*.json (envelopes 5.27-D com hash) e o
// manifest; nada aqui muda o jogo. Gera os CSV/JSON do Bloco T, os gates do
// Bloco K, a classificação de presets (Bloco L) e a decisão de commitment.
//   node scripts/analyze-rebalance-527h.mjs [--root=reports/rebalance-527h] [--allow-partial]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as J from './lib/v527dJobs.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ROOT = resolve(arg('root', 'reports/rebalance-527h'));
const OUT = ROOT;
const P = J.paths(ROOT);
mkdirSync(OUT, { recursive: true });

import {
  PRESETS, PROFILES, TIERS, ROUNDS, CHECKPOINTS, GATES, TARGETS, MATERIAL, CLASS,
  dist, pct, wl, sum, round1, at, roundBucket, partnershipTimeline, stateOf, debtEvents as debtEventsOf,
  dayOfDate, monthIndex, presetGates as presetGatesOf, classifyPresets, commitmentDecision,
} from './lib/v527hMetrics.mjs';

const csv = (rows) => `${rows.map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n')}\n`;
const write = (name, data) => writeFileSync(join(OUT, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
const DIST_COLS = ['n', 'mean', 'median', 'p25', 'p75', 'min', 'max', 'std'];

// ── Carga ──────────────────────────────────────────────────────────────────
const manifest = J.loadManifest(ROOT);
const frozen = existsSync(join(ROOT, 'frozen-config.json')) ? JSON.parse(readFileSync(join(ROOT, 'frozen-config.json'), 'utf8')) : null;
const integrity = { invalidHash: [], wrongCode: [], wrongSemantic: [], wrongPolicy: [], notDoneInManifest: [], doneWithoutFile: [], determinismFailures: manifest?.determinismFailures?.length ?? null };
const careers = [];
const runFiles = existsSync(P.runs) ? readdirSync(P.runs).filter((f) => /^[a-z-]+-(casual|normal|optimizer)-seed\d{3}-\d+y\.json$/.test(f)) : [];
for (const f of runFiles) {
  const env = J.readJson(join(P.runs, f));
  if (J.envelopeHash(env) !== env.resultHash || J.outcomeHash(env.result) !== env.outcomeHash) { integrity.invalidHash.push(f); continue; }
  if (manifest && env.codeHash !== manifest.codeHash) integrity.wrongCode.push(f);
  if (frozen && env.semanticHash !== frozen.semanticHash) integrity.wrongSemantic.push(f);
  if (env.policy !== (frozen?.policy ?? 'v3')) integrity.wrongPolicy.push(f);
  const job = manifest?.jobs.find((j) => j.id === env.jobId);
  if (!job || job.status !== 'DONE') integrity.notDoneInManifest.push(f);
  careers.push(enrich(env));
}
for (const j of manifest?.jobs.filter((x) => x.status === 'DONE') || []) if (!runFiles.includes(`${j.id}.json`)) integrity.doneWithoutFile.push(j.id);

function enrich(env) {
  const r = env.result;
  const start = r.startDate;
  const refusals = partnershipTimeline(r);
  const firstRefusalY1 = refusals.find((x) => x.refusalDay < 365) || null;
  const matches = (r.matches || []).map((m) => {
    const day = dayOfDate(start, m.date);
    return { ...m, day, year: Math.floor(day / 365) + 1, cls: CLASS[m.tier] || 'other', bucket: roundBucket(m), isR1: m.stage !== 'qualifying' && Number(m.stageRoundIndex) === 0, pstate: day < 365 ? stateOf(day, firstRefusalY1) : null };
  });
  const months = Object.entries(r.ledger || {}).sort(([a], [b]) => a.localeCompare(b)).map(([month, L]) => {
    const income = sum(Object.values(L.income || {})); const expense = sum(Object.values(L.expense || {}));
    return { month, idx: monthIndex(start, month), year: Math.floor(monthIndex(start, month) / 12) + 1, L, income, expense, opening: L.opening, closing: L.closing };
  });
  return { env, id: env.jobId, preset: env.preset, profile: env.profile, seed: env.seed, r, start, matches, tournaments: (r.tournaments || []).map((t) => ({ ...t, year: Math.floor(t.day / 365) + 1 })), months, weekly: r.weekly || [], refusals, firstRefusalY1 };
}

// ── Métricas ───────────────────────────────────────────────────────────────
function shareByYear(c, keys, year) {
  const ms = c.months.filter((m) => m.year === year);
  const total = sum(ms.map((m) => m.income));
  return total ? pct(sum(ms.map((m) => sum(keys.map((k) => m.L.income?.[k])))), total) : null;
}
const debtEvents = (c) => debtEventsOf({ weekly: c.weekly, months: c.months, start: c.start, dismissals: c.r.dismissals || [] });
function competition(ms) {
  return {
    easy: wl(ms.filter((m) => m.cls === 'easy')), medium: wl(ms.filter((m) => m.cls === 'medium')), hard: wl(ms.filter((m) => m.cls === 'hard')),
    r1: wl(ms.filter((m) => m.isR1)), r2: wl(ms.filter((m) => m.bucket === 'R2')), qf: wl(ms.filter((m) => m.bucket === 'QF')), sf: wl(ms.filter((m) => m.bucket === 'SF')), f: wl(ms.filter((m) => m.bucket === 'F')),
    all: wl(ms),
  };
}
function careerMetrics(c) {
  const y1 = c.matches.filter((m) => m.year === 1); const y2 = c.matches.filter((m) => m.year === 2);
  const titles = (y) => c.tournaments.filter((t) => t.year <= y && t.status === 'champion').length;
  const reached = (bucket, y) => c.tournaments.filter((t) => t.year <= y).length && c.matches.filter((m) => m.year <= y && m.bucket === bucket).length;
  const pq = c.r.partnerQuality || [];
  const debts = debtEvents(c);
  return {
    competition: competition(c.matches), competitionY1: competition(y1), competitionY2: competition(y2),
    tiers: Object.fromEntries(TIERS.map((t) => { const ms = c.matches.filter((m) => m.tier === t); return [t, { all: wl(ms), qualifying: wl(ms.filter((m) => m.stage === 'qualifying')), main: wl(ms.filter((m) => m.stage !== 'qualifying')) }]; })),
    rank: Object.fromEntries([['6m', 182], ['1y', 365], ['18m', 547], ['2y', 730]].map(([k, d]) => [k, at(c.weekly, d)?.rank ?? null])),
    titlesY1: titles(1), titlesY2Cum: titles(2),
    finals: c.matches.filter((m) => m.bucket === 'F').length, semis: c.matches.filter((m) => m.bucket === 'SF').length, reachedFinalY1: reached('F', 1),
    sponsorY1: shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], 1), prizeY1: shareByYear(c, ['prize'], 1),
    sponsorY2: shareByYear(c, ['sponsor_monthly', 'sponsor_signing'], 2), prizeY2: shareByYear(c, ['prize'], 2),
    incomeY1: sum(c.months.filter((m) => m.year === 1).map((m) => m.income)), sponsorIncomeY1: sum(c.months.filter((m) => m.year === 1).map((m) => (m.L.income?.sponsor_monthly || 0) + (m.L.income?.sponsor_signing || 0))), prizeIncomeY1: sum(c.months.filter((m) => m.year === 1).map((m) => m.L.income?.prize || 0)),
    debts, inDebt: debts.length > 0, finalCoins: c.r.finalCoins,
    partnerQuality: Object.fromEntries(CHECKPOINTS.map(([k, d]) => { const q = pq.find((x) => x.mark === d); return [k, q ? { ...q, gap: q.bestAttainableOvr != null && q.partnerOvr != null ? q.bestAttainableOvr - q.partnerOvr : null } : null]; })),
    refusals: c.refusals,
  };
}
for (const c of careers) c.m = careerMetrics(c);

const sel = (preset, profile) => careers.filter((c) => (!preset || c.preset === preset) && (!profile || profile === 'all' || c.profile === profile));
const pool = (list, fn) => list.flatMap((c) => c.matches.filter(fn));
function groupCompetition(list, fn = () => true) {
  const ms = pool(list, fn);
  const comp = competition(ms);
  const perCareer = (key, sub = 'competition') => dist(list.map((c) => c.m[sub][key].wr));
  return { pooled: comp, perCareer: { easy: perCareer('easy'), medium: perCareer('medium'), hard: perCareer('hard'), r1: perCareer('r1') } };
}

// ── Agregação por preset × perfil ──────────────────────────────────────────
function summarize(list) {
  const comp = groupCompetition(list);
  const y1 = groupCompetition(list, (m) => m.year === 1);
  const y2 = groupCompetition(list, (m) => m.year === 2);
  const tiers = Object.fromEntries(TIERS.map((t) => [t, { all: wl(pool(list, (m) => m.tier === t)), qualifying: wl(pool(list, (m) => m.tier === t && m.stage === 'qualifying')), main: wl(pool(list, (m) => m.tier === t && m.stage !== 'qualifying')) }]));
  return {
    careers: list.length, seeds: [...new Set(list.map((c) => c.seed))].sort(),
    competition: comp.pooled, competitionPerCareer: comp.perCareer, competitionY1: y1.pooled, competitionY2: y2.pooled, tiers,
    rank: Object.fromEntries(['6m', '1y', '18m', '2y'].map((k) => [k, dist(list.map((c) => c.m.rank[k]))])),
    titlesY1: dist(list.map((c) => c.m.titlesY1)), titlesY2Cum: dist(list.map((c) => c.m.titlesY2Cum)), finals: dist(list.map((c) => c.m.finals)), semis: dist(list.map((c) => c.m.semis)),
    sponsorY1: dist(list.map((c) => c.m.sponsorY1)), prizeY1: dist(list.map((c) => c.m.prizeY1)),
    debtPct: pct(list.filter((c) => c.m.inDebt).length, list.length), debtCareers: list.filter((c) => c.m.inDebt).length,
    debtEvents: sum(list.map((c) => c.m.debts.length)), peakDebt: dist(list.flatMap((c) => c.m.debts.map((d) => d.peakDebt))), debtDuration: dist(list.flatMap((c) => c.m.debts.map((d) => d.durationDays))),
    finalCoins: dist(list.map((c) => c.m.finalCoins)),
    partnerQuality: Object.fromEntries(CHECKPOINTS.map(([k]) => [k, {
      playerOvr: dist(list.map((c) => c.m.partnerQuality[k]?.playerOvr)), partnerOvr: dist(list.map((c) => c.m.partnerQuality[k]?.partnerOvr)), bestAttainableOvr: dist(list.map((c) => c.m.partnerQuality[k]?.bestAttainableOvr)),
      gap: dist(list.map((c) => c.m.partnerQuality[k]?.gap)), compatibility: dist(list.map((c) => c.m.partnerQuality[k]?.compatibility)), salary: dist(list.map((c) => c.m.partnerQuality[k]?.salary)), teamOvr: dist(list.map((c) => c.m.partnerQuality[k]?.teamOvr)),
    }])),
  };
}
const byPreset = Object.fromEntries(PRESETS.map((p) => [p, Object.fromEntries(['all', ...PROFILES].map((pr) => [pr, summarize(sel(p, pr))]))]));

// ── Bloco D — estado da parceria / limbo (todas as carreiras, foco Normal) ──
function stateTable(list) {
  const out = {};
  for (const s of ['A', 'B', 'C']) {
    const ms = pool(list, (m) => m.year === 1 && m.pstate === s);
    const avg = (f) => round1(ms.length ? sum(ms.map(f)) / ms.length : null);
    out[s] = {
      matches: ms.length, careers: list.filter((c) => c.matches.some((m) => m.year === 1 && m.pstate === s)).length,
      easy: wl(ms.filter((m) => m.cls === 'easy')), medium: wl(ms.filter((m) => m.cls === 'medium')), r1: wl(ms.filter((m) => m.isR1)), all: wl(ms),
      playerOvr: avg((m) => m.playerOvr || 0), partnerOvr: avg((m) => m.partnerOvr || 0), teamOvr: avg((m) => m.teamStrength || 0), opponentOvr: avg((m) => m.oppStrength || 0),
      teamMinusField: avg((m) => (m.teamStrength || 0) - (m.oppStrength || 0)),
    };
  }
  return out;
}
const partnershipState = Object.fromEntries(PRESETS.map((p) => [p, Object.fromEntries(['all', ...PROFILES].map((pr) => [pr, stateTable(sel(p, pr))]))]));
// Teste por seed (item 21: "consistente em múltiplas seeds") — Balanced-E Normal.
function commitmentVerdict(list) {
  const perSeed = list.map((c) => {
    const t = stateTable([c]);
    const fr = c.firstRefusalY1;
    const bWorse = t.B.all.n >= 3 && t.A.all.n >= 3 && t.C.all.n >= 3 && t.B.all.wr <= t.A.all.wr - MATERIAL.wrPp && t.B.all.wr <= t.C.all.wr - MATERIAL.wrPp;
    const bWeak = t.B.all.n >= 3 && t.B.teamMinusField != null && t.B.teamMinusField <= -MATERIAL.teamOvrPts;
    return { id: c.id, seed: c.seed, refused: Boolean(fr), refusalDay: fr?.refusalDay ?? null, changeDay: fr?.changeDay ?? null, limboDays: fr?.limboDays ?? null, nA: t.A.all.n, nB: t.B.all.n, nC: t.C.all.n, wrA: t.A.all.wr, wrB: t.B.all.wr, wrC: t.C.all.wr, teamOvrB: t.B.teamOvr, fieldOvrB: t.B.opponentOvr, teamMinusFieldB: t.B.teamMinusField, bWorse, bWeak, signal: bWorse && bWeak && (fr?.limboDays ?? 0) >= MATERIAL.limboDays };
  });
  const refused = perSeed.filter((s) => s.refused);
  const signalSeeds = perSeed.filter((s) => s.signal).length;
  const pooled = stateTable(list);
  const pooledWorse = pooled.B.all.n > 0 && pooled.B.all.wr <= pooled.A.all.wr - MATERIAL.wrPp && pooled.B.all.wr <= pooled.C.all.wr - MATERIAL.wrPp;
  const limbo = dist(refused.map((s) => s.limboDays));
  const conditions = {
    renewalRefused: refused.length > 0,
    delaysMaterially: limbo.median != null && limbo.median >= MATERIAL.limboDays,
    wrDuringLimboMateriallyWorse: pooledWorse,
    repeatsAcrossSeeds: signalSeeds >= MATERIAL.minSeeds,
  };
  return { perSeed, refusedCareers: refused.length, limboDays: limbo, signalSeeds, conditions, ...commitmentDecision(conditions) };
}
const commitment = { balancedNormal: commitmentVerdict(sel('balanced-e', 'normal')), allPresetsNormal: commitmentVerdict(sel(null, 'normal')), allCareers: commitmentVerdict(careers) };

// ── Bloco H — fontes de pontos de ranking ──────────────────────────────────
// Pontos de cada torneio decompostos pela tabela da própria rodada (circuitCatalog):
// participação = pontos de quem perde a 1ª partida; avanço = o que vem das vitórias
// em campanhas sem título; título = o incremento da campanha campeã; "other" =
// variação do ranking não explicada pelos torneios (ex. ano novo / expiração).
const ptsTable = existsSync(join(ROOT, 'ranking-points-by-tier.csv')) ? Object.fromEntries(readFileSync(join(ROOT, 'ranking-points-by-tier.csv'), 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.split(','); return [c[0], { r1Loss: Number(c[5]) || 0 }]; })) : {};
function pointSources(c, untilDay = 730) {
  const ts = c.tournaments.filter((t) => t.day <= untilDay);
  const out = { participation: 0, wins: 0, roundAdvancement: 0, titles: 0, other: 0 };
  for (const t of ts) {
    const base = Math.min(t.rankPoints || 0, ptsTable[t.tier]?.r1Loss ?? 0);
    out.participation += base;
    const extra = (t.rankPoints || 0) - base;
    if (t.status === 'champion') out.titles += extra;
    else if (t.roundsWon > 0) { out.wins += extra; out.roundAdvancement += extra; }
  }
  const endPts = at(c.weekly, untilDay)?.rankPoints ?? 0;
  out.other = endPts - (out.participation + out.wins + out.titles);
  out.total = endPts;
  return out;
}

// ── Bloco F — táticas em carreira ──────────────────────────────────────────
const tactics = {};
for (const m of careers.flatMap((c) => c.matches)) {
  const k = `${m.tacticA ?? 'n/d'} vs ${m.tacticB ?? 'n/d'}`;
  tactics[k] ||= { matches: 0, wins: 0 };
  tactics[k].matches += 1; if (m.won) tactics[k].wins += 1;
}
for (const v of Object.values(tactics)) v.wr = pct(v.wins, v.matches);
const aiAdapted = careers.flatMap((c) => c.matches).filter((m) => m.opponentAdaptive || (m.tacticBFinal && m.tacticB && m.tacticBFinal !== m.tacticB)).length;

// ── Bloco K/L — gates e classificação ──────────────────────────────────────
const gates = Object.fromEntries(PRESETS.map((p) => [p, presetGatesOf(byPreset[p], { silverVsGoldPp: frozen?.phase === '5.27-I' ? 5 : null })]));
const complete = careers.length === 45;
const { viable, preferred: preferredPreset, classification } = classifyPresets(gates);

// Item 24/44 — Normal ≠ Otimizador e nenhum padrão "parceiro obsoleto com alternativa forte".
function partnerBehaviour(p) {
  const n = sel(p, 'normal'); const o = sel(p, 'optimizer');
  const ovrAt = (list, k) => dist(list.map((c) => c.m.partnerQuality[k]?.partnerOvr));
  const sameChoice = n.filter((c) => { const twin = o.find((x) => x.seed === c.seed); return twin && JSON.stringify((c.r.partners || []).map((x) => x.partnerId)) === JSON.stringify((twin.r.partners || []).map((x) => x.partnerId)); }).length;
  // Obsoleto: no checkpoint, parceiro ≥ 15 abaixo do jogador E mercado com ≥ 15 acima do parceiro, persistindo em 2 marcos seguidos.
  // Separado (análise pós-dados, declarada no relatório): o marco ruim cai no
  // limbo (renovação já recusada, dupla presa por compromissos) ou foi ESCOLHA
  // (parceiro renovado/escolhido apesar da alternativa forte) — item 44 é sobre escolha.
  const obsoleteCases = n.map((c) => {
    const ks = CHECKPOINTS.map(([k]) => c.m.partnerQuality[k]).filter(Boolean);
    let streak = [];
    for (const q of ks) {
      const bad = q.partnerOvr != null && q.playerOvr - q.partnerOvr >= 15 && (q.bestAttainableOvr ?? 0) - q.partnerOvr >= 15;
      streak = bad ? [...streak, q] : [];
      if (streak.length >= 2) {
        const inLimbo = streak.every((s) => c.refusals.some((r) => s.day >= r.refusalDay && (r.changeDay == null || s.day < r.changeDay)));
        return { id: c.id, days: streak.map((s) => s.day), cause: inLimbo ? 'limbo' : 'choice' };
      }
    }
    return null;
  }).filter(Boolean);
  return { normalPartnerOvr1y: ovrAt(n, '1y'), optimizerPartnerOvr1y: ovrAt(o, '1y'), identicalPartnerSequences: sameChoice, of: n.length, normalDiffersFromOptimizer: sameChoice < n.length,
    obsoletePattern: obsoleteCases.filter((x) => x.cause === 'choice').map((x) => x.id), obsoleteDuringLimbo: obsoleteCases.filter((x) => x.cause === 'limbo') };
}
const partnerBehaviourByPreset = Object.fromEntries(PRESETS.map((p) => [p, partnerBehaviour(p)]));

// ── Operacional ────────────────────────────────────────────────────────────
const counts = manifest ? J.countStatuses(manifest) : null;
const operational = {
  manifestJobs: manifest?.jobs.length ?? 0, counts, careersLoaded: careers.length,
  failedUnresolved: manifest?.jobs.filter((j) => j.status === 'FAILED').length ?? null,
  resumes: sum(manifest?.jobs.map((j) => j.resumes || 0) || []), segments: sum(manifest?.jobs.map((j) => j.segments || 0) || []), attempts: sum(manifest?.jobs.map((j) => j.attempts || 0) || []),
  determinismFailures: manifest?.determinismFailures?.length ?? null,
  runtimeHours: round1(sum(manifest?.jobs.map((j) => j.runtimeSeconds || 0) || []) / 3600),
  integrity,
  freezeChecks: (() => { const f = join(P.logs, 'freeze-checks.jsonl'); if (!existsSync(f)) return null; const rows = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); return { checks: rows.length, withDiffs: rows.filter((r) => r.diffs > 0 || r.env?.length).length, hashes: [...new Set(rows.map((r) => r.semanticHash))] }; })(),
  frozenSemanticHash: frozen?.semanticHash ?? null,
};
operational.configChangesDuringMatrix = (operational.freezeChecks?.withDiffs ?? 0) + (operational.freezeChecks?.hashes.length > 1 ? 1 : 0) + integrity.wrongSemantic.length + integrity.wrongCode.length;

// ── Saídas ─────────────────────────────────────────────────────────────────
const stage1 = { at: new Date().toISOString(), complete, operational, gates: GATES, targets: TARGETS, material: MATERIAL, byPreset, partnershipState, commitment, tactics: { distribution: tactics, aiAdaptedMatches: aiAdapted }, partnerBehaviour: partnerBehaviourByPreset };
write('stage1.json', stage1);
const decision = {
  complete, classification, viable, preferred: preferredPreset, gates,
  balancedE: classification['balanced-e'],
  proceedToStage2: complete && ['VIABLE', 'PREFERRED'].includes(classification['balanced-e']) && operational.failedUnresolved === 0 && operational.determinismFailures === 0 && operational.configChangesDuringMatrix === 0,
  defaultChangeRequired: preferredPreset && preferredPreset !== 'balanced-e' ? `outro preset (${preferredPreset}) ficou PREFERRED — PARAR e reportar; default NÃO trocado` : null,
};
write('preset-comparison.json', decision);

const D = (d) => DIST_COLS.map((k) => d[k]);
write('difficulty.csv', csv([['preset', 'profile', 'scope', 'easyWR', 'easyN', 'mediumWR', 'mediumN', 'hardWR', 'hardN', 'r1WR', 'r1N'],
  ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => [['2y', 'competition'], ['Y1', 'competitionY1'], ['Y2', 'competitionY2']].map(([scope, k]) => { const x = byPreset[p][pr][k]; return [p, pr, scope, x.easy.wr, x.easy.n, x.medium.wr, x.medium.n, x.hard.wr, x.hard.n, x.r1.wr, x.r1.n]; })))]));
write('difficulty-per-career-dist.csv', csv([['preset', 'profile', 'metric', ...DIST_COLS], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => ['easy', 'medium', 'hard', 'r1'].map((k) => [p, pr, k, ...D(byPreset[p][pr].competitionPerCareer[k])])))]));
write('tiers.csv', csv([['preset', 'profile', 'tier', 'allWR', 'allN', 'qualifyingWR', 'qualifyingN', 'mainWR', 'mainN'], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => TIERS.map((t) => { const x = byPreset[p][pr].tiers[t]; return [p, pr, t, x.all.wr, x.all.n, x.qualifying.wr, x.qualifying.n, x.main.wr, x.main.n]; })))]));
write('rounds.csv', csv([['preset', 'profile', 'round', 'WR', 'N'], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => ROUNDS.map((r) => { const x = byPreset[p][pr].competition[r.toLowerCase()]; return [p, pr, r, x.wr, x.n]; })))]));
write('medium-breakdown.csv', csv([['preset', 'profile', 'tier', 'stage', 'year', 'WR', 'N'], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => ['Gold', 'Platinum'].flatMap((t) => ['qualifying', 'main'].flatMap((st) => ['all', 1, 2].map((y) => { const x = wl(pool(sel(p, pr), (m) => m.tier === t && (st === 'main' ? m.stage !== 'qualifying' : m.stage === 'qualifying') && (y === 'all' || m.year === y))); return [p, pr, t, st, y, x.wr, x.n]; })))))]));
write('qualifying-vs-main.csv', csv([['preset', 'profile', 'tier', 'qualifyingWR', 'qualifyingN', 'mainWR', 'mainN', 'mainR1WR', 'mainR1N'], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => TIERS.map((t) => { const x = byPreset[p][pr].tiers[t]; const r1 = wl(pool(sel(p, pr), (m) => m.tier === t && m.isR1)); return [p, pr, t, x.qualifying.wr, x.qualifying.n, x.main.wr, x.main.n, r1.wr, r1.n]; })))]));
write('partnership-state.csv', csv([['preset', 'profile', 'state', 'careers', 'matches', 'easyWR', 'easyN', 'mediumWR', 'mediumN', 'r1WR', 'r1N', 'allWR', 'playerOvr', 'partnerOvr', 'teamOvr', 'opponentOvr', 'teamMinusField'], ...PRESETS.flatMap((p) => ['all', ...PROFILES].flatMap((pr) => ['A', 'B', 'C'].map((s) => { const x = partnershipState[p][pr][s]; return [p, pr, s, x.careers, x.matches, x.easy.wr, x.easy.n, x.medium.wr, x.medium.n, x.r1.wr, x.r1.n, x.all.wr, x.playerOvr, x.partnerOvr, x.teamOvr, x.opponentOvr, x.teamMinusField]; })))]));
write('commitment-limbo.csv', csv([['job', 'preset', 'profile', 'seed', 'partnershipId', 'refusalDay', 'reason', 'partnerOvr', 'playerOvr', 'changeDay', 'limboDays', 'censoredAt'], ...careers.flatMap((c) => c.refusals.map((r) => [c.id, c.preset, c.profile, c.seed, r.partnershipId, r.refusalDay, r.reason, r.partnerOvr, r.playerOvr, r.changeDay, r.limboDays, r.censoredAt]))]));
write('partner-quality.csv', csv([['job', 'preset', 'profile', 'seed', 'checkpoint', 'day', 'playerOvr', 'partnerOvr', 'bestAttainableOvr', 'partnerGap', 'compatibility', 'salary', 'teamOvr', 'marketSize'], ...careers.flatMap((c) => CHECKPOINTS.map(([k]) => { const q = c.m.partnerQuality[k]; return [c.id, c.preset, c.profile, c.seed, k, q?.day, q?.playerOvr, q?.partnerOvr, q?.bestAttainableOvr, q?.gap, q?.compatibility, q?.salary, q?.teamOvr, q?.marketSize]; }))]));
write('ranking.csv', csv([['job', 'preset', 'profile', 'seed', 'rank6m', 'rank1y', 'rank18m', 'rank2y'], ...careers.map((c) => [c.id, c.preset, c.profile, c.seed, c.m.rank['6m'], c.m.rank['1y'], c.m.rank['18m'], c.m.rank['2y']])]));
write('ranking-points.csv', csv([['job', 'preset', 'profile', 'seed', 'horizon', 'participation', 'wins', 'roundAdvancement', 'titles', 'other', 'total'], ...careers.flatMap((c) => [['1y', 365], ['2y', 730]].map(([h, d]) => { const s = pointSources(c, d); return [c.id, c.preset, c.profile, c.seed, h, s.participation, s.wins, s.roundAdvancement, s.titles, s.other, s.total]; }))]));
write('titles.csv', csv([['job', 'preset', 'profile', 'seed', 'titlesY1', 'titlesY2Cum', 'finals', 'semis'], ...careers.map((c) => [c.id, c.preset, c.profile, c.seed, c.m.titlesY1, c.m.titlesY2Cum, c.m.finals, c.m.semis])]));
write('economy.csv', csv([['job', 'preset', 'profile', 'seed', 'incomeY1', 'sponsorIncomeY1', 'prizeIncomeY1', 'sponsorShareY1', 'prizeShareY1', 'sponsorShareY2', 'prizeShareY2', 'debtEvents', 'finalCoins'], ...careers.map((c) => [c.id, c.preset, c.profile, c.seed, c.m.incomeY1, c.m.sponsorIncomeY1, c.m.prizeIncomeY1, c.m.sponsorY1, c.m.prizeY1, c.m.sponsorY2, c.m.prizeY2, c.m.debts.length, c.m.finalCoins])]));
write('sponsors.csv', csv([['job', 'preset', 'profile', 'seed', 'day', 'sponsor', 'tier', 'monthly', 'signBonus', 'duration', 'rank', 'ovr'], ...careers.flatMap((c) => (c.r.sponsors || []).map((s) => [c.id, c.preset, c.profile, c.seed, s.day, s.sponsor, s.tier, s.monthly, s.signBonus, s.duration, s.rank, s.ovr]))]));
write('prizes.csv', csv([['job', 'preset', 'profile', 'seed', 'day', 'tournamentId', 'tier', 'status', 'roundsWon', 'prize', 'rankPoints'], ...careers.flatMap((c) => c.tournaments.map((t) => [c.id, c.preset, c.profile, c.seed, t.day, t.tournamentId, t.tier, t.status, t.roundsWon, t.prize, t.rankPoints]))]));
write('debt.csv', csv([['job', 'preset', 'profile', 'seed', 'event', 'startDay', 'endDay', 'durationDays', 'peakDebt', 'open', 'reason'], ...careers.flatMap((c) => c.m.debts.map((d, i) => [c.id, c.preset, c.profile, c.seed, i + 1, d.startDay, d.endDay, d.durationDays, d.peakDebt, Boolean(d.open), d.reason]))]));

// Console
const b = byPreset['balanced-e'];
console.log(`5.27-H Stage 1: ${careers.length}/45 carreiras · falhas ${operational.failedUnresolved} · determinismo ${operational.determinismFailures} · mudanças de config ${operational.configChangesDuringMatrix}`);
for (const p of PRESETS) { const n = byPreset[p].normal.competition; console.log(`${p.padEnd(15)} Normal E ${n.easy.wr} M ${n.medium.wr} H ${n.hard.wr} R1 ${n.r1.wr} · ${classification[p]} · ${gates[p].checks.filter((x) => !x.pass).map((x) => x.gate).join(', ') || 'todos os hard gates ok'}`); }
console.log(`Balanced-E: ${classification['balanced-e']} · Stage 2: ${decision.proceedToStage2 ? 'LIBERADO' : 'NÃO'} · commitment: ${commitment.balancedNormal.recommendation}`);
if (!complete && !process.argv.includes('--allow-partial')) process.exitCode = 2;
