// Fase 5.30 — estados vazios úteis: sem compromisso, sem pendências, sem
// agenda — nunca um bloco em branco.
import { CAREER_DATE, componentSource, gateRunner, HOME_LIB, withModules } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-empty-state-v530');
await withModules({ home: HOME_LIB }, async ({ home }) => {
  const free = home.buildHomeCommitment({ nextTournament: { id: 't-rom', name: 'Roma Pré-Temporada', start_date: '2026-01-25' }, careerDate: CAREER_DATE });
  gate('1. sem compromisso: "Agenda livre · Nenhum torneio imediato"', free.kind === 'free' && free.eyebrow === 'Agenda livre' && free.title === 'Nenhum torneio imediato');
  gate('2. aponta a próxima oportunidade do calendário com prazo', /Roma Pré-Temporada · em 5 dias/.test(free.meta), free.meta);
  gate('3. oferece "Ver calendário" como ação secundária', free.secondaryLabel === 'Ver calendário' && free.secondaryRoute === '/tournaments');
  const nothing = home.buildHomeCommitment({ careerDate: CAREER_DATE });
  gate('4. sem nada no horizonte: mensagem explícita, não vazio', /Nenhum evento no horizonte/.test(nothing.meta));
  gate('5. agenda vazia: lista vazia (UI mostra mensagem)', home.buildHomeAgenda({}).length === 0);
  const progress = home.buildHomeProgress({});
  gate('6. progresso sem dados não quebra (sem métricas, sem objetivo)', progress.metrics.length === 0 && progress.rankingGoal === null);
});
gate('7. UI: prioridades vazias mostram "Tudo em dia"', componentSource('HomePriorities').includes('Tudo em dia'));
gate('8. UI: agenda vazia mostra mensagem da janela de 4 semanas', componentSource('HomeAgenda').includes('Nenhum outro torneio na janela de quatro semanas.'));
gate('9. UI: status sem objetivo mostra "Objetivo em definição"', componentSource('HomeStatusCard').includes('Objetivo em definição'));
finish();
