import React from 'react';
import { Users, Swords, Trophy, Building2, Newspaper, Bot, Activity, TrendingUp, Award, Heart, Shield } from 'lucide-react';
import { KpiCard, HealthBar, ChartCard, DonutChart, SimpleBarChart } from './AdminShared';

export default function OverviewTab({ stats }) {
  const { totals, health, growth, universe, CHART_COLORS } = stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Jogadores" value={totals.players} accent="primary" />
        <KpiCard icon={Bot} label="Atletas IA" value={totals.athletes} accent="cyan" />
        <KpiCard icon={Swords} label="Partidas" value={totals.matches} accent="amber" />
        <KpiCard icon={Trophy} label="Torneios" value={totals.tournaments} accent="purple" />
        <KpiCard icon={Building2} label="Clubes" value={totals.clubs} accent="green" />
        <KpiCard icon={Newspaper} label="Eventos" value={totals.events} accent="rose" />
        <KpiCard icon={Award} label="Rankings" value={totals.rankings} accent="primary" />
        <KpiCard icon={TrendingUp} label="Legados" value={totals.legacies} accent="cyan" />
      </div>

      <div>
        <h3 className="text-xs font-bold mb-2 px-1">Indicadores de Saúde do Universo</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <HealthBar label="Conclusão de Torneios" value={health.tournamentCompletion} icon={Trophy} />
          <HealthBar label="Moral dos Atletas" value={health.avgMorale} icon={Heart} />
          <HealthBar label="Taxa de Lesões (inverso)" value={100 - health.injuryRate} icon={Shield} />
          <HealthBar label="Reputação Média dos Clubes" value={health.avgReputation} icon={Building2} />
          <HealthBar label="Eventos Urgentes" value={universe.totalEvents > 0 ? Math.round((universe.breakingNews / universe.totalEvents) * 100) : 0} icon={Activity} />
          <HealthBar label="Saldo Econômico" value={health.economyBalance >= 0 ? 100 : Math.max(0, 100 + (health.economyBalance / 100))} icon={TrendingUp} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Fase de Carreira dos Atletas" icon={Activity}>
          <DonutChart data={growth.phaseDist} colors={CHART_COLORS} />
        </ChartCard>
        <ChartCard title="Níveis dos Jogadores" icon={TrendingUp}>
          <SimpleBarChart data={growth.levelDist} colors={CHART_COLORS} height={200} />
        </ChartCard>
      </div>

      <ChartCard title="Distribuição de Eventos do Mundo" icon={Newspaper}>
        <SimpleBarChart data={universe.eventTypeDist} colors={CHART_COLORS} height={180} />
      </ChartCard>
    </div>
  );
}