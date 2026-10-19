// CLOUD-7C (somente diagnóstico) — torneios que nunca encerram depois da eliminação do jogador no qualifying.
// Classifica todos os torneios não finalizados já vencidos e, para os torneios com qualifying do jogador, o desfecho.
// Uso: node scripts/diagnose-cloud-7c-qualifying-pending.mjs <save.json> [--output=<json>]
import fs from 'node:fs';
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const outFile = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
const save = JSON.parse(fs.readFileSync(file, 'utf8'));
const E = save.entities; const date = save.player.career_date; const pid = save.player.id;
const day = 86400000;
const eventByTournament = new Map((E.CalendarEvent || []).filter((e) => e.profile_id === pid && e.event_type === 'tournament').map((e) => [e.related_id, e]));
const resultsByTournament = new Map(); for (const r of E.AthleteRankingResult || []) resultsByTournament.set(r.tournament_id, (resultsByTournament.get(r.tournament_id) || 0) + 1);
const worldEventByTournament = new Set((E.WorldEvent || []).map((w) => w.related_tournament_id).filter(Boolean));
const out = { file, careerDate: date, classes: {}, qualifyingOutcomes: {}, stuck: [], pastNotFinalized: 0 };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const stuckSamples = [];
for (const t of E.Tournament) {
  const run = eventByTournament.get(t.id)?.metadata?.tournament_run;
  const hasQualifying = (run?.matches || []).some((m) => m.stage === 'qualifying');
  const mainPlayed = (run?.matches || []).filter((m) => m.stage === 'main' && m.status === 'completed').length;
  if (hasQualifying) {
    const outcome = run.status === 'eliminated' && mainPlayed === 0 ? 'eliminado_no_qualifying' : (run.status === 'eliminated' ? 'passou_qualifying_eliminado_na_chave' : run.status === 'champion' ? 'campeao' : `run_${run.status}`);
    bump(out.qualifyingOutcomes, `${outcome} | torneio=${t.status}${t.world_tour_resolved ? '/resolvido' : '/nao_resolvido'}`);
  }
  if (t.status === 'finalizado' || t.status === 'cancelado') continue;
  const ended = t.end_date && t.end_date < date; const age = ended ? Math.round((new Date(date) - new Date(t.end_date)) / day) : null;
  if (!ended) { bump(out.classes, 'em_andamento_ou_futuro (legitimo)'); continue; }
  out.pastNotFinalized += 1;
  if (age <= 14) { bump(out.classes, 'encerrado_ha_ate_14_dias (legitimo: janela de liquidacao)'); continue; }
  const kind = t.player_participated && hasQualifying && run.status === 'eliminated' && mainPlayed === 0 ? 'DEFEITO: jogador eliminado no qualifying; slot do jogador nunca fecha' : 'DEFEITO: outro motivo';
  bump(out.classes, kind);
  const pm = (t.bracket_history || []).flatMap((r) => r.matches).filter((m) => m.player_match);
  out.stuck.push({ id: t.id, tier: t.tier, start: t.start_date, end: t.end_date, ageDays: age, status: t.status, phase: t.current_phase, champion: t.champion || null, runner_up: t.runner_up || null, resolved: Boolean(t.world_tour_resolved),
    rankingResultRows: resultsByTournament.get(t.id) || 0, hasWorldEventResult: worldEventByTournament.has(t.id), playerSlots: pm.map((m) => `${m.status}/${m.team_a ? 'times' : 'vazio'}`).join(' '), playerRunStatus: run?.status || null, playerPaidEntry: eventByTournament.get(t.id)?.status || null });
}
const resolvedSample = E.Tournament.filter((t) => t.status === 'finalizado' && t.world_tour_resolved).slice(0, 200);
out.referenceResolvedTournaments = { sampled: resolvedSample.length, withRankingResults: resolvedSample.filter((t) => (resultsByTournament.get(t.id) || 0) > 0).length, withWorldEvent: resolvedSample.filter((t) => worldEventByTournament.has(t.id)).length };
out.stuckSummary = { count: out.stuck.length, withAnyRankingResult: out.stuck.filter((s) => s.rankingResultRows > 0).length, withWorldEvent: out.stuck.filter((s) => s.hasWorldEventResult).length, withChampion: out.stuck.filter((s) => s.champion).length, byTier: out.stuck.reduce((o, s) => { bump(o, s.tier); return o; }, {}), maxAgeDays: Math.max(0, ...out.stuck.map((s) => s.ageDays)) };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, stuck: out.stuck.slice(0, 3) }, null, 1));
