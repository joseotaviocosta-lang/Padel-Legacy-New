// Playthrough 5.27-M — Σ(extrato exibido) == variação real do saldo no
// período testado (primeiros 14 dias de carreira nova), incluindo tutorial,
// conquistas, treinador, treino, inscrição, partida e prêmio.
import { gateRunner, onboarding, withModules } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-financial-flow-reconciliation-v527m');

for (const variant of ['continuous', 'no-panel-after', 'reload']) {
  const run = onboarding(variant);
  gate(`1. [${variant}] Σ extrato exibido (${run.financialFlowNet}) = variação do saldo (${run.delta})`, run.financialFlowReconciled && run.financialFlowNet === run.delta);
  const keys = new Set(run.financialFlow.flatMap((m) => m.lines.map((l) => l.key)));
  gate(`2. [${variant}] tutorial e conquistas aparecem no extrato`, keys.has('tutorial') && keys.has('conquista'), [...keys].join(','));
  gate(`3. [${variant}] despesas aparecem (treinador e treino)`, keys.has('treinador') && keys.has('treino'), [...keys].join(','));
}

await withModules({ flow: '/src/lib/financialFlow.js' }, async ({ flow }) => {
  // Fechamento mensal: o total gravado é a autoridade; diferença vira linha explícita.
  const close = { type: 'monthly_close', month: '2026-02', income: 600, expenses: 330, net: 270, breakdown: { sponsor_income: 600, staff_cost: 200, maintenance_cost: 50, coach_salary: 100, club_membership_fee: 0 } };
  const [m] = flow.buildMonthlyFinancialFlow([close]);
  gate('4. mês do fechamento soma exatamente o `net` gravado', m.net === 270 && m.lines.reduce((s, l) => s + l.amount, 0) === 270);
  gate('5. ajuste do fechamento explícito quando o breakdown não fecha', m.lines.some((l) => l.key === 'monthly_adjustment' && l.amount === 20));
});
finish();
