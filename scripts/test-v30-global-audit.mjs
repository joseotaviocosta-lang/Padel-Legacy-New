import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const suites = [
  ['Missões', 'scripts/test-mission-system-v2.mjs'],
  ['Onboarding', 'scripts/test-onboarding-v2.mjs'],
  ['Tutorial', 'scripts/test-tutorial-engine-v2.mjs'],
  ['Cronologia', 'scripts/test-tutorial-chronology.mjs'],
  ['Jogadores', 'scripts/test-player-system.mjs'],
  ['Motor de partidas', 'scripts/test-match-integrity.mjs'],
  ['Ritmo da carreira', 'scripts/test-career-pace-v17.mjs'],
  ['Lesões', 'scripts/test-injury-balance-v21.mjs'],
  ['Universo Vivo', 'scripts/test-living-world-v23.mjs'],
  ['Calendário', 'scripts/test-calendar-advance-v24.mjs'],
  ['Mercado mundial', 'scripts/test-global-market-v25.mjs'],
  ['Economia esportiva', 'scripts/test-sports-economy-v26.mjs'],
  ['Treinadores', 'scripts/test-coach-system-v28.mjs'],
  ['Duplas vivas', 'scripts/test-living-partnerships-v29.mjs'],
  ['Comissão técnica', 'scripts/test-staff-architecture-v29-1.mjs'],
  ['Ofertas de parceria', 'scripts/test-partner-offers-v2.mjs'],
  ['Configuração Vite/Tauri', 'scripts/test-vite-config.mjs'],
  ['Técnico ao vivo', 'scripts/test-live-coach.mjs'],
];

const results = [];
for (const [name, file] of suites) {
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
  const output = `${run.stdout || ''}${run.stderr || ''}`.trim();
  results.push({
    name,
    file,
    ok: run.status === 0,
    durationMs: Date.now() - startedAt,
    output: output.slice(-4000),
  });
  console.log(`${run.status === 0 ? '✓' : '✗'} ${name}`);
}

const failed = results.filter(item => !item.ok);
const report = {
  generatedAt: new Date().toISOString(),
  version: 'v30-rc2',
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  suites: results,
  limitations: [
    'Testes que importam Vite/React exigem node_modules e não fazem parte desta suíte portátil.',
    'O build completo deve ser executado no computador de desenvolvimento após npm install.',
  ],
};
writeFileSync('RELATORIO-AUDITORIA-v30.json', JSON.stringify(report, null, 2));

if (failed.length) {
  console.error(`\nAuditoria v30 reprovada: ${failed.length} suíte(s) falharam.`);
  for (const item of failed) console.error(`\n[${item.name}]\n${item.output}`);
  process.exit(1);
}
console.log(`\nAuditoria v30 aprovada: ${results.length}/${results.length} suítes essenciais.`);
