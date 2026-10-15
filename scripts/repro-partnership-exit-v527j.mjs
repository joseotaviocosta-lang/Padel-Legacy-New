// Playthrough 5.27-J, Bloco A — REPRODUÇÃO DETERMINÍSTICA da extensão do limbo
// (antes e depois da correção). Cenários em scripts/lib/v527jScenario.mjs:
//   A. saída decidida pelo lifecycle (contrato vence → carência →
//      `encerra_apos_compromisso`), com 2 tentativas de inscrição nova;
//   B. saída agendada pelo jogador antes da data nominal, com um torneio que
//      termina antes dela (5.17: permitido) e um que termina depois.
//   node scripts/repro-partnership-exit-v527j.mjs --out=reports/rebalance-527j/authority-after.json
import { writeFileSync } from 'node:fs';
import { runExitScenario } from './lib/v527jScenario.mjs';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const result = { at: new Date().toISOString(), scenarios: [await runExitScenario('ExitLifecycleJ', { exit: 'lifecycle' }), await runExitScenario('ExitPlayerJ', { exit: 'player-scheduled' }), await runExitScenario('ExitLowMoraleJ', { exit: 'refused-low-morale' })] };
for (const s of result.scenarios) console.log(`${s.label}: decisão ${s.exitDecisionDate} · tentativas pós-saída aceitas ${s.newRegistrationsAfterExit} (dentro do contrato ${s.withinContractRegistrationsAfterExit}) · último compromisso legítimo ${s.lastLegitimateCommitmentEnd} · separação ${s.effectiveSeparationDate} · ${JSON.stringify(s.attempts.map((a) => [a.kind, a.ok, a.reasons]))}`);
if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
