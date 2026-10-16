// Fase 5.30 — "O que vem agora?": compromisso assumido → próxima inscrição
// possível → agenda livre; ação secundária só quando o herói aponta para outro lugar.
import { CAREER_DATE, gateRunner, HOME_LIB, planningItem, withModules } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-next-commitment-v530');
await withModules({ home: HOME_LIB }, async ({ home }) => {
  const hero = { to: '/game/training-center?view=training', cta: 'Treinar' };
  const registered = home.buildHomeCommitment({ weeklyCommitment: planningItem(), careerDate: CAREER_DATE, heroStep: hero });
  gate('1. inscrito em torneio futuro: o bloco mostra o torneio comprometido', registered.kind === 'tournament' && registered.title === 'Londres Challenge');
  gate('2. mostra estreia e sorteio relativos à data da carreira', /estreia em 9 dias/.test(registered.meta) && /Sorteio em 6 dias/.test(registered.status), `${registered.meta} | ${registered.status}`);
  gate('3. ação secundária "Ver torneio" com deep link de detalhes', registered.secondaryLabel === 'Ver torneio' && registered.secondaryRoute.includes('tournament=t-lon') && !registered.heroPointsToTournament);
  const drawn = home.buildHomeCommitment({ weeklyCommitment: planningItem({ drawn: true, startDate: CAREER_DATE }), careerDate: CAREER_DATE, heroStep: { to: '/tournaments?tournament=t-lon&mode=run', cta: 'Jogar Oitavas' } });
  gate('4. torneio em andamento (chave sorteada, estreia hoje)', drawn.status === 'Chave sorteada' && /estreia hoje/.test(drawn.meta));
  gate('5. herói já aponta para Torneios → sem secundário redundante', drawn.heroPointsToTournament === true);
  const opportunity = home.buildHomeCommitment({ suggestableTournament: { id: 't-dub', name: 'Dubai Rising Cup', tier: 'Bronze', start_date: '2026-02-12' }, careerDate: CAREER_DATE, heroStep: hero });
  gate('6. sem compromisso, com inscrição possível: "Próxima oportunidade"', opportunity.kind === 'opportunity' && opportunity.status === 'Inscrições abertas' && /em 23 dias/.test(opportunity.meta));
  const commitmentWins = home.buildHomeCommitment({ weeklyCommitment: planningItem(), suggestableTournament: { id: 't-dub', name: 'Dubai' }, careerDate: CAREER_DATE });
  gate('7. compromisso assumido tem precedência sobre a oportunidade', commitmentWins.title === 'Londres Challenge');
});
finish();
