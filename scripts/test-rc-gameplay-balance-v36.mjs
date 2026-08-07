import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  runBalanceBatch,
  createBalanceAthlete,
} from '../src/engine/match/BalanceSimulator.js';
import { MATCH_TACTICS } from '../src/engine/match/MatchTactics.js';

const args = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')));
const matchesPerScenario = Math.max(20, Number(args.matches || 30));
const careerRuns = Math.max(5, Number(args.careerRuns || 10));
const seasons = Math.max(5, Number(args.seasons || 10));
const reportDir = path.resolve(args.reportDir || 'reports/rc-sprint-1');
fs.mkdirSync(reportDir, { recursive: true });

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const team = (prefix, level, extras = {}) => [
  createBalanceAthlete(`${prefix}-left`, `${prefix} L`, level, extras.style || 'Equilibrado', 'left', extras.left || extras.common || {}),
  createBalanceAthlete(`${prefix}-right`, `${prefix} R`, level, extras.style || 'Equilibrado', 'right', extras.right || extras.common || {}),
];
const tactic = (id) => MATCH_TACTICS.find((item) => item.id === id) || MATCH_TACTICS[0];

const scenarios = [
  {
    id: 'equal-teams', label: 'Duplas idênticas',
    teams: { teamA: team('equal-a', 72), teamB: team('equal-b', 72) },
    gates: (result) => ({
      sideBias: result.sideBias <= 8,
      scorelines: result.bagelSetRate <= 10 && result.lopsidedSetRate <= 28,
      serve: result.serviceHoldRate >= 60 && result.serviceHoldRate <= 90,
      doubleFaults: result.doubleFaultRate <= 0.2,
    }),
  },
  {
    id: 'moderate-skill-gap', label: 'Diferença moderada de nível',
    teams: { teamA: team('moderate-a', 77), teamB: team('moderate-b', 72) },
    gates: (result) => ({ strongerFavored: result.winRate.A >= 52 && result.winRate.A <= 72 }),
  },
  {
    id: 'elite-skill-gap', label: 'Elite contra profissional',
    teams: { teamA: team('elite-a', 84), teamB: team('elite-b', 72) },
    gates: (result) => ({ strongerFavored: result.winRate.A >= 68 && result.winRate.A <= 92 }),
  },
  {
    id: 'low-serve-not-double-faults', label: 'Saque baixo sem colapso por dupla falta',
    teams: {
      teamA: team('serve-a', 72, { common: { serve: 35 } }),
      teamB: team('serve-b', 72),
    },
    gates: (result) => ({
      doubleFaultsRare: result.doubleFaultRate <= 0.2,
      stillCompetitive: result.winRate.A >= 18,
    }),
  },
  {
    id: 'aggressive-tactic', label: 'Tática agressiva controlada',
    teams: { teamA: team('aggressive-a', 72), teamB: team('aggressive-b', 72) },
    tactic: tactic('agressivo'),
    gates: (result) => ({
      errorsControlled: result.averageUnforcedErrors <= 38,
      energyControlled: result.averageFinalEnergy >= 58,
      matchLengthControlled: result.p95Points <= 220,
    }),
  },
];

const matchReports = scenarios.map((scenario) => {
  const summary = runBalanceBatch({
    matches: matchesPerScenario,
    teams: scenario.teams,
    tactic: scenario.tactic || tactic('equilibrado'),
    seedPrefix: `rc-sprint-1:${scenario.id}`,
    alternateSides: true,
  });
  const rcGates = scenario.gates(summary);
  const safetyGates = {
    energyWindow: summary.gates.energyWindow,
    exhaustionControlled: summary.gates.exhaustionControlled,
    matchLengthControlled: summary.gates.matchLengthControlled,
    rallyLengthCoherent: summary.gates.rallyLengthCoherent,
    coordinationActive: summary.gates.coordinationActive,
    doubleFaultsRare: summary.gates.doubleFaultsRare,
  };
  if (scenario.id === 'equal-teams') {
    safetyGates.fairSides = summary.gates.fairSides;
    safetyGates.serviceBalance = summary.gates.serviceBalance;
  }
  return {
    id: scenario.id,
    label: scenario.label,
    summary,
    rcGates,
    safetyGates,
    success: Object.values(safetyGates).every(Boolean) && Object.values(rcGates).every(Boolean),
  };
});

const careerOutput = path.join(reportDir, 'career-simulation.json');
const careerRun = spawnSync(process.execPath, [
  'scripts/test-massive-careers-v32.mjs',
  `--runs=${careerRuns}`,
  `--seasons=${seasons}`,
  `--output=${careerOutput}`,
], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

if (careerRun.status !== 0 || !fs.existsSync(careerOutput)) {
  console.error(careerRun.stdout || '');
  console.error(careerRun.stderr || '');
  throw new Error('A simulação de carreiras não foi concluída.');
}

const careerReport = JSON.parse(fs.readFileSync(careerOutput, 'utf8'));
const normalProfiles = careerReport.scenarioReports.filter((row) => row.id !== 'overtraining');
const careerGates = {
  top500Reachable: normalProfiles.every((row) => row.top500 != null && row.top500 <= 3),
  top100InCareerWindow: normalProfiles.every((row) => row.top100 == null || (row.top100 >= 3 && row.top100 <= 7)),
  overallControlled: normalProfiles.every((row) => row.finalOverall >= 72 && row.finalOverall <= 90),
  injuriesControlled: normalProfiles.every((row) => row.injuries <= 6),
  partnerStability: normalProfiles.every((row) => row.partnerChanges <= 4),
  bankruptcyControlled: normalProfiles.every((row) => row.bankruptRate <= 10),
};

const observations = [];
const averageCoins = round(normalProfiles.reduce((sum, row) => sum + row.coins, 0) / Math.max(1, normalProfiles.length));
if (averageCoins > 150000) observations.push({ severity: 'attention', code: 'ECONOMY_GENEROUS', value: averageCoins, message: 'A economia de longo prazo permanece generosa para perfis competitivos; confirmar com saves persistentes e custos reais.' });
if (normalProfiles.every((row) => row.top10 == null)) observations.push({ severity: 'attention', code: 'TOP10_NOT_REACHED_IN_APPROX_SIM', message: 'O simulador aproximado v32 não leva integralmente em conta os pontos atuais do World Tour; não usar isoladamente para recalibrar o ranking real.' });

const success = matchReports.every((row) => row.success) && Object.values(careerGates).every(Boolean);
const report = {
  generatedAt: new Date().toISOString(),
  version: 'RC Sprint 1',
  configuration: {
    matchesPerScenario,
    totalMatchSimulations: matchesPerScenario * scenarios.length,
    careerRuns,
    seasons,
    totalCareerSimulations: careerReport.configuration.totalCareers,
  },
  matchReports,
  careerSummary: {
    global: careerReport.global,
    scenarios: normalProfiles,
    gates: careerGates,
  },
  observations,
  success,
};

fs.writeFileSync(path.join(reportDir, 'RC-SPRINT-1-GAMEPLAY-BALANCE.json'), JSON.stringify(report, null, 2));
const md = `# RC Sprint 1 — Gameplay Balance\n\n` +
  `- Partidas simuladas: **${report.configuration.totalMatchSimulations}**\n` +
  `- Carreiras simuladas: **${report.configuration.totalCareerSimulations}**\n` +
  `- Temporadas por carreira: **${seasons}**\n` +
  `- Resultado: **${success ? 'PASS' : 'REVIEW'}**\n\n` +
  `## Match Engine\n\n` + matchReports.map((row) =>
    `### ${row.label}\n- Vitórias A/B: ${row.summary.winRate.A}% / ${row.summary.winRate.B}%\n- Hold de saque: ${row.summary.serviceHoldRate}%\n- Duplas faltas: ${row.summary.doubleFaultRate}%\n- Sets 6–0: ${row.summary.bagelSetRate}%\n- Sets desequilibrados: ${row.summary.lopsidedSetRate}%\n- Rally médio: ${row.summary.averageRally}\n- Status: ${row.success ? 'PASS' : 'REVIEW'}\n`
  ).join('\n') +
  `\n## Carreiras\n\n` + normalProfiles.map((row) =>
    `- **${row.label}**: OVR ${row.finalOverall}, ranking #${row.finalRank}, Top 100 T${row.top100 ?? '—'}, lesões ${row.injuries}, trocas ${row.partnerChanges}, saldo ${row.coins}.`
  ).join('\n') +
  `\n\n## Observações\n\n` + (observations.length ? observations.map((item) => `- ${item.message}`).join('\n') : '- Nenhuma observação crítica.') + '\n';
fs.writeFileSync(path.join(reportDir, 'RC-SPRINT-1-GAMEPLAY-BALANCE.md'), md);

console.log(JSON.stringify({
  success,
  configuration: report.configuration,
  matchReports: matchReports.map((row) => ({ id: row.id, success: row.success, winRate: row.summary.winRate, serviceHoldRate: row.summary.serviceHoldRate, doubleFaultRate: row.summary.doubleFaultRate, bagelSetRate: row.summary.bagelSetRate })),
  careerGates,
  observations,
}, null, 2));

if (!success) process.exitCode = 1;
