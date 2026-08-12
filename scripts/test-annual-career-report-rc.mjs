import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  annualReportId,
  annualReportPeriod,
  buildAnnualCareerReport,
  createAnnualCareerSnapshot,
  didCareerYearChange,
} from '../src/lib/annualCareerReportModel.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

const attributes = { serve: 40, forehand: 41, backhand: 39, volley: 38, bandeja: 37, smash: 42, defense: 40, agility: 41, strategy: 43, emotional_control: 39 };
const baseProfile = { id: 'career-player-1', sport_name: 'Jogador Teste', career_date: '2026-01-01', ranking_position: 900, rank_points: 100, xp: 0, coins: 7000, followers: 1000, popularity: 20, reputation: 10, energy: 100, fatigue: 0, ...attributes };

function athlete(id, name, age, ranking, overall, wins, losses, titles, points = 1000) {
  return { id, name, country: id === 'x' ? null : 'Brasil', age, ranking_position: ranking, overall_rating: overall, career_wins: wins, career_losses: losses, career_titles: titles, world_ranking_points: points + (20 - ranking) * 100 };
}

function circuit(year, end = false) {
  const suffix = year - 2026;
  const start = [
    athlete('a', 'Arturo Líder', 27 + suffix, 1, 88, suffix * 40, suffix * 10, suffix * 6, 5000),
    athlete('b', 'Bruno Ascensão', 25 + suffix, 10, 72, suffix * 25, suffix * 12, suffix * 2, 2500),
    athlete('c', 'Carlos Queda', 31 + suffix, 2, 82, suffix * 22, suffix * 12, suffix, 4200),
    athlete('d', 'Davi Revelação', 19 + suffix, 12, 55, suffix * 18, suffix * 14, suffix, 1800),
    ...Array.from({ length: 8 }, (_, index) => athlete(`e${index}`, `Atleta ${index + 1}`, 22 + index, 3 + index, 70 - index, suffix * 12, suffix * 8, 0, 3300 - index * 120)),
  ];
  if (!end) return start;
  return start.map((item) => {
    if (item.id === 'a') return { ...item, ranking_position: 1, overall_rating: item.overall_rating + 2, career_wins: item.career_wins + 40, career_losses: item.career_losses + 8, career_titles: item.career_titles + 6, world_ranking_points: item.world_ranking_points + 1800 };
    if (item.id === 'b') return { ...item, ranking_position: 2, overall_rating: item.overall_rating + 6, career_wins: item.career_wins + 28, career_losses: item.career_losses + 12, career_titles: item.career_titles + 2, world_ranking_points: item.world_ranking_points + 2500 };
    if (item.id === 'c') return { ...item, ranking_position: 12, overall_rating: item.overall_rating - 2, career_wins: item.career_wins + 15, career_losses: item.career_losses + 22, world_ranking_points: Math.max(100, item.world_ranking_points - 1800) };
    if (item.id === 'd') return { ...item, ranking_position: 3, overall_rating: item.overall_rating + 12, career_wins: item.career_wins + 24, career_losses: item.career_losses + 14, career_titles: item.career_titles + 3, world_ranking_points: item.world_ranking_points + 2600 };
    return { ...item, career_wins: item.career_wins + 12 + Number(item.id.slice(1)), career_losses: item.career_losses + 10, overall_rating: item.overall_rating + 1 };
  });
}

function pairs(year, end = false) {
  const base = year - 2026;
  return [
    { id: 'pair-a', team_key: 'a_b', player1_name: 'Arturo Líder', player2_name: 'Bruno Ascensão', ranking_points: 4000 + base * 100, matches_played: base * 45, wins: base * 35, losses: base * 10, titles: Array(base * 4).fill('T') },
    { id: 'pair-d', team_key: 'd_e0', player1_name: 'Davi Revelação', player2_name: 'Atleta 1', ranking_points: 1800 + base * 100, matches_played: base * 30, wins: base * 18, losses: base * 12, titles: Array(base).fill('T') },
  ].map((item) => end ? { ...item, ranking_points: item.ranking_points + (item.id === 'pair-a' ? 2200 : 1600), matches_played: item.matches_played + 40, wins: item.wins + (item.id === 'pair-a' ? 34 : 24), losses: item.losses + (item.id === 'pair-a' ? 6 : 16), titles: [...item.titles, ...Array(item.id === 'pair-a' ? 5 : 2).fill('Novo')] } : item);
}

function monthlyReports(profile, year, startRank, endRank) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return {
      id: `monthly:${profile.id}:${month}`, profileId: profile.id, periodKey: month, status: 'finalized',
      ranking: { endPosition: Math.round(startRank + ((endRank - startRank) * (index + 1)) / 12) },
      development: { endOverall: 42 + index },
      competition: { matches: 3, wins: 2, losses: 1, titles: index === 10 ? 1 : 0 },
      training: { sessions: 4, totalMinutes: 240 },
      finances: { income: 10000, expenses: 4000, endBalance: 7000 + (index + 1) * 6000 },
      media: { fansEnd: 1000 + (index + 1) * 500, fansDelta: 500 },
      highlights: index === 10 ? ['Título no Masters Teste'] : [`Mês ${index + 1} concluído`],
    };
  });
}

function seasonData(profile, year) {
  const matches = Array.from({ length: 12 }, (_, index) => ({
    id: `match-${year}-${index}`, profile_id: profile.id, date: `${year}-${String(index + 1).padStart(2, '0')}-15`, result: index % 3 === 2 ? 'derrota' : 'vitória', tournament_id: index === 10 ? `masters-${year}` : `open-${year}-${index}`, tournament_name: index === 10 ? 'Masters Teste' : `Open ${index + 1}`, tournament_round: index === 10 ? 'final' : 'quartas', team_a: [profile.sport_name, 'Parceiro'], team_b: ['Rival A', 'Rival B'], winner: index % 3 === 2 ? 'B' : 'A', score_a: index % 3 === 2 ? 0 : 2, score_b: index % 3 === 2 ? 2 : 0,
  }));
  matches.push({ id: `next-${year}`, profile_id: profile.id, date: `${year + 1}-01-01`, result: 'vitória', tournament_name: 'Não incluir', team_a: [profile.sport_name], winner: 'A' });
  return {
    matches,
    trainings: Array.from({ length: 12 }, (_, i) => ({ id: `tr-${year}-${i}`, profile_id: profile.id, date: `${year}-${String(i + 1).padStart(2, '0')}-05`, category: 'technical', duration_min: 60, attribute_target: 'smash', attribute_gain: 1, condition_before: { energy: 80, fatigue: 20 }, condition_after: { energy: 65, fatigue: 35 } })),
    transactions: [{ id: `next-money-${year}`, profile_id: profile.id, date: `${year + 1}-01-01`, type: 'income', amount: 999999 }],
    tournaments: [{ id: `masters-${year}`, name: 'Masters Teste', tier: 'Masters', prize_coins: 120000, rank_points: 700 }],
    pressArticles: [], achievements: [], missions: [], staff: [], contracts: [], partnerships: [],
    monthlyReports: monthlyReports(profile, year, profile.ranking_position, Math.max(1, profile.ranking_position - 300)),
    athletes: circuit(year, true), teamRankings: pairs(year, true),
  };
}

let previousReport = null;
const reports = [];
const started = performance.now();
for (const year of [2026, 2027, 2028]) {
  const startProfile = { ...baseProfile, career_date: `${year}-01-01`, ranking_position: 900 - (year - 2026) * 300, xp: (year - 2026) * 2000, coins: 7000 + (year - 2026) * 72000 };
  const endProfile = { ...startProfile, career_date: `${year}-12-31`, ranking_position: Math.max(1, startProfile.ranking_position - 300), rank_points: startProfile.rank_points + 3500, xp: startProfile.xp + 2000, coins: startProfile.coins + 72000, followers: startProfile.followers + 6000, popularity: startProfile.popularity + 20, reputation: startProfile.reputation + 10, smash: startProfile.smash + 12 };
  const start = createAnnualCareerSnapshot(startProfile, { athletes: circuit(year, false), teamRankings: pairs(year, false) });
  const end = createAnnualCareerSnapshot(endProfile, { athletes: circuit(year, true), teamRankings: pairs(year, true) });
  const report = buildAnnualCareerReport({ profile: endProfile, year, yearStartSnapshot: start, yearEndSnapshot: end, data: seasonData(endProfile, year), generatedDate: `${year + 1}-01-01`, previousReport });
  reports.push(report); previousReport = report;
}
const durationMs = performance.now() - started;
const report = reports[0];
const frozen = JSON.parse(JSON.stringify(report));
report.yearEndSnapshot.player.rankingPosition = 1;

const lifecycle = read('src/game-core/annualCareerReportLifecycle.js');
const career = read('src/lib/career.js');
const page = read('src/pages/AnnualReports.jsx');
const hub = read('src/pages/CareerHub.jsx');
const routes = read('src/App.jsx');
const destinations = read('src/lib/notificationDestinations.js');
const pkg = JSON.parse(read('package.json'));

check('só detecta transição de ano', !didCareerYearChange('2026-12-30', '2026-12-31') && didCareerYearChange('2026-12-31', '2027-01-01'));
check('período anual é exclusivo', annualReportPeriod(2026).startDate === '2026-01-01' && annualReportPeriod(2026).endDate === '2026-12-31');
check('id é persistente por carreira e ano', annualReportId('career-player-1', 2026) === 'annual-career-report:career-player-1:2026');
check('três temporadas simuladas geram três IDs distintos', new Set(reports.map((item) => item.id)).size === 3);
check('janeiro do ano seguinte fica fora', report.sportingResults.matches === 36 && !report.tournaments.some((item) => item.name === 'Não incluir'));
check('ranking inicial e final fecham', report.ranking.startPosition === 900 && report.ranking.endPosition === 600 && report.ranking.positionsGained === 300);
check('atributos e OVR fecham', report.attributes.items.find((item) => item.key === 'smash')?.delta === 12 && report.attributes.overallDelta > 0);
check('finanças usam soma dos 12 meses', report.finances.income === 120000 && report.finances.expenses === 48000 && report.finances.net === 72000);
check('torneios e melhor campanha fecham', report.bestTournament?.name === 'Masters Teste' && report.bestTournament?.result === 'champion');
check('fãs e popularidade fecham', report.fans.gained === 6000 && report.fans.popularityDelta === 20);
check('Top 10 final correto', report.circuitSummary.finalTop10.length === 10 && report.circuitSummary.finalTop10[0].name === 'Arturo Líder');
check('maior subida correta', report.circuitSummary.biggestClimbers[0].name === 'Davi Revelação');
check('maior queda correta', report.circuitSummary.biggestFallers[0].name === 'Carlos Queda');
check('maior evolução correta', report.circuitSummary.mostImproved[0].name === 'Davi Revelação' && report.circuitSummary.mostImproved[0].technicalDelta === 12);
check('mais vitórias correto', report.circuitSummary.mostWins[0].name === 'Arturo Líder' && report.circuitSummary.mostWins[0].wins === 40);
check('mais títulos correto', report.circuitSummary.mostTitles[0].name === 'Arturo Líder' && report.circuitSummary.mostTitles[0].titles === 6);
check('MVP deriva de score explicado', report.circuitSummary.playerOfTheYear.name === 'Arturo Líder' && report.circuitSummary.playerOfTheYear.criteria.includes('80 por título'));
check('revelação usa idade e critérios objetivos', report.circuitSummary.revelation.name === 'Davi Revelação' && report.circuitSummary.revelation.age <= 23 && report.circuitSummary.revelation.criteria.includes('23 anos'));
check('melhor dupla vem de resultados persistidos', report.circuitSummary.bestPair.name.includes('Arturo Líder') && report.circuitSummary.bestPair.titles === 5);
check('auditoria mensal confere', report.audit.consistent && report.audit.checks.filter((item) => item.applicable).every((item) => item.difference === 0));
check('comparação com ano anterior funciona', reports[1].yearComparison?.year === 2026 && reports[2].yearComparison?.year === 2027);
check('snapshot histórico não muda', frozen.ranking.endPosition === 600 && frozen.yearEndSnapshot.player.rankingPosition === 600);
check('fechamento consulta ID antes do upsert', lifecycle.indexOf('report = await reportById(id)') < lifecycle.indexOf("entities[REPORT_ENTITY].upsert(id"));
check('reload não duplica e notifica com ID estável', lifecycle.includes('annual-career-report-notification:') && lifecycle.includes("notification_type: 'ANNUAL_REPORT'"));
check('fechamento anual ocorre antes da simulação de janeiro', career.indexOf('annualBoundary:finalizeClosedCareerYear') < career.indexOf('monthlyBoundary:simulatePastTournaments'));
check('deep link abre relatório anual diretamente', destinations.includes('case NOTIFICATION_DESTINATION_TYPES.ANNUAL_REPORT') && destinations.includes("'/game/annual-reports'"));
check('rota, tela histórica e card da Home registrados', routes.includes('path="/game/annual-reports"') && page.includes("searchParams.get('report')") && hub.includes('AnnualReportHomeCard'));
check('geração acontece no ciclo e não no render', career.includes('finalizeClosedCareerYear(profile, updated)') && !page.includes('finalizeClosedCareerYear'));
check('script npm registrado', pkg.scripts?.['test:annual-career-report'] === 'node scripts/test-annual-career-report-rc.mjs');
check('três temporadas geram em tempo controlado', durationMs < 500);

for (const [name, ok] of checks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`AnnualCareerReportRCTest: PASS (${checks.length}/${checks.length}) · 3 temporadas em ${durationMs.toFixed(2)}ms`);
