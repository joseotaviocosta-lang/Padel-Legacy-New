const CHECKLIST_STORAGE_KEY = 'padel-legacy-beta-checklist-v1';

export const BETA_CHECKLIST = Object.freeze([
  { id: 'career-create', group: 'Carreira', label: 'Criar uma carreira nova e concluir o fluxo inicial' },
  { id: 'tutorial-core', group: 'Carreira', label: 'Avançar pelo tutorial e concluir etapas informativas' },
  { id: 'training-plan', group: 'Desenvolvimento', label: 'Salvar um planejamento semanal e usar o treino automático' },
  { id: 'calendar-batch', group: 'Desenvolvimento', label: 'Avançar +3 dias e +1 semana sem travamento' },
  { id: 'partner-contract', group: 'Equipe', label: 'Formar dupla, conversar e revisar contrato' },
  { id: 'coach-staff', group: 'Equipe', label: 'Trocar treinador e contratar profissional de apoio' },
  { id: 'tournament-flow', group: 'Competições', label: 'Inscrever-se, jogar e concluir um torneio' },
  { id: 'match-controls', group: 'Competições', label: 'Testar velocidades e atalhos da partida narrada' },
  { id: 'ranking-update', group: 'Mundo', label: 'Confirmar atualização dos rankings individual e de dupla' },
  { id: 'communications', group: 'Mundo', label: 'Receber, abrir e responder uma comunicação contextual' },
  { id: 'shop-equipment', group: 'Economia', label: 'Comprar, equipar e comparar um equipamento' },
  { id: 'monthly-close', group: 'Economia', label: 'Virar o mês e conferir salários, contratos e patrocinadores' },
  { id: 'save-reload', group: 'Segurança', label: 'Fechar o jogo, reabrir e confirmar a integridade do save' },
  { id: 'long-session', group: 'Segurança', label: 'Jogar por pelo menos 30 minutos sem erro crítico' },
]);

function storageId(careerId) {
  return `${CHECKLIST_STORAGE_KEY}:${careerId || 'global'}`;
}

export function loadBetaChecklist(careerId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageId(careerId)) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBetaChecklist(careerId, state) {
  localStorage.setItem(storageId(careerId), JSON.stringify(state || {}));
  return state;
}

export function resetBetaChecklist(careerId) {
  localStorage.removeItem(storageId(careerId));
  return {};
}

export function buildBetaChecklistReport({ careerId, state = {} } = {}) {
  const items = BETA_CHECKLIST.map(item => ({ ...item, completed: Boolean(state[item.id]) }));
  const completed = items.filter(item => item.completed).length;
  return {
    report_type: 'padel_legacy_beta_readiness_checklist',
    generated_at: new Date().toISOString(),
    career_id: careerId || null,
    completed,
    total: items.length,
    completion_percent: Math.round((completed / Math.max(1, items.length)) * 100),
    items,
  };
}

export function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
