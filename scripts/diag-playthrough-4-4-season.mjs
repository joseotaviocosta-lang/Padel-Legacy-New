import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-season-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-44-season' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

function addDays(date, amount) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000); }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; }
function metrics(rows) {
  const byTier = new Map();
  for (const row of rows) byTier.set(row.tier, [...(byTier.get(row.tier) || []), row]);
  return [...byTier.entries()].map(([tier, events]) => {
    const starts = events.map((row) => row.start_date).sort();
    const gaps = starts.slice(1).map((date, index) => daysBetween(starts[index], date));
    const byStart = new Map();
    for (const row of events) byStart.set(row.start_date, (byStart.get(row.start_date) || 0) + 1);
    const draws = events.map((row) => Number(row.main_draw_size) || 0);
    return {
      tier, events: events.length, eventsByMonth: Object.fromEntries([...new Set(events.map((row) => row.start_date.slice(0, 7)))].map((month) => [month, events.filter((row) => row.start_date.startsWith(month)).length])),
      maxSimultaneous: Math.max(...byStart.values()), minGapDays: gaps.length ? Math.min(...gaps) : 0, avgGapDays: gaps.length ? Number((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length).toFixed(2)) : 0,
      typicalDraw: median(draws), cancelled: events.filter((row) => row.world_tour_cancelled).length,
      incomplete: events.filter((row) => row.world_tour_resolved && !row.world_tour_cancelled && !(row.bracket_history || []).length).length,
      completed: events.filter((row) => row.world_tour_resolved && !row.world_tour_cancelled && row.champion && row.runner_up).length,
    };
  }).sort((a, b) => a.tier.localeCompare(b.tier));
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: 'Playthrough 4.4 Season', playerName: 'Season 4.4' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'playthrough-44-season-player', sport_name: 'Season 4.4', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  let profile = await activeCareerAdapter.getPlayerProfile();
  const d3Snapshots = new Map();
  const captureD3 = async (date) => {
    const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const athletes = await localGame.entities.AthleteProfile.list('ranking_position', 2000);
    const top10 = athletes.filter((row) => Number(row.ranking_position) <= 10).map((row) => row.name);
    for (const tournament of tournaments.filter((row) => ['Masters', 'Elite', 'Crown', 'Bronze', 'Silver', 'Gold', 'Platinum'].includes(row.tier) && row.bracket_schema_version === 2 && !d3Snapshots.has(row.id))) {
      d3Snapshots.set(tournament.id, { date, tier: tournament.tier, name: tournament.name, start_date: tournament.start_date, participants: tournament.participants || [], top10 });
    }
  };
  for (let day = 0; day < 367; day += 1) {
    await captureD3(profile.career_date);
    if (profile.career_date >= '2027-01-02') break;
    profile = await advanceCareerDayOnce(profile);
  }
  await captureD3(profile.career_date);
  const season = (await localGame.entities.Tournament.list('start_date', 2000)).filter((row) => row.year === 2026 && row.world_tour_event);
  const results = await localGame.entities.AthleteRankingResult.list(null, 20000);
  const tournamentResults = results.filter((row) => row.tournament_id && row.date?.startsWith('2026-'));
  const athletes = await localGame.entities.AthleteProfile.list('-race_points', 2000);
  const raceRows = athletes.filter((row) => Number(row.race_points) > 0).sort((a, b) => Number(b.race_points) - Number(a.race_points));
  const resultByAthlete = new Map();
  for (const row of tournamentResults) resultByAthlete.set(row.athlete_id, [...(resultByAthlete.get(row.athlete_id) || []), row]);
  const top20 = raceRows.slice(0, 20).map((athlete, index) => {
    const rows = resultByAthlete.get(athlete.id) || [];
    return { position: index + 1, athlete: athlete.name, points: athlete.race_points, masters: rows.filter((row) => row.tier === 'Masters' && row.finish === 'champion').length, elite: rows.filter((row) => row.tier === 'Elite' && row.finish === 'champion').length, crown: rows.filter((row) => row.tier === 'Crown' && row.finish === 'champion').length, otherTitles: rows.filter((row) => row.finish === 'champion' && !['Masters', 'Elite', 'Crown'].includes(row.tier)).length, events: new Set(rows.map((row) => row.tournament_id)).size };
  });
  const topTier = season.filter((row) => ['Masters', 'Elite', 'Crown'].includes(row.tier));
  const topParticipation = topTier.map((tournament) => {
    const snapshot = d3Snapshots.get(tournament.id);
    const participantText = new Set((tournament.participants || []).map(String));
    const eligible = snapshot?.top10 || [];
    const present = eligible.filter((name) => [...participantText].some((team) => team.includes(name)));
    return { tier: tournament.tier, name: tournament.name, top10Eligible: eligible.length, participated: present.length, absent: eligible.filter((name) => !present.includes(name)).join(' | '), reason: present.length >= 6 ? 'eligible-converged' : 'field-policy-or-partnership' };
  });
  const pairSymmetry = [];
  for (const tournament of season.filter((row) => row.champion || row.runner_up).slice(0, 20)) {
    const rows = tournamentResults.filter((row) => row.tournament_id === tournament.id);
    const byPartner = new Map(athletes.map((athlete) => [athlete.id, athlete.ai_partner_id]));
    for (const row of rows) {
      const partnerId = byPartner.get(row.athlete_id);
      const peer = rows.find((other) => other.athlete_id === partnerId);
      if (peer) pairSymmetry.push({ tournament: tournament.id, athlete: row.athlete_id, partner: partnerId, points: row.points, partnerPoints: peer.points, equal: row.points === peer.points, finish: row.finish });
    }
  }
  console.log('SEASON_DATE', profile.career_date);
  console.log('CALENDAR_METRICS', JSON.stringify(metrics(season)));
  console.log('D3_BY_TIER', JSON.stringify([...d3Snapshots.values()].reduce((acc, row) => { acc[row.tier] = (acc[row.tier] || 0) + 1; return acc; }, {})));
  console.log('TOP_TIER_PARTICIPATION', JSON.stringify(topParticipation));
  console.log('RACE_TOP20', JSON.stringify(top20));
  console.log('RACE_SUMMARY', JSON.stringify({ positiveAthletes: raceRows.length, top10Points: raceRows.slice(0, 10).reduce((sum, row) => sum + Number(row.race_points), 0), totalPoints: raceRows.reduce((sum, row) => sum + Number(row.race_points), 0), gap1to2: Number(raceRows[0]?.race_points || 0) - Number(raceRows[1]?.race_points || 0), gapTop10: Number(raceRows[0]?.race_points || 0) - Number(raceRows[9]?.race_points || 0) }));
  console.log('PAIR_SYMMETRY', JSON.stringify(pairSymmetry.slice(0, 12)));
  assert(season.length > 0);
} finally { await vite.close(); }
