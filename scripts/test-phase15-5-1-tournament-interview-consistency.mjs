import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
let gates = 0;
const failures = [];
function gate(label, condition) {
  gates += 1;
  if (!condition) failures.push(`${gates}. ${label}`);
}

function bracketFixture() {
  const teams = Array.from({ length: 16 }, (_, index) => `Dupla ${index + 1} & Parceiro ${index + 1}`);
  const rounds = [];
  let entrants = teams;
  for (const [roundIndex, label] of ['Oitavas', 'Quartas', 'Semifinais', 'Final'].entries()) {
    const matches = [];
    for (let index = 0; index < entrants.length; index += 2) {
      matches.push({
        id: `r${roundIndex}-m${index / 2}`,
        date: `2026-06-${String(10 + roundIndex).padStart(2, '0')}`,
        status: 'scheduled',
        team_a: entrants[index],
        team_b: entrants[index + 1],
        // Contaminação proposital: campos futuros não podem vazar.
        winner: entrants[index],
        score: '6-0 6-0',
      });
    }
    rounds.push({ round: label, date: `2026-06-${String(10 + roundIndex).padStart(2, '0')}`, matches });
    entrants = matches.map((match) => match.team_a);
  }
  return rounds;
}

function completeMatches(history, roundIndex, count = history[roundIndex].matches.length) {
  const copy = structuredClone(history);
  for (let index = 0; index < count; index += 1) {
    const match = copy[roundIndex].matches[index];
    match.status = 'completed';
    match.winner = match.team_a;
    match.score = '6-4 6-3';
  }
  return copy;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const bracketModule = await server.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const interviewModule = await server.ssrLoadModule('/src/lib/interviewLifecycle.js');
  const pressModule = await server.ssrLoadModule('/src/lib/pressData.js');
  const postMatchModule = await server.ssrLoadModule('/src/lib/postMatchInterview.js');
  const notificationModule = await server.ssrLoadModule('/src/lib/notificationCenter.js');
  const { getVisibleTournamentBracketState, sanitizeBracketHistory, visibleTournamentChampion } = bracketModule;
  const {
    buildCompletedInterviewMessagePatch,
    interviewContextKey,
    interviewNotificationIdentity,
    isInterviewActionable,
  } = interviewModule;
  const { getPendingInterviews } = pressModule;
  const { buildOfficialInterviewProgressPatch, postMatchInterviewIdentity, postMatchInterviewMessageId } = postMatchModule;

  const noDraw = getVisibleTournamentBracketState({ start_date: '2026-06-10', status: 'inscricoes' }, '2026-06-01');
  gate('chave não sorteada é identificada', noDraw.drawn === false);
  gate('chave não sorteada não tem rodadas', noDraw.rounds.length === 0);
  gate('chave não sorteada não tem campeão', noDraw.champion === null);

  const pristine = bracketFixture();
  const futureTournament = { start_date: '2026-06-10', status: 'inscricoes', current_phase: 'registered', champion: 'CAMPEÃO INVÁLIDO', bracket_history: pristine };
  const preDraw = getVisibleTournamentBracketState(futureTournament, '2026-06-01');
  gate('sorteio futuro preserva oito confrontos iniciais', preDraw.rounds[0].matches.length === 8);
  gate('sorteio futuro preserva participante inicial A', preDraw.rounds[0].matches[0].team_a === pristine[0].matches[0].team_a);
  gate('sorteio futuro preserva participante inicial B', preDraw.rounds[0].matches[0].team_b === pristine[0].matches[0].team_b);
  gate('sorteio futuro remove winner contaminado', preDraw.rounds.flatMap((round) => round.matches).every((match) => match.winner === null));
  gate('sorteio futuro remove score contaminado', preDraw.rounds.flatMap((round) => round.matches).every((match) => match.score === null));
  gate('quartas futuras usam placeholder', preDraw.rounds[1].matches[0].team_a === 'Vencedor Jogo 1');
  gate('semifinal futura usa placeholder', preDraw.rounds[2].matches[0].team_a === 'Vencedor Jogo 1');
  gate('final futura usa placeholder', preDraw.rounds[3].matches[0].team_b === 'Vencedor Jogo 2');
  gate('campeão persistido prematuramente é ocultado', visibleTournamentChampion(futureTournament, '2026-06-01') === null);

  const oneR16 = completeMatches(pristine, 0, 1);
  const afterOne = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: oneR16 }, '2026-06-10');
  gate('um vencedor real da R16 avança', afterOne.rounds[1].matches[0].team_a === oneR16[0].matches[0].winner);
  gate('slot pareado não resolvido continua placeholder', afterOne.rounds[1].matches[0].team_b === 'Vencedor Jogo 2');
  gate('nenhum participante vaza para semifinal após um jogo', afterOne.rounds[2].matches.every((match) => /^Vencedor Jogo/.test(match.team_a) && /^Vencedor Jogo/.test(match.team_b)));

  const allR16 = completeMatches(pristine, 0);
  const afterR16 = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: allR16 }, '2026-06-10');
  gate('R16 completa preenche todas as quartas', afterR16.rounds[1].matches.every((match) => !/^Vencedor Jogo/.test(match.team_a) && !/^Vencedor Jogo/.test(match.team_b)));
  gate('R16 completa não preenche semifinais', afterR16.rounds[2].matches.every((match) => /^Vencedor Jogo/.test(match.team_a) && /^Vencedor Jogo/.test(match.team_b)));

  let partialQf = completeMatches(allR16, 1, 2);
  const afterPartialQf = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: partialQf }, '2026-06-11');
  gate('QF parcial preenche somente uma semifinal', !/^Vencedor Jogo/.test(afterPartialQf.rounds[2].matches[0].team_a) && !/^Vencedor Jogo/.test(afterPartialQf.rounds[2].matches[0].team_b));
  gate('QF parcial mantém outra semifinal indefinida', /^Vencedor Jogo/.test(afterPartialQf.rounds[2].matches[1].team_a) && /^Vencedor Jogo/.test(afterPartialQf.rounds[2].matches[1].team_b));

  const allQf = completeMatches(allR16, 1);
  const afterQf = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: allQf }, '2026-06-11');
  gate('QF completa preenche semifinais', afterQf.rounds[2].matches.every((match) => !/^Vencedor Jogo/.test(match.team_a) && !/^Vencedor Jogo/.test(match.team_b)));
  gate('QF completa ainda não preenche final', /^Vencedor Jogo/.test(afterQf.rounds[3].matches[0].team_a));

  const oneSemi = completeMatches(allQf, 2, 1);
  const afterOneSemi = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: oneSemi }, '2026-06-12');
  gate('uma semifinal preenche somente um slot da final', !/^Vencedor Jogo/.test(afterOneSemi.rounds[3].matches[0].team_a) && /^Vencedor Jogo/.test(afterOneSemi.rounds[3].matches[0].team_b));
  const allSemi = completeMatches(allQf, 2);
  const afterSemi = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: allSemi }, '2026-06-12');
  gate('semifinais completas preenchem a final', !/^Vencedor Jogo/.test(afterSemi.rounds[3].matches[0].team_a) && !/^Vencedor Jogo/.test(afterSemi.rounds[3].matches[0].team_b));
  gate('final ainda sem resultado não tem campeão', afterSemi.champion === null);

  const finishedHistory = completeMatches(allSemi, 3);
  const pendingFinal = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: finishedHistory }, '2026-06-13');
  gate('resultado terminal sem fechamento do torneio ainda não publica campeão', pendingFinal.champion === null);
  const finished = getVisibleTournamentBracketState({ ...futureTournament, status: 'finalizado', bracket_history: finishedHistory }, '2026-06-13');
  gate('campeão aparece após final e fechamento terminal', finished.champion === finishedHistory[3].matches[0].winner);
  gate('final concluída preserva score real', finished.rounds[3].matches[0].score === '6-4 6-3');

  const legacyFuture = structuredClone(finishedHistory);
  const sanitizedLegacy = sanitizeBracketHistory({ ...futureTournament, bracket_history: legacyFuture }, '2026-06-01');
  gate('save legado futuro tem todos os winners sanitizados', sanitizedLegacy.flatMap((round) => round.matches).every((match) => match.winner === null));
  gate('save legado futuro tem todos os scores sanitizados', sanitizedLegacy.flatMap((round) => round.matches).every((match) => match.score === null));

  let prematureParticipants = 0;
  for (let simulation = 0; simulation < 100; simulation += 1) {
    let history = bracketFixture();
    const completedR16 = simulation % 9;
    history = completeMatches(history, 0, completedR16);
    if (completedR16 === 8) {
      const completedQf = simulation % 5;
      history = completeMatches(history, 1, completedQf);
      if (completedQf === 4) {
        const completedSf = simulation % 3;
        history = completeMatches(history, 2, completedSf);
      }
    }
    const date = completedR16 < 8 ? '2026-06-10' : history[1].matches.every((match) => match.status === 'completed') ? '2026-06-12' : '2026-06-11';
    const view = getVisibleTournamentBracketState({ ...futureTournament, status: 'in_progress', bracket_history: history }, date);
    for (let roundIndex = 1; roundIndex < view.rounds.length; roundIndex += 1) {
      const qualifiers = new Set(view.rounds[roundIndex - 1].matches.map((match) => match.winner).filter(Boolean));
      for (const entrant of view.rounds[roundIndex].matches.flatMap((match) => [match.team_a, match.team_b])) {
        if (!/^Vencedor Jogo/.test(entrant) && !qualifiers.has(entrant)) prematureParticipants += 1;
      }
    }
  }
  gate('100 torneios foram simulados', true);
  gate('100 torneios não exibiram avanço visual prematuro', prematureParticipants === 0);

  const profile = {
    id: 'phase15-5-1-player', sport_name: 'Atleta QA', career_date: '2026-07-20',
    matches_played: 2, wins: 1, losses: 1, interviews_given: 4, media_appearances: 5,
  };
  const matchBase = {
    id: 'phase15-5-1-match', profile_id: profile.id, date: profile.career_date,
    played_date: profile.career_date, status: 'completed', match_type: 'tournament',
    competition_type: 'tournament', is_official: true, is_tournament: true,
    match_occurred: true, tournament_id: 'qa-tournament', tournament_name: 'QA Masters',
    tournament_round: 'Quartas', score: '6-4 6-3', team_a: [profile.sport_name, 'Parceiro QA'],
    team_b: ['Rival A', 'Rival B'],
  };
  const win = { ...matchBase, result: 'vitória', winner: 'A' };
  const loss = { ...matchBase, id: 'phase15-5-1-loss', result: 'derrota', winner: 'B' };
  const emptyContext = { calendarEvents: [], registrations: [], partnership: null, pressArticles: [] };
  const winPending = getPendingInterviews(profile, [win], emptyContext);
  gate('vitória gera entrevista pós-vitória real', winPending.length === 1 && winPending[0].questionCategory === 'post_win');
  gate('entrevista de vitória é acionável', isInterviewActionable(winPending[0], profile.career_date));
  const lossPending = getPendingInterviews(profile, [loss], emptyContext);
  gate('derrota gera entrevista pós-derrota real', lossPending.length === 1 && lossPending[0].questionCategory === 'post_loss');
  gate('entrevista de derrota é acionável', isInterviewActionable(lossPending[0], profile.career_date));
  gate('identidade pós-jogo é estável por match', winPending[0].id === postMatchInterviewIdentity(win.id).id);
  gate('identidade da mensagem pós-jogo é estável', postMatchInterviewMessageId(profile.id, win.id) === interviewNotificationIdentity(profile.id, winPending[0]).messageId);

  const completedProfile = { ...profile, processed_press_interview_sources: [winPending[0].sourceId] };
  gate('conclusão remove entrevista da lista pendente', getPendingInterviews(completedProfile, [win], emptyContext).length === 0);
  gate('reload não regenera entrevista concluída', getPendingInterviews(structuredClone(completedProfile), [structuredClone(win)], emptyContext).length === 0);
  gate('avanço de dia não regenera entrevista concluída', getPendingInterviews({ ...completedProfile, career_date: '2026-07-21' }, [win], emptyContext).length === 0);
  gate('fechar sem entrevistar mantém pendência', getPendingInterviews(profile, [win], emptyContext).length === 1);
  const progress = buildOfficialInterviewProgressPatch(profile, winPending[0], [win]);
  gate('primeira conclusão aplica contador oficial', progress.interviews_given === 5 && progress.media_appearances === 6);
  gate('retry não duplica recompensa/contador', Object.keys(buildOfficialInterviewProgressPatch(completedProfile, winPending[0], [win])).length === 0);

  const articleContext = { ...emptyContext, pressArticles: [{ source_event_id: winPending[0].sourceId, interview_status: 'answered' }] };
  gate('publicação respondida também encerra a pendência', getPendingInterviews(profile, [win], articleContext).length === 0);

  const partnership = { id: 'partnership-qa', status: 'ativa', is_active: true, chemistry: 88, partner_name: 'Parceiro QA' };
  const highPartnership = getPendingInterviews(profile, [], { ...emptyContext, partnership });
  const positive = highPartnership.find((interview) => interview.title === 'Parceria em Alta');
  gate('Parceria em Alta existe como entrevista real quando elegível', Boolean(positive));
  gate('Parceria em Alta é acionável pela regra central', isInterviewActionable(positive, profile.career_date));
  gate('Parceria em Alta tem identidade estável sem data diária', positive.sourceId === 'partnership-positive:partnership-qa');
  const positiveTomorrow = getPendingInterviews({ ...profile, career_date: '2026-07-21' }, [], { ...emptyContext, partnership }).find((interview) => interview.title === 'Parceria em Alta');
  gate('Parceria em Alta mantém a mesma identidade no dia seguinte', positiveTomorrow?.sourceId === positive.sourceId);
  gate('Parceria em Alta concluída não reaparece', !getPendingInterviews({ ...profile, processed_press_interview_sources: [positive.sourceId] }, [], { ...emptyContext, partnership }).some((interview) => interview.title === 'Parceria em Alta'));
  gate('sem parceria não existe notificação derivável de Parceria em Alta', !getPendingInterviews(profile, [], emptyContext).some((interview) => interview.title === 'Parceria em Alta'));

  const actionableFixture = { id: 'i', sourceId: 'source:i', type: 'interview', questionCategory: 'partner_positive', status: 'available', availableFrom: '2026-07-20', expiresAt: '2026-07-22' };
  gate('entrevista dentro da janela é acionável', isInterviewActionable(actionableFixture, '2026-07-21'));
  gate('entrevista antes da janela não é acionável', !isInterviewActionable(actionableFixture, '2026-07-19'));
  gate('entrevista expirada não é acionável', !isInterviewActionable(actionableFixture, '2026-07-23'));
  gate('entrevista concluída não é acionável', !isInterviewActionable({ ...actionableFixture, status: 'completed' }, '2026-07-21'));
  gate('entrevista sem deep identity não é acionável', !isInterviewActionable({ type: 'interview', questionCategory: 'post_win' }, '2026-07-21'));
  gate('context key canônica deriva do source', interviewContextKey(actionableFixture) === 'press-interview:source:i');
  const completionPatch = buildCompletedInterviewMessagePatch(actionableFixture, '2026-07-21T12:00:00.000Z', { route: '/press', tournament_id: 'qa' });
  gate('conclusão resolve a mensagem', completionPatch.status === 'resolvida' && completionPatch.is_read === true && completionPatch.is_new === false);
  gate('conclusão preserva metadata histórica', completionPatch.metadata.route === '/press' && completionPatch.metadata.tournament_id === 'qa');
  gate('conclusão registra source estável', completionPatch.metadata.interview_source_id === actionableFixture.sourceId && completionPatch.metadata.interview_completed === true);
  gate('mensagem resolvida deixa de ser ação necessária', notificationModule.getNotificationAttentionLevel({ status: 'resolvida', priority: 'alta' }) === 'Informação');
  gate('mensagem pendente continua ação necessária', notificationModule.getNotificationAttentionLevel({ status: 'nao_lida', priority: 'alta' }) === 'Ação');

  const liveMatchSource = read('src/components/matches/LiveMatch.jsx');
  const modalSource = read('src/components/tournaments/TournamentModal.jsx');
  const simulationSource = read('src/components/matches/SimulationModal.jsx');
  const modalShellSource = read('src/components/design-system/ModalShell.jsx');
  const pressSource = read('src/pages/Press.jsx');
  const communicationsSource = read('src/lib/careerCommunications.js');
  const bellSource = read('src/components/communications/CommunicationBell.jsx');
  gate('CoachPanel usa flex vertical expansível', liveMatchSource.includes('data-coach-panel className="flex h-full min-h-0 flex-col overflow-hidden"'));
  gate('ações do técnico ficam fora do scroll', liveMatchSource.includes('data-coach-actions') && liveMatchSource.includes('shrink-0 grid-cols-2'));
  gate('ações do técnico respeitam safe-area', liveMatchSource.includes('env(safe-area-inset-bottom)'));
  gate('ações do técnico preservam touch target de 44px', liveMatchSource.includes('pl-btn-tap min-h-11'));
  gate('ModalShell permite controlar somente o overflow do conteúdo', modalShellSource.includes('contentClassName'));
  gate('TournamentModal reserva todo o conteúdo da partida', modalSource.includes("contentClassName={phase === 'match' ? 'flex flex-col overflow-hidden'"));
  gate('SimulationModal reserva todo o conteúdo da partida', simulationSource.includes("contentClassName={phase === 'live' ? 'flex flex-col overflow-hidden'"));
  gate('footer de playback permanece shrink-0', liveMatchSource.includes('<div className="shrink-0">') && liveMatchSource.includes('<PlaybackControls'));
  gate('CTA usa isInterviewActionable no resultado', modalSource.includes('postMatchInterviewActionable = isInterviewActionable'));
  gate('lista e deep-link usam somente pending acionável', pressSource.includes('isInterviewActionable(interview, profile?.career_date)'));
  gate('conclusão resolve imediatamente a mensagem vinculada', pressSource.includes('resolveRelatedInterviewMessage(interview)'));
  gate('retry de finalização não ressuscita mensagem', modalSource.includes('rewardAlreadyApplied ? [] : buildRoundMediaOperations'));
  gate('reconciliação expira entrevista derivada fantasma', communicationsSource.includes("expired_reason: 'interview_no_longer_actionable'"));
  gate('Notification Center continua Portal em document.body', bellSource.includes('createPortal(') && bellSource.includes('document.body'));
  gate('Notification Center continua drawer lateral', bellSource.includes('absolute inset-y-0 right-0'));
  gate('Notification Center preserva Android Back/overlay behavior', bellSource.includes('useOverlayBehavior'));
  gate('nenhum polling novo foi adicionado', !read('src/lib/interviewLifecycle.js').includes('setInterval') && !read('src/lib/tournamentBracketView.js').includes('setInterval'));
  gate('helpers não leem storage', !read('src/lib/interviewLifecycle.js').match(/localStorage|sessionStorage|localGame/) && !read('src/lib/tournamentBracketView.js').match(/localStorage|sessionStorage|localGame/));

  if (failures.length) {
    throw new Error(`Phase15.5.1 Tournament/Interview: FAIL (${failures.length}/${gates})\n${failures.join('\n')}`);
  }
  console.log(`Phase15.5.1 Tournament/Interview: PASS (${gates} gates; 100 torneios simulados)`);
} finally {
  await server.close();
}
