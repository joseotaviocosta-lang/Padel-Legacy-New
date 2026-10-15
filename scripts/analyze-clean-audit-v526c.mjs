// Playthrough 5.26-C — análise da re-auditoria limpa (sem shim).
// Lê os JSON brutos de reports/progression-clean-526c/{smoke/raw, runs/raw,
// runs/raw-long} e o summary.json do analisador da 5.26 rodado sobre runs/
// (mesmas definições de economia/"money-solved" nos três estados) e grava:
//   summary.json, difficulty.json, upsets.json, partnership-lifecycle.json,
//   sponsors-eligibility.json, ranking-rollover.json, economy.csv, progression.csv
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('reports/progression-clean-526c');
const load = (dir, kind) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => ({ ...JSON.parse(readFileSync(join(dir, f), 'utf8')), kind })) : []);
const smoke = load(resolve(ROOT, 'smoke/raw'), 'smoke');
const main = load(resolve(ROOT, 'runs/raw'), 'main');
const long = load(resolve(ROOT, 'runs/raw-long'), 'long');
const PROFILES = ['casual', 'normal', 'optimizer'];
const PLANNED = { smoke: 730, main: 1826, long: 3653 };

// ── estatística ──
const nums = (v) => v.map(Number).filter((x) => Number.isFinite(x));
const q = (v, p) => { const s = nums(v).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const dist = (v) => { const s = nums(v); return { n: s.length, p10: r1(q(s, 0.1)), median: r1(q(s, 0.5)), p90: r1(q(s, 0.9)), min: s.length ? Math.min(...s) : null, max: s.length ? Math.max(...s) : null }; };
const pct = (a, b) => (b ? r1((a / b) * 100) : null);
const snapAt = (c, day) => { let best = null; for (const w of c.weekly) { if (w.day <= day) best = w; else break; } return best; };

// ── rodada / classe ──
const CLASS = { Bronze: 'Fácil', Silver: 'Fácil', Gold: 'Médio', Platinum: 'Médio', Masters: 'Difícil', Elite: 'Difícil', Crown: 'Difícil', 'Circuit Finals': 'Difícil', 'Legacy Finals': 'Difícil' };
const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown', 'Circuit Finals', 'Legacy Finals'];
function roundBucket(m) {
  if (m.stage === 'qualifying') return 'Q';
  if (m.round === 'Final') return 'F';
  if (m.round === 'Semifinal') return 'SF';
  if (m.round === 'Quartas de Final') return 'QF';
  return Number(m.stageRoundIndex) === 0 ? 'R1' : 'R2';
}
const deltaBucket = (d) => (d == null ? null : d <= -15 ? '≤-15' : d <= -5 ? '-15..-5' : d < 5 ? '-5..+5' : d < 15 ? '+5..+15' : '≥+15');
const rankDeltaBucket = (team, opp) => { if (!opp) return 'adversário sem rank'; const t = team || 9999; const d = t - opp; return d <= -200 ? 'jogador ≥200 melhor' : d <= -50 ? 'jogador 50–199 melhor' : d < 50 ? '±49' : d < 200 ? 'adversário 50–199 melhor' : 'adversário ≥200 melhor'; };
function winTable(matches, keyFn, order) {
  const g = {};
  for (const m of matches) { const k = keyFn(m); if (k == null) continue; (g[k] ||= { n: 0, won: 0 }).n += 1; if (m.won) g[k].won += 1; }
  const keys = order ? order.filter((k) => g[k]) : Object.keys(g);
  return Object.fromEntries(keys.map((k) => [k, { n: g[k].n, winPct: pct(g[k].won, g[k].n) }]));
}

// ── difficulty.json ──
function difficulty(careers) {
  const ms = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
  const block = (list) => ({
    matches: list.length, winPct: pct(list.filter((m) => m.won).length, list.length),
    byTier: winTable(list, (m) => m.tier, TIER_ORDER),
    byRound: winTable(list, roundBucket, ['Q', 'R1', 'R2', 'QF', 'SF', 'F']),
    byClass: winTable(list, (m) => CLASS[m.tier] || null, ['Fácil', 'Médio', 'Difícil']),
    byEngineStrengthDelta: winTable(list, (m) => deltaBucket(m.engineDelta), ['≤-15', '-15..-5', '-5..+5', '+5..+15', '≥+15']),
    engineStrengthDelta: dist(list.map((m) => m.engineDelta)),
    byPairRankDelta: winTable(list, (m) => rankDeltaBucket(m.teamRank, m.oppTeamRank), ['jogador ≥200 melhor', 'jogador 50–199 melhor', '±49', 'adversário 50–199 melhor', 'adversário ≥200 melhor', 'adversário sem rank']),
  });
  return { all: block(ms), byProfile: Object.fromEntries(PROFILES.map((p) => [p, block(ms.filter((m) => m.profile === p))])) };
}

// ── upsets.json ──
function upsets(careers) {
  const ms = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
  const block = (list) => {
    const ranked = list.filter((m) => m.oppTeamRank);
    const attempts = ranked.filter((m) => m.oppTeamRank < (m.teamRank || 9999));
    return {
      matches: list.length,
      opponentRankCoverage: { teamRanking: list.filter((m) => m.oppRankSource === 'team-ranking').length, unranked: list.filter((m) => m.oppRankSource === 'unranked').length, missingRoster: list.filter((m) => m.oppRankSource === 'missing-roster').length, pct: pct(ranked.length, list.length) },
      opponentOrigin: { catalogFictional: list.filter((m) => (m.oppIds || []).every((id) => String(id).startsWith('player-fictional-'))).length, catalogRealAny: list.filter((m) => (m.oppIds || []).some((id) => String(id).startsWith('player-real-'))).length },
      attempted: attempts.length, won: attempts.filter((m) => m.won).length, lost: attempts.filter((m) => !m.won).length,
      ratePct: pct(attempts.filter((m) => m.won).length, attempts.length), flaggedUpsets: list.filter((m) => m.upset).length,
      // Gate: rank ausente quando a TeamRanking canônica (ids resolvidos) existe com pontos.
      missingWhenCanonicalExists: list.filter((m) => m.oppRankSource && m.oppTeamRowExists && Number(m.oppTeamRowPoints) > 0 && !m.oppTeamRank).length,
      canonicalRowExists: list.filter((m) => m.oppRankSource && m.oppTeamRowExists).length,
    };
  };
  return { all: block(ms), byProfile: Object.fromEntries(PROFILES.map((p) => [p, block(ms.filter((m) => m.profile === p))])) };
}

// ── progressão ──
const MILESTONES = [500, 200, 100, 50, 20, 10, 1];
const CHECK_DAYS = { start: 0, '6m': 183, '1y': 365, '2y': 730, '3y': 1095, '5y': 1826, '10y': 3653 };
function progression(careers) {
  const per = (p) => careers.filter((c) => c.profile === p);
  const milestone = (list) => Object.fromEntries(MILESTONES.map((t) => { const d = list.map((c) => c.weekly.find((w) => w.rank && w.rank <= t)?.day ?? null); return [`top${t}`, { reachedPct: pct(d.filter((x) => x != null).length, list.length), day: dist(d.filter((x) => x != null)) }]; }));
  const ovr = (list) => Object.fromEntries(Object.entries(CHECK_DAYS).map(([k, day]) => [k, dist(list.filter((c) => c.days >= day).map((c) => snapAt(c, day)?.ovr))]));
  const rank = (list) => Object.fromEntries(Object.entries(CHECK_DAYS).map(([k, day]) => [k, dist(list.filter((c) => c.days >= day).map((c) => snapAt(c, day)?.rank))]));
  const perYear = (list) => {
    const years = Math.floor(Math.max(...list.map((c) => c.days)) / 365);
    return Array.from({ length: years }, (_, y) => {
      const ts = list.map((c) => c.tournaments.filter((t) => t.day >= y * 365 && t.day < (y + 1) * 365));
      return { year: y + 1, titles: dist(ts.map((x) => x.filter((t) => t.status === 'champion').length)), finals: dist(ts.map((x) => x.filter((t) => t.roundsWon >= t.totalRounds - 1).length)), semis: dist(ts.map((x) => x.filter((t) => t.roundsWon >= t.totalRounds - 2).length)), tournaments: dist(ts.map((x) => x.length)) };
    });
  };
  return Object.fromEntries(PROFILES.map((p) => [p, { careers: per(p).length, milestones: milestone(per(p)), ovr: ovr(per(p)), rank: rank(per(p)), perYear: perYear(per(p)) }]));
}

// ── save / perf ──
function saveAndPerf(careers) {
  const at = (c, y) => snapAt(c, y * 365)?.saveMB ?? null;
  const save = Object.fromEntries([1, 2, 3, 5, 10].map((y) => [`Y${y}`, dist(careers.filter((c) => c.days >= y * 365).map((c) => at(c, y)))]));
  const mbPerYear = dist(careers.map((c) => { const a = at(c, 1); const b = c.weekly.at(-1)?.saveMB; const yrs = (c.weekly.at(-1)?.day - 365) / 365; return a != null && b != null && yrs > 0 ? (b - a) / yrs : null; }));
  const sPerYear = dist(careers.map((c) => (c.ms / 1000) / (c.days / 365)));
  return { saveMB: save, saveMBPerYearAfterY1: mbPerYear, secondsPerCareerYear: sPerYear };
}
function rssFromLog(file) {
  if (!existsSync(file)) return null;
  const v = [...readFileSync(file, 'utf8').matchAll(/rss (\d+)MB/g)].map((m) => Number(m[1]));
  return dist(v);
}

// ── parceria ──
function partnership(careers) {
  const per = careers.map((c) => {
    const counts = {};
    for (const p of c.partners || []) counts[p.partnerId] = (counts[p.partnerId] || 0) + 1;
    return { id: `${c.profile}-${c.seed}`, kind: c.kind, partners: (c.partners || []).length, distinct: Object.keys(counts).length, maxSamePartner: Math.max(0, ...Object.values(counts)), resignLoopEvents: c.resignLoopEvents || 0, renewals: (c.renewals || []).length, viaSearch: (c.partners || []).filter((p) => p.via === 'search').length };
  });
  const byKind = (k) => per.filter((x) => x.kind === k);
  const block = (list) => ({ careers: list.length, resignLoopEventsTotal: list.reduce((t, x) => t + x.resignLoopEvents, 0), careersWithLoop: list.filter((x) => x.resignLoopEvents > 0).length, careersSamePartner10x: list.filter((x) => x.maxSamePartner >= 10).length, partnersPerCareer: dist(list.map((x) => x.partners)), maxSamePartner: dist(list.map((x) => x.maxSamePartner)), renewalsPerCareer: dist(list.map((x) => x.renewals)), viaSearchPct: pct(list.reduce((t, x) => t + x.viaSearch, 0), list.reduce((t, x) => t + x.partners, 0)) });
  const renewalOutcomes = {};
  for (const c of careers) for (const r of c.renewals || []) renewalOutcomes[r.outcome] = (renewalOutcomes[r.outcome] || 0) + 1;
  return { smoke: block(byKind('smoke')), main: block(byKind('main')), long: block(byKind('long')), renewalOutcomes, worst: per.sort((a, b) => b.maxSamePartner - a.maxSamePartner).slice(0, 5) };
}

// ── patrocínio (estático + empírico) ──
const ORIGINAL = ['babolat', 'siux', 'varlion', 'nox', 'wilson', 'adidas', 'joma', 'bullpadel', 'head'];
function sponsors(careers) {
  const reach = JSON.parse(existsSync(resolve(ROOT, 'sponsors-reachability.json')) ? readFileSync(resolve(ROOT, 'sponsors-reachability.json'), 'utf8') : '[]');
  const signed = {};
  for (const c of careers) for (const s of c.sponsors || []) (signed[s.sponsor] ||= []).push({ career: `${c.kind}:${c.profile}-${c.seed}`, day: s.day, tier: s.tier, monthly: s.monthly });
  const first = (tier) => dist(careers.map((c) => (c.sponsors || []).find((s) => s.tier === tier)?.day).filter((x) => x != null));
  const reached = (tier) => pct(careers.filter((c) => (c.sponsors || []).some((s) => s.tier === tier)).length, careers.length);
  const incomeByTier = {};
  for (const c of careers) for (const s of c.sponsors || []) (incomeByTier[s.tier] ||= []).push(s.monthly);
  return {
    classification: reach.map((r) => ({ ...r, classification: ORIGINAL.includes(r.id) ? 'BUG (corrigido: is_available ausente lido como bloqueio)' : 'EXPECTED LOCK (requisitos de XP/títulos/fãs/idade/estágio)', signedCareers: new Set((signed[r.id] || []).map((x) => x.career)).size, firstSignedDay: dist((signed[r.id] || []).map((x) => x.day)) })),
    neverSigned: reach.map((r) => r.id).filter((id) => !signed[id]),
    firstSilverDay: first('Prata'), firstGoldDay: first('Ouro'), reachedSilverPct: reached('Prata'), reachedGoldPct: reached('Ouro'),
    monthlyByTier: Object.fromEntries(Object.entries(incomeByTier).map(([t, v]) => [t, dist(v)])),
    originalsSignedCareers: careers.filter((c) => (c.sponsors || []).some((s) => ORIGINAL.includes(s.sponsor))).length,
  };
}

// ── virada de ano nas carreiras ──
function rollover(careers) {
  const jumps = [];
  for (const c of careers) {
    for (const y of [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]) {
      const before = [...c.weekly].reverse().find((w) => w.date < `${y}-01-01`);
      const after = c.weekly.find((w) => w.date >= `${y}-01-01`);
      if (!before || !after || after.day - before.day > 10) continue;
      jumps.push({ career: `${c.kind}:${c.profile}-${c.seed}`, year: y, rankBefore: before.rank, rankAfter: after.rank, change: (before.rank || 0) - (after.rank || 0), pointsBefore: before.rankPoints, pointsAfter: after.rankPoints });
    }
  }
  const turns = careers.flatMap((c) => (c.yearTurns || []).map((t) => ({ career: `${c.kind}:${c.profile}-${c.seed}`, ...t })));
  return { weeklyAcrossNewYear: { n: jumps.length, rankChange: dist(jumps.map((j) => j.change)), improvedOver100WithoutPointsGain: jumps.filter((j) => j.change > 100 && (j.pointsAfter || 0) <= (j.pointsBefore || 0)).length, sample: jumps.slice(0, 12) }, yearTurns: { n: turns.length, raceNotResetCareers: turns.filter((t) => t.playerRace > 0).length, maxAthletes: Math.max(0, ...turns.map((t) => t.athletes)), maxWithWorldPoints: Math.max(0, ...turns.map((t) => t.withWorldPoints)), raceNonZeroAfterTurn: dist(turns.map((t) => t.raceNonZero)) } };
}

// ── gates ──
function gates(list, kind) {
  return {
    careers: list.length, planned: PLANNED[kind],
    completed: list.filter((c) => c.days === PLANNED[kind]).length,
    shimFree: list.filter((c) => c.shimEver === false).length,
    softLockFires: list.reduce((t, c) => t + (c.softLock?.fires || 0), 0),
    errors: list.reduce((t, c) => t + (c.errors || []).length, 0), errorSamples: list.flatMap((c) => (c.errors || []).map((e) => `${c.profile}-${c.seed}: ${e}`)).slice(0, 10),
    advanceFailures: list.reduce((t, c) => t + (c.advanceFailures || []).length, 0),
    resumes: list.reduce((t, c) => t + (c.resumes || 0), 0), reloads: list.reduce((t, c) => t + (c.reloads || 0), 0),
    resignLoopEvents: list.reduce((t, c) => t + (c.resignLoopEvents || 0), 0),
    partnerOvrMismatchMatches: list.reduce((t, c) => t + c.matches.filter((m) => m.engineOvr && m.engineOvr.A[1] !== (m.partnerDisplayOvr ?? m.partnerOvr)).length, 0),
    rewardLossCoins: list.reduce((t, c) => t + Object.values(c.ledger || {}).reduce((s, m) => s + (Number(m.expense?.reward_overwrite) || 0), 0), 0),
    raceNotResetAtYearTurn: list.reduce((t, c) => t + (c.yearTurns || []).filter((y) => y.playerRace > 0).length, 0),
    yearTurnsObserved: list.reduce((t, c) => t + (c.yearTurns || []).length, 0),
  };
}

const all = [...smoke, ...main, ...long];
const audit = [...main, ...long];
const base526 = existsSync(resolve(ROOT, 'runs/summary.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'runs/summary.json'), 'utf8')) : null;
const summary = {
  generatedAt: new Date().toISOString(),
  gates: { smoke: gates(smoke, 'smoke'), main: gates(main, 'main'), long: gates(long, 'long') },
  progression: { main: progression(main), long: progression(long), smoke: progression(smoke) },
  saveAndPerf: { main: saveAndPerf(main), long: saveAndPerf(long), smoke: saveAndPerf(smoke), rssMB: { runs: rssFromLog(resolve(ROOT, 'runs/runner.log')), smoke: rssFromLog(resolve(ROOT, 'smoke/runner.log')) } },
  economyFrom526Analyzer: base526 ? Object.fromEntries(PROFILES.map((p) => [p, { economy: base526.profiles?.[p]?.economy, solved: base526.profiles?.[p]?.solved, sponsors: base526.profiles?.[p]?.sponsors }])) : null,
};
writeFileSync(resolve(ROOT, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(resolve(ROOT, 'difficulty.json'), JSON.stringify({ main: difficulty(main), long: difficulty(long), smoke: difficulty(smoke) }, null, 2));
writeFileSync(resolve(ROOT, 'upsets.json'), JSON.stringify({ rule: 'vitória sobre dupla com posição canônica menor (melhor) que a do jogador; adversário sem rank nunca conta (teamRanking.isUpsetResult)', main: upsets(main), long: upsets(long), smoke: upsets(smoke) }, null, 2));
writeFileSync(resolve(ROOT, 'partnership-lifecycle.json'), JSON.stringify({ runs: partnership(all), repro: ['before', 'after'].map((t) => { const f = resolve(ROOT, `partner-loop-repro-${t}.json`); return existsSync(f) ? { state: t, ...JSON.parse(readFileSync(f, 'utf8')).summary } : null; }) }, null, 2));
writeFileSync(resolve(ROOT, 'sponsors-eligibility.json'), JSON.stringify({ audit: sponsors(audit), smoke: sponsors(smoke) }, null, 2));
const rr = (t) => { const f = resolve(ROOT, `ranking-rollover-${t}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).snapshots.filter((s) => s.date >= '2026-12-28') : null; };
writeFileSync(resolve(ROOT, 'ranking-rollover.json'), JSON.stringify({ instrumented: { note: 'carreira real, jogador congelado em 117 pontos', before: rr('before'), after: rr('after') }, runs: rollover(all) }, null, 2));
for (const f of ['economy.csv', 'progression.csv']) if (existsSync(resolve(ROOT, 'runs', f))) copyFileSync(resolve(ROOT, 'runs', f), resolve(ROOT, f));
console.log(JSON.stringify(summary.gates, null, 1));
