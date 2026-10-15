// Playthrough 5.26-D — análise da auditoria curta de paridade de campo.
// Lê os JSON brutos de reports/tournament-world-parity-526d/smoke/raw e grava
// summary.json, difficulty.json, upsets.json, fallback.json,
// comparison-526c-vs-526d.json e o relatório .md.
//
// NÃO rebalanceia nada: só mede o efeito da troca de fonte do campo
// (catálogo sintético → duplas reais do mundo).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('reports/tournament-world-parity-526d');
const SMOKE = resolve(ROOT, 'smoke/raw');
const REF_526C = resolve('reports/progression-clean-526c');
const PROFILES = ['casual', 'normal', 'optimizer'];
const PLANNED = 730;

const load = (dir, kind) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^(casual|normal|optimizer)-\d{3}\.json$/.test(f)).map((f) => ({ ...JSON.parse(readFileSync(join(dir, f), 'utf8')), kind })) : []);
const smoke = load(SMOKE, 'smoke');

const nums = (v) => v.map(Number).filter((x) => Number.isFinite(x));
const q = (v, p) => { const s = nums(v).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const dist = (v) => { const s = nums(v); return { n: s.length, p25: r1(q(s, 0.25)), median: r1(q(s, 0.5)), p75: r1(q(s, 0.75)), min: s.length ? Math.min(...s) : null, max: s.length ? Math.max(...s) : null }; };
const pct = (a, b) => (b ? r1((a / b) * 100) : null);
const snapAt = (c, day) => { let best = null; for (const w of c.weekly) { if (w.day <= day) best = w; else break; } return best; };

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
function winTable(matches, keyFn, order) {
  const g = {};
  for (const m of matches) { const k = keyFn(m); if (k == null) continue; (g[k] ||= { n: 0, won: 0 }).n += 1; if (m.won) g[k].won += 1; }
  const keys = order ? order.filter((k) => g[k]) : Object.keys(g);
  return Object.fromEntries(keys.map((k) => [k, { n: g[k].n, winPct: pct(g[k].won, g[k].n) }]));
}

const allMatches = smoke.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
const opponentField = allMatches.filter((m) => m.stage === 'main');

function difficulty(careers) {
  const ms = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
  const block = (list) => ({
    matches: list.length, winPct: pct(list.filter((m) => m.won).length, list.length),
    byTier: winTable(list, (m) => m.tier, TIER_ORDER),
    byRound: winTable(list, roundBucket, ['Q', 'R1', 'R2', 'QF', 'SF', 'F']),
    byClass: winTable(list, (m) => CLASS[m.tier] || null, ['Fácil', 'Médio', 'Difícil']),
    byEngineStrengthDelta: winTable(list, (m) => deltaBucket(m.engineDelta), ['≤-15', '-15..-5', '-5..+5', '+5..+15', '≥+15']),
    engineStrengthDelta: dist(list.map((m) => m.engineDelta)),
  });
  return { all: block(ms), byProfile: Object.fromEntries(PROFILES.map((p) => [p, block(ms.filter((m) => m.profile === p))])) };
}

function upsets(careers) {
  const ms = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile })));
  const block = (list) => {
    const ranked = list.filter((m) => m.oppTeamRank);
    const attempts = ranked.filter((m) => m.oppTeamRank < (m.teamRank || 9999));
    return {
      matches: list.length,
      opponentRankCoverage: {
        teamRanking: list.filter((m) => m.oppRankSource === 'team-ranking').length,
        unranked: list.filter((m) => m.oppRankSource === 'unranked').length,
        missingRoster: list.filter((m) => m.oppRankSource === 'missing-roster').length,
        pct: pct(ranked.length, list.length),
      },
      opponentOrigin: {
        catalogFictionalAll: list.filter((m) => (m.oppIds || []).length && (m.oppIds || []).every((id) => String(id).startsWith('player-fictional-'))).length,
        worldPair: list.filter((m) => m.opponentSource === 'world-pair').length,
        fallbackSynthetic: list.filter((m) => m.opponentSource === 'fallback-synthetic').length,
      },
      attempted: attempts.length, won: attempts.filter((m) => m.won).length, lost: attempts.filter((m) => !m.won).length,
      ratePct: pct(attempts.filter((m) => m.won).length, attempts.length), flaggedUpsets: list.filter((m) => m.upset).length,
      missingWhenCanonicalExists: list.filter((m) => m.oppRankSource && m.oppTeamRowExists && Number(m.oppTeamRowPoints) > 0 && !m.oppTeamRank).length,
      canonicalRowExists: list.filter((m) => m.oppRankSource && m.oppTeamRowExists).length,
      rankDelta: dist(ranked.map((m) => (m.teamRank || 9999) - m.oppTeamRank)),
    };
  };
  return { all: block(ms), byProfile: Object.fromEntries(PROFILES.map((p) => [p, block(ms.filter((m) => m.profile === p))])) };
}

function fieldImpact(careers) {
  const ms = careers.flatMap((c) => c.matches.map((m) => ({ ...m, profile: c.profile }))).filter((m) => m.stage === 'main');
  return Object.fromEntries(TIER_ORDER.map((tier) => {
    const list = ms.filter((m) => m.tier === tier);
    if (!list.length) return [tier, null];
    const ranks = list.map((m) => m.oppTeamRank).filter(Boolean);
    return [tier, {
      matches: list.length,
      medianOppTeamRank: dist(ranks).median, p25OppTeamRank: dist(ranks).p25, p75OppTeamRank: dist(ranks).p75,
      medianOppOvr: dist(list.map((m) => m.oppStrength)).median,
      medianTeamOvr: dist(list.map((m) => m.teamStrength)).median,
      rankedShare: pct(ranks.length, list.length),
      unrankedShare: pct(list.filter((m) => m.oppRankSource === 'unranked').length, list.length),
      fallbackShare: pct(list.filter((m) => m.opponentSource === 'fallback-synthetic').length, list.length),
    }];
  }).filter(([, v]) => v));
}

function fallback(careers) {
  const byTournament = new Map();
  for (const c of careers) for (const m of c.matches) {
    if (!m.tournamentId) continue;
    if (!byTournament.has(m.tournamentId)) byTournament.set(m.tournamentId, { tier: m.tier, fallback: Number(m.drawFallbackCount) || 0, real: Number(m.drawRealCount) || 0, origin: m.fieldOrigin || null });
  }
  const rows = [...byTournament.values()];
  const perTier = {};
  for (const t of TIER_ORDER) {
    const list = rows.filter((r) => r.tier === t);
    if (!list.length) continue;
    perTier[t] = { tournaments: list.length, fallbackPairs: list.reduce((s, r) => s + r.fallback, 0), realPairs: list.reduce((s, r) => s + r.real, 0), fallbackPct: pct(list.reduce((s, r) => s + r.fallback, 0), list.reduce((s, r) => s + r.fallback + r.real, 0)) };
  }
  return {
    tournaments: rows.length,
    totalFallbackPairs: rows.reduce((s, r) => s + r.fallback, 0),
    totalRealPairs: rows.reduce((s, r) => s + r.real, 0),
    fallbackPct: pct(rows.reduce((s, r) => s + r.fallback, 0), rows.reduce((s, r) => s + r.fallback + r.real, 0)),
    syntheticActivePairs: allMatches.filter((m) => (m.oppIds || []).length && (m.oppIds || []).every((id) => String(id).startsWith('player-fictional-'))).length,
    perTier,
  };
}

const MILESTONES = [500, 200, 100, 50, 20, 10, 1];
const CHECK_DAYS = { start: 0, '1y': 365, '2y': 730 };
function progression(careers) {
  const per = (p) => careers.filter((c) => c.profile === p);
  const milestone = (list) => Object.fromEntries(MILESTONES.map((t) => { const d = list.map((c) => c.weekly.find((w) => w.rank && w.rank <= t)?.day ?? null); return [`top${t}`, { reachedPct: pct(d.filter((x) => x != null).length, list.length), day: dist(d.filter((x) => x != null)) }]; }));
  const rank = (list) => Object.fromEntries(Object.entries(CHECK_DAYS).map(([k, day]) => [k, dist(list.filter((c) => c.days >= day).map((c) => snapAt(c, day)?.rank))]));
  const ovr = (list) => Object.fromEntries(Object.entries(CHECK_DAYS).map(([k, day]) => [k, dist(list.filter((c) => c.days >= day).map((c) => snapAt(c, day)?.ovr))]));
  const perYear = (list) => Array.from({ length: 2 }, (_, y) => {
    const ts = list.map((c) => c.tournaments.filter((t) => t.day >= y * 365 && t.day < (y + 1) * 365));
    return { year: y + 1, titles: dist(ts.map((x) => x.filter((t) => t.status === 'champion').length)), finals: dist(ts.map((x) => x.filter((t) => t.roundsWon >= t.totalRounds - 1).length)), tournaments: dist(ts.map((x) => x.length)) };
  });
  return Object.fromEntries(PROFILES.map((p) => [p, { careers: per(p).length, milestones: milestone(per(p)), rank: rank(per(p)), ovr: ovr(per(p)), perYear: perYear(per(p)) }]));
}

function gates(list) {
  return {
    careers: list.length, planned: PLANNED,
    completed: list.filter((c) => c.days === PLANNED).length,
    shimFree: list.filter((c) => c.shimEver === false).length,
    softLockFires: list.reduce((t, c) => t + (c.softLock?.fires || 0), 0),
    errors: list.reduce((t, c) => t + (c.errors || []).length, 0),
    errorSamples: list.flatMap((c) => (c.errors || []).map((e) => `${c.profile}-${c.seed}: ${e}`)).slice(0, 8),
    advanceFailures: list.reduce((t, c) => t + (c.advanceFailures || []).length, 0),
    partnerOvrMismatchMatches: list.reduce((t, c) => t + c.matches.filter((m) => m.engineOvr && m.engineOvr.A[1] !== (m.partnerDisplayOvr ?? m.partnerOvr)).length, 0),
    opponentOvrMismatchMatches: list.reduce((t, c) => t + c.matches.filter((m) => {
      const b = (m.engineOvr?.B || []);
      // `oppAOvr/oppBOvr` usam a MESMA autoridade da UI (ovrOf → baseOverallRating).
      const disp = [m.oppAOvr, m.oppBOvr];
      return b.some((v, i) => disp[i] != null && v !== disp[i]);
    }).length, 0),
  };
}

const reference526c = existsSync(resolve(REF_526C, 'difficulty.json'))
  ? JSON.parse(readFileSync(resolve(REF_526C, 'difficulty.json'), 'utf8'))
  : null;
const referenceUpsets526c = existsSync(resolve(REF_526C, 'upsets.json'))
  ? JSON.parse(readFileSync(resolve(REF_526C, 'upsets.json'), 'utf8'))
  : null;

const diff = { smoke: difficulty(smoke), fieldImpact: fieldImpact(smoke) };
const ups = { rule: 'vitória sobre dupla com posição canônica menor (melhor) que a do jogador; adversário sem rank nunca conta (teamRanking.isUpsetResult)', smoke: upsets(smoke) };
const fb = fallback(smoke);
const prog = { smoke: progression(smoke) };
const g = { smoke: gates(smoke) };

writeFileSync(resolve(ROOT, 'difficulty.json'), JSON.stringify(diff, null, 2));
writeFileSync(resolve(ROOT, 'upsets.json'), JSON.stringify(ups, null, 2));
writeFileSync(resolve(ROOT, 'fallback.json'), JSON.stringify(fb, null, 2));
writeFileSync(resolve(ROOT, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), gates: g, progression: prog }, null, 2));

const c526 = {
  easy: reference526c?.main?.all?.byClass?.['Fácil']?.winPct ?? 49.2,
  medium: reference526c?.main?.all?.byClass?.['Médio']?.winPct ?? 78.8,
  hard: reference526c?.main?.all?.byClass?.['Difícil']?.winPct ?? 63.6,
  byTier: reference526c?.main?.all?.byTier ?? {},
  r1: reference526c?.main?.all?.byRound?.R1?.winPct ?? 87.5,
  coverage: referenceUpsets526c?.main?.all?.opponentRankCoverage?.pct ?? 0,
  upsets: referenceUpsets526c?.main?.all?.ratePct ?? 0,
  attempted: referenceUpsets526c?.main?.all?.attempted ?? 0,
};
const comparison = {
  note: '5.26-C = lote principal 35×5 temporadas; 5.26-D = smoke 15×2 temporadas (mesma seed base). Comparação de direção, não de igualdade de n.',
  metrics: {
    rankedOpponentCoveragePct: { c: c526.coverage, d: ups.smoke.all.opponentRankCoverage.pct },
    easyWR: { c: c526.easy, d: diff.smoke.all.byClass['Fácil']?.winPct ?? null },
    mediumWR: { c: c526.medium, d: diff.smoke.all.byClass['Médio']?.winPct ?? null },
    hardWR: { c: c526.hard, d: diff.smoke.all.byClass['Difícil']?.winPct ?? null },
    byTier: Object.fromEntries(TIER_ORDER.map((t) => [t, { c: c526.byTier[t]?.winPct ?? null, d: diff.smoke.all.byTier[t]?.winPct ?? null, dn: diff.smoke.all.byTier[t]?.n ?? 0 }])),
    r1WR: { c: c526.r1, d: diff.smoke.all.byRound.R1?.winPct ?? null },
    upsetAttempts: { c: c526.attempted, d: ups.smoke.all.attempted },
    upsetWon: { c: null, d: ups.smoke.all.won },
    upsetRate: { c: c526.upsets, d: ups.smoke.all.ratePct },
    rankAt2y: { c: 10, d: prog.smoke.normal.rank['2y']?.median ?? null },
    titlesAt2y: { c: 1, d: prog.smoke.normal.perYear[1]?.titles?.median ?? null },
  },
};
writeFileSync(resolve(ROOT, 'comparison-526c-vs-526d.json'), JSON.stringify(comparison, null, 2));

console.log(JSON.stringify({ gates: g, coverage: ups.smoke.all.opponentRankCoverage, fallback: { pct: fb.fallbackPct, total: fb.totalFallbackPairs }, byClass: diff.smoke.all.byClass, upsetAttempts: ups.smoke.all.attempted, upsetWon: ups.smoke.all.won }, null, 1));
