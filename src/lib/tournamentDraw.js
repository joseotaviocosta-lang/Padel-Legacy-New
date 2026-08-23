// Fase 15.5.4 (complemento — sorteio na data canônica, não no mount do
// modal). Antes desta correção, TournamentModal.jsx criava o
// tournament_run/bracket na primeira vez que o jogador abria a tela do
// torneio — ou seja, o "sorteio" podia acontecer no dia da inscrição,
// semanas antes do primeiro compromisso real, e reabrir/fechar o modal
// nunca revelava nada além do que já existia (mas também nunca escondia
// um adversário que "ainda não deveria" ser conhecido). Esta função move
// a criação para a pipeline temporal da carreira: só é chamada de
// processCalendarEvents (src/lib/calendarSystem.js, dentro de advanceDay),
// nunca de um efeito de render — abrir/fechar o modal do torneio passa a
// apenas LER o que já foi persistido, nunca criar ou recriar o sorteio.
import { localGame } from '@/api/localGameClient.js';
import { daysBetween, generateTournamentOpponent, getPartnerBot, getTournamentRounds } from '@/lib/career';
import { getTeamRank } from '@/lib/teamRanking';
import { getQualifyingRoundLabels } from '@/gameplay/worldTour/QualifyingManager.js';
import {
  buildTournamentBracketHistory, createTournamentRun, getCurrentTournamentMatch,
} from '@/gameplay/worldTour/TournamentRunManager.js';
import { createKeyedInitializer } from '@/lib/keyedInitialization.js';

export const TOURNAMENT_DRAW_LEAD_DAYS = 3;

// Mesma âncora que createTournamentRun já usava para startDate (o primeiro
// dia competitivo real da campanha, ciente de qualifying) — canônica para
// decidir tanto o calendário de rodadas quanto o momento do sorteio.
export function getTournamentDrawAnchorDate(calendarEvent, tournament) {
  return calendarEvent?.metadata?.original_start_date || calendarEvent?.start_date || tournament?.start_date || null;
}

export function isTournamentDrawDue(calendarEvent, tournament, careerDate) {
  const anchor = getTournamentDrawAnchorDate(calendarEvent, tournament);
  if (!anchor || !careerDate) return false;
  const days = daysBetween(careerDate, anchor);
  // >= 0 é essencial: um evento cuja data já passou (torneio nunca chegou a
  // ser sorteado — ex.: perdido, abandonado, ou um evento de demonstração
  // antigo sem tournament_run) NÃO deve ressuscitar como sorteio novo dias
  // ou semanas depois. Esses casos continuam caindo na checagem de
  // "perdido"/"concluído" já existente em processCalendarEvents, exatamente
  // como se comportavam antes desta pipeline existir.
  return days >= 0 && days <= TOURNAMENT_DRAW_LEAD_DAYS;
}

// Migração de saves anteriores ao schema v2 do tournament_run (campos
// legados metadata.main_draw_state/qualifying_state) — mesma lógica que
// antes vivia só em TournamentModal.jsx; agora usada por quem realmente
// cria o run (abaixo), já que a criação deixou de acontecer lá.
export function normalizeLegacyRun(run, metadata = {}) {
  if (!run || run.meetingsCompleted?.preTournament || !(metadata.main_draw_state?.results?.length || metadata.qualifying_state?.results?.length)) return run;
  const next = JSON.parse(JSON.stringify(run));
  next.meetingsCompleted.preTournament = true;
  const legacyResults = [
    ...(metadata.qualifying_state?.results || []).map((result) => ({ ...result, stage: 'qualifying' })),
    ...(metadata.main_draw_state?.results || []).map((result) => ({ ...result, stage: 'main' })),
  ];
  legacyResults.forEach((result) => {
    const match = next.matches.find((item) => item.stage === result.stage && item.status !== 'completed');
    if (!match) return;
    match.status = 'completed';
    match.preparationCompleted = true;
    match.result = { won: Boolean(result.won), score: result.score || null };
  });
  const nextIndex = next.matches.findIndex((match) => match.status !== 'completed');
  next.currentRound = nextIndex < 0 ? Math.max(0, next.matches.length - 1) : nextIndex;
  if (nextIndex >= 0) next.status = 'between_rounds';
  return next;
}

async function createDrawnRun({ profile, tournament, calendarEvent }) {
  const entities = /** @type {any} */ (localGame.entities);
  const partner = getPartnerBot(profile);
  const rank = partner ? await getTeamRank(profile, partner) : { rank: 0, total: 0 };
  const mainRounds = getTournamentRounds(tournament);
  const qualifyingRequired = Boolean(calendarEvent.metadata?.qualifying_required);
  const qualifyingRounds = qualifyingRequired
    ? getQualifyingRoundLabels(tournament).map((label) => ({ label, short: 'Q' }))
    : [];
  const stageRounds = [
    ...qualifyingRounds.map((round, index) => ({ ...round, stage: 'qualifying', stageRoundIndex: index })),
    ...mainRounds.map((round, index) => ({ ...round, stage: 'main', stageRoundIndex: index })),
  ];
  const usedIds = [partner?.id].filter(Boolean);
  const opponents = stageRounds.map((round) => {
    let members = generateTournamentOpponent(tournament, profile, round.stageRoundIndex, usedIds, rank.rank, round.stage);
    if (members.length < 2) members = generateTournamentOpponent(tournament, profile, round.stageRoundIndex, [partner?.id].filter(Boolean), rank.rank, round.stage);
    usedIds.push(...members.map((item) => item.id));
    return { members, rank: Math.max(1, Number(rank.rank || 240) - (round.stageRoundIndex + 1) * (round.stage === 'main' ? 8 : 3)) };
  });
  let tournamentRun = createTournamentRun({
    tournament,
    profileId: profile.id,
    startDate: getTournamentDrawAnchorDate(calendarEvent, tournament),
    qualifyingRounds,
    mainRounds,
    qualifyingRequired,
    opponents,
  });
  tournamentRun = normalizeLegacyRun(tournamentRun, calendarEvent.metadata || {});
  const playerTeam = `${profile?.sport_name || profile?.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`;
  const savedEvent = await entities.CalendarEvent.update(calendarEvent.id, {
    title: `${tournament.name} — ${getCurrentTournamentMatch(tournamentRun)?.round || 'Torneio'}`,
    start_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.start_date,
    end_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.end_date,
    requires_decision: !['eliminated', 'champion', 'finished'].includes(tournamentRun.status),
    metadata: { ...(calendarEvent.metadata || {}), tournament_run: tournamentRun, tournament_run_schema_version: 2 },
  });
  await entities.Tournament.update(tournament.id, {
    bracket_history: buildTournamentBracketHistory(tournamentRun, playerTeam),
    current_phase: tournamentRun.status,
  }).catch(() => {});
  return { run: tournamentRun, event: savedEvent };
}

// Colapsa apenas chamadas CONCORRENTES para o mesmo CalendarEvent dentro da
// mesma sessão (ex.: o dia de avanço e uma leitura do sino de notificações
// disputando o mesmo instante) — não é a garantia real de idempotência
// entre reloads/sessões diferentes, essa vem do guard de
// `metadata.tournament_run` em ensureTournamentDraw, abaixo.
const singleFlight = createKeyedInitializer(createDrawnRun);

// Ponto único e idempotente de criação do sorteio. Chamado exclusivamente
// pela pipeline de avanço de dia (processCalendarEvents, dentro de
// advanceDay) — nunca por um efeito de montagem de componente. Um
// `tournament_run` já persistido é tratado como estado legado válido:
// nunca é apagado, resorteado ou tem adversários trocados, mesmo que
// tenha sido criado pela implementação antiga (no mount do modal, antes
// deste hotfix).
export async function ensureTournamentDraw({ profile, tournament, calendarEvent }) {
  if (calendarEvent?.metadata?.tournament_run) {
    return { run: calendarEvent.metadata.tournament_run, event: calendarEvent, created: false, drawn: true };
  }
  if (!tournament || !calendarEvent || !profile?.id) {
    return { run: null, event: calendarEvent || null, created: false, drawn: false };
  }
  // Fase 15.6 (achado real — QA físico, "primeiro torneio" bloqueando o
  // calendário sem inscrição): todo CalendarEvent do tipo 'tournament' criado
  // por um registro real (registerTournament, tournamentRegistration.js)
  // grava `metadata.registration_id`. O seed de demonstração
  // (src/local/localSeed.js, CalendarEvent 'cal-002') é um evento
  // event_type:'tournament'/status:'scheduled'/related_id válido só para
  // ilustrar o calendário — nunca teve inscrição real (is_mandatory:false,
  // sem metadata). Sem este guard, esta pipeline sorteava esse evento de
  // demonstração como se fosse uma campanha real assim que sua data
  // chegasse, e a escrita de `requires_decision:true` (abaixo) o
  // transformava numa decisão obrigatória bloqueando advanceDay para
  // QUALQUER carreira nova — mesmo sem o jogador nunca ter se inscrito em
  // nada. Nenhum sorteio deve nascer sem uma inscrição real por trás.
  if (!calendarEvent.metadata?.registration_id) {
    return { run: null, event: calendarEvent, created: false, drawn: false };
  }
  if (!isTournamentDrawDue(calendarEvent, tournament, profile.career_date)) {
    return { run: null, event: calendarEvent, created: false, drawn: false };
  }
  const { run, event } = await singleFlight(calendarEvent.id, { profile, tournament, calendarEvent });
  return { run, event, created: true, drawn: true };
}
