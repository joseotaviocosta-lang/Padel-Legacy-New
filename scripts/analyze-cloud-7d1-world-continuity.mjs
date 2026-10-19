// CLOUD-7D1 — continuidade do mundo: classifica todos os torneios de um save (fim de temporada) e confere campeões,
// WorldEvents, resultados de ranking e duplicidades. Somente leitura.
// Uso: node scripts/analyze-cloud-7d1-world-continuity.mjs <save.json> [--output=<json>]
import fs from 'node:fs';
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const save = JSON.parse(fs.readFileSync(file, 'utf8'));
const E = save.entities; const date = save.player.career_date; const pid = save.player.id;
const DAY = 86400000; const GRACE = 14;
const age = (t) => Math.round((new Date(date) - new Date(t.end_date)) / DAY);
const worldEvents = new Map(); for (const w of E.WorldEvent || []) if (w.event_type === 'tournament_result' && w.related_tournament_id) worldEvents.set(w.related_tournament_id, (worldEvents.get(w.related_tournament_id) || 0) + 1);
const resultRows = new Map(); const rowIds = new Map();
for (const r of E.AthleteRankingResult || []) { resultRows.set(r.tournament_id, (resultRows.get(r.tournament_id) || 0) + 1); rowIds.set(r.id, (rowIds.get(r.id) || 0) + 1); }
const events = new Map((E.CalendarEvent || []).filter((e) => e.profile_id === pid && e.event_type === 'tournament' && e.metadata?.tournament_run).map((e) => [e.related_id, e.metadata.tournament_run]));
const c = { scheduled_total: E.Tournament.length, cancelled: 0, finished_with_champion: 0, finished_without_champion: 0, future_or_in_progress: 0, in_grace_window: 0, overdue_unresolved: 0 };
const overdue = []; const playerTournaments = { total: 0, eliminated_in_qualifying: 0, reached_main: 0, finished: 0, unresolved_overdue: 0 };
const dupTeamPlacements = [];
for (const t of E.Tournament) {
  const run = events.get(t.id);
  if (run) {
    playerTournaments.total += 1;
    const mainPlayed = (run.matches || []).filter((m) => m.stage === 'main' && m.status === 'completed').length;
    if (run.status === 'eliminated' && mainPlayed === 0 && (run.matches || []).some((m) => m.stage === 'qualifying')) playerTournaments.eliminated_in_qualifying += 1;
    if ((run.matches || []).some((m) => m.stage === 'main' && m.status === 'completed')) playerTournaments.reached_main += 1;
  }
  if (t.status === 'cancelado') { c.cancelled += 1; continue; }
  if (t.status === 'finalizado') {
    if (t.champion) c.finished_with_champion += 1; else c.finished_without_champion += 1;
    const names = (t.placements || []).map((p) => p.team); if (names.length !== new Set(names).size) dupTeamPlacements.push(t.id);
    if (run) playerTournaments.finished += 1;
    continue;
  }
  if (!t.end_date || t.end_date >= date) { c.future_or_in_progress += 1; continue; }
  if (age(t) <= GRACE) { c.in_grace_window += 1; continue; }
  c.overdue_unresolved += 1; if (run) playerTournaments.unresolved_overdue += 1;
  overdue.push({ id: t.id, tier: t.tier, end: t.end_date, ageDays: age(t), playerRun: run?.status || null });
}
const finished = E.Tournament.filter((t) => t.status === 'finalizado' && t.champion);
const out = {
  file, careerDate: date, ...c, player: playerTournaments,
  champions_defined: finished.length,
  finished_with_world_event: finished.filter((t) => worldEvents.has(t.id)).length,
  finished_with_ranking_rows: finished.filter((t) => resultRows.has(t.id)).length,
  duplicate_world_events: [...worldEvents.values()].filter((n) => n > 1).length,
  duplicate_ranking_row_ids: [...rowIds.values()].filter((n) => n > 1).length,
  tournaments_with_repeated_team_in_placements: dupTeamPlacements,
  overdue_unresolved_list: overdue,
};
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
