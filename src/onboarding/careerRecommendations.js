export function getCareerRecommendations(profile, context = {}) {
  if (!profile) return [];
  const recommendations = [];
  const add = item => recommendations.push(item);
  if (!profile.court_side || !profile.play_style) add({ id: 'finish-identity', priority: 100, importance: 'importante', title: 'Defina sua identidade', explanation: 'Lado e estilo orientam parceiro e treino.', route: '/game/missions', actionLabel: 'Continuar tutorial' });
  else if (Number(profile.energy || 0) < 30) add({ id: 'recover-energy', priority: 95, importance: 'recomendada', title: 'Recupere energia', explanation: 'Competir cansado reduz desempenho e aumenta o risco de lesão.', route: '/game/training', actionLabel: 'Ver recuperação' });
  if (!profile.partner_id) add({ id: 'find-partner', priority: 85, importance: 'importante', title: 'Encontre um parceiro', explanation: profile.court_side === 'direita' ? 'Procure alguém de esquerda com boa finalização.' : 'Procure alguém de direita com controle e defesa.', route: '/partners', actionLabel: 'Buscar dupla' });
  if (profile.partner_id && !(context.registrations || []).length) add({ id: 'register-tournament', priority: 75, importance: 'recomendada', title: 'Escolha um torneio', explanation: 'Comece por uma competição compatível com seu nível e energia.', route: '/tournaments', actionLabel: 'Ver torneios' });
  if (Number(profile.coins || 0) < 100) add({ id: 'protect-budget', priority: 65, importance: 'importante', title: 'Proteja seu saldo', explanation: 'Evite compras e compromissos caros até recuperar sua reserva.', route: '/game/economy', actionLabel: 'Ver finanças' });
  if (!recommendations.length) add({ id: 'plan-week', priority: 40, importance: 'opcional', title: 'Planeje a próxima semana', explanation: 'Alterne treino, recuperação e competição para evoluir com consistência.', route: '/game/calendar', actionLabel: 'Abrir calendário' });
  return recommendations.sort((a, b) => b.priority - a.priority);
}
