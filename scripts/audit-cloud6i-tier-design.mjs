// CLOUD-6I — desenho da progressão competitiva Silver→Gold (somente leitura / experimental).
// NENHUM arquivo de src/ é alterado. As alternativas A–D são políticas de seleção aplicadas FORA do
// jogo, sobre o pool elegível real (buildCanonicalPairs + evaluateTournamentEntry com aiFieldContext +
// fieldAdmissionScore + chooseTournament, todos exportados pela produção). O baseline é validado contra
// buildPlayerTournamentField (mesma função do sorteio do jogador) via __PL527I_FIELD_OBSERVER.
// O caminho do jogador usa buildSeededDrawSlots real e a mesma projeção "melhor seed do bloco-espelho".
// A chance de vitória por partida vem de uma curva Δ-de-força calibrada no motor real (createMatch/playPoint),
// por nível de dupla. Não existe segundo motor.
//
// Uso: node scripts/audit-cloud6i-tier-design.mjs [--seeds=3] [--cal=80] [--reuseCurves=1] [--out=<dir>]
import fs from 'node:fs';
import path from 'node:path';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { createBalanceAthlete } from '../src/engine/match/BalanceSimulator.js';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const NSEEDS = Number(arg('seeds', 3));
const CAL = Number(arg('cal', 80));
const OUT = arg('out', 'reports/cloud-phase-6i-competitive-tier-design/data');
fs.mkdirSync(OUT, { recursive: true });

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];
const PLAYER_OVRS = [45, 55, 65, 75];
const ELITE_OVRS = [75, 85];
const q = (arr, p) => { const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const dist = (arr) => ({ n: arr.length, min: r1(q(arr, 0)), p25: r1(q(arr, .25)), median: r1(q(arr, .5)), p75: r1(q(arr, .75)), max: r1(q(arr, 1)), mean: r1(mean(arr)) });
const band = (arr, lo, hi) => (arr.length ? r2(arr.filter((x) => x >= lo && x < hi).length / arr.length) : null);

// ── motor real: curva P(vitória) × Δ por nível de dupla ─────────────────────
const flat = (id, lvl, side) => createBalanceAthlete(id, id, Math.max(1, Math.round(lvl)), 'Equilibrado', side, {});
function play(a, b, seed) {
  let s = createMatch(a, b, { seed }); let g = 0;
  while (!s.finished && g++ < 3000) s = playPoint(s);
  if (!s.finished) throw new Error(`partida ${seed} não terminou`);
  return s.winner === 'A';
}
function calibrate(level) {
  const pts = [];
  for (let delta = -40; delta <= 25; delta += 5) {
    const opp = Math.max(1, level - delta); let w = 0;
    for (let i = 0; i < CAL; i++) if (play([flat('p1', level, 'right'), flat('p2', level, 'left')], [flat('o1', opp, 'left'), flat('o2', opp, 'right')], `6i:cal:${level}:${delta}:${i}`)) w++;
    pts.push([delta, w / CAL]);
  }
  return pts;
}
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return 0;
};
const t0 = Date.now();
const CURVES = {};
const curveFile = path.join(OUT, 'win-curves.json');
if (arg('reuseCurves', '0') === '1' && fs.existsSync(curveFile)) Object.assign(CURVES, JSON.parse(fs.readFileSync(curveFile, 'utf8')).curves);
else for (const lvl of [...new Set([...PLAYER_OVRS, ...ELITE_OVRS])]) CURVES[lvl] = calibrate(lvl);
console.log(`curvas calibradas (${Math.round((Date.now() - t0) / 1000)}s)`);
fs.writeFileSync(path.join(OUT, 'win-curves.json'), JSON.stringify({ cal: CAL, curves: CURVES }, null, 1));

// ── por mundo (semente) ─────────────────────────────────────────────────────
const results = { seeds: [], curvesCal: CAL };
const SEEDS = Array.from({ length: NSEEDS }, (_, i) => `6i-world-${i + 1}`);

for (const seedName of SEEDS) {
  const { rt, profile } = await bootDrawCareer(seedName);
  const E = rt.localGame.entities;
  const Entry = await rt.load('/src/gameplay/worldTour/EntryManager.js');
  const Catalog = await rt.load('/src/lib/circuitCatalog.js');
  const W = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const Settle = await rt.load('/src/gameplay/worldTour/tournamentSettlement.js');
  const AI = await rt.load('/src/gameplay/worldTour/TournamentSelectionAI.js');

  const tournaments = {};
  for (const tier of TIERS) {
    tournaments[tier] = await E.Tournament.create({ id: `i6-${tier}`, name: `6I ${tier}`, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', ...(tier === 'Gold' || tier === 'Masters' ? { main_draw_size: 24 } : {}) });
  }

  // pool elegível — réplica do que buildPlayerTournamentField faz (ver WorldTourLifecycle.js:1107-1190)
  const [rawAthletes, partnerships, allTournaments] = await Promise.all([
    E.AthleteProfile.list('-world_ranking_points', 5000), E.Partnership.list('-created_date', 1200).catch(() => []), E.Tournament.list('start_date', 2000),
  ]);
  const athletes = (rawAthletes || []).filter((a) => a && a.retired !== true && a.career_status !== 'aposentado');
  const allPairs = W.buildCanonicalPairs(partnerships, athletes);
  const committed = W.committedPairIdsForWindow([tournaments.Gold], allTournaments);
  const pool = allPairs.filter((p) => !committed.has(p.id) && !p.athletes.some((a) => a.id === profile.partner_id));
  const { pairSeedRank } = await W.createPairSeedRankResolver();
  const ovrOf = (p) => p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / p.athletes.length;
  const entryRankOf = (p) => { const rs = p.athletes.map((a) => Entry.resolveEntryRank(a)).filter((v) => v > 0); return rs.length ? Math.round(mean(rs)) : 0; };
  const repOf = (p) => ({ ...p.athletes[0], overall_rating: ovrOf(p), ...(entryRankOf(p) > 0 ? { rank: entryRankOf(p), ranking_position: entryRankOf(p) } : {}) });

  const info = (p) => ({ id: p.id, name: p.name, ovr: ovrOf(p), rank: pairSeedRank(p) || 0, entryRank: entryRankOf(p), pair: p });
  const eligibleFor = (tier) => pool.filter((p) => Entry.evaluateTournamentEntry(tournaments[tier], repOf(p), { aiFieldContext: true }).eligible);

  // seleção de produção replicada (ordem: preferidos primeiro; Silver com deslocamento) — baseline
  const NEED = (tier) => (2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount) || 4)) - 1;
  const weekT = (tier) => { // mesma janela de ±4 dias que buildPlayerTournamentField usa para a preferência da IA
    const t = tournaments[tier]; const t0 = new Date(`${t.start_date}T00:00:00Z`).getTime();
    return [t, ...allTournaments.filter((x) => x?.id !== t.id && x?.start_date && Math.abs(new Date(`${x.start_date}T00:00:00Z`).getTime() - t0) <= 4 * 86400000)];
  };
  function productionSelection(tier, elig) {
    const t = tournaments[tier];
    const preferred = new Set();
    for (const p of elig) {
      try { const c = AI.chooseTournament(weekT(tier), repOf(p), { strategy: repOf(p).careerStrategy, currentRegion: repOf(p).currentRegion, aiFieldContext: true }); if (c?.decision === 'play' && c?.tournament?.id === t.id) preferred.add(p.id); } catch { /* best-effort */ }
    }
    const cut = (p) => W.fieldAdmissionScore(p, t);
    const order = (l) => [...l].sort((a, b) => cut(b) - cut(a) || String(a.id).localeCompare(String(b.id)));
    const primary = order(elig.filter((p) => preferred.has(p.id)));
    const secondary = order(elig.filter((p) => !preferred.has(p.id)));
    return { ordered: [...primary, ...secondary], preferredN: primary.length };
  }

  // observer do campo REAL (validação do baseline + qualifying real)
  const realField = {};
  async function realFieldFor(tier, playerRank, qualifying) {
    let obs = null; globalThis.__PL527I_FIELD_OBSERVER = (o) => { obs = o; };
    const f = await W.buildPlayerTournamentField({ tournament: tournaments[tier], profile, playerRank, playerTeamName: 'Dupla', partnerAthleteId: profile.partner_id || null, qualifyingRoundCount: qualifying ? 3 : 0 });
    globalThis.__PL527I_FIELD_OBSERVER = undefined;
    return { f, obs };
  }

  const world = { seed: seedName, careerDate: profile.career_date, tiers: {}, alternatives: {}, seeding: {}, validation: {} };

  // ═══ PARTE 1 — diagnóstico do campo real por tier ═════════════════════════
  const QUAL_RANK = { Bronze: 600, Silver: 600, Gold: 800, Platinum: 500, Masters: 400 };
  const DIRECT_RANK = { Bronze: 600, Silver: 600, Gold: 300, Platinum: 250, Masters: 150 };
  for (const tier of TIERS) {
    const elig = eligibleFor(tier).map(info);
    const direct = await realFieldFor(tier, DIRECT_RANK[tier], false);
    const fieldO = direct.obs?.field || [];
    const fieldOvr = fieldO.map((x) => x.ovr); const fieldRank = fieldO.map((x) => x.rank).filter(Boolean);
    const mainOpp = direct.f.mainOpponentIds.map((id) => (id ? direct.f.pairsById.get(id) : null));
    const mainOppOvr = mainOpp.map((p) => (p ? ovrOf(p) : null));
    const mainOppRank = mainOpp.map((p) => (p ? direct.f.rankByPairId.get(p.id) : null));
    const seeds = [...direct.f.entrants].sort((a, b) => (direct.f.rankByPairId.get(a.id) || 1e9) - (direct.f.rankByPairId.get(b.id) || 1e9)).slice(0, 8);
    const hasQual = !!Catalog.getTournamentTierConfig(tier).qualifyingSize;
    let qual = null;
    if (hasQual) {
      const qf = await realFieldFor(tier, QUAL_RANK[tier], true);
      const qp = qf.f.qualifyingOpponentIds.map((id) => qf.f.pairsById.get(id));
      qual = { opponents: qp.map((p) => ({ ovr: r1(ovrOf(p)), rank: qf.f.rankByPairId.get(p.id) })), ovrMean: r1(mean(qp.map(ovrOf))), mainFieldMedian: r1(q(qf.obs?.field?.map((x) => x.ovr) || [], .5)) };
    }
    world.tiers[tier] = {
      eligiblePool: { n: elig.length, ovr: dist(elig.map((e) => e.ovr)), rank: dist(elig.map((e) => e.rank).filter(Boolean)), share50to70: band(elig.map((e) => e.ovr), 50, 70), shareBelow50: band(elig.map((e) => e.ovr), 0, 50), shareAtLeast70: band(elig.map((e) => e.ovr), 70, 1e9) },
      mainField: { n: fieldO.length, ovr: dist(fieldOvr), rank: dist(fieldRank), share50to70: band(fieldOvr, 50, 70), shareBelow50: band(fieldOvr, 0, 50), shareAtLeast70: band(fieldOvr, 70, 1e9), preferredShare: r2(fieldO.filter((x) => x.preferred).length / Math.max(1, fieldO.length)), offset: direct.obs?.offset, rescue: direct.obs?.rescue },
      seedsTop8: seeds.map((p) => ({ rank: direct.f.rankByPairId.get(p.id), ovr: r1(ovrOf(p)) })),
      firstRounds: mainOpp.map((p, i) => ({ round: i + 1, ovr: mainOppOvr[i] === null ? null : r1(mainOppOvr[i]), rank: mainOppRank[i] })),
      qualifying: qual,
      diag: direct.f.diagnostics,
    };
    realField[tier] = direct;
  }

  // impacto de selecionar os melhores / medianos / piores elegíveis (ordem de produção, mesma quantidade de vagas)
  world.extremes = {};
  for (const tier of TIERS) {
    const need = (2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount))) - 1;
    const { ordered } = productionSelection(tier, eligibleFor(tier));
    const slice = (a, b) => ordered.slice(a, b);
    const mid = Math.max(0, Math.floor((ordered.length - need) / 2));
    const st = (l) => ({ ovrMedian: r1(q(l.map(ovrOf), .5)), ovrP25: r1(q(l.map(ovrOf), .25)), ovrP75: r1(q(l.map(ovrOf), .75)), entryRankMedian: q(l.map(entryRankOf).filter(Boolean), .5) });
    world.extremes[tier] = { eligible: ordered.length, topByAdmission: st(slice(0, need)), middle: st(slice(mid, mid + need)), bottomByAdmission: st(slice(Math.max(0, ordered.length - need))) };
  }

  // validação do baseline replicado × função real (Gold, Silver, Bronze)
  for (const tier of ['Bronze', 'Silver', 'Gold']) {
    const elig = eligibleFor(tier);
    const { ordered } = productionSelection(tier, elig);
    const need = NEED(tier) === 31 || tier === 'Gold' || tier === 'Masters' ? 31 : 15;
    const offset = realField[tier].obs?.offset || 0;
    const mine = ordered.slice(offset, offset + need);
    const realIds = new Set(realField[tier].f.entrants.map((p) => p.id));
    const overlap = mine.filter((p) => realIds.has(p.id)).length;
    world.validation[tier] = { replicaSelected: mine.length, realSelected: realIds.size, overlap, medianOvrReplica: r1(q(mine.map(ovrOf), .5)), medianOvrReal: r1(q(realField[tier].obs.field.map((x) => x.ovr), .5)), offset };
  }

  // ═══ PARTE 2 — alternativas A–D (políticas fora do jogo) ══════════════════
  // Cada política devolve { main: [pair], qual: [pair] } para (tier, caminho).
  const needOf = (tier) => (2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount))) - 1;
  const pctWindow = (list, from, to) => list.slice(Math.floor(list.length * from), Math.max(Math.floor(list.length * from) + 1, Math.floor(list.length * to)));
  const byOvrAsc = (list) => [...list].sort((a, b) => ovrOf(a) - ovrOf(b));
  const cache = {};
  const prod = (tier) => (cache[tier] ||= productionSelection(tier, eligibleFor(tier)));
  const weakestQual = (tier, excludeIds, n = 3) => eligibleFor(tier).filter((p) => !excludeIds.has(p.id)).sort((a, b) => (entryRankOf(b) || 9e9) - (entryRankOf(a) || 9e9)).slice(0, n);

  // Cada política devolve { main: [pair], qual: [pair] } para o tier.
  const POLICIES = {
    // baseline — réplica validada da produção
    BASE: (tier) => {
      const t = prod(tier); const off = tier === 'Silver' ? (realField.Silver.obs?.offset || 0) : 0;
      const main = t.ordered.slice(off, off + needOf(tier));
      return { main, qual: weakestQual(tier, new Set(main.map((p) => p.id))) };
    },
    // A1 — redistribuição: Silver passa a usar a banda do meio (deslocamento 50% em vez de 25%) e Gold deixa de pegar o topo absoluto (pula o 25% mais forte)
    A1: (tier) => {
      const t = prod(tier); const need = needOf(tier);
      if (tier === 'Silver') { const off = Math.max(need, Math.round(t.ordered.length * 0.5)); return { main: t.ordered.slice(off, off + need), qual: [] }; }
      if (tier === 'Gold') { const off = Math.round(t.ordered.length * 0.25); const main = t.ordered.slice(off, off + need); return { main, qual: weakestQual(tier, new Set(main.map((p) => p.id))) }; }
      return POLICIES.BASE(tier);
    },
    // A2 — como A1 mas Silver mais fundo (deslocamento 60%) e Gold pulando 40% do topo: curva ascendente mais suave
    A2: (tier) => {
      const t = prod(tier); const need = needOf(tier);
      if (tier === 'Silver') { const off = Math.max(need, Math.round(t.ordered.length * 0.6)); return { main: t.ordered.slice(off, off + need), qual: [] }; }
      if (tier === 'Gold') { const off = Math.round(t.ordered.length * 0.4); const main = t.ordered.slice(off, off + need); return { main, qual: weakestQual(tier, new Set(main.map((p) => p.id))) }; }
      return POLICIES.BASE(tier);
    },
    // B — qualifying ampliado/graduado: mantém a chave principal do baseline, mas o qualifying (3 rodadas) deixa de ser "as 3 piores":
    //     vem em degraus de percentil do pool elegível fora da chave (p25, p50, p75 da força) — transição gradual.
    B1: (tier) => {
      const base = POLICIES.BASE(tier);
      if (!Catalog.getTournamentTierConfig(tier).qualifyingSize) return base;
      const outside = byOvrAsc(eligibleFor(tier).filter((p) => !base.main.some((m) => m.id === p.id)));
      const pick = (pc) => outside[Math.min(outside.length - 1, Math.floor(outside.length * pc))];
      return { main: base.main, qual: [pick(0.25), pick(0.5), pick(0.75)].filter(Boolean) };
    },
    // B2 — B1 + rodada intermediária: antes da chave principal o jogador enfrenta uma dupla do degrau (p60 fora da chave) — 4 jogos de transição
    B2: (tier) => {
      const base = POLICIES.BASE(tier);
      if (!Catalog.getTournamentTierConfig(tier).qualifyingSize) return base;
      const outside = byOvrAsc(eligibleFor(tier).filter((p) => !base.main.some((m) => m.id === p.id)));
      const pick = (pc) => outside[Math.min(outside.length - 1, Math.floor(outside.length * pc))];
      return { main: base.main, qual: [pick(0.2), pick(0.4), pick(0.6), pick(0.8)].filter(Boolean) };
    },
    // A3 / A4 — componentes de A1 isolados (Silver mais "central" apenas; Gold sem o topo absoluto apenas)
    A3: (tier) => {
      if (tier !== 'Silver') return POLICIES.BASE(tier);
      const t = prod(tier); const need = needOf(tier); const off = Math.max(need, Math.round(t.ordered.length * 0.5));
      return { main: t.ordered.slice(off, off + need), qual: [] };
    },
    A4: (tier) => {
      if (tier !== 'Gold') return POLICIES.BASE(tier);
      return POLICIES.A1(tier);
    },
    // A5 — Silver ESTRATIFICADO: 15 duplas espaçadas uniformemente na janela p25–p75 do pool fraco-primeiro (gradiente interno: rodadas iniciais fracas, finais intermediárias)
    A5: (tier) => {
      if (tier !== 'Silver') return POLICIES.BASE(tier);
      const t = prod(tier); const need = needOf(tier); const lo = Math.round(t.ordered.length * 0.25); const hi = Math.round(t.ordered.length * 0.75);
      const win = t.ordered.slice(lo, hi); const step = (win.length - 1) / (need - 1);
      return { main: Array.from({ length: need }, (_, i) => win[Math.round(i * step)]), qual: [] };
    },
    // Varredura do Silver (só tier Silver; demais = BASE): deslocamento simples S<pct> e janela estratificada W<lo>_<hi>
    ...Object.fromEntries([0.35, 0.4, 0.45].map((pct) => [`S${Math.round(pct * 100)}`, (tier) => {
      if (tier !== 'Silver') return POLICIES.BASE(tier);
      const t = prod(tier); const need = needOf(tier); const off = Math.max(need, Math.round(t.ordered.length * pct));
      return { main: t.ordered.slice(off, off + need), qual: [] };
    }])),
    ...Object.fromEntries([[0.25, 0.9], [0.35, 0.85], [0.4, 0.95]].map(([lo, hi]) => [`W${Math.round(lo * 100)}_${Math.round(hi * 100)}`, (tier) => {
      if (tier !== 'Silver') return POLICIES.BASE(tier);
      const t = prod(tier); const need = needOf(tier); const a = Math.round(t.ordered.length * lo); const b = Math.round(t.ordered.length * hi);
      const win = t.ordered.slice(a, b); const step = (win.length - 1) / (need - 1);
      return { main: Array.from({ length: need }, (_, i) => win[Math.round(i * step)]), qual: [] };
    }])),
    // B3 — qualifying por VIZINHANÇA DE RANK: os 3 adversários (do pool inteiro, não só dos elegíveis ao tier) mais próximos do rank da dupla
    //      (informação que o jogo tem na inscrição — não usa OVR). B4 = B3 com 4 rodadas (rodada intermediária extra).
    B3: (tier, rank) => {
      const base = POLICIES.BASE(tier);
      if (!Catalog.getTournamentTierConfig(tier).qualifyingSize) return base;
      const mainIds = new Set(base.main.map((p) => p.id));
      const near = pool.filter((p) => !mainIds.has(p.id) && (pairSeedRank(p) || 0) > 0).sort((a, b) => Math.abs(pairSeedRank(a) - rank) - Math.abs(pairSeedRank(b) - rank));
      return { main: base.main, qual: near.slice(0, 3) };
    },
    B4: (tier, rank) => {
      const base = POLICIES.BASE(tier);
      if (!Catalog.getTournamentTierConfig(tier).qualifyingSize) return base;
      const mainIds = new Set(base.main.map((p) => p.id));
      const near = pool.filter((p) => !mainIds.has(p.id) && (pairSeedRank(p) || 0) > 0).sort((a, b) => Math.abs(pairSeedRank(a) - rank) - Math.abs(pairSeedRank(b) - rank));
      return { main: base.main, qual: near.slice(0, 4) };
    },
    // C — composição por ADEQUAÇÃO AO RANK (rankCandidatesByTierFit, a mesma curva do rescue): sem fraco-primeiro em Bronze/Silver nem corte por força no Gold
    C1: (tier) => {
      const elig = eligibleFor(tier);
      const main = W.rankCandidatesByTierFit(elig, tournaments[tier]).slice(0, needOf(tier));
      return { main, qual: weakestQual(tier, new Set(main.map((p) => p.id))) };
    },
    // C2 — composição por ADEQUAÇÃO, mas Bronze/Silver ordenados do mais fraco ao mais forte DENTRO do tier de rank (Bronze mantido como produção, Silver central, Gold pelo fit)
    C2: (tier) => {
      if (tier === 'Bronze') return POLICIES.BASE(tier);
      return POLICIES.C1(tier);
    },
    // D — categoria intermediária conceitual ("Silver+/Gold Lite"): duplas elegíveis ao Gold cujos ranks de dupla caem em 400–900,
    //     as mais próximas do centro (650); sem qualifying. Avaliada como se fosse um tier novo.
    D: (tier) => {
      if (tier !== 'Gold') return POLICIES.BASE(tier);
      const elig = eligibleFor('Gold');
      const center = 650;
      const main = [...elig].sort((a, b) => Math.abs((pairSeedRank(a) || entryRankOf(a) || 9e9) - center) - Math.abs((pairSeedRank(b) || entryRankOf(b) || 9e9) - center)).slice(0, needOf('Gold'));
      return { main, qual: [] };
    },
  };

  // projeção do caminho do jogador — MESMA lógica de buildPlayerTournamentField (bloco-espelho; seed mais forte)
  function projectPath(selected, tier, playerSeedRank) {
    const cfg = Catalog.getTournamentTierConfig(tier);
    const roundCount = Math.max(1, Number(cfg.roundCount));
    const player = { id: '__player__', name: 'Dupla', seedRank: playerSeedRank, strength: 0, isPlayer: true };
    const ents = selected.map((p) => ({ id: p.id, name: p.name, seedRank: pairSeedRank(p) || 0, strength: ovrOf(p), pair: p }));
    const { slots } = Settle.buildSeededDrawSlots({ entrants: [...ents, player], tournamentId: `${tournaments[tier].id}:player-field` });
    const playerSlot = slots.findIndex((e) => e?.isPlayer);
    const used = new Set(); const path = [];
    for (let r = 0; r < roundCount; r++) {
      const bs = 2 ** r; const start = Math.floor(playerSlot / bs) * bs;
      const sib = (Math.floor(start / bs) % 2 === 0) ? start + bs : start - bs;
      const sibling = slots.slice(sib, sib + bs).filter((e) => e && !e.isPlayer);
      if (!sibling.length) { path.push(null); continue; }
      const seedOf = (e) => (Number(e.seedRank) > 0 ? Number(e.seedRank) : Infinity);
      const ranked = [...sibling].sort((a, b) => seedOf(a) - seedOf(b));
      const chosen = ranked.find((e) => !used.has(e.id)) || ranked[0];
      used.add(chosen.id); path.push({ ovr: ovrOf(chosen.pair), rank: chosen.seedRank || null });
    }
    return path;
  }

  const bracketSizeOf = (tier) => 2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount));
  const currentSeed = (tier, rank) => (rank > 0 ? Math.min(Math.round(rank), bracketSizeOf(tier)) : Math.round(bracketSizeOf(tier) * 0.75));

  // avalia (path de oponentes qual+main) para um nível de dupla, analiticamente com a curva do motor
  function evalPath(qualOpps, mainPath, lvl) {
    const curve = CURVES[lvl];
    let alive = 1; let eWins = 0; const deltas = [];
    const seq = [...qualOpps.map((o) => ({ o, st: 'q' })), ...mainPath.map((o) => ({ o, st: 'm' }))];
    for (const { o, st } of seq) {
      if (!o) continue;
      const d = lvl - o.ovr; const p = interp(curve, d);
      deltas.push(d);
      eWins += alive * p; alive *= p;
    }
    const firstReal = seq.find((s) => s.o);
    const pWinFirst = firstReal ? interp(curve, lvl - firstReal.o.ovr) : null;
    // P(chegar à chave principal) e P(vencer ao menos uma partida da CHAVE PRINCIPAL)
    let aliveQ = 1; for (const o of qualOpps) if (o) aliveQ *= interp(curve, lvl - o.ovr);
    const firstMain = mainPath.find((o) => o);
    const pWinMainR1 = firstMain ? aliveQ * interp(curve, lvl - firstMain.ovr) : null;
    return {
      pWinFirstMatch: r2(pWinFirst), pReachMain: r2(aliveQ), pWinMainR1: r2(pWinMainR1), eWins: r2(eWins), pChampion: r2(alive),
      meanDelta: r1(mean(deltas)), r1Delta: firstMain ? r1(lvl - firstMain.ovr) : null,
      competitiveShare: deltas.length ? r2(deltas.filter((d) => Math.abs(d) <= 10).length / deltas.length) : null,
      hopelessShare: deltas.length ? r2(deltas.filter((d) => d <= -20).length / deltas.length) : null,
    };
  }

  // Ranks de dupla por caminho de entrada (elegibilidade real): Silver 600; Gold direto 300 / qualifying 600 / 800
  const SCEN = [
    { key: 'Bronze', tier: 'Bronze', rank: 600, qual: false },
    { key: 'Silver', tier: 'Silver', rank: 600, qual: false },
    { key: 'Gold-direct(300)', tier: 'Gold', rank: 300, qual: false },
    { key: 'Gold-qual(600)', tier: 'Gold', rank: 600, qual: true },
    { key: 'Platinum-qual(500)', tier: 'Platinum', rank: 500, qual: true },
    { key: 'Masters-direct(150)', tier: 'Masters', rank: 150, qual: false },
  ];
  for (const [name, fn] of Object.entries(POLICIES)) {
    world.alternatives[name] = {};
    for (const sc of SCEN) {
      const e = Entry.evaluateTournamentEntry({ tier: sc.tier }, Entry.buildAthleteEntryContext({}, sc.rank, {}));
      const sel = fn(sc.tier, sc.rank);
      const path = projectPath(sel.main, sc.tier, currentSeed(sc.tier, sc.rank));
      const qualOpps = sc.qual ? sel.qual.map((p) => ({ ovr: ovrOf(p), rank: pairSeedRank(p) || null })) : [];
      const fieldOvr = sel.main.map(ovrOf);
      world.alternatives[name][sc.key] = {
        eligible: e.eligible, entryPath: e.path,
        field: { n: sel.main.length, ovr: dist(fieldOvr), rank: dist(sel.main.map((p) => pairSeedRank(p)).filter(Boolean)), share50to70: band(fieldOvr, 50, 70) },
        qualifyingOvr: sc.qual ? sel.qual.map((p) => r1(ovrOf(p))) : null,
        path: path.map((x) => (x ? { ovr: r1(x.ovr), rank: x.rank } : null)),
        byLevel: Object.fromEntries([...PLAYER_OVRS, ...ELITE_OVRS].map((lvl) => [lvl, evalPath(qualOpps, path, lvl)])),
      };
    }
  }

  // ═══ PARTE 3 — seeding (Etapa 5) — Gold direto e Silver; ranks reais da dupla ═══
  const SEED_RANKS = [150, 300, 443, 600, 800];
  for (const tier of ['Silver', 'Gold']) {
    const base = POLICIES.BASE(tier);
    world.seeding[tier] = {};
    for (const rk of SEED_RANKS) {
      const entryOk = Entry.evaluateTournamentEntry({ tier }, Entry.buildAthleteEntryContext({}, rk, {})).eligible;
      const variants = {
        current: currentSeed(tier, rk),                       // min(rank, bracketSize) — produção
        real: rk,                                             // rank real da dupla
        // regra oficial já modelada: seeds protegidos = primeiros seedCountForDrawSize; fora deles, sorteio determinístico — o seed REAL decide quem está entre eles
        realCapped: rk,
      };
      world.seeding[tier][rk] = { entryEligible: entryOk };
      for (const [vn, sr] of Object.entries(variants)) {
        const path = projectPath(base.main, tier, sr);
        world.seeding[tier][rk][vn] = {
          seedRank: sr, path: path.map((x) => (x ? { ovr: r1(x.ovr), rank: x.rank } : null)),
          byLevel: Object.fromEntries(PLAYER_OVRS.map((lvl) => [lvl, evalPath([], path, lvl)])),
        };
      }
    }
  }
  results.seeds.push(world);
  console.log(`mundo ${seedName} ok (${Math.round((Date.now() - t0) / 1000)}s)`);
  await rt.close();
}
fs.writeFileSync(path.join(OUT, 'tier-design-experiments.json'), JSON.stringify(results, null, 1));
console.log('feito');
