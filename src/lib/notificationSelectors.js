import { isCareerMessageUnread } from './careerCommunications.js';

export function selectUnreadCareerMessages(messages = []) {
  return messages.filter(isCareerMessageUnread);
}

export function countUnreadCareerMessages(messages = []) {
  return selectUnreadCareerMessages(messages).length;
}

export function selectPendingDecisions(messages = []) {
  return messages.filter((message) => message?.status === 'decisao_pendente');
}
