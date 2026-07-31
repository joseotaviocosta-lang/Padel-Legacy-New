import React from 'react';
import { TrendingUp } from 'lucide-react';

export default function LegendComparison({ legends }) {
  if (!legends || legends.length < 2) return null;
  const athletes = legends.filter(l => l.entity_type === 'atleta').slice(0, 4);
  if (athletes.length < 2) return null;

  const maxTitles = Math.max(...athletes.map(a => a.comparison_stats?.titles || 0));
  const maxWinRate = Math.max(...athletes.map(a => a.comparison_stats?.winRate || 0));
  const maxMajors = Math.max(...athletes.map(a => a.comparison_stats?.majors || 0));
  const maxYears = Math.max(...athletes.map(a => a.comparison_stats?.yearsPro || 0));

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-primary" /> Comparação entre Lendas
      </h3>
      <div className="space-y-3">
        <ComparisonBar label="Títulos" athletes={athletes} getValue={a => a.comparison_stats?.titles || 0} max={maxTitles} color="bg-primary" />
        <ComparisonBar label="Taxa de Vitórias" athletes={athletes} getValue={a => a.comparison_stats?.winRate || 0} max={maxWinRate} color="bg-cyan-500" suffix="%" />
        <ComparisonBar label="Majors" athletes={athletes} getValue={a => a.comparison_stats?.majors || 0} max={maxMajors} color="bg-amber-500" />
        <ComparisonBar label="Anos Pro" athletes={athletes} getValue={a => a.comparison_stats?.yearsPro || 0} max={maxYears} color="bg-purple-500" />
      </div>
    </div>
  );
}

function ComparisonBar({ label, athletes, getValue, max, color, suffix = '' }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {athletes.map(a => {
          const val = getValue(a);
          const pct = max > 0 ? Math.round((val / max) * 100) : 0;
          return (
            <div key={a.name} className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground w-20 truncate shrink-0">{a.name.split(' ').slice(-1)[0]}</span>
              <div className="flex-1 h-5 rounded-lg bg-secondary/40 overflow-hidden relative">
                <div className={`h-full ${color} rounded-lg transition-all duration-700 flex items-center justify-end pr-1.5`} style={{ width: `${Math.max(pct, 8)}%` }}>
                  <span className="text-[9px] font-black text-primary-foreground tabular-nums">{val}{suffix}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}