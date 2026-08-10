import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMonthlyCareerReport,
  closedMonthKeys,
  createMonthlyCareerSnapshot,
  didCareerMonthChange,
  monthlyReportId,
  monthlyReportPeriod,
} from '../src/lib/monthlyCareerReportModel.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const profile = {
  id: 'player-1', sport_name: 'Teste', career_date: '2026-01-31', ranking_position: 84, rank_points: 500,
  xp: 1000, coins: 2000, energy: 44, fatigue: 58, followers: 900, popularity: 35, reputation: 20,
  wins: 6, losses: 4, tournaments_won: 0, partner_id: 'partner-1', partner_name: 'Alex', partner_chemistry: 60,
  coach_id: 'coach-1', coach_name: 'Rafa', serve: 40, forehand: 42, backhand: 39, volley: 38, bandeja: 41,
  smash: 43, defense: 40, agility: 44, strategy: 45, emotional_control: 41,
};
const startProfile = { ...profile, career_date: '2026-01-01', ranking_position: 91, rank_points: 410, xp: 800, coins: 1800, energy: 100, fatigue: 0, followers: 700, serve: 38 };
const start = createMonthlyCareerSnapshot(startProfile);
const end = createMonthlyCareerSnapshot(profile);
const report = buildMonthlyCareerReport({
  profile, periodKey: '2026-01', startSnapshot: start, endSnapshot: end, generatedDate: '2026-02-01',
  data: {
    matches: [
      { id: 'jan-win', profile_id: profile.id, date: '2026-01-10', result: 'vitória', tournament_id: 't1', tournament_name: 'Open Sul', round: 'qf', player_stats: { winners: 18, unforced_errors: 9, net_points_won: 12, net_points_played: 20 } },
      { id: 'jan-title', profile_id: profile.id, date: '2026-01-14', result: 'vitória', tournament_id: 't1', tournament_name: 'Open Sul', round: 'final', is_final: true },
      { id: 'feb-loss', profile_id: profile.id, date: '2026-02-01', result: 'derrota', tournament_name: 'Não incluir' },
    ],
    trainings: [{ id: 'tr-1', profile_id: profile.id, date: '2026-01-08', duration_min: 60, xp_reward: 20, energy_cost: 10, attribute_target: 'serve', attribute_gain: 2 }, { id: 'tr-feb', profile_id: profile.id, date: '2026-02-01', duration_min: 90 }],
    transactions: [{ id: 'in', profile_id: profile.id, date: '2026-01-05', type: 'income', category: 'premiacao', amount: 500 }, { id: 'out', profile_id: profile.id, date: '2026-01-06', type: 'expense', category: 'treino', amount: 100 }, { id: 'feb', profile_id: profile.id, date: '2026-02-01', type: 'expense', amount: 999 }],
    pressArticles: [{ id: 'p1', profile_id: profile.id, published_date: '2026-01-15', sentiment: 'positivo' }],
    achievements: [{ id: 'a1', profile_id: profile.id, unlocked_date: '2026-01-20', unlocked: true }],
    missions: [{ id: 'm1', profile_id: profile.id, period_key: 'monthly:2026-01', completed: true }],
    staff: [{ id: 's1', profile_id: profile.id, name: 'Fisio', staff_type: 'physio', contract_status: 'active' }],
    contracts: [{ id: 'c1', profile_id: profile.id, contract_type: 'patrocinio', sponsor_name: 'Marca', start_date: '2026-01-01', end_date: '2026-06-30', monthly_value: 300, is_active: true }],
  },
});

const career = read('src/lib/career.js');
const lifecycle = read('src/game-core/monthlyCareerReportLifecycle.js');
const page = read('src/pages/MonthlyReports.jsx');
const hub = read('src/pages/CareerHub.jsx');
const routes = read('src/App.jsx');
const destinations = read('src/lib/notificationDestinations.js');
const pkg = JSON.parse(read('package.json'));

const persisted = JSON.parse(JSON.stringify(report));
start.rankingPosition = 1;
end.energy = 100;

const checks = [
  ['não gera dentro do mesmo mês', didCareerMonthChange('2026-01-10', '2026-01-11') === false],
  ['detecta exclusivamente a virada mensal', didCareerMonthChange('2026-01-31', '2026-02-01') === true],
  ['avanço em lote enumera todos os meses fechados', JSON.stringify(closedMonthKeys('2026-01-20', '2026-04-03')) === JSON.stringify(['2026-01', '2026-02', '2026-03'])],
  ['período encerra no último dia correto', monthlyReportPeriod('2028-02').endDate === '2028-02-29'],
  ['id é determinístico por carreira e mês', monthlyReportId('player-1', '2026-01') === 'monthly-career-report:player-1:2026-01'],
  ['partidas do novo mês são excluídas', report.competition.matches === 2 && !report.competition.matchIds.includes('feb-loss')],
  ['campanha e título são agregados', report.competition.wins === 2 && report.competition.titles === 1],
  ['treino do novo mês é excluído', report.training.sessions === 1 && report.training.totalMinutes === 60],
  ['fluxo financeiro respeita o período', report.finances.income === 500 && report.finances.expenses === 100 && report.finances.net === 400],
  ['ranking e XP comparam snapshots', report.ranking.positionDelta === -7 && report.development.xpGained === 200],
  ['saúde preserva energia e fadiga', report.health.startEnergy === 100 && report.health.endEnergy === 44 && report.health.endFatigue === 58],
  ['mídia, missão, conquista, staff e patrocinador integrados', report.media.pressArticles === 1 && report.development.missionsCompleted === 1 && report.development.achievementsUnlocked === 1 && report.relationships.activeStaff.length === 1 && report.sponsors.length === 1],
  ['estatísticas técnicas usam somente dados disponíveis', report.performance.available && report.performance.winners === 18 && report.performance.netSuccessRate === 60],
  ['snapshot persistido não muda com referências externas', persisted.startSnapshot.rankingPosition === 91 && persisted.endSnapshot.energy === 44],
  ['ciclo inicializa snapshot só quando necessário', lifecycle.includes('profile.monthly_report_state?.periodKey === currentMonth') && lifecycle.includes('startSnapshot: createMonthlyCareerSnapshot(profile)')],
  ['fechamento consulta ID antes do upsert', lifecycle.indexOf('report = await reportById(id)') < lifecycle.indexOf("entities[REPORT_ENTITY].upsert(id")],
  ['notificação tem ID estável e deep-link direto', lifecycle.includes('monthly-career-report-notification:') && lifecycle.includes("notification_type: 'MONTHLY_REPORT'") && destinations.includes("case NOTIFICATION_DESTINATION_TYPES.MONTHLY_REPORT")],
  ['geração ocorre no avanço e não no render', career.includes('finalizeClosedCareerMonth(profile, updated)') && !page.includes('finalizeClosedCareerMonth') && !hub.includes('finalizeClosedCareerMonth')],
  ['tela histórica consome snapshots finalizados', page.includes('listMonthlyCareerReports') && page.includes("searchParams.get('report')") && page.includes('snapshot imutável')],
  ['Home mostra resumo apenas no primeiro dia', hub.includes("profile.career_date?.endsWith('-01')") && hub.includes('MonthlyReportHomeCard')],
  ['rota histórica registrada', routes.includes('path="/game/monthly-reports"')],
  ['script npm registrado', pkg.scripts?.['test:monthly-career-report'] === 'node scripts/test-monthly-career-report-rc.mjs'],
  ['sem polling ou simulação paralela', !lifecycle.includes('setInterval') && !lifecycle.includes('setTimeout') && !lifecycle.includes('simulate')],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`MonthlyCareerReportRCTest: PASS (${checks.length}/${checks.length})`);
