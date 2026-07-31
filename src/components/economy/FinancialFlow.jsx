import React from 'react';
import { Receipt } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return safeNumber(value).toLocaleString('pt-BR');
}

function getMonthLabel(value) {
  if (!value) return 'Data não informada';

  try {
    const normalized = String(value).slice(0, 7);
    const [year, month] = normalized.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIndex = Number(month) - 1;

    if (!year || monthIndex < 0 || monthIndex > 11) return normalized || 'Data não informada';
    return `${months[monthIndex]}/${year}`;
  } catch {
    return 'Data não informada';
  }
}

export default function FinancialFlow({ transactions }) {
  const safeTransactions = Array.isArray(transactions)
    ? transactions.filter(Boolean)
    : [];

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Receipt className="h-4 w-4 text-primary" /> Fluxo Financeiro Mensal
      </h2>

      {safeTransactions.length === 0 ? (
        <EmptyStateCard
          icon={Receipt}
          message="Nenhuma transação registrada. O fluxo financeiro é processado a cada mudança de mês."
        />
      ) : (
        <div className="space-y-2">
          {safeTransactions.slice(0, 12).map((tx, i) => {
            const monthLabel = getMonthLabel(tx?.month);
            const breakdown = tx?.breakdown && typeof tx.breakdown === 'object' ? tx.breakdown : {};
            const net = safeNumber(tx?.net);

            return (
              <div key={tx?.id || `${tx?.month || 'transaction'}-${i}`} className="rounded-xl bg-secondary/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">{monthLabel}</span>
                  <span className={`text-sm font-black tabular-nums ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {net >= 0 ? '+' : ''}{formatNumber(net)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Patrocínios</span>
                    <span className="text-green-400 tabular-nums">+{formatNumber(breakdown.sponsor_income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Investimentos</span>
                    <span className="text-green-400 tabular-nums">+{formatNumber(breakdown.investment_income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renda passiva</span>
                    <span className="text-green-400 tabular-nums">+{formatNumber(breakdown.passive_income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Funcionários</span>
                    <span className="text-red-400 tabular-nums">-{formatNumber(breakdown.staff_cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Manutenção</span>
                    <span className="text-red-400 tabular-nums">-{formatNumber(breakdown.maintenance_cost)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-border/30">
                    <span>Total</span>
                    <span className={net >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {net >= 0 ? '+' : ''}{formatNumber(net)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
