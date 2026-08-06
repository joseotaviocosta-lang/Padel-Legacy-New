import fs from 'node:fs';
const live = fs.readFileSync('src/components/matches/LiveMatch.jsx', 'utf8');
const modal = fs.readFileSync('src/components/matches/SimulationModal.jsx', 'utf8');
const checks = [
  ['painel de estatísticas', live.includes("id: 'stats'") && live.includes('LiveStatsPanel')],
  ['momento importante', live.includes('getImportantMoment') && live.includes('Match point')],
  ['três filtros de narração', live.includes("['summary', 'Resumida']") && live.includes("['important', 'Momentos']")],
  ['métricas ao vivo', live.includes('Break points') && live.includes('Pontos na rede')],
  ['momentum recente', live.includes('Momento dos últimos') && live.includes('momentumA')],
  ['configuração em três modos', modal.includes("['summary','Resumida']") && modal.includes("['important','Momentos']")],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('MatchExperienceV34_12Test: FAIL', failed.map(([name]) => name)); process.exit(1); }
console.log(`MatchExperienceV34_12Test: PASS (${checks.length}/${checks.length})`);
