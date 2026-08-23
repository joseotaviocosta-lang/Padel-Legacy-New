const HIDDEN_CONTEXTUAL_MEMORY_TYPES = new Set([
  'physical_condition',
  'recent_form',
  'agent_strategy',
  'match_milestone',
]);

export const NOTIFICATION_CATEGORIES = Object.freeze([
  { id: 'all', label: 'Todas' },
  { id: 'tournament', label: 'Torneios' },
  { id: 'career', label: 'Carreira' },
  { id: 'partner', label: 'Dupla' },
  { id: 'staff', label: 'Comissão técnica' },
  { id: 'training', label: 'Treinos' },
  { id: 'interview', label: 'Entrevistas' },
  { id: 'world', label: 'Mundo' },
  { id: 'system', label: 'Sistema' },
]);

function notificationToken(notification = {}) {
  return [
    notification.notification_type,
    notification.message_type,
    notification.related_entity_type,
    notification.destination?.type,
    notification.metadata?.notification_type,
    notification.metadata?.type,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
}

export function getNotificationCategory(notification = {}) {
  const token = notificationToken(notification);
  if (/press|interview|imprensa/.test(token)) return 'interview';
  if (/tournament|torneio|competition/.test(token)) return 'tournament';
  if (/partner|partnership|dupla|atleta/.test(token) || notification.sender_type === 'atleta') return 'partner';
  if (/coach|staff|trainer|treinador|comiss/.test(token) || notification.sender_type === 'treinador') return 'staff';
  if (/training|treino/.test(token)) return 'training';
  if (/world|circuit|mundo/.test(token)) return 'world';
  if (/system|sistema/.test(token) || notification.sender_type === 'sistema') return 'system';
  return 'career';
}

export function getNotificationCategoryLabel(notification = {}) {
  const category = getNotificationCategory(notification);
  return NOTIFICATION_CATEGORIES.find((item) => item.id === category)?.label || 'Carreira';
}

export function getNotificationAttentionLevel(notification = {}) {
  if (['resolvida', 'ignorada', 'invalidada', 'expirada'].includes(notification.status)) return 'Informação';
  if (notification.priority === 'critica' || notification.priority === 'crítica') return 'Crítica';
  if (notification.status === 'decisao_pendente' || notification.priority === 'alta') return 'Ação';
  return 'Informação';
}

export function isRelevantCareerNotification(notification = {}) {
  if (!notification || notification.status === 'invalidada') return false;
  return !HIDDEN_CONTEXTUAL_MEMORY_TYPES.has(notification.metadata?.memory_type);
}

export function notificationIdentity(notification = {}) {
  const metadata = notification.metadata || {};
  const type = notification.notification_type || notification.message_type || notification.related_entity_type;
  if (metadata.context_key) return String(metadata.context_key);
  if (metadata.interview_source_id || metadata.source_event_id) {
    return `press-interview:${metadata.interview_source_id || metadata.source_event_id}`;
  }
  if (metadata.event_id) return `${type || 'event'}:${metadata.event_id}`;
  const entityId = notification.related_entity_id || metadata.entity_id;
  if (type && entityId) return `${type}:${entityId}`;
  return String(notification.id || '');
}

export function deduplicateCareerNotifications(notifications = []) {
  const seen = new Set();
  return notifications.filter((notification) => {
    const identity = notificationIdentity(notification);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function selectRelevantCareerNotifications(notifications = []) {
  return deduplicateCareerNotifications(notifications.filter(isRelevantCareerNotification));
}

export function isNotificationFromCareerDate(notification, careerDate) {
  if (!careerDate) return false;
  const date = notification?.career_date || String(notification?.created_date || '').slice(0, 10);
  return date === careerDate;
}

// Onboarding 2.0 + Central de Notificações (docs/ONBOARDING_V3_COMMUNICATIONS.md,
// itens 26/34): relatórios passivos e recorrentes (resumo semanal, boletim
// do mundo, relatório da comissão, relatórios mensal/anual/de temporada)
// não devem competir visualmente com ação necessária (entrevista, proposta,
// partida, torneio, problema médico, decisão pendente). Lista fechada de
// tipos conhecidos — nenhum tipo novo de relatório passa a existir aqui,
// só a classificação de tipos que já existiam.
const PASSIVE_REPORT_TYPES = new Set([
  'weekly_summary', 'staff_report', 'staff_event', 'staff_monthly_report', 'world_bulletin',
  'monthly_career_report', 'annual_career_report', 'season_report', 'sponsor', 'fans',
]);
const PASSIVE_REPORT_NOTIFICATION_TYPES = new Set([
  'WEEKLY_SUMMARY', 'STAFF', 'MONTHLY_REPORT', 'ANNUAL_REPORT', 'SEASON_REPORT',
]);

export function isPassiveReportNotification(notification = {}) {
  return PASSIVE_REPORT_TYPES.has(notification.message_type) || PASSIVE_REPORT_NOTIFICATION_TYPES.has(notification.notification_type);
}

/**
 * Agrupa por prioridade visual (não por data): AÇÃO NECESSÁRIA primeiro
 * (Crítica/Ação — entrevista, proposta, partida, torneio, decisão),
 * ATUALIZAÇÕES depois (Informação, mas não um relatório recorrente),
 * RELATÓRIOS por último (informação passiva — resumo semanal, boletim do
 * mundo, relatório da comissão). Não esconde nada — só reordena.
 */
export function groupNotificationsByPriority(notifications = []) {
  const action = [];
  const updates = [];
  const reports = [];
  for (const notification of notifications) {
    if (isPassiveReportNotification(notification)) { reports.push(notification); continue; }
    const level = getNotificationAttentionLevel(notification);
    (level === 'Crítica' || level === 'Ação' ? action : updates).push(notification);
  }
  return [
    { id: 'action', label: 'Ação necessária', messages: action },
    { id: 'updates', label: 'Atualizações', messages: updates },
    { id: 'reports', label: 'Relatórios', messages: reports },
  ].filter((group) => group.messages.length > 0);
}
