// Hotfix 5.30-B — kit dos testes *-v530b (autoridade do "próximo evento").
//
// O cenário usa o CATÁLOGO REAL, não nomes inventados:
// - buildPreSeasonExhibition(2026) → "Roma Pré-Temporada" (12/01, sem ranking);
// - buildSeasonTournaments(2026) → a temporada regular, que abre em 29/01
//   com "Londres Challenge" (Bronze).
// Na data de início da carreira (01/01) Roma está a 11 dias e Londres a 28:
// o estado exato do smoke físico.
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

export { gateRunner } from './v527mTestKit.mjs';

export const CAREER_START = '2026-01-01';

export async function withNextEventModules(work) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  try {
    const authority = await server.ssrLoadModule('/src/lib/nextEventAuthority.js');
    const header = await server.ssrLoadModule('/src/lib/careerHeaderContext.js');
    const home = await server.ssrLoadModule('/src/lib/homeDashboard.js');
    const catalog = await server.ssrLoadModule('/src/lib/circuitCatalog.js');
    const preseason = catalog.buildPreSeasonExhibition(2026, 'season-2026');
    const season = catalog.buildSeasonTournaments(2026, 'season-2026');
    const london = season.find((item) => item.name === 'Londres Challenge');
    return await work({ authority, header, home, catalog, preseason, season, london, world: [preseason, ...season] });
  } finally { await server.close(); }
}

export const profileOn = (careerDate, extra = {}) => ({ id: 'player-1', career_date: careerDate, energy: 90, fatigue: 10, ...extra });

/** CalendarEvent igual ao que registerTournament grava. */
export function registrationEvent(tournament, extra = {}) {
  const id = `registration-player-1-${tournament.id}`;
  return {
    id: `calendar-${id}`, profile_id: 'player-1', event_type: 'tournament', title: tournament.name,
    start_date: tournament.start_date, end_date: tournament.end_date, related_id: tournament.id, related_name: tournament.name,
    status: 'scheduled', metadata: { registration_id: id }, ...extra,
  };
}

/** Campanha sorteada (tournament_run) parada na rodada `round`. */
export function campaignEvent(tournament, { round = 0, status = 'scheduled', eventStatus = 'scheduled' } = {}) {
  const base = registrationEvent(tournament, { status: eventStatus });
  // Uma rodada por dia a partir da estreia.
  const dates = [0, 1, 2].map((offset) => new Date(Date.parse(`${tournament.start_date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10));
  return {
    ...base,
    metadata: {
      ...base.metadata,
      tournament_run: {
        status, currentRound: round, tournamentId: tournament.id, tournamentName: tournament.name,
        matches: ['Quartas de final', 'Semifinal', 'Final'].map((name, index) => ({ id: `m${index}`, round: name, date: dates[index] })),
      },
    },
  };
}

/** O que cada superfície responde para o mesmo save e a mesma data. */
export function surfaces({ authority, header, home }, { tournaments, calendarEvents = [], careerDate }) {
  const next = authority.selectNextRelevantEvent({ tournaments, calendarEvents, careerDate });
  const headerCtx = header.buildCareerHeaderContext({ profile: profileOn(careerDate), tournaments, calendarEvents });
  const tournamentsPageOpen = authority.selectNextOpenTournament(tournaments, careerDate);
  const homeNext = next?.tournament || (next ? { id: next.tournamentId, name: next.name, start_date: next.startDate } : null);
  const homeFree = home.buildHomeCommitment({ nextTournament: homeNext, careerDate });
  return { next, headerCtx, tournamentsPageOpen, homeNext, homeFree };
}

export const readSource = (path) => readFileSync(path, 'utf8');

export function liveRun(label) {
  const file = `reports/hotfix-530b/runs/${label}.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
