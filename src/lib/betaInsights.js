import { getBetaAnalyticsSnapshot, getBetaTesterInsights } from '@/lib/betaAnalytics.js';

const CATEGORY_MAP = {
  Gameplay: ['training', 'tournaments', 'team', 'shop'],
  Gestão: ['economy', 'market', 'club'],
  Carreira: ['career', 'ranking', 'communications'],
  Mundo: ['world', 'press', 'legacy'],
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function avg(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function systemById(insights, id) {
  return insights.features.find(item => item.id === id);
}

export function buildBetaInsights(snapshot = getBetaAnalyticsSnapshot()) {
  const base = getBetaTesterInsights(snapshot);
  const events = snapshot.events || [];
  const friction = [];

  for (const feature of base.features) {
    if (!feature.visits) continue;
    const averageVisitSeconds = feature.visits > 0 ? feature.timeMs / feature.visits / 1000 : 0;
    if (feature.visits >= 8 && averageVisitSeconds > 0 && averageVisitSeconds < 15) {
      friction.push({
        id: `rapid-${feature.id}`,
        severity: feature.visits >= 15 ? 'high' : 'medium',
        feature: feature.label,
        title: `${feature.label} é aberta repetidamente por pouco tempo`,
        detail: `${feature.visits} visitas, média de ${Math.max(1, Math.round(averageVisitSeconds))}s por visita. Pode indicar dificuldade para localizar uma ação ou informação.`,
      });
    }
  }

  const createdCommunications = Number(snapshot.totals?.counters?.COMMUNICATION_CREATED || 0);
  const openedCommunications = Number(snapshot.totals?.counters?.COMMUNICATION_OPENED || 0);
  const unread = Math.max(0, createdCommunications - openedCommunications);
  if (unread >= 5) {
    friction.push({
      id: 'unread-communications',
      severity: unread >= 12 ? 'high' : 'medium',
      feature: 'Comunicações',
      title: 'Muitas comunicações não foram abertas',
      detail: `${unread} comunicações criadas ainda não têm abertura registrada. Revise descobribilidade, agrupamento e prioridade do sino.`,
    });
  }

  const screenViews = events.filter(event => event.type === 'SCREEN_VIEW');
  const recent = screenViews.slice(-30).map(event => event.screen);
  let pingPong = 0;
  for (let index = 2; index < recent.length; index += 1) {
    if (recent[index] === recent[index - 2] && recent[index] !== recent[index - 1]) pingPong += 1;
  }
  if (pingPong >= 4) {
    friction.push({
      id: 'navigation-ping-pong',
      severity: pingPong >= 8 ? 'high' : 'medium',
      feature: 'Navegação',
      title: 'Possível vai-e-volta excessivo entre telas',
      detail: `${pingPong} padrões A → B → A nas últimas 30 navegações. Pode haver uma ação que deveria abrir diretamente no contexto correto.`,
    });
  }

  const categories = Object.entries(CATEGORY_MAP).map(([label, ids]) => {
    const systems = ids.map(id => systemById(base, id)).filter(Boolean);
    const discovered = systems.filter(item => item.discovered).length;
    const coverage = systems.length ? Math.round(discovered / systems.length * 100) : 0;
    return { label, coverage, discovered, total: systems.length };
  });

  const recommendations = [];
  base.unusedFeatures.slice(0, 4).forEach(feature => recommendations.push({
    id: `discover-${feature.id}`,
    priority: 'discover',
    title: `Conhecer ${feature.label}`,
    detail: 'Este sistema principal ainda não aparece como utilizado nesta instalação.',
    route: feature.routes?.[0] || '/',
  }));
  friction.filter(item => item.severity === 'high').slice(0, 3).forEach(item => recommendations.push({
    id: `fix-${item.id}`,
    priority: 'attention',
    title: `Revisar ${item.feature}`,
    detail: item.detail,
    route: '/',
  }));

  const press = systemById(base, 'press');
  if (press && !press.discovered && base.totalEvents >= 40) recommendations.unshift({
    id: 'discover-press-context',
    priority: 'attention',
    title: 'Imprensa ainda não foi descoberta',
    detail: 'O testador já acumulou atividade suficiente, mas não visitou a Imprensa. Verifique se entrevistas e atalhos estão aparecendo no fluxo.',
    route: '/press',
  });

  const engagement = clamp(Math.round(Math.min(100, base.totalEvents / 4)));
  const discovery = clamp(base.coverage);
  const navigation = clamp(100 - friction.reduce((sum, item) => sum + (item.severity === 'high' ? 12 : 5), 0));
  const continuity = clamp(Math.round(Math.min(100, base.totalDurationMs / 3600000 * 25)));
  const uxScore = Math.round(avg([discovery, engagement, navigation, continuity]));

  const behaviorScores = {
    Competidor: ['tournaments', 'ranking'].reduce((sum, id) => sum + (systemById(base, id)?.visits || 0), 0),
    Manager: ['team', 'economy', 'market'].reduce((sum, id) => sum + (systemById(base, id)?.visits || 0), 0),
    Explorador: base.features.filter(item => item.discovered).length * 2,
    Desenvolvedor: ['communications', 'world', 'legacy'].reduce((sum, id) => sum + (systemById(base, id)?.visits || 0), 0),
  };
  const behaviorProfile = Object.entries(behaviorScores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Explorador';

  return {
    generatedAt: new Date().toISOString(),
    uxScore,
    grade: uxScore >= 90 ? 'Excelente' : uxScore >= 75 ? 'Boa' : uxScore >= 55 ? 'Atenção' : 'Crítica',
    behaviorProfile,
    metrics: { discovery, engagement, navigation, continuity },
    categories,
    friction: friction.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1)),
    recommendations,
    unusedFeatures: base.unusedFeatures,
    tester: base,
  };
}
