// Hotfix 15.5.4 (P1 — notificações redundantes de torneio, QA físico): cada
// marco (7/3/1/0 dias) tinha sua PRÓPRIA chave de dedup
// (tournamentReminderContextKey), então os quatro persistiam juntos na
// caixa de entrada para o mesmo torneio ("Miami Cup se aproxima" repetido
// 4x) — nenhum marco novo expirava o anterior. O jogo já mostra o próximo
// torneio em Header/Home/Calendário/Torneios; só um aviso prévio (D-3, o
// marco mais próximo do sorteio real de oponentes) evita ruído sem perder
// a informação. Não movida a geração do sorteio/oponente em si para D-3
// nesta fase — isso exigiria extrair a criação do tournament_run de
// TournamentModal.jsx para uma função compartilhada, um refactor fora do
// escopo deste hotfix; o conteúdo da notificação permanece honesto (nunca
// anuncia "sorteio definido" com adversário inventado).
export const TOURNAMENT_REMINDER_MILESTONES = Object.freeze([3]);

export function getTournamentReminderMilestone(daysUntilTournament) {
  const days = Number(daysUntilTournament);
  return TOURNAMENT_REMINDER_MILESTONES.includes(days) ? days : null;
}

export function tournamentReminderContextKey(tournamentId, milestone) {
  return `federation-tournament:${tournamentId}:upcoming:${milestone}-days`;
}

