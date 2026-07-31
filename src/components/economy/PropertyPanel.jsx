import React from 'react';
import { Building2, Home, Store, Check, Coins } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { PROPERTIES } from '@/lib/economy';

const TYPE_ICONS = { residencial: Home, comercial: Store };

export default function PropertyPanel({ profile, properties, onBuy, onSell, busy }) {
  const ownedIds = (properties || []).map(p => p.property_id);

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Check className="h-4 w-4 text-green-400" /> Imóveis Adquiridos
        </h2>
        {(!properties || properties.length === 0) ? (
          <EmptyStateCard icon={Building2} message="Nenhum imóvel adquirido ainda." />
        ) : (
          <div className="space-y-2">
            {properties.map((p, i) => {
              const Icon = TYPE_ICONS[p.property_type] || Building2;
              return (
                <div key={p.id || i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{p.property_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.monthly_maintenance.toLocaleString('pt-BR')}/mês · {p.bonus_type === 'passive_income' ? `+${p.bonus_value}/mês` : p.description || p.bonus_type}
                    </p>
                  </div>
                  <button
                    onClick={() => onSell(p)}
                    disabled={busy === 'sell'}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors"
                  >
                    Vender
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-amber-400" /> Mercado Imobiliário
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {PROPERTIES.map((prop, i) => {
            const Icon = TYPE_ICONS[prop.type] || Building2;
            const owned = ownedIds.includes(prop.id);
            const canAfford = (profile?.coins || 0) >= prop.price;
            return (
              <div key={i} className={`rounded-xl border p-3 ${owned ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-amber-400" />
                  </div>
                  <span className="text-sm font-bold">{prop.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">{prop.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                  <span className="flex items-center gap-0.5"><Coins className="h-3 w-3 text-yellow-400" />{prop.price.toLocaleString('pt-BR')}</span>
                  <span className="text-red-400">{prop.monthly_maintenance.toLocaleString('pt-BR')}/mês</span>
                </div>
                {owned ? (
                  <div className="flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-primary">
                    <Check className="h-3.5 w-3.5" /> Adquirido
                  </div>
                ) : (
                  <button
                    onClick={() => onBuy(prop)}
                    disabled={!canAfford || busy === 'buy'}
                    className="w-full py-2 rounded-xl bg-amber-500/15 text-amber-400 font-semibold text-xs hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy === 'buy' ? 'Comprando...' : !canAfford ? 'Moedas insuficientes' : 'Comprar'}
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