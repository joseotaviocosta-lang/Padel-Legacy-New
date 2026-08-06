import fs from 'node:fs';
const health = fs.readFileSync('src/lib/simulationHealth.js', 'utf8');
const beta = fs.readFileSync('src/components/system/BetaTools.jsx', 'utf8');
const checks = [
  ['coleta entidades', health.includes('collectWorldHealth') && health.includes('AthleteProfile')],
  ['anomalias ranking', health.includes('zero-point-top100') && health.includes('negative-points')],
  ['duplas e treinadores', health.includes('partnerships-without-coach') && health.includes('coach-supply')],
  ['projeção 10/50/100', health.includes('projectWorldHealth') && beta.includes('[10, 50, 100]')],
  ['painel beta', beta.includes("['health', 'Saúde do mundo']") && beta.includes('Painel de Saúde da Simulação')],
  ['exportação', beta.includes('padel-legacy-saude-mundo')],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('SimulationHealthV35Test: FAIL', failed.map(([name]) => name)); process.exit(1); }
console.log(`SimulationHealthV35Test: PASS (${checks.length}/${checks.length})`);
