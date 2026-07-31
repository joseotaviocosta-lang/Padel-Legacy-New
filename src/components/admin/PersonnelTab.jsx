import React from 'react';
import { Users, Briefcase, Coins, Handshake } from 'lucide-react';
import { KpiCard, ChartCard, DonutChart } from './AdminShared';

export default function PersonnelTab({ stats }) {
  const { personnel, CHART_COLORS } = stats;
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Funcionários" value={personnel.totalStaff} accent="primary" />
        <KpiCard icon={Coins} label="Custo Mensal Staff" value={fmt(personnel.totalStaffCost)} accent="rose" />
        <KpiCard icon={Briefcase} label="Contratos Ativos" value={personnel.activeContracts} accent="cyan" />
        <KpiCard icon={Coins} label="Salários Mensais" value={fmt(personnel.totalSalary)} accent="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Funcionários por Tipo" icon={Users}>
          <DonutChart data={personnel.staffByType} colors={CHART_COLORS} />
        </ChartCard>
        <ChartCard title="Patrocinadores por Tier" icon={Handshake}>
          <DonutChart data={personnel.sponsorsByTier} colors={CHART_COLORS} />
        </ChartCard>
      </div>

      <ChartCard title="Top Patrocinadores" icon={Briefcase}>
        {personnel.topSponsors.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum contrato ativo</p>
        ) : (
          <div className="space-y-2">
            {personnel.topSponsors.map((c, i) => (
              <div key={c.id || i} className="flex items-center gap-3 glass rounded-xl p-2.5">
                <div className="h-8 w-8 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <Briefcase className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{c.sponsor_name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.sponsor_tier || '—'}</p>
                </div>
                <span className="text-sm font-black text-amber-400 tabular-nums">{fmt(c.monthly_salary)}</span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}