// CLOUD-6F — fronteira de elegibilidade Bronze/Silver/Gold (somente leitura).
// Usa as funções reais de produção (EntryManager.evaluateTournamentEntry,
// circuitCatalog.getTierRankingFit/overallForRank) e os CSVs já gerados pela 6D.
// Nenhuma regra de inscrição é reimplementada aqui.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'reports/cloud-phase-6f-tournament-tier-transition/data';
const D6 = 'reports/cloud-phase-6d-career-progression-validation/data';
const RANKS = [350, 375, 399, 400, 401, 425, 450, 500];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { evaluateTournamentEntry, OPEN_TIER_CEILING } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { getTierRankingFit, getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { overallForRank } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');

  // ---- 1. Fronteira (função real, caminho do jogador e caminho da IA) ----
  const boundary = {};
  for (const rank of RANKS) {
    boundary[rank] = {};
    for (const tier of TIERS) {
      const p = evaluateTournamentEntry({ tier }, { rank, teamRank: rank });
      const ai = evaluateTournamentEntry({ tier }, { rank, teamRank: rank }, { aiFieldContext: true });
      boundary[rank][tier] = {
        player: { eligible: p.eligible, path: p.path, reason: p.eligible ? null : p.reason, overqualified: Boolean(p.overqualified) },
        ai: { eligible: ai.eligible, path: ai.path },
        fit: getTierRankingFit(tier, rank),
      };
    }
  }
  // varredura fina: onde exatamente muda Bronze/Silver?
  const sweep = [];
  for (let r = 380; r <= 460; r += 1) {
    sweep.push({ rank: r, bronze: evaluateTournamentEntry({ tier: 'Bronze' }, { rank: r, teamRank: r }).eligible, silver: evaluateTournamentEntry({ tier: 'Silver' }, { rank: r, teamRank: r }).eligible, gold: evaluateTournamentEntry({ tier: 'Gold' }, { rank: r, teamRank: r }).path });
  }
  const flips = sweep.filter((s, i) => i > 0 && (s.bronze !== sweep[i - 1].bronze || s.silver !== sweep[i - 1].silver || s.gold !== sweep[i - 1].gold)).map((s) => s.rank);
  // sem ranking
  const unranked = Object.fromEntries(TIERS.map((t) => [t, evaluateTournamentEntry({ tier: t }, { rank: 0 }).eligible]));
  // wildcard / protegido não contornam o teto?
  const wildcard = evaluateTournamentEntry({ tier: 'Bronze' }, { rank: 200, teamRank: 200, wildcard: true });

  // ---- 2. Curva rank -> OVR do mundo (função real) ----
  const ovrByRank = {};
  for (const r of [200, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 900]) {
    let s = 0; let n = 0;
    for (let k = Math.max(1, r - 25); k <= Math.min(1000, r + 25); k += 1) { s += overallForRank(k); n += 1; }
    ovrByRank[r] = Math.round((s / n) * 10) / 10;
  }

  // ---- 3. Evidência 6D: tier jogado e força do adversário por teamRank ----
  const csv = (f) => { const [h, ...rows] = fs.readFileSync(path.join(D6, f), 'utf8').trim().split('\n'); const cols = h.split(','); return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]))); };
  const runs = ['normal-cloud6d-5a8350a', 'optimizer-cloud6d-5a8350a', 'normal-baseline-fbb0bc4', 'optimizer-baseline-fbb0bc4'];
  const evidence = {};
  const bucket = (r) => (r === null ? 'sem' : r > 450 ? '>450' : r > 400 ? '401-450' : r > 360 ? '361-400' : r > 320 ? '321-360' : '<=320');
  for (const run of runs) {
    const weekly = csv(`weekly-${run}.csv`); const matches = csv(`matches-${run}.csv`); const tours = csv(`tournaments-${run}.csv`);
    const rankAt = (date) => { let best = null; for (const w of weekly) { if (w.date <= date) best = w; else break; } return best; };
    const agg = {}; const tierCount = {};
    for (const m of matches) {
      const w = rankAt(m.date); const tr = w && w.teamRank ? Number(w.teamRank) : null; const b = bucket(tr);
      const k = `${b}|${m.tier}`; (agg[k] ||= { n: 0, wins: 0, opp: [], delta: [] }); agg[k].n += 1; agg[k].wins += m.won === 'true' ? 1 : 0; agg[k].opp.push(Number(m.oppStrength)); agg[k].delta.push(Number(m.strengthDelta));
    }
    for (const t of tours) { const w = rankAt(t.date); const b = bucket(w && w.teamRank ? Number(w.teamRank) : null); const k = `${b}|${t.tier}`; tierCount[k] = (tierCount[k] || 0) + 1; }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    evidence[run] = {
      matchesByBucketTier: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, { n: v.n, wins: v.wins, medianOpp: med(v.opp), medianDelta: med(v.delta) }])),
      tournamentsByBucketTier: tierCount,
      // Bronze/Silver jogados com teamRank semanal <= 400 (o teto deveria barrar)
      openTierAtOrBelow400: tours.filter((t) => ['Bronze', 'Silver'].includes(t.tier)).map((t) => ({ date: t.date, tier: t.tier, weeklyTeamRank: Number((rankAt(t.date) || {}).teamRank) || null, weeklyRank: Number((rankAt(t.date) || {}).rank) || null })).filter((t) => t.weeklyTeamRank && t.weeklyTeamRank <= 400),
    };
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'boundary-scenarios.json'), JSON.stringify({ OPEN_TIER_CEILING, boundary, flips, unranked, wildcardOverridesCeiling: wildcard.eligible, ovrByRank, gold: getTournamentTierConfig('Gold').minRanking }, null, 1));
  fs.writeFileSync(path.join(OUT, 'evidence-6d-by-rank-bucket.json'), JSON.stringify(evidence, null, 1));

  console.log('OPEN_TIER_CEILING =', OPEN_TIER_CEILING, '| mudanças de elegibilidade (380-460) em:', flips.join(','));
  console.log('rank'.padEnd(6) + TIERS.map((t) => t.padEnd(12)).join(''));
  for (const r of RANKS) console.log(String(r).padEnd(6) + TIERS.map((t) => { const e = boundary[r][t].player; return (e.eligible ? e.path.slice(0, 6) : (e.overqualified ? 'ACIMA' : 'nao')).padEnd(12); }).join(''));
  console.log('fit    ' + TIERS.join('/'));
  for (const r of RANKS) console.log(String(r).padEnd(6) + TIERS.map((t) => String(boundary[r][t].fit).padEnd(12)).join(''));
  console.log('OVR médio do mundo por rank individual (±25):', JSON.stringify(ovrByRank));
  console.log('sem ranking elegível:', JSON.stringify(unranked), '| wildcard vence teto:', wildcard.eligible);
  for (const run of runs) console.log(run, 'Bronze/Silver com teamRank semanal<=400:', evidence[run].openTierAtOrBelow400.length);
} finally { await vite.close(); }
