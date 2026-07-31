import React from 'react';
import { Trophy, Users, Coins, Award } from 'lucide-react';
import { KpiCard, ChartCard, DonutChart, SimpleBarChart } from './AdminShared';

export default function TournamentsTab({ stats }) {
  const { tournaments, CHART_COLORS } = stats;
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Trophy} label="Total de Torneios" value={tournaments.totalPrize ? tournaments.recentChampions.length + (tournaments.tierDist.reduce((a, t) => a + t.value, 0) - tournaments.recentChampions.length) : 0} accent="amber" />
        <KpiCard icon={Coins} label="Premiação Total" value={fmt(tournaments.totalPrize)} accent="green" />
        <KpiCard icon={Users} label="Participantes" value={tournaments.totalParticipants} accent="cyan" />
        <KpiCard icon={Award} label="Finalizados" value={tournaments.recentChampions.length} accent="purple" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Torneios por Tier" icon={Trophy}>
          <DonutChart data={tournaments.tierDist} colors={CHART_COLORS} />
        </ChartCard>
        <ChartCard title="Status dos Torneios" icon={Award}>
          <SimpleBarChart data={tournaments.statusDist} colors={CHART_COLORS} height={200} />
        </ChartCard>
      </div>

      <ChartCard title="Campeões Recentes" icon={Award}>
        {tournaments.recentChampions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum campeão registrado ainda</p>
        ) : (
          <div className="space-y-2">
            {tournaments.recentChampions.map((t, i) => (
              <div key={t.id || i} className="flex items-center gap-3 glass rounded-xl p-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Trophy className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{t.champion}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.name}</p>
                </div>
                <span className="text-[10px] font-bold text-amber-400 uppercase">{t.tier}</span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}