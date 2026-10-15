// Playthrough 5.18-C, Partes A/B/D/E — INSTRUMENTAÇÃO TEMPORAL DA ELITE.
//
// O problema que isto resolve: `injured_until` lido no snapshot FINAL não
// explica uma lesão que começou em abril e terminou em maio. A 5.18-B
// descobriu duas duplas Top10 com 13 e 15 semanas consecutivas sem competir e
// não conseguiu atribuir causa, justamente por falta de histórico semanal.
//
// Este harness roda a simulação com paridade de produção (simulateWorldDay +
// processAiPartnershipMarket, mesma ordem) e tira um SNAPSHOT SEMANAL do
// estado que importa para atribuição: parceria ativa, lesão, agente livre,
// eventos elegíveis, eventos disputados.
//
// Vive só no harness de teste — nada é persistido em produção (Parte A).
import { createServer } from 'vite';

export const IDLE_CAUSES = Object.freeze({
  INJURY: 'INJURY',
  PARTNERSHIP_DISSOLVED: 'PARTNERSHIP_DISSOLVED',
  FREE_AGENT_WAIT: 'FREE_AGENT_WAIT',
  PARTNERSHIP_FORMING: 'PARTNERSHIP_FORMING',
  HIGHER_TIER_CONFLICT: 'HIGHER_TIER_CONFLICT',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  REST_SELF_SELECTION: 'REST_SELF_SELECTION',
  NO_ELIGIBLE_EVENT: 'NO_ELIGIBLE_EVENT',
  CHOOSE_NONE: 'CHOOSE_NONE',
  CAPACITY: 'CAPACITY',
  TOURNAMENT_CANCELLED: 'TOURNAMENT_CANCELLED',
  OTHER: 'OTHER',
  UNEXPLAINED: 'UNEXPLAINED',
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

export function installGlobalShims(pathname = '/elite-inactivity') {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

export const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weekOf = (date) => Math.floor(new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getTime() / 604800000);
export const pairKey = (a, b) => [a, b].sort().join('_');

/**
 * Roda uma temporada com paridade de produção, coletando um snapshot por
 * semana. `label` só identifica a seed (o mundo não é seedável: resultados de
 * partida usam Math.random, documentado desde a 5.x).
 */
export async function runInstrumentedSeason({ label = 'elite', years = 1, cohortSize = 20 } = {}) {
  installGlobalShims(`/elite-inactivity-${label}`);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await mod('/src/storage/GameStorage.js');
  const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
  const { CareerManager } = await mod('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
  const { localGame } = await mod('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await mod('/src/lib/career.js');
  const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
  const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
  const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');
  const { evaluateTournamentEntry } = await mod('/src/gameplay/worldTour/EntryManager.js');

  const START = '2026-01-01';
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: `elite-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(START);

  // Cohort A (Parte E): Top N no INÍCIO, para evitar survivor bias.
  const initialTeams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  const cohortStart = initialTeams.slice(0, cohortSize).map((t, i) => ({
    key: pairKey(t.player1_id, t.player2_id),
    a: t.player1_id, b: t.player2_id,
    name: `${t.player1_name}/${t.player2_name}`,
    initialRank: i + 1,
  }));

  const weeklySnapshots = [];
  // Cohort B (Parte E): Top N observado em CADA semana.
  const weeklyTopN = new Map();

  let circuitAnchor = START;
  let date = START;
  const totalDays = years * 365;

  for (let i = 0; i < totalDays; i += 1) {
    const previous = date;
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    // Mesma ordem da produção.
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

    // --- SNAPSHOT SEMANAL ---
    if ((i + 1) % 7 === 0) {
      const [athletes, partnerships, teams] = await Promise.all([
        localGame.entities.AthleteProfile.list(null, 5000),
        localGame.entities.Partnership.list(null, 5000).catch(() => []),
        localGame.entities.TeamRanking.list('-ranking_points', 5000),
      ]);
      const byId = new Map(athletes.map((a) => [a.id, a]));
      const activeByKey = new Map();
      for (const p of partnerships) {
        if (p.status !== 'ativa') continue;
        const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
        if (ids.length !== 2) continue;
        activeByKey.set(pairKey(ids[0], ids[1]), p);
      }
      const rankByKey = new Map();
      teams.forEach((t, idx) => rankByKey.set(pairKey(t.player1_id, t.player2_id), idx + 1));
      weeklyTopN.set(weekOf(date), teams.slice(0, cohortSize).map((t) => pairKey(t.player1_id, t.player2_id)));

      const observe = (entry) => {
        const A = byId.get(entry.a);
        const B = byId.get(entry.b);
        const partnership = activeByKey.get(entry.key);
        const mutual = Boolean(A && B && A.ai_partner_id === entry.b && B.ai_partner_id === entry.a);
        return {
          member_a_injured: Boolean(A?.injured_until && A.injured_until >= date),
          member_b_injured: Boolean(B?.injured_until && B.injured_until >= date),
          injured_until: A?.injured_until || B?.injured_until || null,
          free_agent_a: Boolean(A && !A.ai_partner_id),
          free_agent_b: Boolean(B && !B.ai_partner_id),
          partnership_active: mutual,
          partnership_row: Boolean(partnership),
          partnership_started_at: partnership?.started_career_date || A?.ai_partnership_start_date || null,
          team_rank: rankByKey.get(entry.key) || null,
          a_partner_now: A?.ai_partner_id || null,
          b_partner_now: B?.ai_partner_id || null,
        };
      };

      weeklySnapshots.push({
        week: weekOf(date),
        date,
        cohortStart: cohortStart.map((entry) => ({ ...entry, ...observe(entry) })),
      });
    }
  }
  await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);

  const [tournaments, athletes, partnerships, teams] = await Promise.all([
    localGame.entities.Tournament.list('start_date', 5000),
    localGame.entities.AthleteProfile.list(null, 5000),
    localGame.entities.Partnership.list(null, 5000).catch(() => []),
    localGame.entities.TeamRanking.list('-ranking_points', 5000),
  ]);
  const entryFn = evaluateTournamentEntry;
  await vite.close();

  return {
    label, finalDate: date, weeklySnapshots, weeklyTopN, cohortStart,
    tournaments, athletes, partnerships, teams, evaluateTournamentEntry: entryFn,
  };
}

/**
 * Parte B — classificação canônica de UMA semana ociosa. Exatamente uma causa
 * primária, na ordem de precedência que o mundo impõe: sem dupla não se
 * compete; com dupla mas lesionado não se compete; e só então as causas de
 * escolha/calendário.
 */
export function classifyIdleWeek({ observation, weekEvents, eligibleEvents, cancelledThatWeek }) {
  if (!observation) return IDLE_CAUSES.UNEXPLAINED;
  const { partnership_active: active, member_a_injured: aInj, member_b_injured: bInj,
    free_agent_a: freeA, free_agent_b: freeB, partnership_started_at: startedAt } = observation;

  if (!active) {
    // A dupla não existe nesta semana. Distinguir quem está livre de quem já
    // refez dupla com outra pessoa.
    if (freeA || freeB) return IDLE_CAUSES.FREE_AGENT_WAIT;
    return IDLE_CAUSES.PARTNERSHIP_DISSOLVED;
  }
  if (aInj || bInj) return IDLE_CAUSES.INJURY;
  if (startedAt && weekOf(startedAt) === observation.week) return IDLE_CAUSES.PARTNERSHIP_FORMING;
  if (!weekEvents || weekEvents.length === 0) return IDLE_CAUSES.NO_ELIGIBLE_EVENT;
  if (cancelledThatWeek) return IDLE_CAUSES.TOURNAMENT_CANCELLED;
  if (!eligibleEvents || eligibleEvents.length === 0) return IDLE_CAUSES.NO_ELIGIBLE_EVENT;
  const allFull = eligibleEvents.every((t) => {
    const size = Number(t.main_draw_size) || 0;
    return size > 0 && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length >= size;
  });
  if (allFull) return IDLE_CAUSES.CAPACITY;
  // Dupla ativa, saudável, com evento elegível e vaga: é escolha.
  return IDLE_CAUSES.REST_SELF_SELECTION;
}

/** Sequências consecutivas de semanas ociosas, com as causas de cada uma. */
export function findIdleGaps(weeks) {
  const gaps = [];
  let current = null;
  for (const w of weeks) {
    if (w.played) {
      if (current) { gaps.push(current); current = null; }
      continue;
    }
    if (!current) current = { startWeek: w.week, endWeek: w.week, length: 0, weeks: [] };
    current.endWeek = w.week;
    current.length += 1;
    current.weeks.push(w);
  }
  if (current) gaps.push(current);
  return gaps;
}
