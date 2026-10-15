// Playthrough 5.18-G, Partes B/E/M/N/O/Q — HARNESS FINAL.
//
// Duas mudanças em relação ao da 5.18-F:
//   1. a admissão não é mais reconstruída: ela é CAPTURADA no instante da
//      decisão, via `setDrawAdmissionObserver` (deriva estruturalmente 0);
//   2. todo fato semanal resolve Partnership pelo snapshot DAQUELA semana
//      (regra da Parte A, em scripts/lib/temporalIntegrity.mjs).
import { createServer } from 'vite';
import {
  pairKey, addDays, weekOf, playedKeysForWeek, TEMPORAL_RULE,
} from './temporalIntegrity.mjs';

export { pairKey, addDays, weekOf, TEMPORAL_RULE };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

export function installGlobalShims(pathname = '/draw-admission') {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

/**
 * @param {object} opts
 * @param {string} opts.label       identifica a seed (o mundo não é seedável:
 *                                  resultados de partida usam Math.random).
 * @param {number} opts.years
 * @param {number} opts.cohortSize
 * @param {boolean} opts.captureAdmissions  instala o observador do sorteio.
 */
export async function runFinalHarness({
  label = 'seed', years = 1, cohortSize = 20, captureAdmissions = true, census = true,
} = {}) {
  installGlobalShims(`/draw-admission-${label}`);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  try {
    const { GameStorage } = await mod('/src/storage/GameStorage.js');
    const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
    const { CareerManager } = await mod('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
    const { localGame } = await mod('/src/api/localGameClient.js');
    const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
    const { ensureFutureTournaments } = await mod('/src/lib/career.js');
    const wt = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const { ensureWorldTourDraws, resolveCompletedWorldTourEvents, buildCanonicalPairs, setDrawAdmissionObserver } = wt;
    const { resolveEntryRank } = await mod('/src/gameplay/worldTour/EntryManager.js');
    const { chooseTournament } = await mod('/src/gameplay/worldTour/TournamentSelectionAI.js');
    const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
    const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
    const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');

    const admissions = [];
    if (captureAdmissions) setDrawAdmissionObserver((record) => admissions.push(record));

    const START = '2026-01-01';
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: label, playerName: label });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `final-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
      level: 'Amador', coins: 1000, xp: 0,
    });
    await ensureWorldSeed2025();
    await ensureFutureTournaments(START);

    const initialTeams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const cohort = initialTeams.slice(0, cohortSize).map((t, i) => ({
      key: pairKey(t.player1_id, t.player2_id), a: t.player1_id, b: t.player2_id,
      name: `${t.player1_name}/${t.player2_name}`, initialRank: i + 1,
    }));

    const weekly = [];
    let circuitAnchor = START;
    let date = START;

    for (let i = 0; i < Math.round(years * 365); i += 1) {
      const previous = date;
      date = addDays(date, 1);
      await ensureWorldTourDraws(date).catch(() => null);
      await resolveCompletedWorldTourEvents(date).catch(() => null);
      const world = await simulateWorldDay(profile, previous, date).catch(() => null);
      if (world?.profile) profile = world.profile;
      const market = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
      if (market?.profile) profile = market.profile;
      if ((i + 1) % 14 === 0) {
        const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
        if (c?.profile) profile = c.profile;
        circuitAnchor = date;
      }
      if ((i + 1) % 60 === 0) await ensureFutureTournaments(date).catch(() => null);
      if ((i + 1) % 7 !== 0) continue;

      const [athletes, partnerships, teams, tournaments] = await Promise.all([
        localGame.entities.AthleteProfile.list(null, 5000),
        localGame.entities.Partnership.list(null, 5000).catch(() => []),
        localGame.entities.TeamRanking.list('-ranking_points', 5000),
        localGame.entities.Tournament.list('start_date', 5000),
      ]);
      const byId = new Map(athletes.map((a) => [a.id, a]));
      // Snapshot DESTA semana — a única fonte admitida para resolver os ids
      // de sorteio desta semana (Parte A).
      const partnershipByIdNow = new Map(partnerships.map((p) => [p.id, p]));
      const week = weekOf(date);
      const playedNow = playedKeysForWeek({ tournaments, week, partnershipByIdAtDate: partnershipByIdNow });

      const rankByKey = new Map();
      teams.forEach((t, idx) => rankByKey.set(pairKey(t.player1_id, t.player2_id), idx + 1));
      const teamRowByKey = new Map(teams.map((t) => [pairKey(t.player1_id, t.player2_id), t]));

      const pairs = buildCanonicalPairs(partnerships, athletes);
      const pairByKey = new Map(pairs.map((p) => [pairKey(p.athletes[0].id, p.athletes[1].id), p]));

      const weekTournaments = tournaments.filter((t) => t.start_date && weekOf(t.start_date) === week);

      const rows = cohort.map((c) => {
        const A = byId.get(c.a);
        const B = byId.get(c.b);
        const pair = pairByKey.get(c.key);
        const mutual = Boolean(A && B && A.ai_partner_id === c.b && B.ai_partner_id === c.a);
        let chooseDecision = null;
        if (pair && weekTournaments.length) {
          const rep = {
            ...pair.athletes[0],
            overall_rating: pair.athletes.reduce((s, x) => s + Number(x.overall_rating || x.overall || 50), 0) / 2,
          };
          const pr = pair.athletes.map((x) => resolveEntryRank(x)).filter((v) => v > 0);
          if (pr.length) {
            const r = Math.round(pr.reduce((s, v) => s + v, 0) / pr.length);
            rep.rank = r; rep.ranking_position = r;
          }
          chooseDecision = chooseTournament(weekTournaments, rep, { aiFieldContext: true })?.decision || null;
        }
        return {
          key: c.key, date, week, mutual,
          exists: Boolean(pair),
          played: playedNow.has(c.key),
          team_rank: rankByKey.get(c.key) || null,
          injured: Boolean((A?.injured_until && A.injured_until >= date) || (B?.injured_until && B.injured_until >= date)),
          choose_decision: chooseDecision,
          events_this_week: weekTournaments.length,
        };
      });

      let censusRows = null;
      if (census) {
        censusRows = pairs.map((p) => {
          const k = pairKey(p.athletes[0].id, p.athletes[1].id);
          const row = teamRowByKey.get(k);
          return {
            pid: p.id, key: k, name: p.name,
            team_rank: rankByKey.get(k) || null,
            team_points: Number(row?.ranking_points) || 0,
            team_matches: Math.max(0, Number(row?.matches_played) || 0),
            team_origin: row?.origin || null,
            ovr: Math.round(p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / 2),
            member_points: p.athletes.reduce((s, a) => s + (Math.max(0, Number(a.world_ranking_points ?? a.ranking_points) || 0)), 0),
            played: playedNow.has(k),
          };
        });
      }

      // Contagem populacional do instante (Parte O).
      const freeAgents = athletes.filter((a) => !a.ai_partner_id).length;
      const activePartnerships = partnerships.filter((p) => p.status === 'ativa').length;

      weekly.push({
        week, date, rows, census: censusRows,
        population: athletes.length, freeAgents, activePartnerships,
        canonicalPairs: pairs.length,
      });
    }

    await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
    if (captureAdmissions) setDrawAdmissionObserver(null);

    const [tournaments, athletes, partnerships, teams] = await Promise.all([
      localGame.entities.Tournament.list('start_date', 5000),
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      localGame.entities.TeamRanking.list('-ranking_points', 5000),
    ]);

    return { label, finalDate: date, weekly, cohort, admissions, tournaments, athletes, partnerships, teams };
  } finally {
    await vite.close();
  }
}

/** Integridade estrutural do mundo, medida no estado final (é um fato do
 *  estado final, não uma reconstrução histórica — permitido pela Parte A). */
export function structuralIntegrity({ athletes, partnerships, teams }) {
  const seen = new Map();
  let duplicates = 0;
  let unilateral = 0;
  let ghosts = 0;
  const byId = new Map(athletes.map((a) => [a.id, a]));
  for (const a of athletes) {
    if (!a.ai_partner_id) continue;
    const partner = byId.get(a.ai_partner_id);
    if (!partner) { ghosts += 1; continue; }
    if (partner.ai_partner_id !== a.id) unilateral += 1;
  }
  for (const p of partnerships) {
    if (p.status !== 'ativa') continue;
    const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
    if (ids.length !== 2) { ghosts += 1; continue; }
    const k = pairKey(ids[0], ids[1]);
    if (seen.has(k)) duplicates += 1;
    seen.set(k, p);
  }
  const nanRanking = (teams || []).filter((t) => !Number.isFinite(Number(t.ranking_points))).length;
  return { duplicates, unilateral, ghosts, nanRanking };
}
