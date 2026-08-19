import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const checks = [
  ['ranking usa circuito completo', read('src/pages/Ranking.jsx').includes('buildWorldRankingSnapshot(profile)') && read('src/pages/Ranking.jsx').includes('const circuitAthletes = entries.map(toCircuitDisplay)')],
  ['comunidade incorpora rede', read('src/pages/Community.jsx').includes('<Social embedded />')],
  ['menu social removido', !read('src/navigation/navigationConfig.js').includes("to: '/social'")],
  ['rota antiga redireciona', read('src/App.jsx').includes('<Navigate to="/community" replace />')],
  ['entrevista gera comunicação', read('src/lib/careerCommunications.js').includes('press-interview:')],
  ['comunicação abre recurso', read('src/pages/Communications.jsx').includes('resolveAndOpenNotification(normalized, { navigate })')],
  ['imprensa abre entrevistas', read('src/pages/Press.jsx').includes("searchParams.get('tab') === 'interviews'")],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failed.length) process.exit(1);
console.log(`BetaIntegrationV35_5Test: PASS (${checks.length}/${checks.length})`);
