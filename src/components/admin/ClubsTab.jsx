import React from 'react';
import { Building2, Users, Star, Crown } from 'lucide-react';
import { KpiCard, ChartCard, DonutChart } from './AdminShared';

export default function ClubsTab({ stats }) {
  const { clubs, CHART_COLORS } = stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Building2} label="Total de Clubes" value={clubs.totalClubs} accent="primary" />
        <KpiCard icon={Users} label="Total de Membros" value={clubs.totalMembers} accent="cyan" />
        <KpiCard icon={Crown} label="Pontos Acumulados" value={clubs.totalPoints} accent="amber" />
        <KpiCard icon={Star} label="Reputação Média" value={`${clubs.avgReputation}`} accent="purple" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Distribuição por Nível" icon={Building2}>
          <DonutChart data={clubs.levelDist} colors={CHART_COLORS} />
        </ChartCard>
        <ChartCard title="Top Clubes por Pontos" icon={Crown}>
          {clubs.topClubs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum clube registrado</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-none">
              {clubs.topClubs.map((c, i) => (
                <div key={c.id || i} className="flex items-center gap-2 glass rounded-lg p-2">
                  <span className="text-sm font-black text-muted-foreground/50 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{c.name}</p>
                    <p className="text-[9px] text-muted-foreground">{c.city || '—'} · {c.member_count || 0} membros</p>
                  </div>
                  <span className="text-sm font-black text-primary tabular-nums">{c.club_points || 0}</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}