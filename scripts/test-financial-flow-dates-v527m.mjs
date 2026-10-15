// Playthrough 5.27-M — "Data não informada" no Fluxo Financeiro.
// Causa: o componente só lia o formato do fechamento mensal (`month`/`net`);
// as linhas datadas (`date`/`amount`) — inclusive as duas de demonstração que
// toda carreira nova herdava — viravam "Data não informada +0".
import { readFileSync } from 'node:fs';
import { gateRunner, onboarding, withModules } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-financial-flow-dates-v527m');

await withModules({ flow: '/src/lib/financialFlow.js', seed: '/src/gameplay/services/CareerInitialDataService.js' }, async ({ flow, seed }) => {
  const legacy = [
    { id: 'finance-001', type: 'income', category: 'patrocinio', date: '2026-01-01', amount: 300, description: 'Adiantamento Sul Energia' },
    { id: 'finance-002', type: 'expense', category: 'treinamento', date: '2026-01-01', amount: 250, description: 'Mensalidade do centro' },
    { id: 'close', type: 'monthly_close', month: '2026-02', income: 300, expenses: 120, net: 180, breakdown: { sponsor_income: 300, staff_cost: 100, maintenance_cost: 20 } },
    { id: 'eval', type: 'sponsor_evaluation', month: '2026-02', net: -150, income: 0, expenses: 150 },
    { id: 'opp', category: 'career_opportunity', month: '2026-03-05', net: 90, income: 90, expenses: 0 },
    { id: 'prize', type: 'income', category: 'torneio', date: '2026-03-14', amount: 24 },
  ];
  const months = flow.buildMonthlyFinancialFlow(legacy);
  gate('1. toda transação (datada ou de fechamento) cai num mês válido', legacy.every((t) => flow.financialTransactionMonth(t)));
  gate('2. nenhum bloco "Sem data"', months.every((m) => m.month && m.label !== 'Sem data'));
  gate('3. linhas datadas aparecem com valor (não +0)', months.find((m) => m.month === '2026-01').net === 50);
  gate('4. avaliação de patrocínio e oportunidade entram no extrato', months.find((m) => m.month === '2026-02').lines.some((l) => l.key === 'sponsor_evaluation') && months.find((m) => m.month === '2026-03').lines.some((l) => l.key === 'career_opportunity'));
  gate('5. carreira nova não herda transações de demonstração', seed.seedCollection('FinancialTransaction', 'p1').length === 0);
  gate('6. carreira nova não herda conquista de demonstração', seed.seedCollection('PlayerAchievement', 'p1').length === 0);
});

for (const variant of ['continuous', 'no-panel-after', 'reload']) {
  const run = onboarding(variant);
  gate(`7. [${variant}] 0 transações sem data válida`, run.undatedTransactions === 0);
  gate(`8. [${variant}] nenhuma linha "Adiantamento Sul Energia"/"Mensalidade do centro" de demonstração`, !run.financialTransactions.some((t) => /Adiantamento Sul Energia|Mensalidade do centro/.test(t.description || '')));
}
const ui = readFileSync('src/components/economy/FinancialFlow.jsx', 'utf8');
gate('9. componente não tem mais o rótulo "Data não informada"', !ui.includes('Data não informada'));
gate('10. componente usa o extrato mensal canônico', ui.includes('buildMonthlyFinancialFlow'));
finish();
