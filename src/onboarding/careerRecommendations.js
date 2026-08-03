export function getCareerRecommendations(profile, context = {}) {
  if (!profile) return [];
  const recommendations = [];
  const add = item => recommendations.push(item);
  if (!profile.court_side || !profile.play_style) add({ id: 'finish-identity', priority: 100, importance: 'importante', title: 'Defina sua identidade', explanation: 'Lado e estilo orientam parceiro e treino.', route: '/game/missions', actionLabel: 'Continuar tutorial' });
  else if (Number(profile.energy || 0) < 30) add({ id: 'recover-energy', priority: 95, importance: 'recomendada', title: 'Recupere energia', explanation: 'Competir cansado reduz desempenho e aumenta o risco de lesão.', route: '/game/training', actionLabel: 'Ver recuperação' });
  if (profile.play_style && profile.recommended_training_attributes?.length && !(context.trainings || []).length) {
    const labels = { smash: 'smash', volley: 'voleio', serve: 'saque', defense: 'defesa', agility: 'agilidade', strategy: 'estratégia', emotional_control: 'controle emocional', bandeja: 'bandeja', forehand: 'forehand', backhand: 'backhand' };
    const priorities = (profile.recommended_training_attributes || []).map(key => labels[key] || key).slice(0, 3);
    add({ id: 'profile-training', priority: 90, importance: 'recomendada', title: `Treine como ${profile.archetype_label || 'seu arquétipo'}`, explanation: priorities.length ? `Priorize ${priorities.join(', ')}.` : 'Escolha um treino alinhado ao seu perfil.', route: '/game/training', actionLabel: 'Ver treinos' });
  }
  if (!profile.partner_id) add({ id: 'find-partner', priority: 85, importance: 'importante', title: 'Escolha sua primeira dupla', explanation: profile.tactical_role === 'finalizador' ? 'Analise as propostas e procure controle e construção.' : profile.tactical_role === 'controlador' ? 'Analise as propostas e procure definição e pressão.' : 'Compare as propostas por função, lado e atributos complementares.', route: '/partners?view=offers', actionLabel: 'Analisar propostas' });
  if (profile.partner_id && !(context.registrations || []).length) add({ id: 'register-tournament', priority: 75, importance: 'recomendada', title: 'Escolha um torneio', explanation: 'Comece por uma competição compatível com seu nível e energia.', route: '/tournaments', actionLabel: 'Ver torneios' });
  if (Number(profile.coins || 0) < 100) add({ id: 'protect-budget', priority: 65, importance: 'importante', title: 'Proteja seu saldo', explanation: 'Evite compras e compromissos caros até recuperar sua reserva.', route: '/game/economy', actionLabel: 'Ver finanças' });
  if (!recommendations.length) add({ id: 'plan-week', priority: 40, importance: 'opcional', title: 'Planeje a próxima semana', explanation: 'Alterne treino, recuperação e competição para evoluir com consistência.', route: '/game/calendar', actionLabel: 'Abrir calendário' });
  return recommendations.sort((a, b) => b.priority - a.priority);
}
