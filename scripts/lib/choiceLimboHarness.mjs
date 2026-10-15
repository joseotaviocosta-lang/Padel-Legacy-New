// Playthrough 5.18-H, Partes B/D/E/M/N — LIMBO DE ESCOLHA.
//
// A 5.18-G fechou a admissão (0 inversões em 1.116 decisões capturadas no
// instante) e sobrou uma dívida: 22 de 466 duplas novas passavam >=40 semanas
// sem evento, e 14 delas NUNCA chegaram a disputar uma vaga. Como a admissão
// está provada, a causa está antes dela.
//
// Este harness observa o pipeline INTEIRO para cada dupla, semana a semana,
// capturando no instante (nunca reconstruindo):
//   chooseTournament  -> decisão + reasonCode + score de cada evento
//   assignPairsForWeek -> em que torneio ela caiu (ou se sumiu)
//   drawAdmissionObserver -> se chegou à fila do sorteio
import { createServer } from 'vite';
import { pairKey, addDays, weekOf, playedKeysForWeek } from './temporalIntegrity.mjs';

export { pairKey, addDays, weekOf };

/** Parte N — classificação do limbo. Toda dupla em limbo recebe uma causa. */
export const LIMBO_CAUSES = Object.freeze({
  NO_ELIGIBLE_EVENT: 'NO_ELIGIBLE_EVENT',
  DEAD_TIER_ZONE: 'DEAD_TIER_ZONE',
  CHOICE_THRESHOLD: 'CHOICE_THRESHOLD',
  REST_LOOP: 'REST_LOOP',
  STALE_CONFLICT: 'STALE_CONFLICT',
  ASSIGNMENT_DROP: 'ASSIGNMENT_DROP',
  UNRANKED_GATE: 'UNRANKED_GATE',
  QUEUE_CUT: 'QUEUE_CUT',
  OTHER: 'OTHER',
});

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

export function installGlobalShims(pathname = '/choice-limbo') {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

export async function runChoiceLimboRun({ label = 'limbo', years = 3, cohortSize = 20 } = {}) {
  installGlobalShims(`/choice-limbo-${label}`);
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
    const { ensureWorldTourDraws, resolveCompletedWorldTourEvents, buildCanonicalPairs, assignPairsForWeek, setDrawAdmissionObserver } = wt;
    const sel = await mod('/src/gameplay/worldTour/TournamentSelectionAI.js');
    const { chooseTournament, setChoiceObserver, CHOOSE_NONE_REASONS } = sel;
    const { resolveEntryRank } = await mod('/src/gameplay/worldTour/EntryManager.js');
    const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
    const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
    const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');

    // Toda dupla que chega a uma fila de sorteio, em qualquer semana.
    const everQueued = new Set();
    setDrawAdmissionObserver((rec) => {
      for (const c of rec.candidates) everQueued.add(c.pairId);
    });

    const START = '2026-01-01';
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: label, playerName: label });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `limbo-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
      level: 'Amador', coins: 1000, xp: 0,
    });
    await ensureWorldSeed2025();
    await ensureFutureTournaments(START);

    // Por dupla: agregados de escolha ao longo de toda a run.
    const perPair = new Map();
    const bump = (pid, patch) => {
      let rec = perPair.get(pid);
      if (!rec) {
        rec = {
          pid, weeksAlive: 0, weeksWithEvents: 0, weeksEligible: 0, weeksChosePlay: 0,
          reasons: {}, assignedWeeks: 0, assignmentDrops: 0, playedWeeks: 0,
          bestScoreSeen: null, minRestScore: null, maxRestScore: null,
          minEnergy: null, ovr: null, entryRank: null, name: null,
          overqualifiedWeeks: 0, ineligibleReasons: {},
        };
        perPair.set(pid, rec);
      }
      Object.assign(rec, patch(rec));
      return rec;
    };

    let circuitAnchor = START;
    let date = START;
    const weekly = [];

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
      const week = weekOf(date);
      const partnershipByIdNow = new Map(partnerships.map((p) => [p.id, p]));
      const playedNow = playedKeysForWeek({ tournaments, week, partnershipByIdAtDate: partnershipByIdNow });
      const rankByKey = new Map();
      teams.forEach((t, idx) => rankByKey.set(pairKey(t.player1_id, t.player2_id), idx + 1));

      const pairs = buildCanonicalPairs(partnerships, athletes);
      const weekTournaments = tournaments.filter((t) => t.start_date && weekOf(t.start_date) === week);
      const assignments = weekTournaments.length ? assignPairsForWeek(weekTournaments, pairs) : new Map();
      const assignedIds = new Set();
      for (const list of assignments.values()) for (const p of list) assignedIds.add(p.id);

      for (const pair of pairs) {
        const k = pairKey(pair.athletes[0].id, pair.athletes[1].id);
        const rep = {
          ...pair.athletes[0],
          overall_rating: pair.athletes.reduce((s, x) => s + Number(x.overall_rating || x.overall || 50), 0) / 2,
        };
        const pr = pair.athletes.map((x) => resolveEntryRank(x)).filter((v) => v > 0);
        if (pr.length) {
          const r = Math.round(pr.reduce((s, v) => s + v, 0) / pr.length);
          rep.rank = r; rep.ranking_position = r;
        }
        // Energia da dupla = a do representante, exatamente como a produção faz.
        let captured = null;
        setChoiceObserver((rec) => { captured = rec; });
        const choice = chooseTournament(weekTournaments, rep, { aiFieldContext: true });
        setChoiceObserver(null);

        bump(pair.id, (rec) => {
          const reasons = { ...rec.reasons };
          const code = choice.reasonCode || (choice.decision === 'play' ? 'PLAY' : 'OTHER');
          reasons[code] = (reasons[code] || 0) + 1;
          const ineligible = { ...rec.ineligibleReasons };
          let overq = rec.overqualifiedWeeks;
          for (const ev of (captured?.availableEvents || [])) {
            if (ev.eligible) continue;
            const key = ev.overqualified ? 'OVERQUALIFIED' : (ev.eligibilityReason || 'sem motivo');
            ineligible[key] = (ineligible[key] || 0) + 1;
          }
          if ((captured?.availableEvents || []).some((e) => e.overqualified)) overq += 1;
          const assigned = assignedIds.has(pair.id);
          return {
            name: pair.name,
            ovr: Math.round(rep.overall_rating),
            entryRank: rankByKey.get(k) || rec.entryRank,
            weeksAlive: rec.weeksAlive + 1,
            weeksWithEvents: rec.weeksWithEvents + (weekTournaments.length ? 1 : 0),
            weeksEligible: rec.weeksEligible + ((captured?.eligibleCount || 0) > 0 ? 1 : 0),
            weeksChosePlay: rec.weeksChosePlay + (choice.decision === 'play' ? 1 : 0),
            reasons,
            ineligibleReasons: ineligible,
            overqualifiedWeeks: overq,
            assignedWeeks: rec.assignedWeeks + (assigned ? 1 : 0),
            assignmentDrops: rec.assignmentDrops + (choice.decision === 'play' && !assigned ? 1 : 0),
            playedWeeks: rec.playedWeeks + (playedNow.has(k) ? 1 : 0),
            bestScoreSeen: Math.max(rec.bestScoreSeen ?? -Infinity, captured?.bestScore ?? -Infinity) === -Infinity ? null : Math.max(rec.bestScoreSeen ?? -Infinity, captured?.bestScore ?? -Infinity),
            minRestScore: rec.minRestScore === null ? captured?.restScore ?? null : Math.min(rec.minRestScore, captured?.restScore ?? Infinity),
            maxRestScore: rec.maxRestScore === null ? captured?.restScore ?? null : Math.max(rec.maxRestScore, captured?.restScore ?? -Infinity),
            minEnergy: rec.minEnergy === null ? captured?.energy ?? null : Math.min(rec.minEnergy, captured?.energy ?? Infinity),
          };
        });
      }

      weekly.push({ week, date, pairCount: pairs.length, eventCount: weekTournaments.length });
    }

    await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
    setDrawAdmissionObserver(null);

    const [tournaments, athletes, partnerships, teams] = await Promise.all([
      localGame.entities.Tournament.list('start_date', 5000),
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      localGame.entities.TeamRanking.list('-ranking_points', 5000),
    ]);
    return {
      label, finalDate: date, weekly, perPair: [...perPair.values()], everQueued,
      tournaments, athletes, partnerships, teams, CHOOSE_NONE_REASONS,
    };
  } finally {
    await vite.close();
  }
}

/** Parte N — atribui UMA causa a cada dupla em limbo, por precedência. */
export function classifyLimbo(rec, everQueued) {
  if (everQueued.has(rec.pid)) return LIMBO_CAUSES.QUEUE_CUT;
  const r = rec.reasons || {};
  const weeks = Math.max(1, rec.weeksAlive);
  // Sem evento no calendário na maior parte da vida.
  if ((r.NO_EVENTS || 0) / weeks > 0.5) return LIMBO_CAUSES.NO_ELIGIBLE_EVENT;
  // Nunca foi elegível a nada, e havia eventos.
  if (rec.weeksEligible === 0 && rec.weeksWithEvents > 0) {
    if (rec.overqualifiedWeeks > 0) return LIMBO_CAUSES.DEAD_TIER_ZONE;
    return LIMBO_CAUSES.UNRANKED_GATE;
  }
  // Era elegível mas o descanso sempre venceu.
  if ((r.REST_POLICY || 0) > 0 && rec.weeksChosePlay === 0) return LIMBO_CAUSES.REST_LOOP;
  // Escolheu jogar e nunca foi atribuída a torneio algum.
  if (rec.weeksChosePlay > 0 && rec.assignedWeeks === 0) return LIMBO_CAUSES.ASSIGNMENT_DROP;
  // Escolheu jogar, foi atribuída, mas nunca chegou a uma fila de sorteio.
  if (rec.assignedWeeks > 0) return LIMBO_CAUSES.ASSIGNMENT_DROP;
  if ((r.NO_ELIGIBLE_EVENT || 0) > 0) return LIMBO_CAUSES.NO_ELIGIBLE_EVENT;
  return LIMBO_CAUSES.OTHER;
}
