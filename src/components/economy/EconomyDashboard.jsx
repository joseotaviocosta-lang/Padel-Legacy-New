import React from 'react';
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Coins, Star, Users, Wrench } from 'lucide-react';
import { GlassCard } from '@/components/padel/ui';
import { calculateMonthlyIncome, calculateMonthlyExpenses, hasStaff } from '@/lib/economy';

export default function EconomyDashboard({ profile, contracts, staff, properties, investments }) {
  const hasManager = hasStaff(staff, 'manager');
  const hasAccountant = hasStaff(staff, 'accountant');
  const income = calculateMonthlyIncome(contracts, investments, properties, hasManager);
  const expenses = calculateMonthlyExpenses(staff, properties, hasAccountant);
  const net = income.total - expenses.total;
  const balance = profile?.coins || 0;

  const incomeItems = [
    { label: 'Patrocínios', value: income.sponsors, icon: Star, color: 'text-amber-400' },
    { label: 'Investimentos', value: income.investments, icon: TrendingUp, color: 'text-cyan-400' },
    { label: 'Renda Passiva', value: income.passive, icon: Coins, color: 'text-green-400' },
  ];
  const expenseItems = [
    { label: 'Funcionários', value: expenses.staff, icon: Users, color: 'text-red-400' },
    { label: 'Manutenção', value: expenses.maintenance, icon: Wrench, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
        <div className="absolute -top-10 -right-10 h-36 w-36 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">Patrimônio</h1>
            <p className="text-sm text-muted-foreground">Seu fluxo financeiro completo</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-black tabular-nums ${balance < 0 ? 'text-red-400' : 'text-primary'}`}>
              {balance.toLocaleString('pt-BR')}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moedas</p>
          </div>
        </div>
        <div className="relative mt-4 pt-4 border-t border-border/40 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-lg font-black text-green-400 tabular-nums">+{income.total.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Receitas</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-red-400 tabular-nums">-{expenses.total.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Despesas</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-black tabular-nums ${net >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {net >= 0 ? '+' : ''}{net.toLocaleString('pt-BR')}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase">Líquido</p>
          </div>
        </div>
      </div>

      {/* Income / Expense breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
            <ArrowUpRight className="h-4 w-4 text-green-400" /> Receitas Mensais
          </h2>
          <div className="space-y-2.5">
            {incomeItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                  </div>
                  <span className="text-xs flex-1">{item.label}</span>
                  <span className={`text-xs font-black tabular-nums ${item.color}`}>+{item.value.toLocaleString('pt-BR')}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-xs font-bold">Total</span>
              <span className="text-sm font-black text-green-400 tabular-nums">+{income.total.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
            <ArrowDownRight className="h-4 w-4 text-red-400" /> Despesas Mensais
          </h2>
          <div className="space-y-2.5">
            {expenseItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                  </div>
                  <span className="text-xs flex-1">{item.label}</span>
                  <span className="text-xs font-black tabular-nums text-red-400">-{item.value.toLocaleString('pt-BR')}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-xs font-bold">Total</span>
              <span className="text-sm font-black text-red-400 tabular-nums">-{expenses.total.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}