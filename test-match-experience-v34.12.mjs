import fs from 'node:fs';
const live = fs.readFileSync('src/components/matches/LiveMatch.jsx', 'utf8');
// Correção UI/cronologia — Fase 4 (unificação treino × torneio): o seletor
// "Modo da partida" (Completa/Resumida/Momentos) foi extraído de dentro de
// SimulationModal.jsx para MatchPreparationControls.jsx — um único lugar
// compartilhado por treino E torneio, em vez de só existir dentro do modal
// de treino. A verificação passa a olhar a fonte canônica atual.
const modal = fs.readFileSync('src/components/matches/MatchPreparationControls.jsx', 'utf8');
const checks = [
  ['painel de estatísticas', live.includes("id: 'stats'") && live.includes('LiveStatsPanel')],
  ['momento importante', live.includes('getImportantMoment') && live.includes('Match point')],
  ['três filtros de narração', live.includes("['summary', 'Resumida']") && live.includes("['important', 'Momentos']")],
  ['métricas ao vivo', live.includes('Break points') && live.includes('Pontos na rede')],
  ['momentum recente', live.includes('Momento dos últimos') && live.includes('momentumA')],
  ['configuração em três modos', modal.includes("['summary', 'Resumida']") && modal.includes("['important', 'Momentos']")],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) { console.error('MatchExperienceV34_12Test: FAIL', failed.map(([name]) => name)); process.exit(1); }
console.log(`MatchExperienceV34_12Test: PASS (${checks.length}/${checks.length})`);
