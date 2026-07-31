import React from 'react';
import { Coins, TrendingUp, TrendingDown, Wallet, Briefcase, Users } from 'lucide-react';
import { KpiCard, ChartCard, DonutChart, SimpleBarChart } from './AdminShared';

export default function EconomyTab({ stats }) {
  const { economy, CHART_COLORS } = stats;
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Coins} label="Moedas em Circulação" value={fmt(economy.totalCoins)} accent="amber" />
        <KpiCard icon={TrendingUp} label="Receita Total" value={fmt(economy.totalIncome)} accent="green" />
        <KpiCard icon={TrendingDown} label="Despesas Totais" value={fmt(economy.totalExpenses)} accent="rose" />
        <KpiCard icon={Wallet} label="Saldo Líquido" value={fmt(economy.netBalance)} accent={economy.netBalance >= 0 ? 'primary' : 'rose'} />
        <KpiCard icon={Briefcase} label="Contratos Ativos" value={economy.activeContracts} accent="cyan" />
        <KpiCard icon={Users} label="Salários Mensais" value={fmt(economy.totalSalary)} accent="purple" />
        <KpiCard icon={Users} label="Custo de Staff" value={fmt(economy.totalStaffCost)} accent="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Fontes de Receita" icon={TrendingUp}>
          <SimpleBarChart data={economy.incomeBySource} colors={CHART_COLORS} height={200} horizontal />
        </ChartCard>
        <ChartCard title="Contratos por Tier" icon={Briefcase}>
          <DonutChart data={economy.sponsorTiers} colors={CHART_COLORS} />
        </ChartCard>
      </div>

      <ChartCard title="Resumo Financeiro" icon={Wallet}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FinanceRow label="Patrocínios" value={economy.totalSalary} color="text-cyan-400" />
          <FinanceRow label="Custo de Staff" value={economy.totalStaffCost} color="text-rose-400" />
          <FinanceRow label="Receita Líquida" value={economy.totalIncome - economy.totalExpenses} color={economy.netBalance >= 0 ? 'text-green-400' : 'text-rose-400'} />
          <FinanceRow label="Moedas Circulando" value={economy.totalCoins} color="text-amber-400" />
        </div>
      </ChartCard>
    </div>
  );
}

function FinanceRow({ label, value, color }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-black tabular-nums ${color}`}>{Number(value || 0).toLocaleString('pt-BR')}</p>
    </div>
  );
}