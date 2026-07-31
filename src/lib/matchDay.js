const DAY_THEMES = {
  0: { label: 'Domingo de decisão', tone: 'Finais, recuperação e balanço da semana.' },
  1: { label: 'Segunda de preparação', tone: 'Planejamento, recuperação e início de ciclo.' },
  2: { label: 'Terça de evolução', tone: 'Treino técnico e compromissos de imprensa.' },
  3: { label: 'Quarta competitiva', tone: 'Circuito regional, mercado e ajustes táticos.' },
  4: { label: 'Quinta estratégica', tone: 'Análise de adversários e preparação mental.' },
  5: { label: 'Sexta de pressão', tone: 'Coletivas, viagens e definição de objetivos.' },
  6: { label: 'Sábado de torneio', tone: 'Rodadas decisivas e maior desgaste competitivo.' },
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function diff(after, before) {
  return safeNumber(after) - safeNumber(before);
}

function dateLabel(dateStr) {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr || 'Novo dia';
  }
}

export function buildMatchDaySummary({ before, after }) {
  const date = after?.career_date || before?.career_date;
  const dateObj = new Date(`${date}T00:00:00`);
  const theme = DAY_THEMES[dateObj.getDay()] || DAY_THEMES[1];
  const changes = [
    { key: 'energy', label: 'Energia', value: diff(after?.energy, before?.energy) },
    { key: 'fatigue', label: 'Fadiga', value: diff(after?.fatigue, before?.fatigue), inverse: true },
    { key: 'morale', label: 'Moral', value: diff(after?.morale, before?.morale) },
    { key: 'coins', label: 'Moedas', value: diff(after?.coins, before?.coins) },
    { key: 'xp', label: 'XP', value: diff(after?.xp, before?.xp) },
    { key: 'ranking', label: 'Pontos de ranking', value: diff(after?.rank_points, before?.rank_points) },
  ].filter(item => item.value !== 0);

  const highlights = [];
  const energy = safeNumber(after?.energy, 100);
  const fatigue = safeNumber(after?.fatigue, 0);
  if (energy >= 90) highlights.push('Condição física excelente');
  else if (energy < 35) highlights.push('Energia baixa: priorize recuperação');
  else highlights.push('Energia recuperada para o novo dia');
  if (fatigue >= 70) highlights.push('Fadiga elevada: reduza a intensidade dos treinos');
  if (safeNumber(after?.morale, 70) < 40) highlights.push('Moral em atenção');
  if (after?.injured_until) highlights.push(`Recuperação médica até ${after.injured_until}`);
  if (!after?.injured_until && before?.injured_until) highlights.push('Liberado pelo departamento médico');

  return { date, dateLabel: dateLabel(date), theme, changes, highlights };
}

export function emitDayAdvanced(before, after) {
  if (typeof window === 'undefined') return;
  // O resumo é calculado apenas com os perfis já disponíveis em memória.
  // Não há novas consultas ao banco, mantendo o avanço rápido.
  const summary = buildMatchDaySummary({ before, after });
  window.dispatchEvent(new CustomEvent('padel:day-advanced', { detail: summary }));
}
