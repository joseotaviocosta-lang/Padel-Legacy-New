// Playthrough 5.27-M — extrato mensal a partir de TODAS as transações.
//
// O Fluxo Financeiro só sabia ler o fechamento mensal (`type:
// 'monthly_close'`, com `month`/`net`/`breakdown`). As demais linhas do
// extrato (prêmio de torneio, salário de parceiro, recompensas...) têm outro
// formato (`date`/`amount`/`category`) e apareciam como "Data não informada
// +0" — enquanto o saldo real crescia milhares de moedas. Aqui as duas formas
// viram linhas por mês e categoria; o total de um mês é exatamente a soma
// das linhas que ele mostra.

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const FINANCIAL_CATEGORY_LABELS = Object.freeze({
  patrocinio: 'Patrocínios',
  sponsor_income: 'Patrocínios',
  investment_income: 'Investimentos',
  passive_income: 'Renda passiva',
  torneio: 'Prêmios de torneio',
  premiacao_anual: 'Premiação anual',
  partida: 'Partidas',
  tutorial: 'Recompensas do tutorial',
  missao: 'Missões',
  conquista: 'Conquistas',
  parceria: 'Parceria',
  inscricao: 'Inscrições',
  treino: 'Treinos',
  treinador: 'Treinador',
  staff_cost: 'Funcionários',
  maintenance_cost: 'Manutenção',
  coach_salary: 'Treinador',
  club_membership_fee: 'Clube',
  sponsor_evaluation: 'Metas de patrocínio',
  career_opportunity: 'Oportunidades',
  loja: 'Loja',
  equipe: 'Comissão técnica',
  instalacoes: 'Instalações',
  monthly_adjustment: 'Ajustes do fechamento',
  outros: 'Outros',
});

const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

/** 'YYYY-MM' da transação: `month` do fechamento ou a data efetiva da linha. */
export function financialTransactionMonth(tx) {
  const raw = String(tx?.month || tx?.date || tx?.effective_date || '').slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
}

export function formatFinancialMonth(month) {
  if (!month) return 'Sem data';
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]}/${year}`;
}

/** Linhas assinadas (+receita / −despesa) de uma transação. */
export function financialTransactionLines(tx) {
  if (!tx || typeof tx !== 'object') return [];
  if (tx.type === 'monthly_close') {
    const b = tx.breakdown && typeof tx.breakdown === 'object' ? tx.breakdown : {};
    const income = [['sponsor_income', b.sponsor_income], ['investment_income', b.investment_income], ['passive_income', b.passive_income]]
      .map(([key, value]) => ({ key, amount: num(value) })).filter((line) => line.amount);
    const expense = [['staff_cost', b.staff_cost], ['maintenance_cost', b.maintenance_cost], ['coach_salary', b.coach_salary], ['club_membership_fee', b.club_membership_fee]]
      .map(([key, value]) => ({ key, amount: -num(value) })).filter((line) => line.amount);
    const lines = [...income, ...expense];
    // O total gravado (`net`) é a autoridade: multiplicador de custo da
    // dificuldade e economia do contador ficam numa linha de ajuste explícita.
    const net = tx.net != null ? num(tx.net) : num(tx.income) - num(tx.expenses);
    const shown = lines.reduce((sum, line) => sum + line.amount, 0);
    if (Math.round(net - shown)) lines.push({ key: 'monthly_adjustment', amount: Math.round(net - shown) });
    return lines;
  }
  // Linhas no formato de fechamento SEM ser monthly_close (avaliação de metas
  // de patrocínio, oportunidade de carreira): `net` já vem assinado.
  if (tx.amount == null && tx.net != null) {
    const net = num(tx.net);
    if (!net) return [];
    const key = FINANCIAL_CATEGORY_LABELS[tx.type] ? tx.type : FINANCIAL_CATEGORY_LABELS[tx.category] ? tx.category : 'outros';
    return [{ key, amount: net, description: tx.description || null }];
  }
  const amount = Math.abs(num(tx.amount));
  if (!amount) return [];
  const key = FINANCIAL_CATEGORY_LABELS[tx.category] ? tx.category : 'outros';
  return [{ key, amount: tx.type === 'expense' ? -amount : amount, description: tx.description || null }];
}

/** Meses (mais recente primeiro) com linhas por categoria e totais. */
export function buildMonthlyFinancialFlow(transactions = []) {
  const months = new Map();
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const lines = financialTransactionLines(tx);
    if (!lines.length) continue;
    const month = financialTransactionMonth(tx);
    if (!months.has(month)) months.set(month, new Map());
    const byKey = months.get(month);
    for (const line of lines) byKey.set(line.key, (byKey.get(line.key) || 0) + line.amount);
  }
  return [...months.entries()]
    .sort(([a], [b]) => String(b || '').localeCompare(String(a || '')))
    .map(([month, byKey]) => {
      const lines = [...byKey.entries()].filter(([, amount]) => amount)
        .map(([key, amount]) => ({ key, label: FINANCIAL_CATEGORY_LABELS[key] || FINANCIAL_CATEGORY_LABELS.outros, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      const income = lines.filter((line) => line.amount > 0).reduce((sum, line) => sum + line.amount, 0);
      const expense = lines.filter((line) => line.amount < 0).reduce((sum, line) => sum - line.amount, 0);
      return { month, label: formatFinancialMonth(month), lines, income, expense, net: income - expense };
    });
}
