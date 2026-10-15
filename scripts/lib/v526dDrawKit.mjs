// Playthrough 5.26-D — kit compartilhado dos testes de PARIDADE DO CAMPO
// (duplas reais do mundo no torneio do jogador). Usa os módulos reais via Vite
// SSR e uma carreira REAL semeada (bootCareer → createRealCareer →
// ensureWorldSeed2025), de onde saem as duplas canônicas do mundo.
import { bootCareer } from './v526bTestKit.mjs';

/** Carreira real + um parceiro de mundo definido (exclusão/identidade). */
export async function bootDrawCareer(seed, { warmDays = 8 } = {}) {
  const ctx = await bootCareer(seed);
  const { rt } = ctx;
  const athletes = (await rt.localGame.entities.AthleteProfile.list('-world_ranking_points', 5000)) || [];
  const partner = athletes.find((a) => a && a.retired !== true && a.career_status !== 'aposentado') || athletes[0] || null;
  let profile = await rt.localGame.entities.PlayerProfile.update(ctx.profile.id, {
    ...(partner?.id ? { partner_id: partner.id } : {}),
  });
  // Aquece o mundo pelo pipeline REAL: processWorldCircuit/updateTeamRankings
  // materializam as linhas de TeamRanking das duplas canônicas (sem isso, um
  // mundo no dia 0 só tem as linhas da semeadura, que não cobrem as duplas
  // procedurais — artefato do teste, não do jogo).
  if (warmDays > 0) {
    const from = profile.career_date;
    const result = await rt.calendar.advanceCareerDays(profile, warmDays);
    profile = await rt.calendar.finalizeCareerAdvanceRange(result.profile, from, result.profile.career_date);
    profile = await rt.localGame.entities.PlayerProfile.get(ctx.profile.id);
  }
  return { ...ctx, profile, partner, athletes };
}

/**
 * Cria um Tournament + CalendarEvent de campanha (registration_id real) e roda
 * o sorteio D-3 pela MESMA pipeline de produção (ensureTournamentDraw).
 * `anchorDate` default = career_date do perfil (D-0 → dias=0, dentro da janela).
 */
export async function drawPlayerTournament(rt, {
  profile, tournamentId, tier = 'Silver', anchorDate = null, mainDrawSize = null,
  qualifyingRequired = false, name = null, registrationId = null,
}) {
  const E = rt.localGame.entities;
  const anchor = anchorDate || profile.career_date;
  const tournament = await E.Tournament.create({
    id: tournamentId,
    name: name || `${tier} ${tournamentId}`,
    tier,
    start_date: anchor,
    end_date: anchor,
    status: 'inscricoes',
    world_tour_event: false,
    ...(mainDrawSize ? { main_draw_size: mainDrawSize } : {}),
  });
  const event = await E.CalendarEvent.create({
    id: `${tournamentId}-cal`,
    profile_id: profile.id,
    event_type: 'tournament',
    title: tournament.name,
    start_date: anchor,
    end_date: anchor,
    related_id: tournamentId,
    related_name: tournament.name,
    status: 'scheduled',
    is_mandatory: true,
    requires_decision: true,
    decision_type: 'play_tournament',
    metadata: {
      registration_id: registrationId || `${tournamentId}-reg`,
      partner_id: profile.partner_id || null,
      entry_path: 'direct',
      qualifying_required: qualifyingRequired,
      team_rank: 0,
      original_start_date: anchor,
    },
  });
  const { ensureTournamentDraw } = await rt.load('/src/lib/tournamentDraw.js');
  const result = await ensureTournamentDraw({
    profile: { ...profile, career_date: anchor }, tournament, calendarEvent: event,
  });
  const freshTournament = await E.Tournament.get(tournamentId);
  const freshEvent = await E.CalendarEvent.get(event.id);
  return {
    tournament: freshTournament,
    event: freshEvent,
    run: freshEvent?.metadata?.tournament_run || result.run,
    result,
  };
}

/** Visão do MAIN DRAW de um run/época (adversários reais por rodada). */
export function mainDrawMatches(run) {
  return (run?.matches || []).filter((match) => match.stage === 'main');
}

/** IDs de todos os membros das duplas reais do snapshot do sorteio. */
export function snapshotMemberIds(tournament) {
  return (tournament?.draw_ranking_snapshot || []).flatMap((row) => row.member_ids || []);
}

/** IDs de membros do roster real por rodada do main draw. */
export function opponentMemberIds(run) {
  return mainDrawMatches(run).flatMap((match) => (match.opponent || []).map((member) => member?.id).filter(Boolean));
}

/** Resolve o rank canônico de uma dupla do snapshot, com fallback de nomes. */
export async function canonicalRank(TR, members) {
  return TR.getCanonicalTeamWorldRank((members || []).map((member) => (
    typeof member === 'string' ? member : { id: member.id, name: member.name }
  )));
}

/** Linhas de AthleteProfile para uma lista de ids. */
export async function athleteRows(rt, ids) {
  const E = rt.localGame.entities;
  return Promise.all((ids || []).map((id) => E.AthleteProfile.get(id).catch(() => null)));
}

/** Representante de elegibilidade de uma dupla (mesma forma do assignPairsForWeek). */
export async function pairEligibilityInputs(rt, memberIds) {
  const { resolveEntryRank } = await rt.load('/src/gameplay/worldTour/EntryManager.js');
  const rows = (await athleteRows(rt, memberIds)).filter(Boolean);
  if (rows.length !== 2) return null;
  const ranks = rows.map((row) => resolveEntryRank(row)).filter((value) => value > 0);
  const pairRank = ranks.length ? Math.round(ranks.reduce((sum, value) => sum + value, 0) / ranks.length) : 0;
  const representative = {
    ...rows[0],
    overall_rating: rows.reduce((sum, row) => sum + Number(row.overall_rating || row.overall || 50), 0) / rows.length,
    ...(pairRank > 0 ? { rank: pairRank, ranking_position: pairRank } : {}),
  };
  return { representative, pairRank, rows };
}

/** Cria um torneio de IA "já sorteado" que sobrepõe a janela informada. */
export async function seedCommittedTournament(rt, { id, anchorDate, drawPairIds, tier = 'Silver' }) {
  return rt.localGame.entities.Tournament.create({
    id,
    name: `Committed ${id}`,
    tier,
    start_date: anchorDate,
    end_date: anchorDate,
    status: 'chaveamento',
    world_tour_event: true,
    bracket_schema_version: 2,
    world_tour_resolved: false,
    draw_pair_ids: [...drawPairIds],
  });
}

