import { APP_ROUTES } from '@/navigation/routes.js';
import { formatAttributeGain } from '@/lib/numberFormat.js';
import { evaluateTournamentRegistration, getTournamentRegistrationWindow, daysBetweenGameDates } from '@/lib/tournamentRegistration.js';
import { getPlayerTournamentRegistrationState, canPlayerRegisterNow, isPlayerParticipating, TOURNAMENT_REGISTRATION_STATE } from '@/lib/tournamentRegistrationState.js';
import { evaluateTournamentChoice } from '@/gameplay/worldTour/TournamentSelectionAI.js';
import { tierPreferenceFit } from '@/lib/circuitCatalog.js';
import { getTournamentDrawState, TOURNAMENT_DRAW_STATES } from '@/lib/tournamentBracketView.js';
import { pickCanonicalTournamentEvent } from '@/lib/tournamentRegistration.js';

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inWindow(value, start, end) {
  const date = parseDate(value);
  return Boolean(date && date >= start && date <= end);
}

function matchWon(match, profileId) {
  return match?.player_won === true
    || match?.is_winner === true
    || match?.winner_id === profileId
    || match?.winner_profile_id === profileId
    || match?.winner_player_id === profileId;
}

function completedMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  return ['completed', 'finished', 'concluida', 'concluido'].includes(status)
    || Boolean(match?.winner_id || match?.winner_profile_id || match?.winner_player_id || match?.winner_team_id)
    || typeof match?.player_won === 'boolean'
    || typeof match?.is_winner === 'boolean';
}

function trainingGain(session) {
  if (Number.isFinite(Number(session?.attribute_gain))) return Number(session.attribute_gain);
  const gains = session?.attribute_gains || session?.gains;
  if (!gains || typeof gains !== 'object') return 0;
  return Object.values(gains).reduce((total, value) => {
    if (Number.isFinite(Number(value))) return total + Number(value);
    if (value && Number.isFinite(Number(value.progress))) return total + Number(value.progress);
    if (value && Number.isFinite(Number(value.levels))) return total + Number(value.levels);
    return total;
  }, 0);
}

function pickHeadline({ matches, wins, trainings, unread, profile }) {
  if (profile?.is_injured || Number(profile?.injury_days_remaining) > 0) {
    return {
      tone: 'danger',
      label: 'Recuperação',
      title: 'Semana de recuperação',
      description: 'O principal objetivo é voltar à quadra sem comprometer a sequência da carreira.',
      route: '/game/calendar',
    };
  }
  if (matches >= 3 && wins === matches) {
    return {
      tone: 'success',
      label: 'Momento',
      title: 'Semana perfeita em quadra',
      description: `${wins} vitória${wins === 1 ? '' : 's'} em ${matches} partida${matches === 1 ? '' : 's'} disputada${matches === 1 ? '' : 's'}.`,
      route: '/stats',
    };
  }
  if (matches > 0 && wins === 0) {
    return {
      tone: 'warning',
      label: 'Ajuste',
      title: 'Hora de revisar o plano',
      description: 'Os resultados da semana indicam uma boa oportunidade para ajustar treino, tática e recuperação.',
      route: APP_ROUTES.TRAINING,
    };
  }
  if (trainings >= 4) {
    return {
      tone: 'info',
      label: 'Desenvolvimento',
      title: 'Semana consistente de evolução',
      description: `${trainings} sessões concluídas mantiveram o desenvolvimento da carreira em movimento.`,
      route: APP_ROUTES.TRAINING,
    };
  }
  if (unread > 0) {
    return {
      tone: 'premium',
      label: 'Comunicações',
      title: 'A equipe espera sua atenção',
      description: `${unread} comunicação${unread === 1 ? '' : 'ões'} ainda não lida${unread === 1 ? '' : 's'}.`,
      route: '/communications',
    };
  }
  return {
    tone: 'neutral',
    label: 'Planejamento',
    title: 'Semana sob controle',
    description: 'Use a próxima semana para equilibrar treino, recuperação e objetivos competitivos.',
    route: '/game/calendar',
  };
}

// Playthrough 4.9, Parte G — mesmo heurística de tom usada pela lembrete de
// inscrição (careerCommunications.js) — duplicada aqui de propósito (função
// pura de 5 linhas) pra não acoplar este módulo (síntese semanal, sem I/O)
// a careerCommunications.js (que faz I/O e importa de volta bots.js/etc).
function coachToneForTournamentChoice(choice) {
  if (!choice?.entry?.eligible) return 'fora de alcance no momento';
  if (choice.titleChance >= 30 || choice.expectedNet >= 400) return 'recomendado';
  if (choice.expectedNet < 0 || choice.fatigueIncrease >= 28) return 'arriscado';
  return 'adequado';
}

function coachCommentForTone(tone, tournamentName) {
  if (tone === 'recomendado') return `Boa oportunidade para pontuar em ${tournamentName}.`;
  if (tone === 'adequado') return `Campo compatível com o nível atual da dupla.`;
  if (tone === 'arriscado') return 'Campo mais forte. Pode ser cedo para sua dupla.';
  return 'Fora de alcance esportivo no momento.';
}

const PLANNING_HORIZON_DAYS = 28;

function formatPlanningDate(date) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function getTournamentPlanningDeadline(state, { deadline, daysToDeadline } = {}) {
  if ([TOURNAMENT_REGISTRATION_STATE.DRAWN, TOURNAMENT_REGISTRATION_STATE.IN_PROGRESS, TOURNAMENT_REGISTRATION_STATE.ELIMINATED, TOURNAMENT_REGISTRATION_STATE.COMPLETED].includes(state)) {
    return { tone: 'resolved', label: 'Sorteio realizado', detail: null };
  }
  if ([TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED, TOURNAMENT_REGISTRATION_STATE.WITHDRAWN, TOURNAMENT_REGISTRATION_STATE.CANCELLED].includes(state)) {
    return { tone: 'resolved', label: 'Inscrições encerradas', detail: null };
  }
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTERED) {
    return { tone: 'resolved', label: 'Plano definido', detail: deadline ? `Sorteio após ${formatPlanningDate(deadline)}` : null };
  }
  if (state !== TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN || !deadline) return { tone: 'normal', label: 'Acompanhar calendário', detail: null };
  const due = `Inscrições até ${formatPlanningDate(deadline)}`;
  if (daysToDeadline === 0) return { tone: 'urgent', label: 'Último dia', detail: due };
  if (daysToDeadline === 1) return { tone: 'attention', label: 'Encerra amanhã', detail: due };
  if (daysToDeadline != null && daysToDeadline > 1) return { tone: daysToDeadline <= 3 ? 'attention' : 'normal', label: `Encerra em ${daysToDeadline} dias`, detail: due };
  return { tone: 'resolved', label: 'Inscrições encerradas', detail: due };
}

export function getTournamentPlanningFieldStrength(choice) {
  const chance = Number(choice?.titleChance) || 0;
  if (chance >= 55) return 'Fraco';
  if (chance >= 42) return 'Acessível';
  if (chance >= 27) return 'Equilibrado';
  if (chance >= 14) return 'Forte';
  return 'Muito forte';
}

export function getTournamentPlanningRiskReward(choice) {
  const risk = Number(choice?.risk) || 100;
  const net = Number(choice?.expectedNet) || 0;
  const prestige = Number(choice?.prestige) || 0;
  if (risk >= 65 && (prestige >= 60 || net > 0)) return 'Alto risco / alto prestígio';
  if (risk <= 35 && net <= 0) return 'Baixo risco / prêmio menor';
  return 'Equilibrado';
}

function planningActionForState(state, canRegister) {
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN) return canRegister ? { id: 'register', label: 'Inscrever-se' } : { id: 'details', label: 'Ver detalhes' };
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTERED) return { id: 'details', label: 'Ver inscrição' };
  if (state === TOURNAMENT_REGISTRATION_STATE.DRAWN) return { id: 'bracket', label: 'Ver chave' };
  if (state === TOURNAMENT_REGISTRATION_STATE.IN_PROGRESS) return { id: 'follow', label: 'Acompanhar torneio' };
  if ([TOURNAMENT_REGISTRATION_STATE.ELIMINATED, TOURNAMENT_REGISTRATION_STATE.COMPLETED].includes(state)) return { id: 'results', label: 'Ver resultados' };
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED) return { id: 'closed', label: 'Prazo encerrado' };
  return { id: 'details', label: 'Ver detalhes' };
}

function planningScore(item) {
  // A ordem é intencionalmente léxica: prazo antes de recomendação, depois
  // compromisso já assumido e, por fim, a importância do evento. Os valores
  // vêm apenas das projeções canônicas usadas no próprio card.
  const urgency = item.registrationState === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN
    ? Math.max(0, 35 - Math.max(0, item.daysToDeadline ?? 35)) : 0;
  const recommendation = item.canRegisterNow && item.registrationAllowed ? Math.round(item.fit / 4) : 0;
  const committed = isPlayerParticipating(item.registrationState) ? 18 : 0;
  const tierImportance = Math.round((Number(item.choice?.prestige) || 0) / 12);
  const conflictPenalty = item.conflictWith ? 30 : 0;
  return (urgency * 10000) + (recommendation * 100) + committed + tierImportance - conflictPenalty;
}

function eventByTournament(events, tournamentId) {
  return pickCanonicalTournamentEvent((Array.isArray(events) ? events : [])
    .filter((event) => event?.related_id === tournamentId && event?.event_type === 'tournament'));
}

export function planningQualityScore(item) {
  return (Number(item?.fit) * 2)
    + (Number(item?.choice?.expectedNet) / 100)
    + (Number(item?.choice?.expectedPoints) / 10)
    - Number(item?.choice?.risk || 0);
}

// Playthrough 5.16, Partes B/C/D — a comissão pulava Los Angeles (D-7) e
// recomendava Dubai (D-14).
//
// Causa medida: esta função ordenava SÓ por qualidade global
// (fit/retorno/risco) e usava a data apenas como critério de desempate de
// score exatamente igual — o que praticamente nunca acontece. Com horizonte
// de 28 dias, um evento melhor duas semanas à frente sempre vencia um evento
// elegível e com inscrição aberta na semana seguinte. O jogador então perdia
// a decisão de Los Angeles não por escolha, mas porque ninguém a apresentou.
//
// Regra da Parte C: a comissão decide a PRÓXIMA decisão competitiva real. A
// cronologia escolhe a JANELA; o score de qualidade — o mesmo de antes, sem
// nenhum peso novo — escolhe DENTRO da janela. Eventos que começam MENOS de
// 7 dias depois do primeiro candidato são alternativas genuínas da mesma
// decisão (o jogador só pode disputar um por vez); a partir de 7 dias já é a
// semana competitiva SEGUINTE, que não compete com esta — foi exatamente o
// caso Los Angeles (05/02) x Dubai (12/02) do playtest.
//
// Isto é um CONSTRAINT, não um bônus (Parte D): nenhum score, por maior que
// seja, promove um evento posterior por cima de uma decisão ainda pendente.
const SAME_DECISION_WINDOW_DAYS = 7;

export function getTournamentPlanningRecommendation(items = []) {
  const candidates = items.filter((item) => item.canRegisterNow && item.registrationAllowed && !item.conflictWith);
  if (!candidates.length) return null;

  const earliestStart = candidates
    .map((item) => item.startDate)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))[0] || null;

  const windowEnd = earliestStart
    ? (() => {
      const limit = new Date(`${earliestStart}T00:00:00`);
      limit.setDate(limit.getDate() + SAME_DECISION_WINDOW_DAYS);
      return limit.toISOString().slice(0, 10);
    })()
    : null;

  const inWindow = windowEnd
    ? candidates.filter((item) => item.startDate && item.startDate < windowEnd)
    : candidates;

  const best = [...(inWindow.length ? inWindow : candidates)].sort((a, b) => (
    planningQualityScore(b) - planningQualityScore(a) || a.startDate.localeCompare(b.startDate)
  ))[0] || null;

  return best ? { tournamentId: best.id, label: 'Melhor opção', reason: `${best.name} combina encaixe competitivo, retorno e prazo.` } : null;
}

// Planejamento semanal é uma projeção pura: não registra, não notifica e não
// muda o calendário. A inscrição continua pertencendo a registerTournament().
export function buildUpcomingTournamentPlanning(profile, context = {}) {
  const tournaments = Array.isArray(context.tournaments) ? context.tournaments : [];
  const registrations = Array.isArray(context.registrations) ? context.registrations : [];
  const calendarEvents = Array.isArray(context.calendarEvents) ? context.calendarEvents : [];
  const teamRank = Number(context.teamRank) || 0;
  const partner = context.partner || null;
  const careerDate = profile.career_date || '2026-01-01';
  const horizon = new Date(`${careerDate}T00:00:00`); horizon.setDate(horizon.getDate() + 28);
  const horizonEnd = horizon.toISOString().slice(0, 10);

  const items = tournaments
    .filter((tournament) => tournament?.id && tournament.start_date && tournament.start_date >= careerDate && tournament.start_date <= horizonEnd)
    .map((tournament) => {
      const registration = registrations.find((item) => item.tournament_id === tournament.id) || null;
      const event = eventByTournament(calendarEvents, tournament.id);
      const drawState = getTournamentDrawState(tournament, careerDate);
      const state = getPlayerTournamentRegistrationState({
        tournament, registration, careerDate, tournamentRun: event?.metadata?.tournament_run,
        drawn: [TOURNAMENT_DRAW_STATES.DRAWN, TOURNAMENT_DRAW_STATES.IN_PROGRESS, TOURNAMENT_DRAW_STATES.COMPLETED].includes(drawState),
      });
      const validation = evaluateTournamentRegistration({ player: profile, partner, tournament, currentDate: careerDate, registrations, tournaments, teamRank, partnership: context.partnership || null });
      const conflict = validation.reasons.find((item) => item.code === 'DATE_CONFLICT') || null;
      const window = getTournamentRegistrationWindow(tournament);
      const daysToDeadline = window.closesAt ? daysBetweenGameDates(careerDate, window.closesAt) : null;
      const choice = evaluateTournamentChoice(tournament, { ...profile, rank: teamRank, teamRank }, {});
      const tone = coachToneForTournamentChoice(choice);
      return {
        id: tournament.id, name: tournament.name, tier: tournament.tier,
        startDate: tournament.start_date, endDate: tournament.end_date,
        // Playthrough 5.16, Partes J/L — `drawn` era consumido por
        // resolveCompetitiveDecisionCta (`target.drawn ? 'Ver chave' : 'Ver
        // compromisso'`) e pela assinatura de dedupe da reunião semanal, mas
        // NUNCA existia no item: ficava `undefined` sempre. Duas
        // consequências medidas: o CTA da comissão jamais virava "Ver
        // chave", e a transição INSCRITO → SORTEADO não mudava a assinatura,
        // então o sorteio — um fato substantivo — não gerava aviso nenhum.
        drawn: [
          TOURNAMENT_DRAW_STATES.DRAWN,
          TOURNAMENT_DRAW_STATES.IN_PROGRESS,
          TOURNAMENT_DRAW_STATES.COMPLETED,
        ].includes(drawState),
        drawDate: tournament.draw_date || null,
        deadline: window.closesAt, daysToDeadline, registrationState: state,
        points: tournament.rank_points || 0, prize: tournament.prize_coins || 0, cost: tournament.entry_fee || 0,
        eligible: Boolean(choice.entry?.eligible),
        registrationAllowed: validation.allowed,
        conflictWith: conflict ? conflict.message : null,
        coachTone: tone, coachComment: coachCommentForTone(tone, tournament.name),
        canRegisterNow: canPlayerRegisterNow(state),
        recommendedCta: canPlayerRegisterNow(state) && validation.allowed ? 'register' : 'details',
        fit: tierPreferenceFit(teamRank, tournament.tier),
        choice,
        fieldStrength: getTournamentPlanningFieldStrength(choice),
        riskReward: getTournamentPlanningRiskReward(choice),
        deadlineInfo: getTournamentPlanningDeadline(state, { deadline: window.closesAt, daysToDeadline }),
      };
    })
    // Um torneio sem entrada esportiva não cria uma decisão de agenda. Já uma
    // participação confirmada permanece visível mesmo quando a janela mudou.
    .filter((item) => item.eligible || isPlayerParticipating(item.registrationState))
    .map((item) => ({ ...item, action: planningActionForState(item.registrationState, item.registrationAllowed), planningScore: 0 }));
  const recommendation = getTournamentPlanningRecommendation(items);
  const scored = items
    .map((item) => ({
      ...item,
      isRecommended: recommendation?.tournamentId === item.id,
      coachComment: recommendation?.tournamentId === item.id ? 'Melhor opção para a semana.' : item.coachComment,
      planningScore: planningScore(item),
    }))
    .sort((a, b) => b.planningScore - a.planningScore || a.startDate.localeCompare(b.startDate));

  // Playthrough 5.14, Parte J — o filtro acima já declarava a intenção ("uma
  // participação confirmada permanece visível mesmo quando a janela mudou"),
  // mas o corte de 4 itens a desfazia: `planningScore` multiplica a URGÊNCIA
  // de prazo por 10.000, e um torneio já inscrito tem urgência ZERO (o prazo
  // deixou de importar). Resultado medido: ao se inscrever em Madri World
  // Gold, o torneio caía para trás de qualquer evento ainda aberto e SUMIA
  // da lista — o compromisso desaparecia justamente depois de assumido.
  //
  // O compromisso é preservado explicitamente antes do corte; o resto
  // continua ordenado por urgência como sempre esteve.
  const committed = scored.filter((item) => isPlayerParticipating(item.registrationState));
  const rest = scored.filter((item) => !isPlayerParticipating(item.registrationState));
  return [...committed, ...rest].slice(0, Math.max(4, committed.length));
}

export function buildWeeklyCareerReview(profile, context = {}) {
  if (!profile) return null;
  const end = parseDate(profile.career_date || '2026-01-01');
  if (!end) return null;
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const allMatches = Array.isArray(context.matches) ? context.matches : [];
  const allTrainings = Array.isArray(context.trainings) ? context.trainings : [];
  const messages = Array.isArray(context.messages) ? context.messages : [];

  const weeklyMatches = allMatches.filter((match) => completedMatch(match) && inWindow(
    match?.match_date || match?.date || match?.played_at || match?.created_date,
    start,
    end,
  ));
  const weeklyTrainings = allTrainings.filter((session) => inWindow(
    session?.training_date || session?.date || session?.created_date,
    start,
    end,
  ));
  const wins = weeklyMatches.filter((match) => matchWon(match, profile.id)).length;
  const losses = Math.max(0, weeklyMatches.length - wins);
  const gain = weeklyTrainings.reduce((total, session) => total + trainingGain(session), 0);
  const unread = messages.filter((message) => ['nao_lida', 'decisao_pendente', 'unread', 'pending'].includes(String(message?.status || '').toLowerCase())).length;
  const winRate = weeklyMatches.length ? Math.round((wins / weeklyMatches.length) * 100) : 0;
  const headline = pickHeadline({ matches: weeklyMatches.length, wins, trainings: weeklyTrainings.length, unread, profile });

  return {
    periodLabel: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
    headline,
    metrics: [
      { id: 'matches', label: 'Partidas', value: weeklyMatches.length, detail: weeklyMatches.length ? `${wins}V · ${losses}D` : 'Nenhuma disputa' },
      { id: 'performance', label: 'Aproveitamento', value: `${winRate}%`, detail: weeklyMatches.length ? 'Na semana' : 'Sem partidas' },
      { id: 'trainings', label: 'Treinos', value: weeklyTrainings.length, detail: gain > 0 ? `+${formatAttributeGain(gain)} de progresso` : 'Sessões concluídas' },
      { id: 'communications', label: 'Pendências', value: unread, detail: unread ? 'Aguardando leitura' : 'Tudo em dia' },
    ],
    hasActivity: weeklyMatches.length > 0 || weeklyTrainings.length > 0 || unread > 0,
    upcomingTournaments: buildUpcomingTournamentPlanning(profile, context),
  };
}
