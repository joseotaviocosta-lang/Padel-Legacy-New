// Playthrough 5.12, Parte I — roda o MOTOR EXISTENTE
// (evolveAthleteCareerMonth) sobre um parceiro materializado, 12 meses.
// Não existe segundo motor: este harness só chama a função de produção.
export function buildTemplate({ id, name, age, overall, potential }) {
  return {
    id, name, age,
    overall_rating: overall,
    overall,
    potential,
    country: 'Brasil',
    position: 'direita',
    play_style: 'controle',
  };
}

export async function runTwelveMonths(vite, template, { startYear = 2026 } = {}) {
  const { evolveAthleteCareerMonth } = await vite.ssrLoadModule('/src/game-core/livingCircuitRules.js');
  const { materializePartnerAthlete } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');
  const athlete = await materializePartnerAthlete(template, { careerDate: `${startYear}-01-01` });
  let current = { ...athlete };
  const timeline = [];
  for (let month = 1; month <= 12; month += 1) {
    const date = `${startYear}-${String(month).padStart(2, '0')}-15`;
    const result = evolveAthleteCareerMonth(current, date, { isYearBoundary: month === 1 });
    if (result.changed) current = { ...current, ...result.patch };
    timeline.push({
      date,
      overall: Number(current.overall_rating ?? current.overall),
      stage: result.state?.stage ?? null,
      delta: result.delta ?? 0,
      retires: Boolean(result.retires),
    });
  }
  return { athlete, current, timeline };
}

export function summarize(timeline, startOverall) {
  const end = timeline.at(-1).overall;
  return {
    start: startOverall,
    end,
    change: end - startOverall,
    ups: timeline.filter((t) => t.delta > 0).length,
    downs: timeline.filter((t) => t.delta < 0).length,
    stages: [...new Set(timeline.map((t) => t.stage).filter(Boolean))],
    retired: timeline.some((t) => t.retires),
  };
}
