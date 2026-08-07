import fs from 'node:fs';

const checks = [];
function check(condition, message) {
  checks.push({ condition: Boolean(condition), message });
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const betaTools = fs.readFileSync('src/components/system/BetaTools.jsx', 'utf8');
const insights = fs.readFileSync('src/lib/betaInsights.js', 'utf8');
const inspector = fs.readFileSync('src/lib/saveInspector.js', 'utf8');

check(pkg.version === '0.9.0-beta.45', 'versão beta.45');
check(pkg.scripts['test:rc-beta-intelligence']?.includes('test-rc-beta-intelligence-v36.mjs'), 'script de teste registrado');
check(betaTools.includes("['insights', 'Insights']"), 'aba Insights presente');
check(betaTools.includes("['inspector', 'Save Inspector']"), 'aba Save Inspector presente');
check(betaTools.includes('runSaveInspector'), 'execução do Save Inspector integrada');
check(insights.includes('navigation-ping-pong') && insights.includes('unread-communications'), 'motor de fricção presente');
check(insights.includes('uxScore') && insights.includes('behaviorProfile'), 'score UX e perfil comportamental presentes');
check(inspector.includes('Atletas sem país') && inspector.includes('Duplas ativas inválidas'), 'auditoria de país e duplas presente');
check(inspector.includes('Tutorial concluído sem recompensa/avanço'), 'auditoria de tutorial presente');
check(inspector.includes('Inscrições duplicadas') && inspector.includes('Contratos vencidos ainda ativos'), 'auditoria de torneios e contratos presente');
check(inspector.includes('O Inspector é somente leitura') === false, 'lógica do inspector não contém texto de UI');

console.log(`RCBetaIntelligenceV36Test: PASS (${checks.length}/${checks.length})`);
