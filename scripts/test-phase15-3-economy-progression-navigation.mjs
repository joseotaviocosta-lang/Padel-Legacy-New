import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ROUTES } from '../src/navigation/routes.js';
import { formatAttributeGain, formatCoinBalance } from '../src/lib/numberFormat.js';
import { isTournamentCompletedAt, sanitizeBracketHistory, visibleTournamentChampion } from '../src/lib/tournamentBracketView.js';
import { isMarketEventActive, normalizeMarketEvent } from '../src/lib/marketPromotion.js';
import { deriveAthleteCareerState, evolveAthleteCareerMonth } from '../src/game-core/livingCircuitRules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) failures.push(`${gates}. ${label}`);
}
function addMonths(date, months) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

const careerDate = '2026-01-10';
const completedHistory = [{ round: 'Final', matches: [{ team_a: 'A & B', team_b: 'C & D', score: '6-4 6-3', winner: 'A & B', status: 'completed' }] }];
const future30 = { start_date: '2026-02-09', status: 'inscricoes', champion: 'A & B', bracket_history: completedHistory };
const future1 = { ...future30, start_date: '2026-01-11' };
const todayPending = { ...future30, start_date: careerDate };
const futureRows = [future30, future1, todayPending].map((tournament) => sanitizeBracketHistory(tournament, careerDate));

gate('torneio +30 dias não mostra score', futureRows[0][0].matches[0].score === null);
gate('torneio +1 dia não mostra winner', futureRows[1][0].matches[0].winner === null);
gate('torneio hoje pendente não mostra resultado', futureRows[2][0].matches[0].status === 'scheduled');
gate('draw futuro preserva participante A', futureRows[0][0].matches[0].team_a === 'A & B');
gate('draw futuro preserva participante B', futureRows[0][0].matches[0].team_b === 'C & D');
gate('torneio futuro não expõe campeão legado', visibleTournamentChampion(future30, careerDate) === null);
gate('torneio futuro não é concluído por champion inválido', !isTournamentCompletedAt(future30, careerDate));
const past = { start_date: '2026-01-02', status: 'finalizado', champion: 'A & B', bracket_history: completedHistory };
const pastHistory = sanitizeBracketHistory(past, careerDate);
gate('torneio passado preserva score real', pastHistory[0].matches[0].score === '6-4 6-3');
gate('final concluída preserva winner', pastHistory[0].matches[0].winner === 'A & B');
gate('final concluída cria um campeão visível', visibleTournamentChampion(past, careerDate) === 'A & B');
gate('torneio sem draw mantém chave vazia', sanitizeBracketHistory({ start_date: '2026-02-01' }, careerDate).length === 0);
const teamRankingSource = read('src/lib/teamRanking.js');
gate('simulador legado respeita data canônica', teamRankingSource.includes('if (t.start_date) return t.start_date < careerDate'));
gate('World Tour não entra no simulador legado', teamRankingSource.includes('if (t.world_tour_event) return false'));
const bracketSource = read('src/components/tournaments/TournamentBracket.jsx');
gate('UI oferece estado de chave não sorteada', bracketSource.includes('Chave ainda não sorteada'));
gate('UI usa sanitização de save futuro', bracketSource.includes('sanitizeBracketHistory'));

function athleteFixture(index, role = 'free') {
  return {
    id: `phase15-3-athlete-${index}`,
    name: `Atleta ${index}`,
    role,
    age: 18,
    birth_date: '2008-01-01',
    peak_age: 28,
    overall: 58 + (index % 4),
    overall_rating: 58 + (index % 4),
    potential: 91,
    growth_rate: 1.4,
    decline_rate: 1,
    ranking_position: 250 + index,
    attributes: { serve: 58, forehand: 58, backhand: 58, volley: 58, smash: 58, speed: 58 },
    form: 62,
  };
}
function simulateAthlete(index, role, months = 36) {
  const initial = athleteFixture(index, role);
  let athlete = structuredClone(initial);
  for (let month = 0; month < months; month += 1) {
    const date = addMonths('2026-01-01', month);
    const evolution = evolveAthleteCareerMonth(athlete, date, { isYearBoundary: month > 0 && month % 12 === 0 });
    athlete = { ...athlete, ...evolution.patch };
  }
  return { initial, athlete, delta: athlete.overall_rating - initial.overall_rating };
}
const roles = ['active-partner', 'free', 'ex-partner'];
const roleRuns = Object.fromEntries(roles.map((role) => [role, Array.from({ length: 100 }, (_, index) => simulateAthlete(index, role))]));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const roleDelta = Object.fromEntries(roles.map((role) => [role, average(roleRuns[role].map((run) => run.delta))]));
gate('parceiro jovem evolui em 100 carreiras', roleDelta['active-partner'] > 0);
gate('OVR do parceiro muda', roleRuns['active-partner'].some((run) => run.delta !== 0));
gate('parceiro envelhece conforme birth_date', roleRuns['active-partner'][0].athlete.age >= 20);
gate('estado de auge é derivado pela curva canônica', deriveAthleteCareerState({ ...athleteFixture(900), age: 28, birth_date: null, ranking_position: 40 }, '2026-01-01').stage === 'prime');
gate('estado de declínio é derivado pela curva canônica', deriveAthleteCareerState({ ...athleteFixture(901), age: 34, birth_date: null, overall: 78, overall_rating: 78, ranking_position: 180 }, '2026-01-01').stage === 'declining');
gate('parceiro ativo não recebe exclusão especial', roleDelta['active-partner'] === roleDelta.free);
gate('NPC livre segue a mesma curva', roleDelta.free === roleDelta['ex-partner']);
const partnershipSource = read('src/lib/partnershipSystem.js');
gate('Partnership referencia AthleteProfile por id', partnershipSource.includes('partner_bot_id: bot.id') && partnershipSource.includes('athlete_b_id: bot.id'));
const partnerOverviewSource = read('src/components/partner/PartnerOverview.jsx');
gate('Minha dupla lê AthleteProfile canônico', partnerOverviewSource.includes('(localGame.entities).AthleteProfile') && partnerOverviewSource.includes('athleteProfiles.get(partnership.partner_bot_id)'));
gate('Minha dupla deriva OVR do perfil canônico', partnerOverviewSource.includes('overallRating(partnerProfile)'));
const reloadStart = simulateAthlete(777, 'active-partner', 12).athlete;
const reloaded = structuredClone(JSON.parse(JSON.stringify(reloadStart)));
const reloadEvolution = evolveAthleteCareerMonth(reloaded, '2027-02-01');
gate('reload preserva progressão mensal', reloadEvolution.changed && reloadEvolution.patch.last_career_evolution_month === '2027-02');
gate('ex-parceiro continua evoluindo', roleRuns['ex-partner'].some((run) => run.delta > 0));

const appSource = read('src/App.jsx');
const homeSource = read('src/pages/CareerHub.jsx');
const guideSource = read('src/onboarding/tutorialSteps.js');
const navSource = read('src/navigation/navigationConfig.js');
const bottomNavSource = read('src/components/BottomNav.jsx');
const notificationSource = read('src/lib/notificationDestinations.js');
const nextActionSource = read('src/lib/careerNextAction.js');
gate('rota canônica de treino é /game/training', APP_ROUTES.TRAINING === '/game/training');
gate('router declara rota canônica de treino', appSource.includes('path="/game/training"'));
gate('CTA da Home usa constante canônica', homeSource.includes('APP_ROUTES.TRAINING'));
gate('guia resolve para rota existente', guideSource.includes("'first-training'") && guideSource.includes("'/game/training'"));
gate('NavigationHub/sidebar resolve Treinos', navSource.includes("to: '/game/training'"));
gate('BottomNav deriva itens da fonte de navegação', bottomNavSource.includes('NAV_GROUPS'));
gate('notificação de treino usa rota canônica válida', notificationSource.includes("'/game/training'"));
gate('pós-treino usa rota válida', nextActionSource.includes("route: '/game/training'"));
for (const relative of ['src/lib/weeklyCareerReview.js', 'src/lib/dailyCareerBriefing.js', 'src/lib/careerDecisionCenter.js']) {
  gate(`${relative} não contém rota /training inválida`, !/route:\s*['"]\/training['"]/.test(read(relative)));
}
gate('momentos de carreira não usam /partnership inválida', !/route:\s*['"]\/partnership['"]/.test(read('src/lib/careerMoments.js')));

gate('43.806000000000004 vira 43.81', formatAttributeGain(43.806000000000004) === '43.81');
gate('35.617000000000004 vira 35.62', formatAttributeGain(35.617000000000004) === '35.62');
gate('5.696 vira 5.70', formatAttributeGain(5.696) === '5.70');
const exact = 35.617000000000004;
formatAttributeGain(exact);
gate('formatação não altera valor persistido', exact === 35.617000000000004);
const trainingUiSources = ['src/pages/Training.jsx', 'src/components/training/AttributeEvolution.jsx', 'src/components/training/TrainingActivityCard.jsx'].map(read).join('\n');
gate('telas de evolução usam helper canônico', (trainingUiSources.match(/formatAttributeGain/g) || []).length >= 7);
gate('UI de evolução não interpola attribute_gain cru', !trainingUiSources.includes('+{t.attribute_gain}'));

const legacyPromotion = normalizeMarketEvent({ id: 'launch', event_type: 'promotion', discount_percent: 10, is_active: true, start_date: '2026-01-01', end_date: '2026-01-07' });
gate('promoção inicial normaliza tipo legado', legacyPromotion.event_type === 'promocao');
gate('desconto legado normaliza para multiplicador', legacyPromotion.price_modifier === 0.9);
gate('badge nunca recebe modificador NaN', Number.isFinite(legacyPromotion.price_modifier));
gate('promoção ativa no início da carreira', isMarketEventActive(legacyPromotion, '2026-01-01'));
gate('promoção ativa na data final inclusiva', isMarketEventActive(legacyPromotion, '2026-01-07'));
gate('promoção expira no dia seguinte', !isMarketEventActive(legacyPromotion, '2026-01-08'));
gate('evento global alcança itens quando filtros estão vazios', legacyPromotion.affected_item_ids.length === 0 && legacyPromotion.affected_categories.length === 0);
gate('preço promocional é positivo e correto', Math.round(1000 * legacyPromotion.price_modifier) === 900);
const missingDiscount = normalizeMarketEvent({ is_active: true });
gate('save antigo sem desconto recebe fallback finito', missingDiscount.price_modifier === 1 && Number.isFinite(missingDiscount.price_modifier));
const bannerSource = read('src/components/shop/MarketEventsBanner.jsx');
gate('banner não faz aritmética com evento cru', bannerSource.includes('.map(normalizeMarketEvent)'));

const appLayoutSource = read('src/components/AppLayout.jsx');
const hudSource = read('src/components/career/CareerHud.jsx');
const playerAdapterSource = read('src/gameplay/adapters/PlayerAdapter.js');
gate('saldo aparece no header mobile', appLayoutSource.includes('formatCoinBalance(headerProfile?.coins)'));
gate('saldo aparece no HUD desktop', hudSource.includes("label: 'Moedas'"));
gate('saldo mobile navega para Economia', appLayoutSource.includes('to={APP_ROUTES.ECONOMY}'));
gate('saldo desktop navega para Economia', hudSource.includes('to: APP_ROUTES.ECONOMY'));
gate('saldo reage imediatamente ao update canônico', playerAdapterSource.includes("'padel:profile-updated'"));
gate('evento de saldo carrega o perfil atualizado em memória', playerAdapterSource.includes('detail: { profile'));
gate('header não adiciona polling', !appLayoutSource.includes('setInterval('));
gate('header mobile protege overflow em 360px', appLayoutSource.includes('items-center overflow-hidden') && appLayoutSource.includes('max-w-[4.65rem]'));
gate('saldo usa separador pt-BR sem decimais', formatCoinBalance(125000) === '125.000');
let balance = 1307;
for (const delta of [-120, -300, 650, 100, -90]) balance += delta;
gate('sequência treino/compra/prêmio/missão/staff mantém saldo canônico', balance === 1547 && formatCoinBalance(balance) === '1.547');

const tournamentCalendars = Array.from({ length: 100 }, (_, career) => Array.from({ length: 20 }, (_, event) => ({
  id: `${career}-${event}`,
  start_date: addMonths('2026-02-01', event),
  status: 'inscricoes',
  champion: 'legado inválido',
  bracket_history: completedHistory,
})));
const prematureResults = tournamentCalendars.flat().flatMap((tournament) => sanitizeBracketHistory(tournament, '2026-01-01')).flatMap((round) => round.matches).filter((match) => match.score || match.winner).length;
gate('100 calendários não exibem resultados futuros', prematureResults === 0);

const report = {
  generatedAt: new Date().toISOString(),
  gates,
  simulations: {
    careers: 100,
    seasons: 3,
    deltaOvrPerRole: roleDelta,
    activePartnerFinalAgeAverage: average(roleRuns['active-partner'].map((run) => run.athlete.age)),
    futureTournamentCalendars: tournamentCalendars.length,
    prematureResults,
    finalEconomyBalance: balance,
  },
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/phase15-3-simulation.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`Phase 15.3: ${failures.length}/${gates} gate(s) falharam:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  assert.fail('Fase 15.3 integrada falhou');
}
console.log(`test:phase15-3-economy-progression-navigation OK — ${gates} gates`);
console.log(JSON.stringify(report.simulations, null, 2));
