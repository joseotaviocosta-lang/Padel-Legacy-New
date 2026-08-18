import { getTournamentNotificationMode, TOURNAMENT_DEEP_LINK_MODES } from './tournamentDeepLink.js';

export const NOTIFICATION_DESTINATION_TYPES = Object.freeze({
  PRESS_INTERVIEW: 'PRESS_INTERVIEW',
  TOURNAMENT: 'TOURNAMENT',
  TOURNAMENT_DETAILS: 'TOURNAMENT_DETAILS',
  TOURNAMENT_RUN: 'TOURNAMENT_RUN',
  PARTNER_OFFER: 'PARTNER_OFFER',
  COACH: 'COACH',
  STAFF: 'STAFF',
  CONTRACT: 'CONTRACT',
  MISSION: 'MISSION',
  INJURY: 'INJURY',
  TRAINING: 'TRAINING',
  SPONSOR: 'SPONSOR',
  RANKING: 'RANKING',
  CALENDAR: 'CALENDAR',
  WORLD_EVENT: 'WORLD_EVENT',
  MONTHLY_REPORT: 'MONTHLY_REPORT',
  ANNUAL_REPORT: 'ANNUAL_REPORT',
  COMMUNICATION_ONLY: 'COMMUNICATION_ONLY',
});

// Polish editorial da Central (docs/NOTIFICATION_EDITORIAL_POLISH.md, itens
// 15/16): antes toda notificação acionável usava o mesmo botão genérico
// "Abrir recurso" (Communications.jsx). Rótulo específico por destino,
// reaproveitando o mesmo switch/tipo já resolvido abaixo — não é um sistema
// de rotas paralelo, só texto do botão.
const CTA_LABELS = Object.freeze({
  [NOTIFICATION_DESTINATION_TYPES.PRESS_INTERVIEW]: 'Dar entrevista',
  [NOTIFICATION_DESTINATION_TYPES.TOURNAMENT]: 'Ver torneio',
  [NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_DETAILS]: 'Ver torneio',
  [NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_RUN]: 'Jogar partida',
  [NOTIFICATION_DESTINATION_TYPES.PARTNER_OFFER]: 'Ver proposta',
  [NOTIFICATION_DESTINATION_TYPES.COACH]: 'Ver treinador',
  [NOTIFICATION_DESTINATION_TYPES.STAFF]: 'Ver comissão',
  [NOTIFICATION_DESTINATION_TYPES.CONTRACT]: 'Revisar contrato',
  [NOTIFICATION_DESTINATION_TYPES.MISSION]: 'Ver missão',
  [NOTIFICATION_DESTINATION_TYPES.INJURY]: 'Ver recuperação',
  [NOTIFICATION_DESTINATION_TYPES.TRAINING]: 'Ver treino',
  [NOTIFICATION_DESTINATION_TYPES.SPONSOR]: 'Ver patrocínio',
  [NOTIFICATION_DESTINATION_TYPES.RANKING]: 'Ver ranking',
  [NOTIFICATION_DESTINATION_TYPES.CALENDAR]: 'Ver calendário',
  [NOTIFICATION_DESTINATION_TYPES.WORLD_EVENT]: 'Ver notícia',
  [NOTIFICATION_DESTINATION_TYPES.MONTHLY_REPORT]: 'Ver relatório',
  [NOTIFICATION_DESTINATION_TYPES.ANNUAL_REPORT]: 'Ver relatório',
});
const DEFAULT_CTA_LABEL = 'Abrir recurso';

const normalizeToken = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function withParams(route, params = {}) {
  const [pathname, query = ''] = String(route || '/communications').split('?');
  const search = new URLSearchParams(query);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const suffix = search.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

function classifyNotification(notification = {}) {
  const metadata = notification.metadata || {};
  const explicitType = notification.destination?.type || metadata.destination?.type || notification.notification_type;
  const declaredType = String(explicitType || '').trim().toUpperCase();
  const tournamentMode = getTournamentNotificationMode(notification);
  if (tournamentMode === TOURNAMENT_DEEP_LINK_MODES.RUN) return NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_RUN;
  if (['TOURNAMENT_UPCOMING', 'TOURNAMENT_REMINDER', 'TOURNAMENT_AVAILABLE'].includes(declaredType)) {
    return NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_DETAILS;
  }
  const knownTypes = /** @type {string[]} */ (Object.values(NOTIFICATION_DESTINATION_TYPES));
  if (knownTypes.includes(declaredType)) return declaredType;
  const token = [explicitType, notification.message_type, notification.related_entity_type, metadata.type]
    .map(normalizeToken)
    .filter(Boolean)
    .join(' ');

  if (/press|interview|imprensa/.test(token)) return NOTIFICATION_DESTINATION_TYPES.PRESS_INTERVIEW;
  if (/tournament|torneio|competition/.test(token)) return NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_DETAILS;
  if (/partner_offer|partnership_proposal|proposta_parceria|partner_proposal/.test(token)) return NOTIFICATION_DESTINATION_TYPES.PARTNER_OFFER;
  if (/mission|missao|missão/.test(token)) return NOTIFICATION_DESTINATION_TYPES.MISSION;
  if (/injury|medical|lesao|lesão|fisioter/.test(token)) return NOTIFICATION_DESTINATION_TYPES.INJURY;
  if (/training|treino/.test(token)) return NOTIFICATION_DESTINATION_TYPES.TRAINING;
  if (/ranking|rank/.test(token)) return NOTIFICATION_DESTINATION_TYPES.RANKING;
  if (/world_event|world_bulletin|evento_mundial/.test(token)) return NOTIFICATION_DESTINATION_TYPES.WORLD_EVENT;
  if (/monthly_career_report|monthly_report|relatorio_mensal|relatório_mensal/.test(token)) return NOTIFICATION_DESTINATION_TYPES.MONTHLY_REPORT;
  if (/annual_career_report|annual_report|season_report|relatorio_anual|relatório_anual/.test(token)) return NOTIFICATION_DESTINATION_TYPES.ANNUAL_REPORT;
  if (/calendar|calendario|calendário/.test(token)) return NOTIFICATION_DESTINATION_TYPES.CALENDAR;
  if (/contract|contrato/.test(token)) return NOTIFICATION_DESTINATION_TYPES.CONTRACT;
  if (/sponsor|patrocin/.test(token)) return NOTIFICATION_DESTINATION_TYPES.SPONSOR;
  if (/coach|trainer|treinador/.test(token)) return NOTIFICATION_DESTINATION_TYPES.COACH;
  if (/staff|comissao|comissão/.test(token)) return NOTIFICATION_DESTINATION_TYPES.STAFF;
  return NOTIFICATION_DESTINATION_TYPES.COMMUNICATION_ONLY;
}

export function resolveNotificationDestination(notification = {}) {
  const messageId = notification.id || null;
  // Notificações inválidas/expiradas nunca tentam abrir um recurso que já
  // não existe mais — caem direto no histórico, com uma mensagem amigável,
  // em vez de navegar para uma tela quebrada ou lançar erro.
  if (['invalidada', 'expirada'].includes(notification.status)) {
    return {
      type: NOTIFICATION_DESTINATION_TYPES.COMMUNICATION_ONLY,
      route: withParams('/communications', { message: messageId }),
      actionable: false,
    };
  }
  const metadata = notification.metadata || {};
  const explicit = notification.destination || metadata.destination || null;
  const type = classifyNotification(notification);
  const entityId = notification.related_entity_id || metadata.entity_id || null;
  const explicitRoute = typeof explicit === 'string' ? explicit : explicit?.route;

  let route;
  switch (type) {
    case NOTIFICATION_DESTINATION_TYPES.PRESS_INTERVIEW:
      route = withParams(explicitRoute || metadata.route || '/press', {
        tab: 'interviews',
        interview: metadata.interview_id || entityId,
        source: metadata.interview_source_id,
      });
      break;
    case NOTIFICATION_DESTINATION_TYPES.TOURNAMENT:
    case NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_DETAILS:
    case NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_RUN:
      route = withParams(explicitRoute || metadata.route || '/tournaments', {
        tournament: metadata.tournament_id || entityId,
        mode: type === NOTIFICATION_DESTINATION_TYPES.TOURNAMENT_RUN
          ? TOURNAMENT_DEEP_LINK_MODES.RUN
          : TOURNAMENT_DEEP_LINK_MODES.DETAILS,
      });
      break;
    case NOTIFICATION_DESTINATION_TYPES.PARTNER_OFFER:
      route = withParams(explicitRoute || metadata.route || '/partners', { view: 'offers', offer: metadata.offer_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.COACH:
      route = withParams(explicitRoute || metadata.route || '/coaches', { coach: metadata.coach_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.STAFF:
      route = withParams(explicitRoute || metadata.route || '/staff', { staff: metadata.staff_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.CONTRACT: {
      const partnerContract = /partner/i.test(`${notification.message_type || ''} ${notification.related_entity_type || ''}`);
      const coachContract = /coach|trainer|treinador/i.test(`${notification.message_type || ''} ${notification.related_entity_type || ''}`);
      route = withParams(explicitRoute || metadata.route || (partnerContract ? '/partners' : coachContract ? '/coaches' : '/game/economy'), {
        view: partnerContract || coachContract ? 'contract' : 'sponsors',
        contract: metadata.contract_id || entityId,
        coach: coachContract ? metadata.coach_id || entityId : null,
      });
      break;
    }
    case NOTIFICATION_DESTINATION_TYPES.MISSION:
      route = withParams(explicitRoute || metadata.route || '/game/missions', { mission: metadata.mission_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.INJURY:
      route = withParams(explicitRoute || metadata.route || '/game/calendar', { focus: 'recovery', injury: metadata.injury_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.TRAINING:
      route = withParams(explicitRoute || metadata.route || '/game/training', { training: metadata.training_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.SPONSOR:
      route = withParams(explicitRoute || metadata.route || '/game/economy', { view: 'sponsors', sponsor: metadata.sponsor_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.RANKING:
      route = withParams(explicitRoute || metadata.route || '/ranking', { athlete: metadata.athlete_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.CALENDAR:
      route = withParams(explicitRoute || metadata.route || '/game/calendar', { event: metadata.calendar_event_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.WORLD_EVENT:
      route = withParams(explicitRoute || metadata.route || '/world-events', { event: metadata.world_event_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.MONTHLY_REPORT:
      route = withParams(explicitRoute || metadata.route || '/game/monthly-reports', { report: metadata.report_id || entityId });
      break;
    case NOTIFICATION_DESTINATION_TYPES.ANNUAL_REPORT:
      route = withParams(explicitRoute || metadata.route || '/game/annual-reports', { report: metadata.report_id || entityId });
      break;
    default:
      route = withParams(explicitRoute || metadata.route || '/communications', { message: messageId });
  }

  if (explicit && typeof explicit === 'object' && explicit.params) route = withParams(route, explicit.params);
  const actionable = type !== NOTIFICATION_DESTINATION_TYPES.COMMUNICATION_ONLY || Boolean(explicitRoute || metadata.route);
  return { type, route, actionable, label: actionable ? (CTA_LABELS[type] || DEFAULT_CTA_LABEL) : null };
}

export function hasSpecificNotificationDestination(notification) {
  return resolveNotificationDestination(notification).actionable;
}
