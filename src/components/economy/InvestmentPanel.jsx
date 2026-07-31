import React, { useMemo, useState } from 'react';
import { TrendingUp, Check, X } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { INVESTMENTS, getRiskStyle, normalizePlayerInvestment } from '@/lib/economy';

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : 'R$ 0';
}

export default function InvestmentPanel({ profile, investments, onInvest, onWithdraw, busy }) {
  const [activeForm, setActiveForm] = useState(null);
  const [amount, setAmount] = useState('');

  const safeInvestments = useMemo(
    () => (Array.isArray(investments) ? investments : [])
      .filter(Boolean)
      .map(normalizePlayerInvestment),
    [investments],
  );

  function openForm(inv) {
    setActiveForm(inv.id);
    setAmount(String(Number(inv.min_amount) || 0));
  }

  function confirmInvestment(inv) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    onInvest(inv, numericAmount);
    setActiveForm(null);
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Check className="h-4 w-4 text-green-400" /> Investimentos Ativos
        </h2>
        {safeInvestments.length === 0 ? (
          <EmptyStateCard icon={TrendingUp} message="Nenhum investimento ativo. Comece a investir abaixo!" />
        ) : (
          <div className="space-y-2">
            {safeInvestments.map((inv, i) => (
              <div key={inv.id || `${inv.investment_id || 'investment'}-${i}`} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{inv.investment_name || 'Investimento'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {money(inv.amount)} · {(Number(inv.return_rate || 0) * 100).toFixed(1)}%/mês ·{' '}
                    <span className={getRiskStyle(inv.risk_level)}>{inv.risk_level || 'Não informado'}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onWithdraw(inv)}
                  disabled={busy === 'withdraw' || !inv.id}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-colors disabled:opacity-40"
                >
                  Resgatar
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-cyan-400" /> Oportunidades de Investimento
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {INVESTMENTS.filter(Boolean).map((inv) => {
            const minimum = Number(inv.min_amount) || 0;
            const balance = Number(profile?.coins) || 0;
            return (
              <div key={inv.id} className="rounded-xl border border-border/40 bg-secondary/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">{inv.name}</span>
                  <span className={`text-[9px] font-bold uppercase ${getRiskStyle(inv.risk)}`}>{inv.risk}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">{inv.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                  <span>Min: <span className="font-bold text-yellow-400">{money(minimum)}</span></span>
                </div>
                {activeForm === inv.id ? (
                  <div className="space-y-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      min={minimum}
                      step="100"
                      className="w-full px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/60 text-xs focus:outline-none focus:border-primary/50"
                      placeholder="Valor"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmInvestment(inv)}
                        disabled={busy === 'invest' || !Number.isFinite(Number(amount)) || Number(amount) < minimum || Number(amount) > balance}
                        className="flex-1 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 font-semibold text-[10px] hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
                      >
                        {busy === 'invest' ? 'Investindo...' : 'Confirmar'}
                      </button>
                      <button type="button" onClick={() => setActiveForm(null)} className="px-3 py-1.5 rounded-lg bg-secondary/40 text-muted-foreground text-[10px]">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openForm(inv)}
                    disabled={balance < minimum}
                    className="w-full py-2 rounded-xl bg-cyan-500/15 text-cyan-400 font-semibold text-xs hover:bg-cyan-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Investir
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
