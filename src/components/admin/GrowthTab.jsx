import React from 'react';
import { TrendingUp, Bot, Activity, Brain } from 'lucide-react';
import { ChartCard, DonutChart, SimpleBarChart } from './AdminShared';

export default function GrowthTab({ stats }) {
  const { growth, CHART_COLORS } = stats;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Distribuição de Níveis (Jogadores)" icon={TrendingUp}>
          <SimpleBarChart data={growth.levelDist} colors={CHART_COLORS} height={220} />
        </ChartCard>
        <ChartCard title="Fase de Carreira (Atletas IA)" icon={Activity}>
          <DonutChart data={growth.phaseDist} colors={CHART_COLORS} height={220} />
        </ChartCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Distribuição de Idade (Atletas)" icon={Bot}>
          <SimpleBarChart data={growth.ageDist} colors={CHART_COLORS} height={200} />
        </ChartCard>
        <ChartCard title="Personalidades (Atletas IA)" icon={Brain}>
          <SimpleBarChart data={growth.personalityDist} colors={CHART_COLORS} height={200} horizontal />
        </ChartCard>
      </div>

      <ChartCard title="Resumo de Crescimento" icon={TrendingUp}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {growth.phaseDist.map((phase, i) => (
            <div key={phase.name} className="glass rounded-xl p-3 text-center">
              <div className="h-2 w-full rounded-full mb-2" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{phase.name}</p>
              <p className="text-xl font-black tabular-nums">{phase.value}</p>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}