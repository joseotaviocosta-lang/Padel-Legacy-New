import React, { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { buildMonthlyFinancialFlow } from '@/lib/financialFlow.js';

function formatNumber(value) {
  const number = Number(value);
  return (Number.isFinite(number) ? number : 0).toLocaleString('pt-BR');
}

function signed(value) {
  return `${value >= 0 ? '+' : '-'}${formatNumber(Math.abs(value))}`;
}

// Playthrough 5.27-M: o extrato é montado a partir de TODAS as transações
// (fechamento mensal + linhas datadas: prêmios, recompensas, inscrições,
// treinos...), agrupadas por mês e categoria — ver src/lib/financialFlow.js.
export default function FinancialFlow({ transactions }) {
  const months = useMemo(() => buildMonthlyFinancialFlow(transactions), [transactions]);

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Receipt className="h-4 w-4 text-primary" /> Fluxo Financeiro Mensal
      </h2>

      {months.length === 0 ? (
        <EmptyStateCard
          icon={Receipt}
          message="Nenhuma movimentação registrada ainda. Prêmios, recompensas, salários e custos aparecem aqui mês a mês."
        />
      ) : (
        <div className="space-y-2">
          {months.slice(0, 12).map((month) => (
            <div key={month.month || 'sem-data'} className="rounded-xl bg-secondary/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold">{month.label}</span>
                <span className={`text-sm font-black tabular-nums ${month.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {signed(month.net)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                {month.lines.map((line) => (
                  <div key={line.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className={`tabular-nums ${line.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>{signed(line.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-border/30 sm:col-span-2">
                  <span>Total</span>
                  <span className={month.net >= 0 ? 'text-green-400' : 'text-red-400'}>{signed(month.net)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
