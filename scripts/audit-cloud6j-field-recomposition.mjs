// CLOUD-6J — validação da recomposição estratificada dos campos (somente leitura / experimental).
// NENHUM arquivo de src/ é alterado. Reusa as funções reais de produção (buildPlayerTournamentField,
// buildCanonicalPairs, evaluateTournamentEntry, fieldAdmissionScore, chooseTournament, buildSeededDrawSlots,
// buildInitialAttributes) e o motor real (createMatch/playPoint). Políticas alternativas são aplicadas FORA do jogo
// sobre o pool elegível real, e o baseline é validado contra a função real em cada semente e em cada preset.
//
// Uso: node scripts/audit-cloud6j-field-recomposition.mjs [--seeds=4] [--cal=100] [--reuseCurves=1] [--out=<dir>]
import fs from 'node:fs';
import path from 'node:path';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { createBalanceAthlete } from '../src/engine/match/BalanceSimulator.js';
import { buildInitialAttributes } from '../src/lib/initialCareerProfiles.js';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const NSEEDS = Number(arg('seeds', 4));
const CAL = Number(arg('cal', 100));
const OUT = arg('out', 'reports/cloud-phase-6j-field-recomposition-validation/data');
fs.mkdirSync(OUT, { recursive: true });

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];
const LEVELS = [22, 30, 40, 45, 55, 65, 75];            // OVR da dupla (média dos dois atletas)
const q = (arr, p) => { const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const dist = (arr) => ({ n: arr.length, min: r1(q(arr, 0)), p25: r1(q(arr, .25)), median: r1(q(arr, .5)), p75: r1(q(arr, .75)), max: r1(q(arr, 1)), mean: r1(mean(arr)) });
const band = (arr, lo, hi) => (arr.length ? r2(arr.filter((x) => x >= lo && x < hi).length / arr.length) : null);

// ── motor real: curvas P(vitória) × OVR do adversário (adversário do mundo = atributos planos, como em produção) ──
// Produção: AthleteProfile do mundo só tem `overall_rating` ⇒ normalizePlayer usa atributos = OVR (planos).
// Só o lado do jogador tem atributos desiguais. Cenários de dupla (OVR da dupla = média dos dois atletas):
const STYLE_LABEL = { controle: 'Controle', ofensivo: 'Ofensivo', defensivo: 'Defensivo', equilibrado: 'Equilibrado', construtor: 'Construtor' };
const ATTR_KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
// Perfil real: ordem/forma vem de buildInitialAttributes (produção), reescalado para média `level`; `stretch` amplia a especialização.
function shapedAttrs(styleId, level, stretch = 1) {
  const raw = buildInitialAttributes('direita', styleId, 'right', 'hard');
  const m = mean(ATTR_KEYS.map((k) => raw[k]));
  const out = {};
  for (const k of ATTR_KEYS) out[k] = Math.max(1, Math.min(100, Math.round(level * (1 + stretch * (raw[k] - m) / m))));
  // corrige a média para `level` (arredondamento/clamp)
  let diff = Math.round(level * ATTR_KEYS.length) - ATTR_KEYS.reduce((s, k) => s + out[k], 0); let i = 0;
  while (diff !== 0 && i++ < 100) { const k = ATTR_KEYS[i % ATTR_KEYS.length]; const step = Math.sign(diff); if (out[k] + step >= 1 && out[k] + step <= 100) { out[k] += step; diff -= step; } }
  return out;
}
const flatAth = (id, lvl, side) => createBalanceAthlete(id, id, Math.max(1, Math.round(lvl)), 'Equilibrado', side, {});
const shapedAth = (id, styleId, lvl, side, stretch) => createBalanceAthlete(id, id, Math.max(1, Math.round(lvl)), STYLE_LABEL[styleId] || 'Equilibrado', side, shapedAttrs(styleId, Math.max(1, Math.round(lvl)), stretch));
const DUPLA_SCENARIOS = {
  // plano: dois atletas planos no OVR da dupla (método CLOUD-6E/6G/6I)
  FLAT: (T) => [flatAth('p1', T, 'right'), flatAth('p2', T, 'left')],
  // real equilibrado: jogador com perfil de produção (Equilibrado) no OVR da dupla, parceiro de mundo plano igual
  REAL_BAL: (T) => [shapedAth('p1', 'equilibrado', T, 'right', 1), flatAth('p2', T, 'left')],
  // parceiro mais fraco (jogador +8, parceiro −8): típico da 1ª dupla do início de carreira
  REAL_PW: (T) => [shapedAth('p1', 'equilibrado', T + 8, 'right', 1), flatAth('p2', Math.max(1, T - 8), 'left')],
  // parceiro mais forte (jogador −8, parceiro +8): mentoria / parceiro otimizado
  REAL_PS: (T) => [shapedAth('p1', 'equilibrado', Math.max(1, T - 8), 'right', 1), flatAth('p2', T + 8, 'left')],
  // especialista (ofensivo, especialização 1,6×): estresse de atributos muito desiguais
  REAL_SPEC: (T) => [shapedAth('p1', 'ofensivo', T, 'right', 1.6), flatAth('p2', T, 'left')],
};
function play(a, b, seed) {
  let s = createMatch(a, b, { seed }); let g = 0;
  while (!s.finished && g++ < 3000) s = playPoint(s);
  if (!s.finished) throw new Error(`partida ${seed} não terminou`);
  return s.winner === 'A';
}
const oppGrid = (T) => { const lo = Math.max(20, Math.floor((T - 30) / 5) * 5); const hi = Math.min(95, Math.ceil((T + 45) / 5) * 5); const g = []; for (let o = lo; o <= hi; o += 5) g.push(o); return g; };
function calibrate(scn, T) {
  const pts = [];
  for (const opp of oppGrid(T)) {
    let w = 0;
    for (let i = 0; i < CAL; i++) if (play(DUPLA_SCENARIOS[scn](T), [flatAth('o1', opp, 'left'), flatAth('o2', opp, 'right')], `6j:cal:${scn}:${T}:${opp}:${i}`)) w++;
    pts.push([opp, w / CAL]);
  }
  return pts;
}
// P(vitória) por OVR do adversário (monótona decrescente em opp); extrapola nas bordas pelo valor extremo
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return 0;
};
const t0 = performance.now();
const curveFile = path.join(OUT, 'win-curves.json');
let CURVES = {};
if (arg('reuseCurves', '0') === '1' && fs.existsSync(curveFile)) CURVES = JSON.parse(fs.readFileSync(curveFile, 'utf8')).curves;
else {
  for (const scn of Object.keys(DUPLA_SCENARIOS)) { CURVES[scn] = {}; for (const T of LEVELS) CURVES[scn][T] = calibrate(scn, T); console.log(`curvas ${scn} (${Math.round((performance.now() - t0) / 1000)}s)`); }
  fs.writeFileSync(curveFile, JSON.stringify({ cal: CAL, note: 'pontos [OVR do adversário plano, P(vitória da dupla)]', curves: CURVES }, null, 1));
}

// ── por mundo (semente) ─────────────────────────────────────────────────────
const SEEDS = Array.from({ length: NSEEDS }, (_, i) => `6j-world-${i + 1}`);
const results = { cal: CAL, levels: LEVELS, seeds: [] };

async function runWorld(seedName, warmDays) {
  const { rt, profile } = await bootDrawCareer(seedName, { warmDays });
  const E = rt.localGame.entities;
  const Entry = await rt.load('/src/gameplay/worldTour/EntryManager.js');
  const Catalog = await rt.load('/src/lib/circuitCatalog.js');
  const W = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const Settle = await rt.load('/src/gameplay/worldTour/tournamentSettlement.js');
  const AI = await rt.load('/src/gameplay/worldTour/TournamentSelectionAI.js');

  const tournaments = {};
  for (const tier of TIERS) {
    tournaments[tier] = await E.Tournament.create({ id: `j6-${tier}`, name: `6J ${tier}`, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', ...(tier === 'Gold' || tier === 'Masters' ? { main_draw_size: 24 } : {}) });
  }
  const [rawAthletes, partnerships, allTournaments] = await Promise.all([E.AthleteProfile.list('-world_ranking_points', 5000), E.Partnership.list('-created_date', 1200).catch(() => []), E.Tournament.list('start_date', 2000)]);
  const athletes = (rawAthletes || []).filter((a) => a && a.retired !== true && a.career_status !== 'aposentado');
  const allPairs = W.buildCanonicalPairs(partnerships, athletes);
  const committed = W.committedPairIdsForWindow([tournaments.Gold], allTournaments);
  const pool = allPairs.filter((p) => !committed.has(p.id) && !p.athletes.some((a) => a.id === profile.partner_id));
  const { pairSeedRank } = await W.createPairSeedRankResolver();
  const ovrOf = (p) => p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / p.athletes.length;
  const entryRankOf = (p) => { const rs = p.athletes.map((a) => Entry.resolveEntryRank(a)).filter((v) => v > 0); return rs.length ? Math.round(mean(rs)) : 0; };
  const repOf = (p) => ({ ...p.athletes[0], overall_rating: ovrOf(p), ...(entryRankOf(p) > 0 ? { rank: entryRankOf(p), ranking_position: entryRankOf(p) } : {}) });
  const needOf = (tier) => (2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount))) - 1;
  const bracketSizeOf = (tier) => 2 ** Math.max(1, Number(Catalog.getTournamentTierConfig(tier).roundCount));
  const currentSeed = (tier, rank) => (rank > 0 ? Math.min(Math.round(rank), bracketSizeOf(tier)) : Math.round(bracketSizeOf(tier) * 0.75));
  const weekT = (tier) => { const t = tournaments[tier]; const tt = new Date(`${t.start_date}T00:00:00Z`).getTime(); return [t, ...allTournaments.filter((x) => x?.id !== t.id && x?.start_date && Math.abs(new Date(`${x.start_date}T00:00:00Z`).getTime() - tt) <= 4 * 86400000)]; };

  // Estado dependente do preset (produção efetiva 'balanced' × calibração 5.27-I 'balanced-e'): pool elegível, preferidos, ordem e campo REAL
  const state = {};
  async function loadPreset(presetId) {
    globalThis.__PL527_PRESET = presetId;
    const st = { eligible: {}, ordered: {}, preferredN: {}, real: {}, offset: {} };
    for (const tier of TIERS) {
      const t = tournaments[tier];
      const elig = pool.filter((p) => Entry.evaluateTournamentEntry(t, repOf(p), { aiFieldContext: true }).eligible);
      const preferred = new Set();
      for (const p of elig) {
        try { const c = AI.chooseTournament(weekT(tier), repOf(p), { strategy: repOf(p).careerStrategy, currentRegion: repOf(p).currentRegion, aiFieldContext: true }); if (c?.decision === 'play' && c?.tournament?.id === t.id) preferred.add(p.id); } catch { /* best-effort */ }
      }
      const cut = (p) => W.fieldAdmissionScore(p, t);
      const order = (l) => [...l].sort((a, b) => cut(b) - cut(a) || String(a.id).localeCompare(String(b.id)));
      const primary = order(elig.filter((p) => preferred.has(p.id)));
      const secondary = order(elig.filter((p) => !preferred.has(p.id)));
      st.eligible[tier] = elig; st.ordered[tier] = [...primary, ...secondary]; st.preferredN[tier] = primary.length;
      // campo REAL
      let obs = null; globalThis.__PL527I_FIELD_OBSERVER = (o) => { obs = o; };
      const direct = await W.buildPlayerTournamentField({ tournament: t, profile, playerRank: tier === 'Gold' ? 300 : tier === 'Platinum' ? 250 : tier === 'Masters' ? 150 : 600, playerTeamName: 'Dupla', partnerAthleteId: profile.partner_id || null, qualifyingRoundCount: 0 });
      globalThis.__PL527I_FIELD_OBSERVER = undefined;
      st.real[tier] = { f: direct, obs }; st.offset[tier] = obs?.offset || 0;
    }
    return st;
  }
  state.balanced = await loadPreset('balanced');
  state['balanced-e'] = await loadPreset('balanced-e');
  globalThis.__PL527_PRESET = 'balanced';

  // validação réplica × função real, por preset
  const validation = {};
  for (const presetId of ['balanced', 'balanced-e']) {
    validation[presetId] = {};
    for (const tier of ['Bronze', 'Silver', 'Gold']) {
      const st = state[presetId]; const need = needOf(tier);
      const mine = st.ordered[tier].slice(st.offset[tier], st.offset[tier] + need);
      const realIds = new Set(st.real[tier].f.entrants.map((p) => p.id));
      validation[presetId][tier] = { replicaSelected: mine.length, realSelected: realIds.size, overlap: mine.filter((p) => realIds.has(p.id)).length, offset: st.offset[tier], eligible: st.eligible[tier].length, preferred: st.preferredN[tier] };
    }
  }

  // ── políticas (sobre a ordem de admissão de um preset) ──────────────────────
  const stratified = (ordered, need, lo, hi) => { const a = Math.round(ordered.length * lo); const b = Math.round(ordered.length * hi); const win = ordered.slice(a, b); const step = (win.length - 1) / (need - 1); return Array.from({ length: need }, (_, i) => win[Math.round(i * step)]); };
  const offsetSel = (ordered, need, pct) => { const off = Math.max(need, Math.round(ordered.length * pct)); return ordered.slice(off, off + need); };
  const weakestQual = (tier, st, excludeIds, n = 3) => st.eligible[tier].filter((p) => !excludeIds.has(p.id)).sort((a, b) => (entryRankOf(b) || 9e9) - (entryRankOf(a) || 9e9)).slice(0, n);
  const baseMain = (presetId, tier) => { const st = state[presetId]; const need = needOf(tier); return st.ordered[tier].slice(st.offset[tier], st.offset[tier] + need); };
  // Silver: o campo REAL (função de produção) é a referência; Bronze/Gold idem (offset 0).
  const SILVER_POLICIES = {
    PROD:        () => baseMain('balanced', 'Silver'),                                                // produção efetiva (offset 25%)
    CAL_E:       () => baseMain('balanced-e', 'Silver'),                                              // calibração 5.27-I (offset 15% + silverPeakLow 900) — preset -E
    S40:         () => offsetSel(state.balanced.ordered.Silver, 15, 0.40),
    A5:          () => stratified(state.balanced.ordered.Silver, 15, 0.25, 0.75),                      // alternativa A da 6I
    W35_85:      () => stratified(state.balanced.ordered.Silver, 15, 0.35, 0.85),
    A5_LITE:     () => stratified(state.balanced.ordered.Silver, 15, 0.15, 0.60),                      // estratificação ancorada na 5.27-I (15%)
    A5_E:        () => stratified(state['balanced-e'].ordered.Silver, 15, 0.25, 0.75),
    A5_LITE_E:   () => stratified(state['balanced-e'].ordered.Silver, 15, 0.15, 0.60),
  };
  // Gold: referência = campo real; GA4 (6I) e recomposições localizadas da cauda inferior com âncoras de elite preservadas
  const goldAnchors = (k) => [...baseMain('balanced', 'Gold')].sort((a, b) => (pairSeedRank(a) || 1e9) - (pairSeedRank(b) || 1e9)).slice(0, k);
  const goldLocal = (k, lo, hi) => {
    const anchors = goldAnchors(k); const ids = new Set(anchors.map((p) => p.id));
    const rest = state.balanced.eligible.Gold.filter((p) => !ids.has(p.id)).sort((a, b) => ovrOf(a) - ovrOf(b));
    const a = Math.floor(rest.length * lo); const b = Math.floor(rest.length * hi); const win = rest.slice(a, b);
    const n = needOf('Gold') - k; const step = (win.length - 1) / (n - 1);
    return [...anchors, ...Array.from({ length: n }, (_, i) => win[Math.round(i * step)])];
  };
  const GOLD_POLICIES = {
    PROD:  () => baseMain('balanced', 'Gold'),
    GA4:   () => state.balanced.ordered.Gold.slice(Math.round(state.balanced.ordered.Gold.length * 0.25), Math.round(state.balanced.ordered.Gold.length * 0.25) + 31),
    GL8:   () => goldLocal(8, 0.0, 0.5),     // 8 âncoras de elite do campo atual + 23 distribuídos na metade inferior (por OVR) do pool restante
    GL12:  () => goldLocal(12, 0.0, 0.5),    // 12 âncoras
    GL8_M: () => goldLocal(8, 0.0, 0.75),    // 8 âncoras + 23 na faixa inferior-média (menos agressivo)
  };
  const fieldFor = (tier, name) => {
    if (tier === 'Silver') return (SILVER_POLICIES[name] || SILVER_POLICIES.PROD)();
    if (tier === 'Gold') return (GOLD_POLICIES[name] || GOLD_POLICIES.PROD)();
    return baseMain('balanced', tier);
  };

  function projectPath(selected, tier, playerSeedRank) {
    const cfg = Catalog.getTournamentTierConfig(tier); const roundCount = Math.max(1, Number(cfg.roundCount));
    const player = { id: '__player__', name: 'Dupla', seedRank: playerSeedRank, strength: 0, isPlayer: true };
    const ents = selected.map((p) => ({ id: p.id, name: p.name, seedRank: pairSeedRank(p) || 0, strength: ovrOf(p), pair: p }));
    const { slots } = Settle.buildSeededDrawSlots({ entrants: [...ents, player], tournamentId: `${tournaments[tier].id}:player-field` });
    const playerSlot = slots.findIndex((e) => e?.isPlayer); const used = new Set(); const out = [];
    for (let r = 0; r < roundCount; r++) {
      const bs = 2 ** r; const start = Math.floor(playerSlot / bs) * bs; const sib = (Math.floor(start / bs) % 2 === 0) ? start + bs : start - bs;
      const sibling = slots.slice(sib, sib + bs).filter((e) => e && !e.isPlayer);
      if (!sibling.length) { out.push(null); continue; }
      const seedOf = (e) => (Number(e.seedRank) > 0 ? Number(e.seedRank) : Infinity);
      const ranked = [...sibling].sort((a, b) => seedOf(a) - seedOf(b)); const chosen = ranked.find((e) => !used.has(e.id)) || ranked[0];
      used.add(chosen.id); out.push({ ovr: ovrOf(chosen.pair), rank: chosen.seedRank || null });
    }
    return out;
  }
  function evalPath(qualOpps, mainPath, curve) {
    let alive = 1; let eWins = 0; const deltas = []; const seq = [...qualOpps, ...mainPath];
    for (const o of seq) { if (!o) continue; const p = interp(curve, o.ovr); eWins += alive * p; alive *= p; }
    const firstReal = seq.find((o) => o);
    let aliveQ = 1; for (const o of qualOpps) if (o) aliveQ *= interp(curve, o.ovr);
    const firstMain = mainPath.find((o) => o);
    return { pFirst: r2(firstReal ? interp(curve, firstReal.ovr) : null), pMainR1: r2(firstMain ? aliveQ * interp(curve, firstMain.ovr) : null), eWins: r2(eWins), pTitle: r2(alive) };
  }

  // Cenários de entrada (elegibilidade real validada com evaluateTournamentEntry)
  const ENTRY = [
    { key: 'Bronze/sem-rank', tier: 'Bronze', rank: 0 },
    { key: 'Silver/sem-rank', tier: 'Silver', rank: 0 },
    { key: 'Silver/600', tier: 'Silver', rank: 600 },
    { key: 'Gold-qual/600', tier: 'Gold', rank: 600, qual: true },
    { key: 'Gold-direto/300', tier: 'Gold', rank: 300 },
    { key: 'Platinum-direto/250', tier: 'Platinum', rank: 250 },
    { key: 'Masters-direto/150', tier: 'Masters', rank: 150 },
  ];
  const world = { seed: seedName, warmDays, careerDate: profile.career_date, validation, pools: {}, fields: {}, evals: {}, consistency: {}, eligibilityCheck: {} };
  for (const presetId of ['balanced', 'balanced-e']) {
    world.pools[presetId] = {};
    for (const tier of TIERS) {
      const st = state[presetId]; const elig = st.eligible[tier].map(ovrOf);
      const obs = st.real[tier].obs; const fo = (obs?.field || []).map((x) => x.ovr);
      world.pools[presetId][tier] = { eligible: elig.length, preferred: st.preferredN[tier], eligOvr: dist(elig), share50to70: band(elig, 50, 70), realOffset: st.offset[tier], realField: { ovr: dist(fo), share50to70: band(fo, 50, 70), shareBelow50: band(fo, 0, 50), rankMedian: q((obs?.field || []).map((x) => x.rank).filter(Boolean), .5) } };
    }
  }
  const POL_NAMES = { Bronze: ['PROD'], Silver: Object.keys(SILVER_POLICIES), Gold: Object.keys(GOLD_POLICIES), Platinum: ['PROD'], Masters: ['PROD'] };
  for (const tier of TIERS) {
    world.fields[tier] = {}; world.consistency[tier] = {};
    for (const name of POL_NAMES[tier]) {
      const sel = fieldFor(tier, name); const need = needOf(tier);
      const ov = sel.map(ovrOf); const ranks = sel.map((p) => pairSeedRank(p)).filter(Boolean);
      const presetOf = name.endsWith('_E') || name === 'CAL_E' ? 'balanced-e' : 'balanced';
      const eligIds = new Set(state[presetOf].eligible[tier].map((p) => p.id));
      const ids = sel.map((p) => p?.id);
      world.consistency[tier][name] = {
        size: sel.length, need, duplicates: ids.length - new Set(ids).size, undefinedSlots: sel.filter((p) => !p).length,
        notEligible: sel.filter((p) => p && !eligIds.has(p.id)).length, // elegibilidade no MESMO preset em que a política foi construída
        committedOrPartner: sel.filter((p) => p && (committed.has(p.id) || p.athletes.some((a) => a.id === profile.partner_id))).length,
        rankWorseThanDirectCut: tier === 'Gold' ? sel.filter((p) => p && entryRankOf(p) > Catalog.getTournamentTierConfig('Gold').minRanking).length : null, // entram pelo contexto da IA (qualifying/vaga); informativo
      };
      world.fields[tier][name] = { ovr: dist(ov), rank: dist(ranks), share50to70: band(ov, 50, 70), shareBelow50: band(ov, 0, 50), shareAtLeast70: band(ov, 70, 1e9) };
    }
  }
  // avaliação por cenário de entrada × política × dupla (FLAT/REAL_*) × nível
  for (const ent of ENTRY) {
    const eligible = Entry.evaluateTournamentEntry({ tier: ent.tier }, Entry.buildAthleteEntryContext({}, ent.rank, {})).eligible;
    world.eligibilityCheck[ent.key] = eligible;
    world.evals[ent.key] = { eligible, byPolicy: {} };
    for (const name of POL_NAMES[ent.tier]) {
      const sel = fieldFor(ent.tier, name);
      const pth = projectPath(sel, ent.tier, currentSeed(ent.tier, ent.rank));
      const st = name.endsWith('_E') || name === 'CAL_E' ? state['balanced-e'] : state.balanced;
      const qualOpps = ent.qual ? weakestQual(ent.tier, st, new Set(sel.map((p) => p.id))).map((p) => ({ ovr: ovrOf(p), rank: pairSeedRank(p) || null })) : [];
      const rec = { path: pth.map((x) => (x ? { ovr: r1(x.ovr), rank: x.rank } : null)), qualifying: qualOpps.map((x) => r1(x.ovr)), byScenario: {} };
      for (const scn of Object.keys(DUPLA_SCENARIOS)) { rec.byScenario[scn] = {}; for (const T of LEVELS) rec.byScenario[scn][T] = evalPath(qualOpps, pth, CURVES[scn][T]); }
      world.evals[ent.key].byPolicy[name] = rec;
    }
  }
  await rt.close();
  return world;
}

for (const s of SEEDS) { results.seeds.push(await runWorld(s, 8)); console.log(`mundo ${s} ok (${Math.round((performance.now() - t0) / 1000)}s)`); }
// sensibilidade de maturidade do mundo (45 dias de calendário, não temporada completa)
results.sensitivity = [await runWorld('6j-world-1', 45)];
console.log(`sensibilidade 45d ok (${Math.round((performance.now() - t0) / 1000)}s)`);
fs.writeFileSync(path.join(OUT, 'field-recomposition-experiments.json'), JSON.stringify(results, null, 1));
console.log('feito');
