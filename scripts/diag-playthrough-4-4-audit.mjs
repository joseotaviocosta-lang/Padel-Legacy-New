/** Playthrough 4.4 audit: calendar, D-3 path, ranking/Race and interviews. */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-44-audit' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

function addDays(date, amount) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function metric(values) { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, min: sorted[0] || 0, max: sorted.at(-1) || 0, avg: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0 }; }
function calendarInventory(events) {
  const byTier = {};
  for (const event of events) {
    const tier = event.tier;
    if (!byTier[tier]) byTier[tier] = [];
    byTier[tier].push(event);
  }
  const rows = Object.entries(byTier).map(([tier, rows]) => {
    const starts = rows.map((row) => row.start_date).sort();
    const intervals = starts.slice(1).map((date, index) => Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${starts[index]}T00:00:00Z`)) / 86400000));
    const weeks = new Map();
    for (const row of rows) weeks.set(row.start_date, (weeks.get(row.start_date) || 0) + 1);
    return { tier, events: rows.length, months: new Set(rows.map((row) => row.start_date.slice(0, 7))).size, overlapMax: Math.max(...weeks.values()), interval: metric(intervals) };
  });
  return rows.sort((a, b) => a.tier.localeCompare(b.tier));
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { getPendingInterviews } = await vite.ssrLoadModule('/src/lib/pressData.js');
  const { ensureContextualCareerCommunications, listCareerCommunications } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: 'Playthrough 4.4 Audit', playerName: 'Auditoria 4.4' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'playthrough-44-player', sport_name: 'Auditoria 4.4', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false, partner_id: 'partner-test', partner_name: 'Parceiro Teste', partner_chemistry: 90 });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const season = buildSeasonTournaments(2026, 'season-2026');
  console.log('=== Playthrough 4.4 audit ===');
  console.log('CALENDAR_BEFORE');
  console.table(calendarInventory(season));
  const masters = season.filter((row) => ['Masters', 'Elite', 'Crown'].includes(row.tier));
  console.log('TOP_TIER_BY_WEEK');
  const byWeek = new Map();
  for (const row of masters) byWeek.set(row.start_date, [...(byWeek.get(row.start_date) || []), row.name]);
  console.table([...byWeek.entries()].map(([start_date, names]) => ({ start_date, count: names.length, names: names.join(' | ') })));

  let profile = await activeCareerAdapter.getPlayerProfile();
  const checkpoints = {};
  for (let day = 0; day < 36; day += 1) {
    if (['2026-01-27', '2026-01-01', '2026-01-28', '2026-01-29'].includes(profile.career_date)) {
      checkpoints[profile.career_date] = await localGame.entities.Tournament.list('start_date', 2000);
    }
    if (profile.career_date >= '2026-02-05') break;
    profile = await advanceCareerDayOnce(profile);
  }
  const wave = (await localGame.entities.Tournament.list('start_date', 2000)).filter((row) => row.world_tour_event && row.start_date === '2026-01-29');
  for (const date of ['2026-01-27', '2026-01-28', '2026-01-29']) {
    const rows = (checkpoints[date] || []).filter((row) => wave.some((item) => item.id === row.id));
    console.log(`CHECKPOINT ${date}`);
    console.table(rows.map((row) => ({ id: row.id, name: row.name, status: row.status, schema: row.bracket_schema_version || null, rounds: row.bracket_history?.length || 0, matches: (row.bracket_history || []).reduce((sum, round) => sum + (round.matches?.length || 0), 0) })));
    rows.forEach((row) => console.log(`CHECKPOINT_ROW ${date} | ${row.name} | status=${row.status} | schema=${row.bracket_schema_version || '-'} | rounds=${row.bracket_history?.length || 0} | matches=${(row.bracket_history || []).reduce((sum, round) => sum + (round.matches?.length || 0), 0)}`));
  }
  const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 2000);
  const results = await localGame.entities.AthleteRankingResult.list(null, 10000);
  const tournamentResults = results.filter((row) => row.tournament_id && Number(row.points) > 0);
  console.log(`RACE_ROWS ${tournamentResults.length} POSITIVE ${tournamentResults.length} ATHLETE_RACE_POSITIVE ${athletes.filter((row) => Number(row.race_points) > 0).length}`);
  const partnership = {
    id: 'partnership-test', status: 'ativa', chemistry: 90, partner_name: 'Parceiro Teste', partner_id: 'partner-test',
  };
  const interviewProfile = { ...profile, partner_id: profile.partner_id || 'partner-test', partner_chemistry: 90, partner_name: profile.partner_name || 'Parceiro Teste' };
  const pending = getPendingInterviews(interviewProfile, [], { partnership });
  const interviewProbe = getPendingInterviews({ id: 'interview-probe', career_date: '2026-01-01', partner_id: 'partner-test', partner_chemistry: 90 }, [], { partnership });
  await ensureContextualCareerCommunications(interviewProfile, { partnership });
  const messagesBefore = await listCareerCommunications(profile.id, 200);
  const interviewRecords = await localGame.entities.PressInterview.filter({ profile_id: profile.id }, '-created_date', 20).catch(() => []);
  console.log('INTERVIEW_PENDING', JSON.stringify(pending.filter((row) => row.title === 'Parceria em Alta').map((row) => ({ id: row.id, sourceId: row.sourceId, expiresAt: row.expiresAt || null }))));
  console.log('INTERVIEW_PROBE', JSON.stringify(interviewProbe.map((row) => ({ title: row.title, sourceId: row.sourceId }))));
  console.log('INTERVIEW_MESSAGES', JSON.stringify(messagesBefore.filter((row) => row.related_entity_type === 'PressInterview').map((row) => ({ id: row.id, title: row.title, status: row.status, source: row.metadata?.interview_source_id }))));
  console.log('INTERVIEW_RECORDS', JSON.stringify(interviewRecords.map((row) => ({ id: row.id, title: row.title, status: row.interview_status, source: row.source_id }))));
  assert(season.length > 0);
} finally { await vite.close(); }
