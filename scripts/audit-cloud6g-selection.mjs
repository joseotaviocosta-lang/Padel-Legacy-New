// CLOUD-6G — seleção de torneios e fluxo de inscrição (somente leitura).
// Usa funções reais de produção: EntryManager.evaluateTournamentEntry/buildAthleteEntryContext,
// circuitCatalog (config de tier, fit), WorldTourLifecycle.buildPlayerTournamentField (o MESMO
// construtor de campo que o sorteio do jogador usa) e o motor real (createMatch/playPoint).
// Nenhum arquivo de src/ é alterado. Mundo semeado via bootDrawCareer (kit da 5.26-D).
//
// Uso: node scripts/audit-cloud6g-selection.mjs [--n=60] [--out=<dir>]
//
// Partes:
//   1. divergência harness × jogo nos 4 CSVs da 6D (rank individual × rank da dupla)
//   2. composição do campo do jogador por (rank da dupla, tier, caminho) em 2 mundos
//   3. estratégias A/B/C: decisão com o mundo A (retido), resultado no mundo B (motor real)
//   4. oferta de força intermediária no mundo (OVR por faixa de rank individual)
import fs from 'node:fs';
import path from 'node:path';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { createBalanceAthlete } from '../src/engine/match/BalanceSimulator.js';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const N = Number(arg('n', 60));
const OUT = arg('out', 'reports/cloud-phase-6g-tournament-selection-audit/data');
const D6 = 'reports/cloud-phase-6d-career-progression-validation/data';
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];
const QUALIFYING_ROUNDS = 3; // Gold/Platinum/Masters: qualifyingSize 16 → 3 rodadas (QualifyingManager)
fs.mkdirSync(OUT, { recursive: true });

// ── utilidades de CSV (mesmo formato da 6F) ─────────────────────────────────
const csv = (f) => { const [h, ...rows] = fs.readFileSync(path.join(D6, f), 'utf8').trim().split('\n'); const cols = h.split(','); return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]))); };
const RUNS = ['normal-cloud6d-5a8350a', 'optimizer-cloud6d-5a8350a', 'normal-baseline-fbb0bc4', 'optimizer-baseline-fbb0bc4'];
const weeklyAt = (weekly, date) => { let best = null; for (const w of weekly) { if (w.date <= date) best = w; else break; } return best; };
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ── motor: partida e chave ──────────────────────────────────────────────────
const flat = (id, name, lvl, side) => createBalanceAthlete(id, name, Math.max(1, Math.round(lvl)), 'Equilibrado', side, {});
function play(teamA, teamB, seed) {
  let s = createMatch(teamA, teamB, { seed });
  let guard = 0;
  while (!s.finished && guard++ < 3000) s = playPoint(s);
  if (!s.finished) throw new Error(`partida ${seed} não terminou`);
  return s.winner === 'A';
}
const playerTeam = (st) => () => [flat('pl', 'Jogador', st.ovr, 'right'), flat('pt', 'Parceiro', st.partnerOvr, 'left')];
const oppTeam = (o) => () => [flat('o1', 'AdvE', o.m[0], 'left'), flat('o2', 'AdvD', o.m[1] ?? o.m[0], 'right')];

// Curva P(vitória) × Δ de força, calibrada no motor real (média da dupla 50, adversário 50−Δ... flat).
// Usada SÓ como regra aproximada de decisão da estratégia C (o jogador sabe que "mais fraco que o campo" perde).
function calibrateWinCurve(n = 120) {
  const pts = [];
  for (let delta = -30; delta <= 20; delta += 5) {
    let w = 0;
    for (let i = 0; i < n; i++) if (play([flat('pl', 'J', 50, 'right'), flat('pt', 'P', 50, 'left')], [flat('o1', 'A', 50 - delta, 'left'), flat('o2', 'B', 50 - delta, 'right')], `6g:cal:${delta}:${i}`)) w++;
    pts.push([delta, w / n]);
  }
  return pts;
}
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return 0;
};

// ═══ PARTE 1 — divergência harness × jogo (dados da 6D + funções reais) ═══════
const { rt: rtA, profile: profileA } = await bootDrawCareer('6g-world-a');
const { rt: rtB, profile: profileB } = await bootDrawCareer('6g-world-b');
const Entry = await rtA.load('/src/gameplay/worldTour/EntryManager.js');
const Catalog = await rtA.load('/src/lib/circuitCatalog.js');
const orderOf = (tier) => Catalog.getTournamentTierConfig(tier)?.order ?? 0;
const minRankingOf = (tier) => Number(Catalog.getTournamentTierConfig(tier)?.minRanking) || 0;
const realEntry = (tier, teamRank) => Entry.evaluateTournamentEntry({ tier }, Entry.buildAthleteEntryContext({}, teamRank, {}));
// filtro do harness (sim-progression-economy-v526.mjs:596): rank INDIVIDUAL <= minRanking do tier
const harnessVisible = (tier, indRank) => { const min = minRankingOf(tier); return !min || ((indRank || 9999) <= min); };

const part1 = {};
for (const run of RUNS) {
  const weekly = csv(`weekly-${run}.csv`); const tours = csv(`tournaments-${run}.csv`);
  const rows = []; let hiddenQualWeeks = 0; let rankedWeeks = 0;
  for (const w of weekly) {
    const ind = Number(w.rank) || 0; const team = Number(w.teamRank) || 0;
    if (!team) continue;
    rankedWeeks += 1;
    const tiersReal = TIERS.filter((t) => realEntry(t, team).eligible);
    const tiersHarness = TIERS.filter((t) => harnessVisible(t, ind) && realEntry(t, team).eligible);
    const hiddenByHarness = tiersReal.filter((t) => !tiersHarness.includes(t));
    if (hiddenByHarness.length) hiddenQualWeeks += 1;
    rows.push({ date: w.date, ind, team, real: tiersReal, harness: tiersHarness, hidden: hiddenByHarness });
  }
  // por inscrição: o tier jogado era elegível pelo rank da dupla? e visível pelo filtro individual?
  const played = tours.map((t) => { const w = weeklyAt(weekly, t.date); const ind = Number(w?.rank) || 0; const team = Number(w?.teamRank) || 0; const e = team ? realEntry(t.tier, team) : null; return { date: t.date, tier: t.tier, ind, team, path: e?.path || 'sem-ranking', realEligible: e ? e.eligible : t.tier === 'Silver' || t.tier === 'Bronze', harnessVisible: harnessVisible(t.tier, ind) }; });
  const byPath = played.reduce((a, p) => { a[p.path] = (a[p.path] || 0) + 1; return a; }, {});
  const harnessVisibleButRealIneligible = played.filter((p) => p.team && !p.realEligible);
  const gap = rows.map((r) => Math.abs(r.team - r.ind));
  // semanas em que o Gold era acessível por qualifying (451–900) pelo rank da dupla
  const goldQualWeeks = rows.filter((r) => r.team > 450 && r.team <= 900);
  part1[run] = {
    weeksWithTeamRank: rankedWeeks, weeksWhereHarnessHidesRealEligibleTier: hiddenQualWeeks,
    medianAbsGapIndividualVsTeam: med(gap), maxAbsGap: Math.max(0, ...gap),
    goldQualifyingOpenByTeamRankWeeks: goldQualWeeks.length,
    goldQualifyingOpenButHarnessHidWeeks: goldQualWeeks.filter((r) => r.hidden.includes('Gold')).length,
    tournamentsByEntryPath: byPath,
    playedButRealIneligible: harnessVisibleButRealIneligible.map((p) => `${p.date} ${p.tier} team=${p.team} ind=${p.ind}`),
    firstGoldPlayed: played.find((p) => p.tier === 'Gold') || null,
    goldPlayedByPath: played.filter((p) => p.tier === 'Gold').reduce((a, p) => { a[p.path] = (a[p.path] || 0) + 1; return a; }, {}),
    samples: rows.filter((r) => r.hidden.length).slice(0, 6),
  };
}
fs.writeFileSync(path.join(OUT, 'harness-vs-game-eligibility.json'), JSON.stringify(part1, null, 1));
console.log('PARTE 1 ok');

// ═══ PARTE 2 — composição do campo (mundo real, buildPlayerTournamentField) ═══
// Estados de carreira = linhas reais dos CSVs da 6D (rank individual, rank da dupla, OVR jogador/parceiro).
const stateAt = (run, date, label) => { const w = weeklyAt(csv(`weekly-${run}.csv`), date); return { label, run, date: w.date, ind: Number(w.rank), team: Number(w.teamRank), ovr: Number(w.ovr), partnerOvr: Number(w.partnerOvr) }; };
const STATES = [
  stateAt('normal-cloud6d-5a8350a', '2026-08-13', 'N1 normal ago/26'),
  stateAt('normal-cloud6d-5a8350a', '2026-10-30', 'N2 normal out/26'),
  stateAt('normal-cloud6d-5a8350a', '2027-02-04', 'N3 normal fev/27'),
  stateAt('normal-cloud6d-5a8350a', '2027-03-18', 'N4 normal mar/27'),
  stateAt('optimizer-cloud6d-5a8350a', '2026-10-29', 'O1 otimizador out/26'),
  stateAt('optimizer-cloud6d-5a8350a', '2027-02-07', 'O2 otimizador fev/27'),
  stateAt('optimizer-cloud6d-5a8350a', '2027-03-25', 'O3 otimizador mar/27'),
].map((s) => ({ ...s, avg: (s.ovr + s.partnerOvr) / 2 }));

async function makeTournaments(rt, profile) {
  const E = rt.localGame.entities; const out = {};
  for (const tier of TIERS) {
    out[tier] = await E.Tournament.create({ id: `g6-${tier}`, name: `6G ${tier}`, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', ...(tier === 'Gold' || tier === 'Masters' ? { main_draw_size: 24 } : {}) });
  }
  return out;
}
const TA = await makeTournaments(rtA, profileA);
const TB = await makeTournaments(rtB, profileB);
const WA = await rtA.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
const WB = await rtB.load('/src/gameplay/worldTour/WorldTourLifecycle.js');

const ovrOfPair = (pair) => (pair ? pair.athletes.map((a) => Math.round(Number(a.overall_rating || a.overall || 50))) : null);
async function fieldFor(W, tournaments, profile, tier, team, qualifying) {
  const f = await W.buildPlayerTournamentField({ tournament: tournaments[tier], profile, playerRank: team, playerTeamName: 'Dupla', partnerAthleteId: profile.partner_id || null, qualifyingRoundCount: qualifying ? QUALIFYING_ROUNDS : 0 });
  const opp = (id) => { const p = id ? f.pairsById.get(id) : null; const m = ovrOfPair(p); return p ? { m, avg: (m[0] + (m[1] ?? m[0])) / 2, rank: f.rankByPairId.get(id) || null } : null; };
  const entrantAvg = f.entrants.map((p) => { const m = ovrOfPair(p); return (m[0] + (m[1] ?? m[0])) / 2; }).sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null);
  return {
    main: f.mainOpponentIds.map(opp), qual: f.qualifyingOpponentIds.map(opp),
    entrants: { n: entrantAvg.length, min: entrantAvg[0] ?? null, p25: q(entrantAvg, .25), median: q(entrantAvg, .5), p75: q(entrantAvg, .75), max: entrantAvg[entrantAvg.length - 1] ?? null, ranks: f.entrants.map((p) => f.rankByPairId.get(p.id) || 0).sort((a, b) => a - b).filter((r) => r).slice(0, 3).concat(['...']).concat(f.entrants.map((p) => f.rankByPairId.get(p.id) || 0).sort((a, b) => a - b).filter((r) => r).slice(-2)) },
    diag: { candidatePool: f.diagnostics.candidatePool, eligiblePool: f.diagnostics.eligiblePool, preferredPool: f.diagnostics.preferredPool, realSelected: f.diagnostics.realSelected, rescueSelected: f.diagnostics.rescueSelected, unrankedSelected: f.diagnostics.unrankedSelected },
  };
}

const fields = { A: {}, B: {} };
const t0 = Date.now();
for (const st of STATES) {
  fields.A[st.label] = {}; fields.B[st.label] = {};
  for (const tier of TIERS) {
    const e = realEntry(tier, st.team);
    if (!e.eligible) continue;
    const qualifying = e.path === 'qualifying';
    fields.A[st.label][tier] = { path: e.path, ...(await fieldFor(WA, TA, profileA, tier, st.team, qualifying)) };
    fields.B[st.label][tier] = { path: e.path, ...(await fieldFor(WB, TB, profileB, tier, st.team, qualifying)) };
  }
}
console.log(`PARTE 2 ok (${Math.round((Date.now() - t0) / 1000)}s)`);
fs.writeFileSync(path.join(OUT, 'player-field-composition.json'), JSON.stringify({ states: STATES, fields }, null, 1));

// ═══ PARTE 3 — estratégias A/B/C ═════════════════════════════════════════════
const curve = calibrateWinCurve();
// avalia uma opção (campo do mundo B) com o motor real: n chaves seguidas; derrota elimina.
function evaluateOption(st, tier, opt, tag) {
  const cfg = Catalog.getTournamentTierConfig(tier);
  const rounds = [...(opt.path === 'qualifying' ? opt.qual.map((o) => ({ o, stage: 'q' })) : []), ...opt.main.map((o) => ({ o, stage: 'm' }))];
  let reachMain = 0; let wins1 = 0; let sumMainWon = 0; let sumPts = 0; let champ = 0;
  for (let i = 0; i < N; i++) {
    let mainWon = 0; let alive = true; let anyWin = false; let enteredMain = opt.path !== 'qualifying';
    for (let r = 0; r < rounds.length && alive; r++) {
      const { o, stage } = rounds[r];
      if (!o) { if (stage === 'm') mainWon += 1; continue; } // chave sem adversário projetado = bye (contado, ver null_rounds)
      const win = play(playerTeam(st)(), oppTeam(o)(), `6g:${tag}:${st.label}:${tier}:${i}:${r}`);
      if (win) { anyWin = true; if (stage === 'q' && r === QUALIFYING_ROUNDS - 1) enteredMain = true; if (stage === 'm') mainWon += 1; } else alive = false;
    }
    if (enteredMain && opt.path === 'qualifying') reachMain += 1;
    if (anyWin) wins1 += 1;
    if (alive && opt.main.length && mainWon >= opt.main.length) champ += 1;
    // pontos: só chave principal conta (qualifying eliminado = 0, premissa NÃO verificada); índice = rodadas vencidas
    const main = (opt.path === 'qualifying' ? enteredMain : true) ? Math.min(mainWon, cfg.roundPoints.length - 1) : null;
    if (main !== null) { sumMainWon += mainWon; sumPts += cfg.roundPoints[main]; }
  }
  return {
    pReachMain: opt.path === 'qualifying' ? +(reachMain / N).toFixed(2) : 1, pWinAny: +(wins1 / N).toFixed(2), eMainRoundsWon: +(sumMainWon / N).toFixed(2), ePoints: +(sumPts / N).toFixed(2), pChampion: +(champ / N).toFixed(2),
    nullMainRounds: opt.main.filter((x) => !x).length,
  };
}
// estimativa do jogador (decisão): usa o campo do mundo A (retido) e a curva Δ→P.
function estimate(st, tier, optA) {
  const cfg = Catalog.getTournamentTierConfig(tier);
  const seq = [...(optA.path === 'qualifying' ? optA.qual.map((o) => ({ o, stage: 'q' })) : []), ...optA.main.map((o) => ({ o, stage: 'm' }))].filter((x) => x.o);
  let alive = 1; let ePts = 0; let mainWon = 0; const pReach = [];
  for (const { o, stage } of seq) {
    const p = interp(curve, st.avg - o.avg);
    if (stage === 'm') { ePts += alive * (1 - p) * cfg.roundPoints[mainWon]; alive *= p; mainWon += 1; } else alive *= p;
  }
  ePts += alive * cfg.roundPoints[Math.min(mainWon, cfg.roundPoints.length - 1)] * (optA.main.length && mainWon >= optA.main.length ? 1 : 0);
  const first = seq[0]?.o || null;
  return { ePts: +ePts.toFixed(2), firstOppAvg: first ? first.avg : null, pFirst: first ? +interp(curve, st.avg - first.avg).toFixed(2) : null };
}

const strategies = {
  // A: reproduz o harness (normal/best-eligible): filtro rank individual ≤ minRanking + maior tier (order)
  A_harness: (st, opts) => opts.filter((x) => harnessVisible(x.tier, st.ind)).sort((a, b) => orderOf(b.tier) - orderOf(a.tier))[0],
  // A': mesma regra de "maior tier", mas com o conjunto REAL de elegíveis (rank da dupla, inclui qualifying)
  A_real: (st, opts) => [...opts].sort((a, b) => orderOf(b.tier) - orderOf(a.tier))[0],
  // B: adversário do 1º jogo mais próximo da força da dupla (estimativa vem do mundo A)
  B_closest: (st, opts) => [...opts].filter((x) => x.est.firstOppAvg !== null).sort((a, b) => Math.abs(a.est.firstOppAvg - st.avg) - Math.abs(b.est.firstOppAvg - st.avg))[0],
  // C: maximiza pontos de ranking esperados estimados ao longo da chave (força × dificuldade × pontos do tier)
  C_balanced: (st, opts) => [...opts].sort((a, b) => b.est.ePts - a.est.ePts || orderOf(a.tier) - orderOf(b.tier))[0],
};

const part3 = { curve, N, states: [] };
const totals = Object.fromEntries([...Object.keys(strategies), 'oracle'].map((k) => [k, { ePoints: 0, pWinAny: 0, eMainRoundsWon: 0, n: 0 }]));
for (const st of STATES) {
  const opts = Object.entries(fields.B[st.label]).map(([tier, optB]) => {
    const optA = fields.A[st.label][tier];
    return { tier, path: optB.path, est: estimate(st, tier, optA), real: evaluateOption(st, tier, optB, 'B'), optB };
  });
  const picks = {};
  for (const [name, fn] of Object.entries(strategies)) {
    const pick = fn(st, opts);
    picks[name] = pick ? { tier: pick.tier, path: pick.path, est: pick.est, real: pick.real } : null;
    if (pick) { const t = totals[name]; t.ePoints += pick.real.ePoints; t.pWinAny += pick.real.pWinAny; t.eMainRoundsWon += pick.real.eMainRoundsWon; t.n += 1; }
  }
  const best = [...opts].sort((a, b) => b.real.ePoints - a.real.ePoints)[0];
  picks.oracle = { tier: best.tier, path: best.path, real: best.real };
  const t = totals.oracle; t.ePoints += best.real.ePoints; t.pWinAny += best.real.pWinAny; t.eMainRoundsWon += best.real.eMainRoundsWon; t.n += 1;
  part3.states.push({ state: st, options: opts.map((o) => ({ tier: o.tier, path: o.path, est: o.est, real: o.real })), picks });
}
part3.totals = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { states: v.n, sumEPoints: +v.ePoints.toFixed(2), meanPWinAny: +(v.pWinAny / v.n).toFixed(2), meanMainRoundsWon: +(v.eMainRoundsWon / v.n).toFixed(2) }]));
fs.writeFileSync(path.join(OUT, 'strategy-comparison.json'), JSON.stringify(part3, null, 1));
console.log('PARTE 3 ok');

// ═══ PARTE 4 — oferta de força intermediária (atletas do mundo A) ═════════════
const athletes = (await rtA.localGame.entities.AthleteProfile.list('-world_ranking_points', 5000)) || [];
const alive = athletes.filter((a) => a && a.retired !== true && a.career_status !== 'aposentado');
const bands = [['<=200', 1, 200], ['201-450', 201, 450], ['451-700', 451, 700], ['701-1000', 701, 1000], ['>1000', 1001, 1e9]];
const ovrBins = [[0, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 101]];
const ranked = alive.map((a, i) => ({ ovr: Number(a.overall_rating || a.overall || 0), rank: Number(a.world_ranking || a.ranking_position || 0) || i + 1 }));
const part4 = Object.fromEntries(bands.map(([label, lo, hi]) => {
  const inBand = ranked.filter((a) => a.rank >= lo && a.rank <= hi);
  return [label, { n: inBand.length, medianOvr: med(inBand.map((a) => a.ovr)), bins: Object.fromEntries(ovrBins.map(([a, b]) => [`${a}-${b}`, inBand.filter((x) => x.ovr >= a && x.ovr < b).length])) }];
}));
fs.writeFileSync(path.join(OUT, 'world-strength-supply.json'), JSON.stringify({ athletes: alive.length, byIndividualRankBand: part4 }, null, 1));
console.log('PARTE 4 ok');

// ═══ PARTE 5 — sensibilidade com campos OBSERVADOS na carreira (6D, meio de carreira) ═══
// Os mundos A/B são fotos do dia ~8. Os CSVs da 6D trazem a força real dos adversários em 2026–2028.
// Aqui as opções usam a mediana observada por (tier, estágio, rodada) — mesma regra de decisão/avaliação das estratégias.
const ROUND_ORDER = {
  'Bronze|main': ['Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  'Silver|main': ['Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  'Gold|main': ['Primeira Rodada', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  'Platinum|main': ['Rodada de 32', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  'Masters|main': ['Primeira Rodada', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  'Gold|qualifying': ['Quartas do qualifying', 'Semifinal do qualifying', 'Rodada decisiva do qualifying'],
  'Platinum|qualifying': ['Quartas do qualifying', 'Semifinal do qualifying', 'Rodada decisiva do qualifying'],
  'Masters|qualifying': ['Quartas do qualifying', 'Semifinal do qualifying', 'Rodada decisiva do qualifying'],
};
const obsMatches = RUNS.filter((r) => r.includes('cloud6d')).flatMap((r) => csv(`matches-${r}.csv`));
const observed = {}; // chave "tier|stage" -> [{avg,n}] por rodada
for (const [key, labels] of Object.entries(ROUND_ORDER)) {
  const [tier, stage] = key.split('|'); let last = null;
  observed[key] = labels.map((label) => {
    const xs = obsMatches.filter((m) => m.tier === tier && m.stage === stage && m.round === label).map((m) => Number(m.oppStrength));
    const v = xs.length ? med(xs) : last; if (v !== null) last = v;
    return { avg: v, n: xs.length, m: v === null ? null : [v, v] };
  });
}
const part5 = { observed, states: [] };
const totals5 = Object.fromEntries([...Object.keys(strategies), 'oracle'].map((k) => [k, { ePoints: 0, pWinAny: 0, eMainRoundsWon: 0, n: 0 }]));
for (const st of STATES) {
  const opts = TIERS.map((tier) => {
    const e = realEntry(tier, st.team); if (!e.eligible) return null;
    const main = (observed[`${tier}|main`] || []).map((x) => (x.avg === null ? null : { m: x.m, avg: x.avg }));
    const qual = e.path === 'qualifying' ? (observed[`${tier}|qualifying`] || []).map((x) => (x.avg === null ? null : { m: x.m, avg: x.avg })) : [];
    if (!main.length || main.some((x) => !x) || qual.some((x) => !x)) return null; // sem observação suficiente para o tier/caminho (ex.: Masters qualifying)
    const optB = { path: e.path, main, qual };
    return { tier, path: e.path, est: estimate(st, tier, optB), real: evaluateOption(st, tier, optB, 'obs'), optB };
  }).filter(Boolean);
  const picks = {};
  for (const [name, fn] of Object.entries(strategies)) {
    const pick = fn(st, opts); picks[name] = pick ? { tier: pick.tier, path: pick.path, real: pick.real } : null;
    if (pick) { const t = totals5[name]; t.ePoints += pick.real.ePoints; t.pWinAny += pick.real.pWinAny; t.eMainRoundsWon += pick.real.eMainRoundsWon; t.n += 1; }
  }
  const best = [...opts].sort((a, b) => b.real.ePoints - a.real.ePoints)[0];
  picks.oracle = { tier: best.tier, path: best.path, real: best.real };
  const t = totals5.oracle; t.ePoints += best.real.ePoints; t.pWinAny += best.real.pWinAny; t.eMainRoundsWon += best.real.eMainRoundsWon; t.n += 1;
  part5.states.push({ state: st, options: opts.map((o) => ({ tier: o.tier, path: o.path, est: o.est, real: o.real })), picks });
}
part5.totals = Object.fromEntries(Object.entries(totals5).map(([k, v]) => [k, { states: v.n, sumEPoints: +v.ePoints.toFixed(2), meanPWinAny: +(v.pWinAny / v.n).toFixed(2), meanMainRoundsWon: +(v.eMainRoundsWon / v.n).toFixed(2) }]));
fs.writeFileSync(path.join(OUT, 'strategy-comparison-observed-fields.json'), JSON.stringify(part5, null, 1));
console.log('PARTE 5 ok');

await rtA.close(); await rtB.close();
console.log('--- mundos A/B (dia ~8)'); console.log(JSON.stringify(part3.totals));
console.log('--- campos observados 6D'); console.log(JSON.stringify(part5.totals));
