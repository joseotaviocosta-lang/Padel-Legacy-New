// Fase 11 — Beta Candidate gate (docs/RANKING_INTEGRITY_PHASE11.md, item 32).
//
// Orquestra os testes de integridade já existentes (não reimplementa nenhuma
// lógica de jogo) para dar um veredito único: os pilares essenciais de um
// Beta Candidate — save, calendário, treino, ranking, torneio, partidas,
// técnico, entrevistas — continuam passando juntos, na mesma execução.
import { spawnSync } from 'node:child_process';

const GATES = [
  { area: 'Save/carreira (motor real, 90 dias-carreira)', script: 'scripts/test-career-beta-readiness.mjs' },
  { area: 'Integridade de escrita (Fase 11, fault injection)', script: 'scripts/test-career-atomicity.mjs' },
  { area: 'Calendário / avanço de dia', script: 'scripts/test-calendar-advance-v24.mjs' },
  { area: 'Treino (sistema v2)', script: 'scripts/test-training-system-v2.mjs' },
  { area: 'Ranking (fonte única, desempate, save/load, performance)', script: 'scripts/test-ranking-consistency.mjs' },
  { area: 'Ranking / carryover de temporada', script: 'scripts/test-ranking-season-carryover-v32.mjs' },
  { area: 'Torneio — inscrição', script: 'scripts/test-tournament-registration-v2.mjs' },
  { area: 'Torneio — resume/recovery', script: 'scripts/test-tournament-resume-recovery.mjs' },
  { area: 'Partidas — pipeline de lançamento (treino/torneio/resume/restart)', script: 'scripts/test-match-launch-pipeline.mjs' },
  { area: 'Partidas — integridade do motor', script: 'scripts/test-match-integrity.mjs' },
  { area: 'Técnico ao vivo — treino', script: 'scripts/test-live-coach-practice.mjs' },
  { area: 'Técnico ao vivo — torneio', script: 'scripts/test-live-coach-tournament.mjs' },
  { area: 'Técnico ao vivo — realismo estatístico', script: 'scripts/test-live-coach-realism.mjs' },
  { area: 'Entrevistas pós-partida', script: 'scripts/test-post-match-interviews-rc.mjs' },
];

console.log(`=== test:beta-candidate — ${GATES.length} pilares ===\n`);

const results = [];
for (const { area, script } of GATES) {
  const startedAt = Date.now();
  const outcome = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  const elapsedMs = Date.now() - startedAt;
  const ok = outcome.status === 0;
  results.push({ area, script, ok, elapsedMs });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${area} (${script}) [${elapsedMs}ms]`);
  if (!ok) {
    console.log(`  --- saída de ${script} ---`);
    console.log((outcome.stdout || '').split('\n').slice(-25).join('\n'));
    console.log((outcome.stderr || '').split('\n').slice(-25).join('\n'));
    console.log('  --- fim da saída ---');
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== Resumo: ${results.length - failed.length}/${results.length} pilares PASS ===`);
if (failed.length) {
  console.error(`test:beta-candidate REPROVADO — falharam: ${failed.map((r) => r.area).join(', ')}`);
  process.exit(1);
}
console.log('test:beta-candidate OK — todos os pilares do Beta Candidate passam juntos.');
