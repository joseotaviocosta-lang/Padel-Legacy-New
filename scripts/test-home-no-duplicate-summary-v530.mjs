// Fase 5.30 — menos repetição: o bloco de status não repete ranking/OVR do
// header; a dupla aparece uma vez; o torneio do compromisso não volta na agenda.
import { CAREER_DATE, componentSource, gateRunner, HOME_LIB, homeSource, planningItem, withModules } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-no-duplicate-summary-v530');
const status = componentSource('HomeStatusCard');
gate('1. status não repete OVR (já no header)', !/overallRating|OVR/.test(status));
gate('2. status não repete a posição de ranking como número solto (só o rumo ao objetivo)', !/worldRank\.rank/.test(status) && status.includes('Rumo a'));
const src = homeSource();
gate('3. a barra de status completa (com data) saiu do rodapé — dupla só na linha compacta do topo', (src.match(/<CareerStatusBar/g) || []).length === 1 && /<CareerStatusBar compact/.test(src));
gate('4. não há mais dois painéis de pendências (O que fazer agora + Atenção)', !src.includes('<AttentionList') && !src.includes('<PriorityActionsPanel'));
await withModules({ home: HOME_LIB }, async ({ home }) => {
  const weeklyReview = { upcomingTournaments: [planningItem(), planningItem({ id: 't-la', name: 'Los Angeles Cup', registrationState: 'REGISTRATION_OPEN', action: { id: 'register', label: 'Inscrever-se' } })] };
  const agenda = home.buildHomeAgenda({ weeklyReview, careerDate: CAREER_DATE, excludeId: 't-lon' });
  gate('5. o torneio do compromisso não se repete na agenda', !agenda.some((i) => i.id === 't-lon') && agenda.some((i) => i.id === 't-la'));
  const progress = home.buildHomeProgress({ weeklyReview: { metrics: [{ id: 'matches' }, { id: 'performance' }, { id: 'trainings' }, { id: 'communications' }] }, seasonPlan: { goals: [{ title: 'Top 500', target: 500, progress: 50 }, { title: 'A', category: 'a' }], overallProgress: 25 } });
  gate('6. progresso não repete pendências (já no sino e nas prioridades)', !progress.metrics.some((m) => m.id === 'communications'));
  gate('7. objetivo de ranking aparece uma vez (status), não de novo nas metas do progresso', progress.rankingGoal?.to === '#500' && !progress.seasonGoals.some((g) => g.title === 'Top 500'));
});
finish();
